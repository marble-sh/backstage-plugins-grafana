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

export { parseLabelSelector } from '@marble-sh/backstage-plugin-grafana-common';

/**
 * Filters for selecting a subset of dashboards.
 *
 * @public
 */
export type DashboardFilter = {
  /** Only keep dashboards carrying all of these tags. */
  tags?: string[];
  /**
   * Only keep dashboards whose title contains one of these comma-separated
   * values (case-insensitive). A single value without commas matches as a
   * plain substring.
   */
  query?: string;
  /** Only keep the dashboard with exactly this uid (case-sensitive). */
  uid?: string;
};

/**
 * Filters for selecting a subset of alerts.
 *
 * @public
 */
export type AlertFilter = {
  /** Only keep alerts whose labels match all of these `key=value` pairs. */
  labelSelector?: Record<string, string>;
};

/**
 * Returns the dashboards matching the given filter.
 *
 * @public
 */
export function filterDashboards(
  dashboards: GrafanaDashboard[],
  filter: DashboardFilter = {},
): GrafanaDashboard[] {
  // A query is a comma-separated list of title substrings; a dashboard
  // matches when ANY value matches (tags, in contrast, must ALL be present).
  const queries = (filter.query ?? '')
    .split(',')
    .map(value => value.trim().toLocaleLowerCase('en-US'))
    .filter(Boolean);
  return dashboards.filter(dashboard => {
    if (filter.uid && dashboard.uid !== filter.uid) {
      return false;
    }
    if (filter.tags?.length) {
      const hasAllTags = filter.tags.every(tag => dashboard.tags.includes(tag));
      if (!hasAllTags) {
        return false;
      }
    }
    if (queries.length > 0) {
      const title = dashboard.title.toLocaleLowerCase('en-US');
      if (!queries.some(query => title.includes(query))) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Returns the alerts matching the given filter.
 *
 * @public
 */
export function filterAlerts(
  alerts: GrafanaAlert[],
  filter: AlertFilter = {},
): GrafanaAlert[] {
  const selector = Object.entries(filter.labelSelector ?? {});
  if (selector.length === 0) {
    return alerts;
  }
  return alerts.filter(alert =>
    selector.every(([key, value]) => alert.labels[key] === value),
  );
}
