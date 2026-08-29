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
  grafana?: {
    /**
     * Configuration for the Grafana catalog discovery module.
     *
     * The module reads the instances from `grafana.instances` (shared with the
     * Grafana backend plugin) and periodically emits a `Resource` entity for
     * each Grafana instance and each dashboard it discovers, linking every
     * dashboard to its instance via `spec.dependsOn`.
     */
    catalog?: {
      /**
       * How often discovery runs, and how long a single run may take.
       * Defaults to every 30 minutes with a 3-minute timeout.
       */
      schedule?: {
        frequency: HumanDuration | { cron: string };
        timeout: HumanDuration;
        initialDelay?: HumanDuration;
      };

      /**
       * The `spec.owner` assigned to every generated entity. Defaults to
       * `group:default/grafana`. Set this to a team that owns the Grafana
       * estate, for example `group:default/observability`.
       */
      defaultOwner?: string;

      /**
       * An optional `spec.system` assigned to every generated entity, for
       * example `observability`.
       */
      system?: string;

      /**
       * The catalog namespace the generated entities are created in.
       *
       *  - unset (default): entities live in the `default` namespace.
       *  - set: entities (and the `dependsOn` references between them) use the
       *    given namespace.
       */
      namespace?: string;

      /**
       * Which configured Grafana instances discovery reads.
       *
       *  - unset (default): every instance under `grafana.instances`.
       *  - a list of instance names: only those instances are discovered.
       *    Startup fails with a configuration error if a listed name does not
       *    exist under `grafana.instances`.
       */
      instances?: string[];

      /**
       * Narrows which dashboards are ingested. Both conditions must hold when
       * both are set. Instance entities are unaffected.
       */
      filter?: {
        /**
         * Only discover dashboards carrying **all** of these tags.
         * Unset (default) means no tag filtering.
         */
        tags?: string[];
        /**
         * Only discover dashboards whose title contains one of these
         * comma-separated values (case-insensitive). Unset (default) means no
         * title filtering.
         */
        query?: string;
      };

      /**
       * Whether to emit a `Resource` for each Grafana instance.
       *
       *  - `true` (default): one `Resource` (`spec.type: grafana-instance`)
       *    per instance; dashboards declare `dependsOn` on it.
       *  - `false`: no instance entities, and dashboard entities carry no
       *    `dependsOn` (there is nothing to point at).
       */
      emitInstances?: boolean;

      /**
       * Whether to emit a `Resource` for each discovered dashboard.
       *
       *  - `true` (default): one `Resource` (`spec.type: grafana-dashboard`)
       *    per dashboard that passes `filter`.
       *  - `false`: no dashboard entities, and Grafana is not queried for
       *    dashboards during discovery at all.
       */
      emitDashboards?: boolean;

      /**
       * Whether dashboard tags are copied onto the generated entities.
       *
       *  - `true` (default): sanitized dashboard tags become
       *    `metadata.tags` on the dashboard entities.
       *  - `false`: generated entities carry no tags. Tag-based `filter`
       *    settings still work — this only affects the emitted entities.
       */
      emitTags?: boolean;

      /**
       * Whether a placeholder `Group` is created for `defaultOwner`, so the
       * `spec.owner` relations of the generated entities do not dangle.
       *
       *  - `true` (default): while no other catalog source defines the owner
       *    ref, a placeholder `Group` (`spec.type: virtual`, no members) is
       *    emitted for it. A definition from any other source (for example a
       *    hand-written catalog-info.yaml) always takes precedence — the
       *    placeholder is only created when the ref does not exist at all.
       *  - `false`: no placeholder; ensure `defaultOwner` exists, or the
       *    generated entities' owner relations dangle. Also the switch for
       *    handing an existing placeholder over to your own definition (see
       *    the module README).
       */
      emitOwnerGroup?: boolean;
    };
  };
}
