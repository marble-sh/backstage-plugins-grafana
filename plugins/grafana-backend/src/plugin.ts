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
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { readGrafanaConfig } from './grafana/config';
import { GrafanaHttpClient } from '@marble-sh/backstage-plugin-grafana-node';
import { CacheGrafanaStore } from './store/CacheGrafanaStore';
import { DatabaseGrafanaStore } from './store/DatabaseGrafanaStore';
import { GrafanaStore } from './store/GrafanaStore';
import {
  DefaultGrafanaService,
  GrafanaInstance,
} from './service/GrafanaService';
import { createRouter } from './service/router';

/**
 * The Grafana backend plugin.
 *
 * Reads dashboards and alerts from the configured Grafana instances, caches
 * them (in the cache or the database), optionally refreshes them on a schedule,
 * and exposes a read-only REST API under `/api/grafana`.
 *
 * @public
 */
export const grafanaPlugin = createBackendPlugin({
  pluginId: 'grafana',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        cache: coreServices.cache,
        database: coreServices.database,
        scheduler: coreServices.scheduler,
      },
      async init({ logger, config, httpRouter, cache, database, scheduler }) {
        const grafanaConfig = readGrafanaConfig(config);

        if (grafanaConfig.instances.length === 0) {
          logger.warn(
            'No Grafana instances are configured under `grafana.instances`; the grafana plugin will return empty results',
          );
        }

        const store: GrafanaStore =
          grafanaConfig.store === 'database'
            ? await DatabaseGrafanaStore.create({ database })
            : new CacheGrafanaStore({ cache, ttl: grafanaConfig.cacheTtl });

        const instances: GrafanaInstance[] = grafanaConfig.instances.map(
          instance => ({
            config: instance,
            client: new GrafanaHttpClient({ instance }),
          }),
        );

        const grafanaService = new DefaultGrafanaService({
          instances,
          store,
          logger,
          fetchOnDemand: grafanaConfig.fetchOnDemand,
        });

        httpRouter.use(
          await createRouter({
            grafanaService,
            allowOnDemandRefresh: grafanaConfig.allowOnDemandRefresh,
          }),
        );
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });

        if (grafanaConfig.schedule) {
          await scheduler.scheduleTask({
            id: 'grafana-refresh',
            ...grafanaConfig.schedule,
            fn: async () => {
              await grafanaService.refresh();
            },
          });
          logger.info('Scheduled periodic Grafana refresh');
        }
      },
    });
  },
});
