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

import { Entity } from '@backstage/catalog-model';

/**
 * Selects which configured Grafana instance an entity belongs to. The value
 * must match an instance `name` in the backend configuration.
 *
 * @public
 */
export const GRAFANA_ANNOTATION_INSTANCE = 'grafana/instance';

/**
 * Selects the dashboards shown for an entity: a comma-separated list of
 * case-insensitive title substrings, matching any dashboard whose title
 * contains at least one of the values.
 *
 * @public
 */
export const GRAFANA_ANNOTATION_DASHBOARD_SELECTOR =
  'grafana/dashboard-selector';

/**
 * A comma-separated list of dashboard tags used to select the dashboards shown
 * for an entity.
 *
 * @public
 */
export const GRAFANA_ANNOTATION_TAG_SELECTOR = 'grafana/tag-selector';

/**
 * A comma-separated list of `key=value` label matchers used to select the
 * alerts shown for an entity.
 *
 * @public
 */
export const GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR =
  'grafana/alert-label-selector';

const read = (entity: Entity, key: string): string | undefined => {
  const value = entity.metadata.annotations?.[key];
  return value ? value : undefined;
};

/**
 * Returns the configured Grafana instance name for an entity, if any.
 *
 * @public
 */
export const getGrafanaInstanceName = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_INSTANCE);

/**
 * Returns the dashboard selector expression for an entity, if any.
 *
 * @public
 */
export const getDashboardSelector = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_DASHBOARD_SELECTOR);

/**
 * Returns the dashboard tag selector for an entity, if any.
 *
 * @public
 */
export const getTagSelector = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_TAG_SELECTOR);

/**
 * Returns the alert label selector for an entity, if any.
 *
 * @public
 */
export const getAlertLabelSelector = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR);

/**
 * Returns `true` when an entity carries an annotation that selects Grafana
 * dashboards, and therefore has dashboard content to display.
 *
 * @public
 */
export const isDashboardsAvailable = (entity: Entity): boolean =>
  Boolean(
    getGrafanaInstanceName(entity) ||
      getDashboardSelector(entity) ||
      getTagSelector(entity),
  );

/**
 * Returns `true` when an entity carries an annotation that selects Grafana
 * alerts, and therefore has alert content to display.
 *
 * @public
 */
export const isAlertsAvailable = (entity: Entity): boolean =>
  Boolean(getGrafanaInstanceName(entity) || getAlertLabelSelector(entity));

/**
 * Returns `true` when an entity carries any Grafana annotation, and therefore
 * has Grafana content to display.
 *
 * @public
 */
export const isGrafanaAvailable = (entity: Entity): boolean =>
  isDashboardsAvailable(entity) || isAlertsAvailable(entity);
