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
 * A read-only Grafana frontend plugin for Backstage. Provides entity
 * dashboard/alert cards and content, plus a standalone instances page.
 *
 * This entry point targets the legacy frontend system; for the new frontend
 * system, install the plugin from this package's `/alpha` export instead.
 *
 * @packageDocumentation
 */

export {
  grafanaPlugin,
  GrafanaPage,
  EntityGrafanaDashboardsCard,
  EntityGrafanaAlertsCard,
  EntityGrafanaDashboardsContent,
  EntityGrafanaAlertsContent,
} from './plugin';

export { rootRouteRef } from './routes';

export { grafanaApiRef, GrafanaApiClient } from './api';
export type {
  GrafanaApi,
  ListDashboardsRequest,
  ListAlertsRequest,
  ListPanelsRequest,
  GetPanelDataRequest,
} from './api';
