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
  createApiFactory,
  createComponentExtension,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { GrafanaApiClient, grafanaApiRef } from './api';
import { rootRouteRef } from './routes';

/**
 * The Grafana frontend plugin, for the legacy frontend system.
 *
 * For Backstage's new frontend system, use this package's default `/alpha`
 * export instead.
 *
 * @public
 */
export const grafanaPlugin = createPlugin({
  id: 'grafana',
  apis: [
    createApiFactory({
      api: grafanaApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new GrafanaApiClient({ discoveryApi, fetchApi }),
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
});

/**
 * A standalone page listing all configured Grafana instances. Route it in the
 * app, for example at `/grafana`.
 *
 * @public
 */
export const GrafanaPage = grafanaPlugin.provide(
  createRoutableExtension({
    name: 'GrafanaPage',
    component: () =>
      import('./components/GrafanaPage').then(m => m.GrafanaPage),
    mountPoint: rootRouteRef,
  }),
);

/**
 * An entity overview card listing the entity's Grafana dashboards.
 *
 * @public
 */
export const EntityGrafanaDashboardsCard = grafanaPlugin.provide(
  createComponentExtension({
    name: 'EntityGrafanaDashboardsCard',
    component: {
      lazy: () =>
        import('./components/DashboardsCard').then(m => m.DashboardsCard),
    },
  }),
);

/**
 * An entity overview card listing the entity's Grafana alerts.
 *
 * @public
 */
export const EntityGrafanaAlertsCard = grafanaPlugin.provide(
  createComponentExtension({
    name: 'EntityGrafanaAlertsCard',
    component: {
      lazy: () => import('./components/AlertsCard').then(m => m.AlertsCard),
    },
  }),
);

/**
 * Entity tab content showing the entity's Grafana dashboards.
 *
 * @public
 */
export const EntityGrafanaDashboardsContent = grafanaPlugin.provide(
  createComponentExtension({
    name: 'EntityGrafanaDashboardsContent',
    component: {
      lazy: () =>
        import('./components/EntityContent').then(
          m => m.GrafanaDashboardsContent,
        ),
    },
  }),
);

/**
 * Entity tab content showing the entity's Grafana alerts.
 *
 * @public
 */
export const EntityGrafanaAlertsContent = grafanaPlugin.provide(
  createComponentExtension({
    name: 'EntityGrafanaAlertsContent',
    component: {
      lazy: () =>
        import('./components/EntityContent').then(m => m.GrafanaAlertsContent),
    },
  }),
);
