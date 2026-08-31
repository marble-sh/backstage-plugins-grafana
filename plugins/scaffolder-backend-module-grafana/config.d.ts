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
  grafana?: {
    /**
     * Guard rails for the Grafana scaffolder actions — the only write path in
     * the plugin suite.
     */
    scaffolder?: {
      /**
       * Which configured Grafana instances the scaffolder actions may write
       * to.
       *
       *  - unset (default): every instance under `grafana.instances` is
       *    writable.
       *  - a list of instance names: only those instances accept writes.
       *    Targeting any other instance fails the action with a 403-style
       *    error, and automatic instance selection (when `instanceName` is
       *    omitted) only considers the listed instances. A listed name that
       *    does not exist under `grafana.instances` fails backend startup
       *    with a configuration error (and, defensively, any action run).
       */
      allowedInstances?: string[];

      /**
       * Whether the `grafana:dashboard:create` action may update existing
       * dashboards.
       *
       *  - `true` (default): the action's `overwrite: true` input updates the
       *    dashboard with the given `uid` in place.
       *  - `false`: any run requesting `overwrite` fails; the action can only
       *    create new dashboards.
       */
      allowOverwrite?: boolean;
    };
  };
}
