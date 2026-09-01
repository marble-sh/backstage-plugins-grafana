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

import { NotFoundError, ResponseError } from '@backstage/errors';
import {
  GrafanaAlert,
  GrafanaAlertHealth,
  GrafanaAlertState,
  GrafanaDashboard,
  GrafanaPanel,
  GrafanaPanelData,
} from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaInstanceConfig } from './config';
import {
  AlertFilter,
  DashboardFilter,
  filterAlerts,
  filterDashboards,
} from './filters';
import {
  buildPanelQueries,
  extractPanels,
  normalizeFrames,
  readUnresolvedDatasourceVariables,
  TemplateVariables,
} from './panels';

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
 * The time range for a panel data query. Both bounds accept Grafana time
 * expressions: `now`, `now-<n><s|m|h|d|w>`, or epoch milliseconds.
 *
 * @public
 */
export type GetPanelDataOptions = {
  /** The start of the range. Defaults to `now-6h`. */
  from?: string;
  /** The end of the range. Defaults to `now`. */
  to?: string;
};

/**
 * A read-only client for a single Grafana instance.
 *
 * The panel methods are optional so that custom implementations that predate
 * them stay valid; consumers treat their absence as "panels not supported".
 *
 * @public
 */
export interface GrafanaClient {
  /** Lists dashboards, optionally filtered by tag and title. */
  listDashboards(options?: ListDashboardsOptions): Promise<GrafanaDashboard[]>;
  /** Lists alert rules with their current state, optionally filtered by labels. */
  listAlerts(options?: ListAlertsOptions): Promise<GrafanaAlert[]>;
  /** Lists the panels of a single dashboard. */
  getPanels?(dashboardUid: string): Promise<GrafanaPanel[]>;
  /** Queries the data of a single panel over a time range. */
  getPanelData?(
    dashboardUid: string,
    panelId: number,
    options?: GetPanelDataOptions,
  ): Promise<GrafanaPanelData>;
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

type PrometheusAlertInstance = {
  state?: string;
  activeAt?: string;
  value?: string;
  labels?: Record<string, string>;
};

type PrometheusRule = {
  name?: string;
  state?: string;
  type?: string;
  uid?: string;
  health?: string;
  activeAt?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  alerts?: PrometheusAlertInstance[];
};

const KNOWN_ALERT_HEALTHS: GrafanaAlertHealth[] = ['ok', 'error', 'nodata'];

const toAlertHealth = (health: unknown): GrafanaAlertHealth | undefined => {
  if (health === undefined) {
    return undefined;
  }
  return KNOWN_ALERT_HEALTHS.includes(health as GrafanaAlertHealth)
    ? (health as GrafanaAlertHealth)
    : 'unknown';
};

/** Grafana reports "never active" as the Go zero time (year 1). */
const toActiveAt = (activeAt: unknown): string | undefined =>
  typeof activeAt === 'string' && activeAt && !activeAt.startsWith('0001-')
    ? activeAt
    : undefined;

/** The annotations linking an alert rule to its dashboard panel. */
const DASHBOARD_UID_ANNOTATION = '__dashboardUid__';
const PANEL_ID_ANNOTATION = '__panelId__';

/**
 * Instance states that count as active. A rule's `alerts` array also lists
 * instances in the `Normal` state, which must not inflate `activeCount`.
 */
const ACTIVE_INSTANCE_STATES = new Set([
  'alerting',
  'pending',
  'recovering',
  'firing',
]);

/**
 * Grafana may append a state reason to an instance state, e.g.
 * `Alerting (NoData, KeepLast)` — only the leading word is the state.
 */
const instanceStateName = (state: string): string =>
  state.split(/[\s(]/, 1)[0].toLocaleLowerCase('en-US');

const countActiveInstances = (instances: PrometheusAlertInstance[]): number =>
  instances.filter(
    alertInstance =>
      typeof alertInstance?.state === 'string' &&
      ACTIVE_INSTANCE_STATES.has(instanceStateName(alertInstance.state)),
  ).length;

/** How long a fetched dashboard model is reused for panel data queries. */
const MODEL_CACHE_TTL_MS = 30_000;

/** Upper bound on App Platform dashboard list pages read per listing. */
const MAX_DASHBOARD_LIST_PAGES = 100;

/**
 * Datasource refs that never appear in `/api/datasources`: server-side
 * expressions and the built-in Grafana datasource.
 */
const BUILTIN_DATASOURCE_REFS = new Set([
  '__expr__',
  'grafana',
  '-- Grafana --',
  '-- Mixed --',
]);

type DsQueryResults = Record<
  string,
  { status?: number; frames?: unknown[]; error?: string } | undefined
>;

type GrafanaDatasource = { uid?: string; name?: string; type?: string };

/** The instance's datasources, indexed for ref resolution. */
type DatasourceListing = {
  /** All datasources, in the order Grafana lists them (by name). */
  all: GrafanaDatasource[];
  byUid: Map<string, GrafanaDatasource>;
  byName: Map<string, GrafanaDatasource>;
};

/** Parses Grafana's `/pattern/flags` variable regex; undefined when invalid. */
const parseVariableRegex = (regex: string): RegExp | undefined => {
  const match = regex.match(/^\/(.*)\/([a-z]*)$/s);
  try {
    return match ? new RegExp(match[1], match[2]) : new RegExp(regex);
  } catch {
    return undefined;
  }
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
  private readonly modelCache = new Map<
    string,
    { promise: Promise<Record<string, unknown>>; expiresAt: number }
  >();
  private datasourceCache?: {
    promise: Promise<DatasourceListing | undefined>;
    expiresAt: number;
  };

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
        const summary = rule.annotations?.summary;
        const dashboardUid = rule.annotations?.[DASHBOARD_UID_ANNOTATION];
        // An empty annotation must not parse as panel 0 (Number('') === 0).
        const rawPanelId = rule.annotations?.[PANEL_ID_ANNOTATION];
        const panelId = rawPanelId ? Number(rawPanelId) : NaN;
        const activeAt = toActiveAt(rule.activeAt);
        alerts.push({
          name: rule.name ?? '',
          state: toAlertState(rule.state),
          url: rule.uid
            ? `${this.instance.baseUrl}/alerting/grafana/${encodeURIComponent(
                rule.uid,
              )}/view`
            : `${this.instance.baseUrl}/alerting/list`,
          labels: rule.labels ?? {},
          folderTitle,
          instanceName: this.instance.name,
          ...(rule.uid ? { uid: rule.uid } : {}),
          ...(rule.health !== undefined
            ? { health: toAlertHealth(rule.health) }
            : {}),
          ...(summary ? { summary } : {}),
          ...(activeAt ? { activeAt } : {}),
          ...(Array.isArray(rule.alerts)
            ? { activeCount: countActiveInstances(rule.alerts) }
            : {}),
          ...(dashboardUid ? { dashboardUid } : {}),
          ...(Number.isFinite(panelId) ? { panelId } : {}),
        });
      }
    }

