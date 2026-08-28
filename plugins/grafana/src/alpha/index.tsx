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

import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { convertLegacyRouteRef } from '@backstage/core-compat-api';
import { rootRouteRef } from '../routes';
import {
  entityGrafanaAlertsCard,
  entityGrafanaAlertsContent,
  entityGrafanaDashboardsCard,
  entityGrafanaDashboardsContent,
  grafanaApi,
  grafanaPage,
} from './extensions';

/**
 * The Grafana frontend plugin, for Backstage's new frontend system.
 *
 * @alpha
 */
const grafanaPlugin = createFrontendPlugin({
  pluginId: 'grafana',
  extensions: [
    grafanaApi,
    grafanaPage,
    entityGrafanaDashboardsCard,
    entityGrafanaAlertsCard,
    entityGrafanaDashboardsContent,
    entityGrafanaAlertsContent,
  ],
  routes: {
    root: convertLegacyRouteRef(rootRouteRef),
  },
});

export default grafanaPlugin;
