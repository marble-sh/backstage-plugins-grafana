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

export interface Config {
  /**
   * Configuration shared by the Grafana plugins.
   *
   * The instance list is declared here, in the shared node library, so that
   * every consumer (the backend plugin, the catalog module, and the scaffolder
   * module) carries the schema — including the secret marking on tokens —
   * regardless of which of them are installed.
   */
  grafana?: {
    /**
     * The Grafana instances the plugins can read from.
     *
     * Both Grafana Cloud and self-hosted Grafana are supported. Each instance
     * is addressed by its unique `name`, which is also the value used by the
     * `grafana/instance` entity annotation to select an instance.
     */
    instances?: Array<{
      /**
       * A unique, stable identifier for this instance, for example
       * `production` or `my-stack`. Referenced by the `grafana/instance`
       * entity annotation and by the REST API.
       */
      name: string;

      /**
       * An optional human-readable title shown in the UI. Defaults to `name`.
       */
      title?: string;

      /**
       * The base URL of the Grafana instance, without a trailing slash.
       *
       * Examples:
       *  - Grafana Cloud: `https://myorg.grafana.net`
       *  - Self-hosted:   `https://grafana.internal.example.com`
       */
      baseUrl: string;

      /**
       * A Grafana service account token used as a Bearer token for all
       * requests to this instance. The token only needs read (Viewer)
       * permissions unless the scaffolder module is used.
       *
       * @visibility secret
       */
      token: string;

      /**
       * The Grafana App Platform namespace to query.
       *
       * When omitted it is derived automatically:
       *  - `default` for a self-hosted instance (organization 1).
       *  - `stacks-<stackId>` for Grafana Cloud, derived from `stackId`.
       *
       * Provide this explicitly for non-default organizations (`org-<id>`).
       */
      namespace?: string;

      /**
       * The Grafana Cloud stack id. Used to derive the App Platform namespace
       * (`stacks-<stackId>`) when `namespace` is not given. Only relevant for
       * Grafana Cloud instances.
       */
      stackId?: string;

      /**
       * Selects which Grafana API is used for each data type, or disables the
       * data type. Defaults favor the newest generally-available APIs.
       */
      apis?: {
        /**
         * Dashboard source API.
         *  - `app-platform` (default): the Kubernetes-style
         *    `dashboard.grafana.app/v1` API (Grafana 12+).
         *  - `legacy-search`: the classic `/api/search` endpoint, for older
         *    Grafana versions.
         *  - `none`: this instance serves no dashboards. Dashboard listings
         *    return empty without contacting Grafana, and catalog discovery
         *    emits no dashboard entities for it.
         */
        dashboards?: 'app-platform' | 'legacy-search' | 'none';

        /**
         * Alert source API.
         *  - `prometheus` (default): the stable Grafana-managed Prometheus
         *    rules API (`/api/prometheus/grafana/api/v1/rules`), which reports
         *    live alert state.
         *  - `none`: this instance serves no alerts. Alert listings return
         *    empty without contacting Grafana — use this for instances that do
         *    not use Grafana-managed alerting, so their snapshot refreshes
         *    cannot fail on the alerting API.
         */
        alerts?: 'prometheus' | 'none';
      };

      /**
       * Whether dashboard folder titles and links are resolved.
       *
       *  - `true` (default): when dashboards are read from the App Platform
       *    API, one extra `/api/folders` call per refresh resolves folder uids
       *    to titles/links.
       *  - `false`: the extra call is skipped; App Platform dashboards carry
       *    no folder information. Dashboards read via `legacy-search` are
       *    unaffected (their response already includes folder details).
       */
      resolveFolders?: boolean;
    }>;
  };
}
