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

import { CacheService, LoggerService } from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import { HumanDuration, durationToMilliseconds } from '@backstage/types';
import {
  GrafanaAlert,
  GrafanaDashboard,
  GrafanaInstanceInfo,
  GrafanaPanel,
  GrafanaPanelData,
} from '@marble-sh/backstage-plugin-grafana-common';
import {
  filterAlerts,
  filterDashboards,
  GrafanaClient,
  GrafanaInstanceConfig,
} from '@marble-sh/backstage-plugin-grafana-node';
import { GrafanaSnapshot, GrafanaStore } from '../store/GrafanaStore';

/**
 * A configured instance together with the client used to read from it.
 *
 * @public
 */
export type GrafanaInstance = {
  config: GrafanaInstanceConfig;
  client: GrafanaClient;
};

/**
 * Options for reading dashboards through the service.
 *
 * @public
 */
export type GetDashboardsOptions = {
  /** Restrict to a single instance. When omitted, all instances are queried. */
  instanceName?: string;
  /** Only return dashboards carrying all of these tags. */
  tags?: string[];
  /** Comma-separated title substrings; dashboards matching any are returned. */
  query?: string;
  /** Only return the dashboard with exactly this uid (case-sensitive). */
  uid?: string;
  /** Force a live fetch, bypassing the store. */
  refresh?: boolean;
};

/**
 * Options for reading alerts through the service.
 *
 * @public
 */
export type GetAlertsOptions = {
  /** Restrict to a single instance. When omitted, all instances are queried. */
  instanceName?: string;
  /** Only return alerts whose labels match all of these `key=value` pairs. */
  labelSelector?: Record<string, string>;
  /** Force a live fetch, bypassing the store. */
  refresh?: boolean;
};

/**
 * Options for listing the panels of a dashboard through the service.
 *
 * @public
 */
export type GetPanelsOptions = {
  /** The instance to read from. */
  instanceName: string;
  /** The uid of the dashboard whose panels are listed. */
  dashboardUid: string;
};

/**
 * Options for querying the data of a single panel through the service.
 *
 * @public
 */
export type GetPanelDataOptions = {
  /** The instance to read from. */
  instanceName: string;
  /** The uid of the dashboard containing the panel. */
  dashboardUid: string;
  /** The id of the panel to query. */
  panelId: number;
  /** Range start: `now`, `now-<n><s|m|h|d|w>`, or epoch ms. Defaults to `now-6h`. */
  from?: string;
  /** Range end, same forms as `from`. Defaults to `now`. */
  to?: string;
};

/**
 * Reads dashboards and alerts from the configured Grafana instances, backed by a
 * {@link GrafanaStore} for caching and periodic refresh.
 *
 * The panel methods are optional so that custom implementations that predate
 * them stay valid; the router responds 404 when they are absent.
 *
 * @public
 */
export interface GrafanaService {
  /** Returns the configured Grafana instances. */
  getInstances(): GrafanaInstanceInfo[];
  /** Returns dashboards for one or all instances, honoring the store and filters. */
  getDashboards(options: GetDashboardsOptions): Promise<GrafanaDashboard[]>;
  /** Returns alerts for one or all instances, honoring the store and filters. */
  getAlerts(options: GetAlertsOptions): Promise<GrafanaAlert[]>;
  /** Refreshes a single instance, or all instances when no name is given. */
  refresh(instanceName?: string): Promise<void>;
  /** Returns the panels of a single dashboard, live from Grafana. */
  getPanels?(options: GetPanelsOptions): Promise<GrafanaPanel[]>;
  /** Returns the queried data of a single panel, live from Grafana. */
  getPanelData?(options: GetPanelDataOptions): Promise<GrafanaPanelData>;
}

/**
 * The default {@link GrafanaService} implementation.
 *
 * @public
 */
export class DefaultGrafanaService implements GrafanaService {
  private readonly instances: Map<string, GrafanaInstance>;
  private readonly store: GrafanaStore;
  private readonly logger: LoggerService;
  private readonly fetchOnDemand: boolean;
  private readonly cache?: CacheService;
  private readonly panelCacheTtlMs: number;

  constructor(options: {
    instances: GrafanaInstance[];
    store: GrafanaStore;
    logger: LoggerService;
    /**
     * Whether a store miss triggers a live Grafana read (default `true`).
     * When `false`, misses resolve to an empty snapshot and Grafana is only
     * contacted by explicit {@link DefaultGrafanaService.refresh} calls (the
     * schedule, the refresh endpoints, or a `refresh: true` read option).
     */
    fetchOnDemand?: boolean;
    /**
     * When given, panel listings and panel data are cached here for
     * `panelDataCacheTtl` to absorb bursts (a dashboard opening queries every
     * panel at once). Without it, every panel request reads live.
     */
    cache?: CacheService;
    /** Time-to-live for cached panel data (default 30 seconds). */
    panelDataCacheTtl?: HumanDuration;
  }) {
    this.instances = new Map(
      options.instances.map(instance => [instance.config.name, instance]),
    );
    this.store = options.store;
    this.logger = options.logger;
    this.fetchOnDemand = options.fetchOnDemand ?? true;
    this.cache = options.cache;
    this.panelCacheTtlMs = durationToMilliseconds(
      options.panelDataCacheTtl ?? { seconds: 30 },
    );
  }

