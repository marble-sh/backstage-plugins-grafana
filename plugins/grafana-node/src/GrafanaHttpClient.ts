/*
 * Copyright 2026 Cassidy Marble
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ResponseError } from '@backstage/errors';
import {
  GrafanaAlert,
  GrafanaAlertState,
  GrafanaDashboard,
} from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaInstanceConfig } from './config';
import {
  AlertFilter,
  DashboardFilter,
  filterAlerts,
  filterDashboards,
} from './filters';

/**
 * Options for listing dashboards.
 *
 * @public
 */
export type ListDashboardsOptions = DashboardFilter;

/**
 * Options for listing alerts.
 *
 * @public
 */
export type ListAlertsOptions = AlertFilter;

/**
 * A read-only client for a single Grafana instance.
 *
 * @public
 */
export interface GrafanaClient {
  /** Lists dashboards, optionally filtered by tag and title. */
  listDashboards(options?: ListDashboardsOptions): Promise<GrafanaDashboard[]>;
  /** Lists alert rules with their current state, optionally filtered by labels. */
  listAlerts(options?: ListAlertsOptions): Promise<GrafanaAlert[]>;
}

/**
 * The subset of the WHATWG `fetch` function used by the client. Injectable for
 * testing.
 *
 * @public
 */
export type FetchApi = typeof fetch;

const KNOWN_ALERT_STATES: GrafanaAlertState[] = [
  'firing',
  'pending',
  'inactive',
  'normal',
  'no_data',
  'error',
];

const toAlertState = (state: unknown): GrafanaAlertState =>
  KNOWN_ALERT_STATES.includes(state as GrafanaAlertState)
    ? (state as GrafanaAlertState)
    : 'unknown';

/**
 * Produces a Grafana-style URL slug from a dashboard title.
 *
 * Grafana redirects `/d/<uid>` to the canonical slug, so this only needs to be
 * a reasonable approximation for readable links.
 *
 * @public
 */
export const slugify = (title: string): string =>
  title
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

type AppPlatformDashboard = {
  metadata?: {
    name?: string;
    annotations?: Record<string, string>;
  };
  spec?: { title?: string; tags?: string[] };
};

type GrafanaFolder = {
  uid?: string;
  title?: string;
};

/** The App Platform annotation carrying a dashboard's folder uid. */
const FOLDER_ANNOTATION = 'grafana.app/folder';

type LegacySearchDashboard = {
  uid?: string;
  title?: string;
  url?: string;
  folderTitle?: string;
  folderUrl?: string;
  tags?: string[];
};

type PrometheusRule = {
  name?: string;
  state?: string;
  type?: string;
  labels?: Record<string, string>;
};

type PrometheusGroup = {
  name?: string;
  file?: string;
  folder?: string;
  rules?: PrometheusRule[];
};

/**
 * The default {@link GrafanaClient}, backed by Grafana's HTTP APIs.
 *
 * Dashboards are read from the App Platform `dashboard.grafana.app/v1` API by
 * default (or the classic `/api/search` endpoint when configured), and alerts
 * from the stable Grafana-managed Prometheus rules API.
 *
 * @public
 */
export class GrafanaHttpClient implements GrafanaClient {
  private readonly instance: GrafanaInstanceConfig;
  private readonly fetch: FetchApi;

  constructor(options: { instance: GrafanaInstanceConfig; fetch?: FetchApi }) {
    this.instance = options.instance;
    this.fetch = options.fetch ?? fetch;
  }

  /** {@inheritDoc GrafanaClient.listDashboards} */
  async listDashboards(
    options: ListDashboardsOptions = {},
  ): Promise<GrafanaDashboard[]> {
    if (this.instance.apis.dashboards === 'none') {
      return [];
    }
    const dashboards =
      this.instance.apis.dashboards === 'legacy-search'
        ? await this.listDashboardsLegacy()
        : await this.listDashboardsAppPlatform();

    return filterDashboards(dashboards, options);
  }

  /** {@inheritDoc GrafanaClient.listAlerts} */
  async listAlerts(options: ListAlertsOptions = {}): Promise<GrafanaAlert[]> {
    if (this.instance.apis.alerts === 'none') {
      return [];
    }
    const body = await this.get<{ data?: { groups?: PrometheusGroup[] } }>(
      '/api/prometheus/grafana/api/v1/rules',
    );

    const alerts: GrafanaAlert[] = [];
    for (const group of body.data?.groups ?? []) {
      const folderTitle = group.folder ?? group.file;
      for (const rule of group.rules ?? []) {
        if (rule.type && rule.type !== 'alerting') {
          continue;
        }
        alerts.push({
          name: rule.name ?? '',
          state: toAlertState(rule.state),
          url: `${this.instance.baseUrl}/alerting/list`,
          labels: rule.labels ?? {},
          folderTitle,
          instanceName: this.instance.name,
        });
      }
    }

    return filterAlerts(alerts, options);
  }

  private async listDashboardsAppPlatform(): Promise<GrafanaDashboard[]> {
    const [body, folders] = await Promise.all([
      this.get<{ items?: AppPlatformDashboard[] }>(
        `/apis/dashboard.grafana.app/v1/namespaces/${this.instance.namespace}/dashboards`,
      ),
      this.listFolders(),
    ]);

    return (body.items ?? []).map(item => {
      const uid = item.metadata?.name ?? '';
      const title = item.spec?.title ?? uid;
      const folderUid = item.metadata?.annotations?.[FOLDER_ANNOTATION];
      const folder = folderUid ? folders.get(folderUid) : undefined;
      return {
        uid,
        title,
        url: `${this.instance.baseUrl}/d/${uid}/${slugify(title)}`,
        ...(folder
          ? {
              folderTitle: folder.title,
              folderUrl: `${
                this.instance.baseUrl
              }/dashboards/f/${folderUid}/${slugify(folder.title)}`,
            }
          : {}),
        tags: item.spec?.tags ?? [],
        instanceName: this.instance.name,
      };
    });
  }

  /**
   * Resolves folder uids to titles via the stable classic `/api/folders`
   * endpoint (the App Platform folder API is not yet GA). Folder lookup is a
   * nicety, so failures degrade to dashboards without folder information
   * rather than failing the listing. Skipped entirely when the instance sets
   * `resolveFolders: false`.
   */
  private async listFolders(): Promise<Map<string, { title: string }>> {
    if (!this.instance.resolveFolders) {
      return new Map();
    }
    try {
      const body = await this.get<GrafanaFolder[]>('/api/folders');
      const folders = Array.isArray(body) ? body : [];
      return new Map(
        folders
          .filter(folder => folder.uid && folder.title)
          .map(folder => [folder.uid!, { title: folder.title! }]),
      );
    } catch {
      return new Map();
    }
  }

  private async listDashboardsLegacy(): Promise<GrafanaDashboard[]> {
    const body = await this.get<LegacySearchDashboard[]>(
      '/api/search?type=dash-db',
    );

    return (Array.isArray(body) ? body : []).map(item => ({
      uid: item.uid ?? '',
      title: item.title ?? '',
      url: `${this.instance.baseUrl}${item.url ?? `/d/${item.uid}`}`,
      folderTitle: item.folderTitle,
      ...(item.folderUrl
        ? { folderUrl: `${this.instance.baseUrl}${item.folderUrl}` }
        : {}),
      tags: item.tags ?? [],
      instanceName: this.instance.name,
    }));
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetch(`${this.instance.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.instance.token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }

    return (await response.json()) as T;
  }
}
