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

import { mockServices } from '@backstage/backend-test-utils';
import {
  GrafanaAlert,
  GrafanaDashboard,
} from '@marble-sh/backstage-plugin-grafana-common';
import {
  GrafanaClient,
  GrafanaInstanceConfig,
} from '@marble-sh/backstage-plugin-grafana-node';
import { GrafanaSnapshot, GrafanaStore } from '../store/GrafanaStore';
import { DefaultGrafanaService } from './GrafanaService';

class MemoryStore implements GrafanaStore {
  readonly map = new Map<string, GrafanaSnapshot>();
  async get(name: string) {
    return this.map.get(name);
  }
  async set(name: string, snapshot: GrafanaSnapshot) {
    this.map.set(name, snapshot);
  }
}

class FakeClient implements GrafanaClient {
  listDashboardsCalls = 0;
  listAlertsCalls = 0;
  constructor(
    private readonly dashboards: GrafanaDashboard[],
    private readonly alerts: GrafanaAlert[] = [],
  ) {}
  async listDashboards() {
    this.listDashboardsCalls += 1;
    return this.dashboards;
  }
  async listAlerts() {
    this.listAlertsCalls += 1;
    return this.alerts;
  }
}

const configFor = (name: string): GrafanaInstanceConfig => ({
  name,
  title: `Title ${name}`,
  baseUrl: `https://${name}.example.com`,
  token: 'token',
  namespace: 'default',
  apis: { dashboards: 'app-platform', alerts: 'prometheus' },
  resolveFolders: true,
});

const dash = (uid: string, tags: string[] = []): GrafanaDashboard => ({
  uid,
  title: uid.toUpperCase(),
  url: `https://g/d/${uid}`,
  tags,
  instanceName: 'prod',
});

const alert = (name: string, labels: Record<string, string>): GrafanaAlert => ({
  name,
  state: 'firing',
  url: 'https://g/alerting/list',
  labels,
  instanceName: 'prod',
});

function makeService(
  instances: Array<{ config: GrafanaInstanceConfig; client: FakeClient }>,
  store: GrafanaStore = new MemoryStore(),
  options: { fetchOnDemand?: boolean } = {},
) {
  return new DefaultGrafanaService({
    instances,
    store,
    logger: mockServices.logger.mock(),
    ...options,
  });
}

