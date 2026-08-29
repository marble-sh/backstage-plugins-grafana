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
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  catalogProcessingExtensionPoint,
  catalogServiceRef,
} from '@backstage/plugin-catalog-node';
import { GrafanaEntityProvider } from './GrafanaEntityProvider';

/**
 * Catalog backend module that discovers Grafana instances and dashboards as
 * catalog `Resource` entities.
 *
 * @public
 */
export const catalogModuleGrafana = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'grafana',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        auth: coreServices.auth,
        catalog: catalogProcessingExtensionPoint,
        catalogService: catalogServiceRef,
      },
      async init({ logger, config, scheduler, auth, catalog, catalogService }) {
        catalog.addEntityProvider(
          GrafanaEntityProvider.fromConfig(config, {
            logger,
            scheduler,
            auth,
            catalog: catalogService,
          }),
        );
      },
    });
  },
});
