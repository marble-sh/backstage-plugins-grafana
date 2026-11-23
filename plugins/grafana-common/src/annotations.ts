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

// Internal name for the deprecated key so the fallback reader below does not
// have to reference its own deprecated public export.
const LEGACY_HOST_ID = 'grafana/host-id';

/**
 * Legacy alias for {@link GRAFANA_ANNOTATION_INSTANCE}, read as a fallback
 * only when `grafana/instance` is absent. Predecessor plugins used this key
 * with the same value (the Grafana instance name, e.g. a Grafana Cloud stack
 * slug), so accepting it keeps entities working while their catalog
 * descriptors migrate.
 *
 * @deprecated Set {@link GRAFANA_ANNOTATION_INSTANCE} instead; this alias
 * will be removed in a future major release.
 *
 * @public
 */
export const GRAFANA_ANNOTATION_LEGACY_HOST_ID = LEGACY_HOST_ID;

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
 * Selects a single dashboard by its Grafana uid (exact, case-sensitive match).
 * Written by catalog discovery onto the `Resource` it emits per dashboard, so
 * that the entity shows exactly its own dashboard; it can also be set by hand.
 *
 * @public
 */
export const GRAFANA_ANNOTATION_DASHBOARD_UID = 'grafana/dashboard-uid';

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

/**
 * A comma-separated list of `name=value` pairs supplying dashboard template
 * variable values for an entity, e.g. `organization=my-org, repository=my-repo`.
 *
 * Applied when panel data is queried in the entity's context: each pair
 * overrides that variable's saved value, the same way `var-<name>` URL
 * parameters override saved values in Grafana's own UI. Names must be valid
 * Grafana variable names (`[A-Za-z_][A-Za-z0-9_]*`); malformed segments are
 * ignored (see {@link parseVariables}).
 *
 * @public
 */
export const GRAFANA_ANNOTATION_VARIABLES = 'grafana/variables';

const read = (entity: Entity, key: string): string | undefined => {
  const value = entity.metadata.annotations?.[key];
  return value ? value : undefined;
};

/**
 * Returns the configured Grafana instance name for an entity, if any. The
 * deprecated {@link GRAFANA_ANNOTATION_LEGACY_HOST_ID} is read as a fallback
 * when {@link GRAFANA_ANNOTATION_INSTANCE} is absent.
 *
 * @public
 */
export const getGrafanaInstanceName = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_INSTANCE) ?? read(entity, LEGACY_HOST_ID);

/**
 * Returns the dashboard selector expression for an entity, if any.
 *
 * @public
 */
export const getDashboardSelector = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_DASHBOARD_SELECTOR);

/**
 * Returns the dashboard uid selector for an entity, if any.
 *
 * @public
 */
export const getDashboardUid = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_DASHBOARD_UID);

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
 * Returns the raw dashboard variable overrides annotation for an entity, if
 * any (see {@link GRAFANA_ANNOTATION_VARIABLES}).
 *
 * @public
 */
export const getGrafanaVariables = (entity: Entity): string | undefined =>
  read(entity, GRAFANA_ANNOTATION_VARIABLES);

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
    getDashboardUid(entity) ||
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
