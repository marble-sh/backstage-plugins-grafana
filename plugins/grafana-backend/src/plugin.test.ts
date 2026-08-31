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
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import request from 'supertest';
import { grafanaPlugin } from './plugin';

const config = {
  grafana: {
    store: 'cache',
    instances: [
      {
        name: 'prod',
        title: 'Production',
        baseUrl: 'https://grafana.example.com',
        token: 'secret-token',
      },
    ],
  },
};

function mockGrafanaFetch() {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
    const url = String(input);
    if (url.includes('/api/ds/query')) {
      return new Response(
        JSON.stringify({
          results: {
            A: {
              status: 200,
              frames: [
                {
                  schema: {
                    refId: 'A',
                    fields: [
                      { name: 'time', type: 'time' },
                      { name: 'Value', type: 'number' },
                    ],
                  },
                  data: {
                    values: [
                      [1000, 2000],
                      [1, 2],
                    ],
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/dashboards/abc')) {
      return new Response(
        JSON.stringify({
          metadata: { name: 'abc' },
          spec: {
            title: 'My Dashboard',
            panels: [
              {
                id: 1,
                type: 'timeseries',
                title: 'Requests',
                datasource: { uid: 'prom-1', type: 'prometheus' },
                targets: [{ refId: 'A', expr: 'up' }],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/apis/dashboard.grafana.app/')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              metadata: { name: 'abc' },
              spec: { title: 'My Dashboard', tags: ['team-a'] },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/api/folders')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/prometheus/grafana/')) {
      return new Response(
        JSON.stringify({
          data: {
            groups: [
              {
                file: 'Team A',
                rules: [
                  {
                    name: 'High latency',
                    state: 'firing',
                    type: 'alerting',
                    labels: { team: 'team-a' },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });
}

describe('grafanaPlugin', () => {
  afterEach(() => jest.restoreAllMocks());

  async function startBackend() {
    const { server } = await startTestBackend({
      features: [
        grafanaPlugin,
        mockServices.rootConfig.factory({ data: config }),
      ],
    });
    return server;
  }

  it('exposes an unauthenticated health endpoint', async () => {
    const server = await startBackend();
    const res = await request(server).get('/api/grafana/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('lists configured instances', async () => {
    const server = await startBackend();
    const res = await request(server)
      .get('/api/grafana/instances')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          name: 'prod',
          title: 'Production',
          url: 'https://grafana.example.com',
        },
      ],
    });
  });

  it('reads dashboards from Grafana on demand', async () => {
    mockGrafanaFetch();
    const server = await startBackend();

    const res = await request(server)
      .get('/api/grafana/instances/prod/dashboards')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        uid: 'abc',
        title: 'My Dashboard',
        url: 'https://grafana.example.com/d/abc/my-dashboard',
        tags: ['team-a'],
        instanceName: 'prod',
      },
    ]);
  });

  it('reads alerts from Grafana on demand', async () => {
    mockGrafanaFetch();
    const server = await startBackend();

    const res = await request(server)
      .get('/api/grafana/instances/prod/alerts')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        name: 'High latency',
        state: 'firing',
        url: 'https://grafana.example.com/alerting/list',
        labels: { team: 'team-a' },
        folderTitle: 'Team A',
        instanceName: 'prod',
      },
    ]);
  });

  it('lists panels and serves panel data live from Grafana', async () => {
    mockGrafanaFetch();
    const server = await startBackend();
    const auth = mockCredentials.user.header();

    const panels = await request(server)
      .get('/api/grafana/instances/prod/dashboards/abc/panels')
      .set('Authorization', auth);
    expect(panels.status).toBe(200);
    expect(panels.body.items).toEqual([
      {
        id: 1,
        title: 'Requests',
        type: 'timeseries',
        kind: 'timeseries',
        dashboardUid: 'abc',
        instanceName: 'prod',
      },
    ]);

    const data = await request(server)
      .get('/api/grafana/instances/prod/dashboards/abc/panels/1/data')
      .query('from=now-1h&to=now')
      .set('Authorization', auth);
    expect(data.status).toBe(200);
    expect(data.body).toEqual({
      panelId: 1,
      series: [
        {
          name: 'Value',
          points: [
            { timeMs: 1000, value: 1 },
            { timeMs: 2000, value: 2 },
          ],
        },
      ],
    });
  });

  it('rejects the panel routes with 403 when panel queries are off', async () => {
    const fetchSpy = mockGrafanaFetch();
    const { server } = await startTestBackend({
      features: [
        grafanaPlugin,
        mockServices.rootConfig.factory({
          data: {
            grafana: { ...config.grafana, allowPanelQueries: false },
          },
        }),
      ],
    });
    const auth = mockCredentials.user.header();

    const panels = await request(server)
      .get('/api/grafana/instances/prod/dashboards/abc/panels')
      .set('Authorization', auth);
    const data = await request(server)
      .get('/api/grafana/instances/prod/dashboards/abc/panels/1/data')
      .set('Authorization', auth);

    expect(panels.status).toBe(403);
    expect(data.status).toBe(403);
    expect(panels.body.error.message).toMatch(/allowPanelQueries/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('boots with the database store and serves snapshots from it', async () => {
    const fetchSpy = mockGrafanaFetch();
    const { server } = await startTestBackend({
      features: [
        grafanaPlugin,
        mockServices.rootConfig.factory({
          data: {
            grafana: { ...config.grafana, store: 'database' },
          },
        }),
      ],
    });

    const first = await request(server)
      .get('/api/grafana/instances/prod/dashboards')
      .set('Authorization', mockCredentials.user.header());
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);

    const callsAfterFirst = fetchSpy.mock.calls.length;
    const second = await request(server)
      .get('/api/grafana/instances/prod/dashboards')
      .set('Authorization', mockCredentials.user.header());
    expect(second.status).toBe(200);
    expect(second.body.items).toEqual(first.body.items);
    // The second request is served from the database snapshot.
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('registers and runs the scheduled refresh when configured', async () => {
    const fetchSpy = mockGrafanaFetch();
    const scheduler = mockServices.scheduler.mock();

    await startTestBackend({
      features: [
        grafanaPlugin,
        scheduler.factory,
        mockServices.rootConfig.factory({
          data: {
            grafana: {
              ...config.grafana,
              schedule: {
                frequency: { minutes: 5 },
                timeout: { minutes: 1 },
              },
            },
          },
        }),
      ],
    });

    expect(scheduler.scheduleTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'grafana-refresh',
        frequency: { minutes: 5 },
        timeout: { minutes: 1 },
      }),
    );

    // Invoking the scheduled task refreshes every instance from Grafana.
    const task = scheduler.scheduleTask.mock.calls[0][0] as {
      fn: () => Promise<void>;
    };
    await task.fn();
    const urls = fetchSpy.mock.calls.map(call => String(call[0]));
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/apis/dashboard.grafana.app/'),
        expect.stringContaining('/api/prometheus/grafana/'),
      ]),
    );
  });

  it('starts with no instances configured and serves empty results', async () => {
    const { server } = await startTestBackend({
      features: [
        grafanaPlugin,
        mockServices.rootConfig.factory({ data: { grafana: {} } }),
      ],
    });

    const res = await request(server)
      .get('/api/grafana/instances')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('rejects the refresh routes with 403 when on-demand refresh is off', async () => {
    const { server } = await startTestBackend({
      features: [
        grafanaPlugin,
        mockServices.rootConfig.factory({
          data: {
            grafana: { ...config.grafana, allowOnDemandRefresh: false },
          },
        }),
      ],
    });

    const res = await request(server)
      .post('/api/grafana/refresh')
      .set('Authorization', mockCredentials.user.header());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/allowOnDemandRefresh/);
  });

  it('behaves correctly with every flag engaged at once', async () => {
    // All six flag groups' backend-relevant switches together: locked-down
    // on-demand behavior, one instance without alerting or folder lookups,
    // and one instance serving no dashboards.
    const fetchSpy = mockGrafanaFetch();
    const scheduler = mockServices.scheduler.mock();

    const { server } = await startTestBackend({
      features: [
        grafanaPlugin,
        scheduler.factory,
        mockServices.rootConfig.factory({
          data: {
            grafana: {
              allowOnDemandRefresh: false,
              fetchOnDemand: false,
              store: 'cache',
              schedule: { frequency: { minutes: 5 }, timeout: { minutes: 1 } },
              instances: [
                {
                  name: 'prod',
                  baseUrl: 'https://grafana.example.com',
                  token: 'secret-token',
                  apis: { alerts: 'none' },
                  resolveFolders: false,
                },
                {
                  name: 'alerts-only',
                  baseUrl: 'https://alerts.example.com',
                  token: 'secret-token',
                  apis: { dashboards: 'none' },
                },
              ],
            },
          },
        }),
      ],
    });
    const auth = mockCredentials.user.header();

    // 1. Cold reads are empty and never reach Grafana, refresh param or not.
    const cold = await request(server)
      .get('/api/grafana/dashboards?refresh=true')
      .set('Authorization', auth);
    expect(cold.status).toBe(200);
    expect(cold.body.items).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. Forced refresh routes are shut off.
    const forced = await request(server)
      .post('/api/grafana/instances/prod/refresh')
      .set('Authorization', auth);
    expect(forced.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 3. The schedule is the only path to Grafana; running it fetches
    //    dashboards for 'prod' only (alerts none, folders off) and alerts for
    //    'alerts-only' only (dashboards none).
    const task = scheduler.scheduleTask.mock.calls[0][0] as {
      fn: () => Promise<void>;
    };
    await task.fn();
    const urls = fetchSpy.mock.calls.map(call => String(call[0]));
    expect(urls).toEqual([
      'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
      'https://alerts.example.com/api/prometheus/grafana/api/v1/rules',
    ]);

    // 4. The scheduled refresh populated the store; reads now serve it
    //    without any further Grafana traffic.
    const warm = await request(server)
      .get('/api/grafana/dashboards')
      .set('Authorization', auth);
    expect(warm.body.items.map((d: { uid: string }) => d.uid)).toEqual(['abc']);
    const alerts = await request(server)
      .get('/api/grafana/alerts')
      .set('Authorization', auth);
    expect(alerts.body.items.map((a: { name: string }) => a.name)).toEqual([
      'High latency',
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
