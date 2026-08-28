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

import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import {
  GrafanaAlert,
  GrafanaDashboard,
  GrafanaInstanceInfo,
  ListAlertsResponse,
  ListDashboardsResponse,
  ListInstancesResponse,
} from '@marble-sh/backstage-plugin-grafana-common';

/**
 * Options for listing dashboards through the frontend API.
 *
 * @public
 */
export type ListDashboardsRequest = {
  /** Restrict to a single instance. When omitted, all instances are queried. */
  instanceName?: string;
  /** Only return dashboards carrying all of these tags. */
  tags?: string[];
  /** Comma-separated title substrings; dashboards matching any are returned. */
  query?: string;
  /** Force a live fetch, bypassing the backend cache. */
  refresh?: boolean;
};

/**
 * Options for listing alerts through the frontend API.
 *
 * @public
 */
export type ListAlertsRequest = {
  /** Restrict to a single instance. When omitted, all instances are queried. */
  instanceName?: string;
  /** Only return alerts whose labels match all of these `key=value` pairs. */
  labelSelector?: Record<string, string>;
  /** Force a live fetch, bypassing the backend cache. */
  refresh?: boolean;
};

/**
 * A client for the Grafana backend REST API.
 *
 * @public
 */
export interface GrafanaApi {
  /** Lists the configured Grafana instances. */
  listInstances(): Promise<GrafanaInstanceInfo[]>;
  /** Lists dashboards for one or all instances. */
  listDashboards(request?: ListDashboardsRequest): Promise<GrafanaDashboard[]>;
  /** Lists alerts for one or all instances. */
  listAlerts(request?: ListAlertsRequest): Promise<GrafanaAlert[]>;
}

/**
 * The {@link GrafanaApi} reference.
 *
 * @public
 */
export const grafanaApiRef = createApiRef<GrafanaApi>({
  id: 'plugin.grafana.service',
});

const serializeLabelSelector = (labels: Record<string, string>): string =>
  Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

/**
 * The default {@link GrafanaApi} implementation, talking to the Grafana backend
 * plugin over HTTP.
 *
 * @public
 */
export class GrafanaApiClient implements GrafanaApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  /** {@inheritDoc GrafanaApi.listInstances} */
  async listInstances(): Promise<GrafanaInstanceInfo[]> {
    const body = await this.get<ListInstancesResponse>('/instances');
    return body.items;
  }

  /** {@inheritDoc GrafanaApi.listDashboards} */
  async listDashboards(
    request: ListDashboardsRequest = {},
  ): Promise<GrafanaDashboard[]> {
    const path = request.instanceName
      ? `/instances/${encodeURIComponent(request.instanceName)}/dashboards`
      : '/dashboards';
    const params = new URLSearchParams();
    for (const tag of request.tags ?? []) {
      params.append('tag', tag);
    }
    if (request.query) {
      params.set('query', request.query);
    }
    if (request.refresh) {
      params.set('refresh', 'true');
    }
    const body = await this.get<ListDashboardsResponse>(path, params);
    return body.items;
  }

  /** {@inheritDoc GrafanaApi.listAlerts} */
  async listAlerts(request: ListAlertsRequest = {}): Promise<GrafanaAlert[]> {
    const path = request.instanceName
      ? `/instances/${encodeURIComponent(request.instanceName)}/alerts`
      : '/alerts';
    const params = new URLSearchParams();
    if (request.labelSelector && Object.keys(request.labelSelector).length) {
      params.set(
        'labelSelector',
        serializeLabelSelector(request.labelSelector),
      );
    }
    if (request.refresh) {
      params.set('refresh', 'true');
    }
    const body = await this.get<ListAlertsResponse>(path, params);
    return body.items;
  }

  private async get<T>(path: string, params?: URLSearchParams): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('grafana');
    const search = params && [...params].length ? `?${params.toString()}` : '';
    const response = await this.fetchApi.fetch(`${baseUrl}${path}${search}`);
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return (await response.json()) as T;
  }
}
