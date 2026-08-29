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

import { createHash } from 'crypto';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  ResourceEntity,
} from '@backstage/catalog-model';
import {
  GRAFANA_ANNOTATION_DASHBOARD_SELECTOR,
  GRAFANA_ANNOTATION_DASHBOARD_UID,
  GRAFANA_ANNOTATION_INSTANCE,
  GrafanaDashboard,
} from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaInstanceConfig } from '@marble-sh/backstage-plugin-grafana-node';

/**
 * Options controlling how Grafana data is turned into catalog entities.
 *
 * @public
 */
export type GrafanaEntityOptions = {
  /** The `spec.owner` assigned to every generated entity. */
  defaultOwner: string;
  /** An optional `spec.system` assigned to every generated entity. */
  system?: string;
  /** The catalog namespace the generated entities live in. */
  namespace: string;
  /** Whether to emit a Resource for the Grafana instance. */
  emitInstances: boolean;
  /** Whether to emit a Resource for each dashboard. */
  emitDashboards: boolean;
  /** Whether dashboard tags are copied onto the generated entities. */
  emitTags: boolean;
};

const RESOURCE_TYPE_INSTANCE = 'grafana-instance';
const RESOURCE_TYPE_DASHBOARD = 'grafana-dashboard';

const shortHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 8);

const sanitizeName = (value: string): string => {
  const sanitized = value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9\-_.]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '');
  if (sanitized.length <= 63) {
    return sanitized;
  }
  // Entity names are capped at 63 characters and must end alphanumeric. A
  // plain cut could end on a separator and could collide with another long
  // name, so truncated names get a stable hash of the full value appended.
  const head = sanitized.slice(0, 54).replace(/[^a-z0-9]+$/, '');
  return `${head}-${shortHash(value)}`;
};

const sanitizeTags = (tags: string[]): string[] => {
  const seen = new Set<string>();
  for (const tag of tags) {
    const sanitized = tag
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9:+#]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
      .slice(0, 63);
    if (sanitized) {
      seen.add(sanitized);
    }
  }
  return [...seen];
};

const instanceEntityName = (instance: GrafanaInstanceConfig): string =>
  sanitizeName(`grafana-instance-${instance.name}`);

const dashboardEntityName = (
  instance: GrafanaInstanceConfig,
  dashboard: GrafanaDashboard,
): string => {
  // Grafana uids are case-sensitive, but entity names are lowercased. When a
  // uid contains uppercase characters, a stable hash of the original uid is
  // appended so that uids differing only in case cannot collide.
  const caseSafeUid =
    dashboard.uid === dashboard.uid.toLocaleLowerCase('en-US')
      ? dashboard.uid
      : `${dashboard.uid}-${shortHash(dashboard.uid)}`;
  return sanitizeName(`grafana-dashboard-${instance.name}-${caseSafeUid}`);
};

/**
 * Builds the catalog entities for a single Grafana instance and its dashboards.
 *
 * Every entity carries `backstage.io/managed-by-location` and
 * `backstage.io/managed-by-origin-location` annotations so the catalog accepts
 * them. Dashboards declare a `spec.dependsOn` on their instance Resource, which
 * produces `dependsOn`/`dependencyOf` relations between them.
 *
 * @public
 */
export function buildGrafanaEntities(
  instance: GrafanaInstanceConfig,
  dashboards: GrafanaDashboard[],
  options: GrafanaEntityOptions,
): ResourceEntity[] {
  const locationRef = `grafana:${instance.name}`;
  const commonAnnotations: Record<string, string> = {
    [ANNOTATION_LOCATION]: locationRef,
    [ANNOTATION_ORIGIN_LOCATION]: locationRef,
    [GRAFANA_ANNOTATION_INSTANCE]: instance.name,
  };
  const systemSpec = options.system ? { system: options.system } : {};

  const entities: ResourceEntity[] = [];

  if (options.emitInstances) {
    entities.push({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: instanceEntityName(instance),
        namespace: options.namespace,
        title: instance.title,
        annotations: { ...commonAnnotations },
        links: [{ url: instance.baseUrl, title: 'Open Grafana' }],
      },
      spec: {
        type: RESOURCE_TYPE_INSTANCE,
        owner: options.defaultOwner,
        ...systemSpec,
      },
    });
  }

  if (options.emitDashboards) {
    for (const dashboard of dashboards) {
      const tags = options.emitTags ? sanitizeTags(dashboard.tags) : [];
      entities.push({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: {
          name: dashboardEntityName(instance, dashboard),
          namespace: options.namespace,
          title: dashboard.title,
          annotations: {
            ...commonAnnotations,
            [GRAFANA_ANNOTATION_DASHBOARD_SELECTOR]: dashboard.title,
            [GRAFANA_ANNOTATION_DASHBOARD_UID]: dashboard.uid,
          },
          links: [{ url: dashboard.url, title: 'Open dashboard' }],
          ...(tags.length ? { tags } : {}),
        },
        spec: {
          type: RESOURCE_TYPE_DASHBOARD,
          owner: options.defaultOwner,
          ...(options.emitInstances
            ? {
                dependsOn: [
                  `resource:${options.namespace}/${instanceEntityName(
                    instance,
                  )}`,
                ],
              }
            : {}),
          ...systemSpec,
        },
      });
    }
  }

  return entities;
}
