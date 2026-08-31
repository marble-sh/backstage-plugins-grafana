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

/**
 * A configured Grafana instance, as exposed to clients of the backend.
 *
 * @public
 */
export type GrafanaInstanceInfo = {
  /** The unique, stable instance name (matches the `grafana/instance` annotation). */
  name: string;
  /** A human-readable title for display. */
  title: string;
  /** The base URL of the Grafana instance, without a trailing slash. */
  url: string;
};

/**
 * A Grafana dashboard, normalized across the App Platform and legacy search
 * APIs.
 *
 * @public
 */
export type GrafanaDashboard = {
  /** The dashboard uid, as used in the dashboard URL. */
  uid: string;
  /** The dashboard title. */
  title: string;
  /** A fully-qualified URL to the dashboard in Grafana. */
  url: string;
  /** The title of the folder containing the dashboard, if any. */
  folderTitle?: string;
  /** A fully-qualified URL to the folder containing the dashboard, if any. */
  folderUrl?: string;
  /** The dashboard tags. */
  tags: string[];
  /** The name of the instance this dashboard was read from. */
  instanceName: string;
};

/**
 * The evaluation state of a Grafana alert rule.
 *
 * @public
 */
export type GrafanaAlertState =
  | 'firing'
  | 'pending'
  | 'inactive'
  | 'normal'
  | 'no_data'
  | 'error'
  | 'unknown';

/**
 * The evaluation health of a Grafana alert rule.
 *
 * @public
 */
export type GrafanaAlertHealth = 'ok' | 'error' | 'nodata' | 'unknown';

/**
 * A Grafana alert rule together with its current state.
 *
 * @public
 */
export type GrafanaAlert = {
  /** The alert rule name. */
  name: string;
  /** The current evaluation state of the rule. */
  state: GrafanaAlertState;
  /** A fully-qualified URL to the alert (or its dashboard/panel) in Grafana. */
  url: string;
  /** The labels attached to the rule. */
  labels: Record<string, string>;
  /** The title of the folder (namespace) containing the rule, if any. */
  folderTitle?: string;
  /** The name of the instance this alert was read from. */
  instanceName: string;
  /** The alert rule uid, when the source API provides one. */
  uid?: string;
  /** The evaluation health of the rule. */
  health?: GrafanaAlertHealth;
  /** The rule's `summary` annotation, if any. */
  summary?: string;
  /** ISO-8601 timestamp of when the rule became active, when it is. */
  activeAt?: string;
  /** The number of currently active (pending or firing) alert instances. */
  activeCount?: number;
  /** The uid of the dashboard the rule is linked to, if any. */
  dashboardUid?: string;
  /** The id of the panel the rule is linked to, if any. */
  panelId?: number;
};

/**
 * How a Grafana panel is rendered by the frontend.
 *
 * - `timeseries`: rendered as a chart (Grafana `timeseries` and legacy `graph`
 *   panels).
 * - `stat`: rendered as a single-value tile (Grafana `stat`, `gauge`, and
 *   legacy `singlestat` panels).
 * - `unsupported`: not rendered; shown as a link into Grafana.
 *
 * @public
 */
export type GrafanaPanelKind = 'timeseries' | 'stat' | 'unsupported';

/**
 * A single panel of a Grafana dashboard, as listed by the backend.
 *
 * @public
 */
export type GrafanaPanel = {
  /** The panel id, unique within its dashboard. */
  id: number;
  /** The panel title. */
  title: string;
  /** The raw Grafana panel type (`timeseries`, `stat`, `table`, ...). */
  type: string;
  /** How the frontend renders this panel. */
  kind: GrafanaPanelKind;
  /** The panel description, if any. */
  description?: string;
  /** The uid of the dashboard containing the panel. */
  dashboardUid: string;
  /** The name of the instance the panel was read from. */
  instanceName: string;
};

/**
 * A single point of a time series: a timestamp and a value.
 *
 * @public
 */
export type GrafanaPanelPoint = {
  /** The point's timestamp, in epoch milliseconds. */
  timeMs: number;
  /** The point's value; `null` marks a gap in the series. */
  value: number | null;
};

/**
 * A single named series of a panel's query results.
 *
 * @public
 */
export type GrafanaPanelSeries = {
  /** The display name of the series. */
  name: string;
  /** The labels attached to the series, if any. */
  labels?: Record<string, string>;
  /** The data points, ordered by time. */
  points: GrafanaPanelPoint[];
};

/**
 * The queried data of a single panel, normalized from Grafana data frames.
 *
 * @public
 */
export type GrafanaPanelData = {
  /** The id of the panel the data belongs to. */
  panelId: number;
  /** The normalized series, across all of the panel's queries. */
  series: GrafanaPanelSeries[];
  /** Human-readable notes about queries that failed or were skipped. */
  warnings?: string[];
};

/**
 * Response body for `GET /instances`.
 *
 * @public
 */
export type ListInstancesResponse = {
  items: GrafanaInstanceInfo[];
};

/**
 * Response body for the dashboard listing endpoints.
 *
 * @public
 */
export type ListDashboardsResponse = {
  items: GrafanaDashboard[];
};

/**
 * Response body for the alert listing endpoints.
 *
 * @public
 */
export type ListAlertsResponse = {
  items: GrafanaAlert[];
};

/**
 * Response body for the panel listing endpoint.
 *
 * @public
 */
export type ListPanelsResponse = {
  items: GrafanaPanel[];
};

/**
 * Response body for the panel data endpoint.
 *
 * @public
 */
export type GetPanelDataResponse = GrafanaPanelData;
