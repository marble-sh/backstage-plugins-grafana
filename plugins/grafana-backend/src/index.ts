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

/**
 * A read-only Grafana backend plugin for Backstage. Reads dashboards and alerts
 * from Grafana, caches them, and exposes a REST API under `/api/grafana`.
 *
 * @packageDocumentation
 */

export { grafanaPlugin as default } from './plugin';

export type {
  GrafanaService,
  GrafanaInstance,
  GetDashboardsOptions,
  GetAlertsOptions,
  GetPanelsOptions,
  GetPanelDataOptions,
} from './service/GrafanaService';
export { DefaultGrafanaService } from './service/GrafanaService';

export type {
  GrafanaClient,
  ListDashboardsOptions,
  ListAlertsOptions,
  FetchApi,
} from '@marble-sh/backstage-plugin-grafana-node';
export { GrafanaHttpClient } from '@marble-sh/backstage-plugin-grafana-node';

export type {
  GrafanaBackendConfig,
  GrafanaInstanceConfig,
  GrafanaInstanceApis,
  GrafanaStoreKind,
} from './grafana/config';
export { readGrafanaConfig } from './grafana/config';

export type { GrafanaStore, GrafanaSnapshot } from './store/GrafanaStore';
export { CacheGrafanaStore } from './store/CacheGrafanaStore';
export { DatabaseGrafanaStore } from './store/DatabaseGrafanaStore';

export { createRouter } from './service/router';
