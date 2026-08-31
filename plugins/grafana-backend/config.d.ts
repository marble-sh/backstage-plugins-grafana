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

import { HumanDuration } from '@backstage/types';

export interface Config {
  /**
   * Configuration for the Grafana backend plugin.
   *
   * The backend performs all communication with Grafana. The frontend never
   * talks to Grafana directly, so all credentials live here in the backend.
   *
   * The `grafana.instances` list itself is declared by the shared
   * `@marble-sh/backstage-plugin-grafana-node` library's config schema.
   */
  grafana?: {
    /**
     * Where fetched dashboard and alert data is stored between live refreshes.
     *
     *  - `cache` (default): the Backstage cache service (ephemeral, honors
     *    `cacheTtl`). Best for stateless deployments.
     *  - `database`: the Backstage database service (durable). Survives
     *    restarts and is shared across replicas.
     */
    store?: 'cache' | 'database';

    /**
     * Time-to-live for cached data. Only used when `store` is `cache`.
     * Defaults to 15 minutes.
     */
    cacheTtl?: HumanDuration;

    /**
     * Whether API callers may force live reads from Grafana.
     *
     *  - `true` (default): the `refresh=true` query parameter bypasses the
     *    store, and `POST /refresh` / `POST /instances/:name/refresh` trigger
     *    immediate refreshes.
     *  - `false`: `refresh` query parameters are silently ignored (requests
     *    are served from the store as if the parameter were absent) and the
     *    `POST …/refresh` routes respond `403`. The scheduled refresh is not
     *    affected.
     */
    allowOnDemandRefresh?: boolean;

    /**
     * Whether a store miss triggers a live read from Grafana.
     *
     *  - `true` (default): when no snapshot is stored for an instance, the
     *    backend fetches from Grafana on the spot and stores the result.
     *  - `false`: store misses return empty results without contacting
     *    Grafana. Data appears once a refresh runs — the schedule, the
     *    `POST …/refresh` routes, or a `refresh=true` read (the latter two
     *    only if `allowOnDemandRefresh` permits them). With both flags
     *    `false`, Grafana is contacted exclusively by the schedule.
     */
    fetchOnDemand?: boolean;

    /**
     * Whether the panel routes are served.
     *
     *  - `true` (default): `GET …/dashboards/:uid/panels` and
     *    `GET …/panels/:panelId/data` read live from Grafana (the dashboard
     *    model and the datasource query API), briefly cached per
     *    `panelDataCacheTtl`.
     *  - `false`: both routes respond `403`. Set this together with
     *    `allowOnDemandRefresh: false` and `fetchOnDemand: false` when
     *    Grafana traffic must be strictly schedule-only — panel data cannot
     *    be served from the snapshot store.
     */
    allowPanelQueries?: boolean;

    /**
     * Time-to-live for cached panel listings and panel data. Short by design:
     * it exists to absorb bursts (opening a dashboard queries every panel at
     * once), not to make graphs stale. Defaults to 30 seconds.
     */
    panelDataCacheTtl?: HumanDuration;

    /**
     * Background refresh schedule. When set, the backend periodically refreshes
     * every instance's dashboards and alerts into the configured store. Omit to
     * disable scheduled refresh (data is then fetched lazily on request).
     */
    schedule?: {
      /**
       * How often the refresh runs. Either a duration or a cron expression.
       */
      frequency: HumanDuration | { cron: string };
      /**
       * The maximum time a single refresh run may take before it times out.
       */
      timeout: HumanDuration;
      /**
       * How long to wait after startup before the first refresh run.
       */
      initialDelay?: HumanDuration;
    };
  };
}