    return filterAlerts(alerts, options);
  }

  /** {@inheritDoc GrafanaClient.getPanels} */
  async getPanels(dashboardUid: string): Promise<GrafanaPanel[]> {
    const model = await this.getDashboardModel(dashboardUid);
    return extractPanels(model).map(panel => ({
      id: panel.id,
      title: panel.title,
      type: panel.type,
      kind: panel.kind,
      ...(panel.description ? { description: panel.description } : {}),
      dashboardUid,
      instanceName: this.instance.name,
    }));
  }

  /** {@inheritDoc GrafanaClient.getPanelData} */
  async getPanelData(
    dashboardUid: string,
    panelId: number,
    options: GetPanelDataOptions = {},
  ): Promise<GrafanaPanelData> {
    const from = options.from ?? 'now-6h';
    const to = options.to ?? 'now';
    const model = await this.getDashboardModel(dashboardUid);
    const panel = extractPanels(model).find(p => p.id === panelId);
    if (!panel) {
      throw new NotFoundError(
        `No panel with id ${panelId} on dashboard '${dashboardUid}'`,
      );
    }

    const extraVariables = await this.resolveDatasourceVariables(model);
    const { queries, hiddenRefIds, warnings } = buildPanelQueries({
      panel: panel.model,
      model,
      range: { from, to },
      ...(extraVariables ? { extraVariables } : {}),
    });
    const resolved = await this.resolveQueryDatasources(queries);
    warnings.push(...resolved.warnings);
    if (resolved.queries.length === 0) {
      return {
        panelId,
        series: [],
        ...(warnings.length ? { warnings } : {}),
      };
    }

    const results = await this.postDsQuery({
      from,
      to,
      queries: resolved.queries,
    });
    const frames: unknown[] = [];
    for (const refId of Object.keys(results).sort()) {
      const entry = results[refId];
      if (hiddenRefIds.includes(refId)) {
        // A hidden query's series are never shown, so its failure is not
        // worth a user-facing warning either.
        continue;
      }
      if (entry?.error) {
        warnings.push(`Query ${refId} failed: ${entry.error}`);
      }
      frames.push(...(Array.isArray(entry?.frames) ? entry.frames : []));
    }

    const normalized = normalizeFrames(frames);
    warnings.push(...normalized.warnings);
    return {
      panelId,
      series: normalized.series,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  /**
   * Fetches the classic JSON model of a single dashboard, deduplicating
   * concurrent requests and briefly memoizing the result so that a burst of
   * per-panel data queries reads the model only once.
   */
  private getDashboardModel(uid: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    // Evict every expired entry, not just the requested one, so the cache
    // stays bounded by the dashboards viewed within the TTL window rather
    // than growing with every dashboard ever viewed.
    for (const [key, entry] of this.modelCache) {
      if (entry.expiresAt <= now) {
        this.modelCache.delete(key);
      }
    }
    const cached = this.modelCache.get(uid);
    if (cached) {
      return cached.promise;
    }
    const promise = this.fetchDashboardModel(uid);
    this.modelCache.set(uid, {
      promise,
      expiresAt: now + MODEL_CACHE_TTL_MS,
    });
    promise.catch(() => this.modelCache.delete(uid));
    return promise;
  }

  private async fetchDashboardModel(
    uid: string,
  ): Promise<Record<string, unknown>> {
    if (this.instance.apis.dashboards === 'none') {
      throw new NotFoundError(
        `The dashboards API is disabled for Grafana instance '${this.instance.name}'`,
      );
    }
    if (this.instance.apis.dashboards === 'legacy-search') {
      const body = await this.get<{ dashboard?: Record<string, unknown> }>(
        `/api/dashboards/uid/${encodeURIComponent(uid)}`,
      );
      if (!body.dashboard) {
        throw new NotFoundError(`Dashboard '${uid}' has no model`);
      }
      return body.dashboard;
    }
    const body = await this.get<{
      spec?: Record<string, unknown>;
      status?: {
        conversion?: { failed?: boolean; storedVersion?: string };
      };
    }>(
      `/apis/dashboard.grafana.app/v1/namespaces/${
        this.instance.namespace
      }/dashboards/${encodeURIComponent(uid)}`,
    );
    if (body.status?.conversion?.failed) {
      throw new Error(
        `Dashboard '${uid}' could not be converted from its stored version ` +
          `'${body.status.conversion.storedVersion ?? 'unknown'}'`,
      );
    }
    if (!body.spec) {
      throw new NotFoundError(`Dashboard '${uid}' has no model`);
    }
    return body.spec;
  }

  private async postDsQuery(body: {
    from: string;
    to: string;
    queries: Array<Record<string, unknown>>;
  }): Promise<DsQueryResults> {
    const response = await this.fetch(`${this.instance.baseUrl}/api/ds/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.instance.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // A 400 can still carry the full per-query results (partial failure).
      if (response.status === 400) {
        try {
          const parsed = (await response.clone().json()) as {
            results?: DsQueryResults;
          };
          if (parsed?.results) {
            return parsed.results;
          }
        } catch {
          // fall through to the generic error below
        }
      }
      throw await ResponseError.fromResponse(response);
    }

    const parsed = (await response.json()) as { results?: DsQueryResults };
    return parsed.results ?? {};
  }

  /**
   * Computes default values for the model's valueless `datasource`-type
   * template variables, mirroring what the Grafana UI does on dashboard
   * load: the first datasource of the variable's declared type, narrowed by
   * its name regex when one is set. Returns `undefined` when the model has
   * no such variables or the datasource listing is unavailable.
   */
  private async resolveDatasourceVariables(
    model: unknown,
  ): Promise<TemplateVariables | undefined> {
    const unresolved = readUnresolvedDatasourceVariables(model);
    if (unresolved.length === 0) {
      return undefined;
    }
    const listing = await this.listDatasources();
    if (!listing) {
      return undefined;
    }

    const values: TemplateVariables = {};
    for (const variable of unresolved) {
      const matcher = variable.regex
        ? parseVariableRegex(variable.regex)
        : undefined;
      const match = listing.all.find(
        datasource =>
          (!variable.type || datasource.type === variable.type) &&
          (!matcher || matcher.test(datasource.name ?? '')),
      );
      if (match?.uid) {
        values[variable.name] = match.uid;
      }
    }
    return Object.keys(values).length > 0 ? values : undefined;
  }

  /**
   * Resolves each query's datasource ref against the instance's datasources:
   * refs whose `uid` is actually a datasource *name* are rewritten to the
   * real uid (Grafana's own frontend resolves uid-then-name, and its
   * provisioned dashboards rely on it), and refs matching no datasource are
   * dropped with a warning — an unknown ref makes `/api/ds/query` reject the
   * whole batch with a 404, healthy queries included. When the datasource
   * listing itself is unavailable, the queries pass through unchanged.
   */
  private async resolveQueryDatasources(
    queries: Array<Record<string, unknown>>,
  ): Promise<{ queries: Array<Record<string, unknown>>; warnings: string[] }> {
    if (queries.length === 0) {
      return { queries, warnings: [] };
    }
    const listing = await this.listDatasources();
    if (!listing) {
      return { queries, warnings: [] };
    }

    const resolved: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];
    for (const query of queries) {
      const ref = query.datasource;
      const refRecord =
        typeof ref === 'object' && ref !== null
          ? (ref as { uid?: unknown; type?: unknown })
          : undefined;
      const uid = typeof ref === 'string' ? ref : refRecord?.uid;
      if (
        typeof uid !== 'string' ||
        !uid ||
        BUILTIN_DATASOURCE_REFS.has(uid) ||
        refRecord?.type === '__expr__' ||
        listing.byUid.has(uid)
      ) {
        resolved.push(query);
        continue;
      }
      const byName = listing.byName.get(uid);
      if (byName?.uid) {
        resolved.push({
          ...query,
          datasource: {
            uid: byName.uid,
            ...(byName.type ? { type: byName.type } : {}),
          },
        });
        continue;
      }
      warnings.push(
        `Query ${query.refId} was skipped: datasource '${uid}' was not found on the instance`,
      );
    }
    return { queries: resolved, warnings };
  }

  /**
   * Fetches the instance's datasources for ref resolution, briefly memoized
   * like the dashboard models. Returns `undefined` when the listing cannot
   * be read (e.g. the token lacks `datasources:read`) — resolution then
   * degrades to sending refs as-is.
   */
  private listDatasources(): Promise<DatasourceListing | undefined> {
    const now = Date.now();
    if (this.datasourceCache && this.datasourceCache.expiresAt > now) {
      return this.datasourceCache.promise;
    }
    const promise = (async () => {
      try {
        const body = await this.get<GrafanaDatasource[]>('/api/datasources');
        if (!Array.isArray(body)) {
          return undefined;
        }
        const all: GrafanaDatasource[] = [];
        const byUid = new Map<string, GrafanaDatasource>();
        const byName = new Map<string, GrafanaDatasource>();
        for (const datasource of body) {
          if (typeof datasource?.uid !== 'string' || !datasource.uid) {
            continue;
          }
          all.push(datasource);
          byUid.set(datasource.uid, datasource);
          if (typeof datasource.name === 'string' && datasource.name) {
            byName.set(datasource.name, datasource);
          }
        }
        return { all, byUid, byName };
      } catch {
        return undefined;
      }
    })();
    this.datasourceCache = { promise, expiresAt: now + MODEL_CACHE_TTL_MS };
    return promise;
  }

  private async listDashboardsAppPlatform(): Promise<GrafanaDashboard[]> {
    const foldersPromise = this.listFolders();
    const basePath = `/apis/dashboard.grafana.app/v1/namespaces/${this.instance.namespace}/dashboards`;

    // The list is a Kubernetes-style paginated collection: a page holds
    // roughly a hundred dashboards and carries a `metadata.continue` token
    // while more remain. The page cap only guards against a server that
    // keeps returning tokens forever.
    const items: AppPlatformDashboard[] = [];
    let continueToken: string | undefined;
    for (let page = 0; page < MAX_DASHBOARD_LIST_PAGES; page++) {
      const body = await this.get<{
        items?: AppPlatformDashboard[];
        metadata?: { continue?: string };
      }>(
        continueToken
          ? `${basePath}?continue=${encodeURIComponent(continueToken)}`
          : basePath,
      );
      items.push(...(body.items ?? []));
      continueToken = body.metadata?.continue || undefined;
      if (!continueToken) {
        break;
      }
    }
    const folders = await foldersPromise;

    return items.map(item => {
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
