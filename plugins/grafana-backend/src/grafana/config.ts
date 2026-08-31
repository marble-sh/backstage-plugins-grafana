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

import { Config } from '@backstage/config';
import {
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { HumanDuration } from '@backstage/types';
import {
  GrafanaInstanceConfig,
  readGrafanaInstances,
} from '@marble-sh/backstage-plugin-grafana-node';

export type {
  GrafanaInstanceConfig,
  GrafanaInstanceApis,
} from '@marble-sh/backstage-plugin-grafana-node';

/**
 * Where fetched data is stored between refreshes.
 *
 * @public
 */
export type GrafanaStoreKind = 'cache' | 'database';

/**
 * The fully-resolved backend configuration.
 *
 * @public
 */
export type GrafanaBackendConfig = {
  instances: GrafanaInstanceConfig[];
  store: GrafanaStoreKind;
  cacheTtl: HumanDuration;
  schedule?: SchedulerServiceTaskScheduleDefinition;
  /** Whether callers may force live reads (`?refresh=true`, `POST /refresh`). */
  allowOnDemandRefresh: boolean;
  /** Whether a store miss triggers a live Grafana read. */
  fetchOnDemand: boolean;
  /** Whether the panel routes (live dashboard/datasource queries) are served. */
  allowPanelQueries: boolean;
  /** Time-to-live for cached panel listings and panel data. */
  panelDataCacheTtl: HumanDuration;
};

const DEFAULT_CACHE_TTL: HumanDuration = { minutes: 15 };
const DEFAULT_PANEL_DATA_CACHE_TTL: HumanDuration = { seconds: 30 };

/**
 * Reads and validates the `grafana` section of the app configuration into a
 * fully-resolved {@link GrafanaBackendConfig}.
 *
 * @public
 */
export function readGrafanaConfig(rootConfig: Config): GrafanaBackendConfig {
  const instances = readGrafanaInstances(rootConfig);
  const config = rootConfig.getOptionalConfig('grafana');

  const store =
    (config?.getOptionalString('store') as GrafanaStoreKind | undefined) ??
    'cache';
  if (store !== 'cache' && store !== 'database') {
    throw new InputError(
      `Invalid grafana.store '${store}', expected 'cache' or 'database'`,
    );
  }

  const scheduleConfig = config?.getOptionalConfig('schedule');

  return {
    instances,
    store,
    cacheTtl:
      (config?.getOptional('cacheTtl') as HumanDuration | undefined) ??
      DEFAULT_CACHE_TTL,
    schedule: scheduleConfig
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
      : undefined,
    allowOnDemandRefresh:
      config?.getOptionalBoolean('allowOnDemandRefresh') ?? true,
    fetchOnDemand: config?.getOptionalBoolean('fetchOnDemand') ?? true,
    allowPanelQueries: config?.getOptionalBoolean('allowPanelQueries') ?? true,
    panelDataCacheTtl:
      (config?.getOptional('panelDataCacheTtl') as HumanDuration | undefined) ??
      DEFAULT_PANEL_DATA_CACHE_TTL,
  };
}