  /** {@inheritDoc GrafanaService.getInstances} */
  getInstances(): GrafanaInstanceInfo[] {
    return [...this.instances.values()].map(({ config }) => ({
      name: config.name,
      title: config.title,
      url: config.baseUrl,
    }));
  }

  /** {@inheritDoc GrafanaService.getDashboards} */
  async getDashboards(
    options: GetDashboardsOptions,
  ): Promise<GrafanaDashboard[]> {
    const names = this.resolveNames(options.instanceName);
    const result: GrafanaDashboard[] = [];
    for (const name of names) {
      const snapshot = await this.snapshotFor(name, options.refresh);
      result.push(
        ...filterDashboards(snapshot.dashboards, {
          tags: options.tags,
          query: options.query,
          uid: options.uid,
        }),
      );
    }
    return result;
  }

  /** {@inheritDoc GrafanaService.getAlerts} */
  async getAlerts(options: GetAlertsOptions): Promise<GrafanaAlert[]> {
    const names = this.resolveNames(options.instanceName);
    const result: GrafanaAlert[] = [];
    for (const name of names) {
      const snapshot = await this.snapshotFor(name, options.refresh);
      result.push(
        ...filterAlerts(snapshot.alerts, {
          labelSelector: options.labelSelector,
        }),
      );
    }
    return result;
  }

  /** {@inheritDoc GrafanaService.refresh} */
  async refresh(instanceName?: string): Promise<void> {
    if (instanceName) {
      await this.refreshInstance(instanceName);
      return;
    }
    for (const name of this.instances.keys()) {
      try {
        await this.refreshInstance(name);
      } catch (error) {
        this.logger.warn(
          `Failed to refresh Grafana instance '${name}'`,
          error as Error,
        );
      }
    }
  }

  /** {@inheritDoc GrafanaService.getPanels} */
  async getPanels(options: GetPanelsOptions): Promise<GrafanaPanel[]> {
    const { client } = this.mustGet(options.instanceName);
    if (!client.getPanels) {
      throw new NotFoundError(
        `The Grafana client for instance '${options.instanceName}' does not support panel queries`,
      );
    }
    return this.withPanelCache(
      `panels:v1:${options.instanceName}:${options.dashboardUid}`,
      () => client.getPanels!(options.dashboardUid),
    );
  }

  /** {@inheritDoc GrafanaService.getPanelData} */
  async getPanelData(options: GetPanelDataOptions): Promise<GrafanaPanelData> {
    const { client } = this.mustGet(options.instanceName);
    if (!client.getPanelData) {
      throw new NotFoundError(
        `The Grafana client for instance '${options.instanceName}' does not support panel queries`,
      );
    }
    const from = options.from ?? 'now-6h';
    const to = options.to ?? 'now';
    return this.withPanelCache(
      `panel-data:v1:${options.instanceName}:${options.dashboardUid}:${options.panelId}:${from}:${to}`,
      () =>
        client.getPanelData!(options.dashboardUid, options.panelId, {
          from,
          to,
        }),
    );
  }

  private async withPanelCache<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.cache) {
      return fn();
    }
    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      return cached as T;
    }
    const value = await fn();
    await this.cache.set(key, value as never, { ttl: this.panelCacheTtlMs });
    return value;
  }

  private resolveNames(instanceName?: string): string[] {
    if (instanceName) {
      this.mustGet(instanceName);
      return [instanceName];
    }
    return [...this.instances.keys()];
  }

  private mustGet(instanceName: string): GrafanaInstance {
    const instance = this.instances.get(instanceName);
    if (!instance) {
      throw new NotFoundError(
        `No Grafana instance configured with name '${instanceName}'`,
      );
    }
    return instance;
  }

  private async snapshotFor(
    instanceName: string,
    refresh?: boolean,
  ): Promise<Pick<GrafanaSnapshot, 'dashboards' | 'alerts'>> {
    if (!refresh) {
      const cached = await this.store.get(instanceName);
      if (cached) {
        return cached;
      }
      if (!this.fetchOnDemand) {
        // Serve the miss as empty rather than reaching for Grafana; nothing
        // is stored, so results fill in as soon as a refresh runs.
        return { dashboards: [], alerts: [] };
      }
    }
    return this.refreshInstance(instanceName);
  }

  private async refreshInstance(
    instanceName: string,
  ): Promise<GrafanaSnapshot> {
    const { client } = this.mustGet(instanceName);
    const [dashboards, alerts] = await Promise.all([
      client.listDashboards(),
      client.listAlerts(),
    ]);
    const snapshot: GrafanaSnapshot = {
      dashboards,
      alerts,
      fetchedAt: new Date().toISOString(),
    };
    await this.store.set(instanceName, snapshot);
    this.logger.debug(
      `Refreshed Grafana instance '${instanceName}': ${dashboards.length} dashboards, ${alerts.length} alerts`,
    );
    return snapshot;
  }
}
