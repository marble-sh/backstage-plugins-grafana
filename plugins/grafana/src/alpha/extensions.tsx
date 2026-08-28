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
  ApiBlueprint,
  PageBlueprint,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { convertLegacyRouteRef } from '@backstage/core-compat-api';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  isAlertsAvailable,
  isDashboardsAvailable,
} from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaApiClient, grafanaApiRef } from '../api';
import { rootRouteRef } from '../routes';

/** The utility API extension providing the grafanaApiRef client. */
export const grafanaApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: grafanaApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new GrafanaApiClient({ discoveryApi, fetchApi }),
    }),
});

/** The standalone `/grafana` instances page. */
export const grafanaPage = PageBlueprint.make({
  params: {
    routeRef: convertLegacyRouteRef(rootRouteRef),
    path: '/grafana',
    loader: () =>
      import('../components/GrafanaPage').then(m => <m.GrafanaPage />),
  },
});

/** Entity overview card listing the entity's dashboards. */
export const entityGrafanaDashboardsCard = EntityCardBlueprint.make({
  name: 'dashboards',
  params: {
    filter: isDashboardsAvailable,
    loader: () =>
      import('../components/DashboardsCard').then(m => <m.DashboardsCard />),
  },
});

/** Entity overview card listing the entity's alerts. */
export const entityGrafanaAlertsCard = EntityCardBlueprint.make({
  name: 'alerts',
  params: {
    filter: isAlertsAvailable,
    loader: () =>
      import('../components/AlertsCard').then(m => <m.AlertsCard />),
  },
});

/** Entity tab showing the entity's dashboards. */
export const entityGrafanaDashboardsContent = EntityContentBlueprint.make({
  name: 'dashboards',
  params: {
    path: 'grafana',
    title: 'Grafana Dashboards',
    filter: isDashboardsAvailable,
    loader: () =>
      import('../components/EntityContent').then(m => (
        <m.GrafanaDashboardsContent />
      )),
  },
});

/** Entity tab showing the entity's alerts. */
export const entityGrafanaAlertsContent = EntityContentBlueprint.make({
  name: 'alerts',
  params: {
    path: 'grafana-alerts',
    title: 'Grafana Alerts',
    filter: isAlertsAvailable,
    loader: () =>
      import('../components/EntityContent').then(m => (
        <m.GrafanaAlertsContent />
      )),
  },
});