describe('DefaultGrafanaService', () => {
  it('lists the configured instances', () => {
    const service = makeService([
      { config: configFor('prod'), client: new FakeClient([]) },
      { config: configFor('staging'), client: new FakeClient([]) },
    ]);

    expect(service.getInstances()).toEqual([
      { name: 'prod', title: 'Title prod', url: 'https://prod.example.com' },
      {
        name: 'staging',
        title: 'Title staging',
        url: 'https://staging.example.com',
      },
    ]);
  });

  it('fetches live and stores a snapshot on a cache miss', async () => {
    const store = new MemoryStore();
    const client = new FakeClient([dash('a')], [alert('x', { team: 'a' })]);
    const service = makeService([{ config: configFor('prod'), client }], store);

    const dashboards = await service.getDashboards({ instanceName: 'prod' });

    expect(dashboards.map(d => d.uid)).toEqual(['a']);
    expect(client.listDashboardsCalls).toBe(1);
    expect(store.map.get('prod')?.dashboards).toHaveLength(1);
    expect(store.map.get('prod')?.alerts).toHaveLength(1);
  });

  it('serves from the store without calling the client on a cache hit', async () => {
    const store = new MemoryStore();
    const client = new FakeClient([dash('a')]);
    const service = makeService([{ config: configFor('prod'), client }], store);

    await service.getDashboards({ instanceName: 'prod' }); // populates
    await service.getDashboards({ instanceName: 'prod' }); // hit

    expect(client.listDashboardsCalls).toBe(1);
  });

  it('bypasses the store when refresh is requested', async () => {
    const store = new MemoryStore();
    const client = new FakeClient([dash('a')]);
    const service = makeService([{ config: configFor('prod'), client }], store);

    await service.getDashboards({ instanceName: 'prod' });
    await service.getDashboards({ instanceName: 'prod', refresh: true });

    expect(client.listDashboardsCalls).toBe(2);
  });

  it('aggregates across all instances when none is specified', async () => {
    const service = makeService([
      { config: configFor('prod'), client: new FakeClient([dash('a')]) },
      { config: configFor('staging'), client: new FakeClient([dash('b')]) },
    ]);

    const dashboards = await service.getDashboards({});
    expect(dashboards.map(d => d.uid).sort()).toEqual(['a', 'b']);
  });

  it('applies tag filters to stored dashboards', async () => {
    const client = new FakeClient([dash('a', ['x']), dash('b', ['y'])]);
    const service = makeService([{ config: configFor('prod'), client }]);

    const dashboards = await service.getDashboards({
      instanceName: 'prod',
      tags: ['x'],
    });
    expect(dashboards.map(d => d.uid)).toEqual(['a']);
  });

  it('selects the union of comma-separated query values', async () => {
    const client = new FakeClient([dash('a'), dash('b'), dash('c')]);
    const service = makeService([{ config: configFor('prod'), client }]);

    // dash titles are the uppercased uids: A, B, C.
    const dashboards = await service.getDashboards({
      instanceName: 'prod',
      query: 'a, b',
    });
    expect(dashboards.map(d => d.uid)).toEqual(['a', 'b']);
  });

  it('selects a single dashboard by exact uid', async () => {
    const client = new FakeClient([dash('a'), dash('b')]);
    const service = makeService([{ config: configFor('prod'), client }]);

    const dashboards = await service.getDashboards({
      instanceName: 'prod',
      uid: 'b',
    });
    expect(dashboards.map(d => d.uid)).toEqual(['b']);
  });

  it('applies label selectors to stored alerts', async () => {
    const client = new FakeClient(
      [],
      [alert('one', { team: 'a' }), alert('two', { team: 'b' })],
    );
    const service = makeService([{ config: configFor('prod'), client }]);

    const alerts = await service.getAlerts({
      instanceName: 'prod',
      labelSelector: { team: 'a' },
    });
    expect(alerts.map(a => a.name)).toEqual(['one']);
  });

  it('refreshes a single instance into the store', async () => {
    const store = new MemoryStore();
    const client = new FakeClient([dash('a')]);
    const service = makeService([{ config: configFor('prod'), client }], store);

    await service.refresh('prod');

    expect(client.listDashboardsCalls).toBe(1);
    expect(store.map.get('prod')?.dashboards).toHaveLength(1);
  });

  it('refreshes all instances when no name is given', async () => {
    const store = new MemoryStore();
    const prod = new FakeClient([dash('a')]);
    const staging = new FakeClient([dash('b')]);
    const service = makeService(
      [
        { config: configFor('prod'), client: prod },
        { config: configFor('staging'), client: staging },
      ],
      store,
    );

    await service.refresh();

    expect(prod.listDashboardsCalls).toBe(1);
    expect(staging.listDashboardsCalls).toBe(1);
    expect(store.map.size).toBe(2);
  });

  describe('with fetchOnDemand disabled', () => {
    it('serves store misses as empty without contacting Grafana', async () => {
      const store = new MemoryStore();
      const client = new FakeClient([dash('a')], [alert('x', { team: 'a' })]);
      const service = makeService(
        [{ config: configFor('prod'), client }],
        store,
        { fetchOnDemand: false },
      );

      expect(await service.getDashboards({ instanceName: 'prod' })).toEqual([]);
      expect(await service.getAlerts({ instanceName: 'prod' })).toEqual([]);
      expect(client.listDashboardsCalls).toBe(0);
      expect(client.listAlertsCalls).toBe(0);
      // Nothing was stored, so a later refresh fully populates the store.
      expect(store.map.size).toBe(0);
    });

    it('still serves stored snapshots', async () => {
      const store = new MemoryStore();
      const client = new FakeClient([dash('a')]);
      const service = makeService(
        [{ config: configFor('prod'), client }],
        store,
        { fetchOnDemand: false },
      );

      await service.refresh('prod'); // an explicit refresh populates
      const dashboards = await service.getDashboards({ instanceName: 'prod' });

      expect(dashboards.map(d => d.uid)).toEqual(['a']);
      expect(client.listDashboardsCalls).toBe(1); // only the refresh fetched
    });

    it('still honors an explicit refresh read', async () => {
      const store = new MemoryStore();
      const client = new FakeClient([dash('a')]);
      const service = makeService(
        [{ config: configFor('prod'), client }],
        store,
        { fetchOnDemand: false },
      );

      const dashboards = await service.getDashboards({
        instanceName: 'prod',
        refresh: true,
      });

      expect(dashboards.map(d => d.uid)).toEqual(['a']);
      expect(client.listDashboardsCalls).toBe(1);
      expect(store.map.get('prod')?.dashboards).toHaveLength(1);
    });

    it('still throws NotFoundError for an unknown instance', async () => {
      const service = makeService(
        [{ config: configFor('prod'), client: new FakeClient([]) }],
        new MemoryStore(),
        { fetchOnDemand: false },
      );

      await expect(service.getAlerts({ instanceName: 'nope' })).rejects.toThrow(
        /nope/,
      );
    });
  });

  it('throws NotFoundError for an unknown instance', async () => {
    const service = makeService([
      { config: configFor('prod'), client: new FakeClient([]) },
    ]);

    await expect(
      service.getDashboards({ instanceName: 'nope' }),
    ).rejects.toThrow(/nope/);
  });

  it('continues a full refresh past a failing instance', async () => {
    const store = new MemoryStore();
    const failing = new FakeClient([]);
    failing.listDashboards = async () => {
      throw new Error('grafana is down');
    };
    const healthy = new FakeClient([dash('b')]);
    const service = makeService(
      [
        { config: configFor('prod'), client: failing },
        { config: configFor('staging'), client: healthy },
      ],
      store,
    );

    await service.refresh();

    expect(store.map.has('prod')).toBe(false);
    expect(store.map.get('staging')?.dashboards).toHaveLength(1);
  });
});
