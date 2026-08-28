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
