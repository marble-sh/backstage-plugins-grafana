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
  GrafanaAlert,
  GrafanaDashboard,
} from '@marble-sh/backstage-plugin-grafana-common';

/**
 * A point-in-time snapshot of the data read from a single Grafana instance.
 *
 * @public
 */
export type GrafanaSnapshot = {
  dashboards: GrafanaDashboard[];
  alerts: GrafanaAlert[];
  /** ISO-8601 timestamp of when the data was read from Grafana. */
  fetchedAt: string;
};

/**
 * Persists {@link GrafanaSnapshot}s between live refreshes.
 *
 * Implementations may be durable (database-backed) or ephemeral (cache-backed).
 *
 * @public
 */
export interface GrafanaStore {
  /** Returns the stored snapshot for an instance, or `undefined` if none. */
  get(instanceName: string): Promise<GrafanaSnapshot | undefined>;
  /** Replaces the stored snapshot for an instance. */
  set(instanceName: string, snapshot: GrafanaSnapshot): Promise<void>;
}
