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
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  ResourceEntity,
} from '@backstage/catalog-model';
import { GrafanaDashboard } from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaInstanceConfig } from '@marble-sh/backstage-plugin-grafana-node';
import { buildGrafanaEntities } from './buildEntities';

const instance: GrafanaInstanceConfig = {
  name: 'prod',
  title: 'Production',
  baseUrl: 'https://grafana.example.com',
  token: 'secret',
  namespace: 'default',
  apis: { dashboards: 'app-platform', alerts: 'prometheus' },
  resolveFolders: true,
};

const dashboard = (
  overrides: Partial<GrafanaDashboard> = {},
): GrafanaDashboard => ({
  uid: 'abc123',
  title: 'My Service',
  url: 'https://grafana.example.com/d/abc123/my-service',
  tags: ['team-a'],
  instanceName: 'prod',
  ...overrides,
});

const defaultOptions = {
  defaultOwner: 'group:default/observability',
  namespace: 'default',
  emitInstances: true,
  emitDashboards: true,
  emitTags: true,
};

const byName = (entities: ResourceEntity[], name: string) =>
  entities.find(e => e.metadata.name === name)!;

describe('buildGrafanaEntities', () => {
  it('emits a Resource for the Grafana instance', () => {
    const entities = buildGrafanaEntities(instance, [], defaultOptions);

    const resource = byName(entities, 'grafana-instance-prod');
    expect(resource.kind).toBe('Resource');
    expect(resource.metadata.title).toBe('Production');
    expect(resource.spec).toMatchObject({
      type: 'grafana-instance',
      owner: 'group:default/observability',
    });
    expect(resource.metadata.annotations).toMatchObject({
      [ANNOTATION_LOCATION]: 'grafana:prod',
      [ANNOTATION_ORIGIN_LOCATION]: 'grafana:prod',
      'grafana/instance': 'prod',
    });
    expect(resource.metadata.links).toEqual([
      { url: 'https://grafana.example.com', title: 'Open Grafana' },
    ]);
  });

  it('emits a Resource for each dashboard depending on the instance', () => {
    const entities = buildGrafanaEntities(
      instance,
      [dashboard()],
      defaultOptions,
    );

    const resource = byName(entities, 'grafana-dashboard-prod-abc123');
    expect(resource.kind).toBe('Resource');
    expect(resource.metadata.title).toBe('My Service');
    expect(resource.spec).toMatchObject({
      type: 'grafana-dashboard',
      owner: 'group:default/observability',
      dependsOn: ['resource:default/grafana-instance-prod'],
    });
    expect(resource.metadata.annotations).toMatchObject({
      [ANNOTATION_LOCATION]: 'grafana:prod',
      'grafana/instance': 'prod',
      'grafana/dashboard-uid': 'abc123',
    });
    // No title-based selector: selectors AND together, so a stale title
    // (renamed in Grafana between discovery runs) would exclude the
    // dashboard its own uid still matches.
    expect(resource.metadata.annotations).not.toHaveProperty(
      'grafana/dashboard-selector',
    );
    expect(resource.metadata.links).toEqual([
      {
        url: 'https://grafana.example.com/d/abc123/my-service',
        title: 'Open dashboard',
      },
    ]);
    expect(resource.metadata.tags).toEqual(['team-a']);
  });

  it('sets spec.system on all entities when configured', () => {
    const entities = buildGrafanaEntities(instance, [dashboard()], {
      ...defaultOptions,
      system: 'observability',
    });
    for (const entity of entities) {
      expect(entity.spec.system).toBe('observability');
    }
  });

  it('omits instance Resources when emitInstances is false', () => {
    const entities = buildGrafanaEntities(instance, [dashboard()], {
      ...defaultOptions,
      emitInstances: false,
    });
    expect(entities.map(e => e.metadata.name)).toEqual([
      'grafana-dashboard-prod-abc123',
    ]);
    // With no instance emitted, dashboards do not declare a dependency.
    expect(entities[0].spec.dependsOn).toBeUndefined();
  });

  it('omits dashboard Resources when emitDashboards is false', () => {
    const entities = buildGrafanaEntities(instance, [dashboard()], {
      ...defaultOptions,
      emitDashboards: false,
    });
    expect(entities.map(e => e.metadata.name)).toEqual([
      'grafana-instance-prod',
    ]);
  });

  it('sanitizes entity names and tags', () => {
    const entities = buildGrafanaEntities(
      instance,
      [
        dashboard({
          uid: 'abc_9/xy',
          title: 'Weird Dash',
          tags: ['Team A', 'PROD!'],
        }),
      ],
      defaultOptions,
    );
    const resource = entities.find(e => e.spec.type === 'grafana-dashboard')!;
    expect(resource.metadata.name).toBe('grafana-dashboard-prod-abc_9-xy');
    expect(resource.metadata.tags).toEqual(['team-a', 'prod']);
  });

  it('disambiguates uids that differ only in case', () => {
    const entities = buildGrafanaEntities(
      instance,
      [
        dashboard({ uid: 'ABc123', title: 'Upper' }),
        dashboard({ uid: 'abc123', title: 'Lower' }),
      ],
      defaultOptions,
    );
    const names = entities
      .filter(e => e.spec.type === 'grafana-dashboard')
      .map(e => e.metadata.name);
    expect(names[0]).toBe('grafana-dashboard-prod-abc123-04505407');
    expect(names[1]).toBe('grafana-dashboard-prod-abc123');
    expect(names[0]).not.toBe(names[1]);
  });

  it('keeps truncated names within 63 chars, valid, and unique', () => {
    const longUidA = `${'a'.repeat(80)}-x`;
    const longUidB = `${'a'.repeat(80)}-y`;
    const entities = buildGrafanaEntities(
      instance,
      [
        dashboard({ uid: longUidA, title: 'Long A' }),
        dashboard({ uid: longUidB, title: 'Long B' }),
      ],
      defaultOptions,
    );
    const names = entities
      .filter(e => e.spec.type === 'grafana-dashboard')
      .map(e => e.metadata.name);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(63);
      // Must start and end alphanumeric (catalog name validation).
      expect(name).toMatch(/^[a-z0-9].*[a-z0-9]$/);
    }
    expect(names[0]).not.toBe(names[1]);
  });

  it('drops tags that sanitize to nothing', () => {
    const entities = buildGrafanaEntities(
      instance,
      [dashboard({ uid: 'abc', title: 'Dash', tags: ['!!!', 'ok'] })],
      defaultOptions,
    );
    const resource = entities.find(e => e.spec.type === 'grafana-dashboard')!;
    expect(resource.metadata.tags).toEqual(['ok']);
  });

  it('places entities and their relations in the configured namespace', () => {
    const entities = buildGrafanaEntities(instance, [dashboard()], {
      ...defaultOptions,
      namespace: 'observability',
    });

    for (const entity of entities) {
      expect(entity.metadata.namespace).toBe('observability');
    }
    const dash = entities.find(e => e.spec.type === 'grafana-dashboard')!;
    expect(dash.spec.dependsOn).toEqual([
      'resource:observability/grafana-instance-prod',
    ]);
  });

  it('omits tags when emitTags is false', () => {
    const entities = buildGrafanaEntities(
      instance,
      [dashboard({ tags: ['team-a', 'prod'] })],
      { ...defaultOptions, emitTags: false },
    );
    const resource = entities.find(e => e.spec.type === 'grafana-dashboard')!;
    expect(resource.metadata.tags).toBeUndefined();
  });

  it('honors every option at once', () => {
    const entities = buildGrafanaEntities(
      instance,
      [dashboard({ tags: ['team-a'] })],
      {
        defaultOwner: 'group:default/observability',
        system: 'observability',
        namespace: 'monitoring',
        emitInstances: false,
        emitDashboards: true,
        emitTags: false,
      },
    );

    // No instance entity, so the dashboard has no dependsOn either.
    expect(entities).toHaveLength(1);
    const [dash] = entities;
    expect(dash.spec.type).toBe('grafana-dashboard');
    expect(dash.metadata.namespace).toBe('monitoring');
    expect(dash.metadata.tags).toBeUndefined();
    expect(dash.spec.dependsOn).toBeUndefined();
    expect(dash.spec.system).toBe('observability');
    expect(dash.spec.owner).toBe('group:default/observability');
  });
});
