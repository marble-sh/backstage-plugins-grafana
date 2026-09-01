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

import { GrafanaHttpClient } from './GrafanaHttpClient';
import { GrafanaInstanceConfig } from './config';

const instance: GrafanaInstanceConfig = {
  name: 'prod',
  title: 'Production',
  baseUrl: 'https://grafana.example.com',
  token: 'secret-token',
  namespace: 'default',
  apis: { dashboards: 'app-platform', alerts: 'prometheus' },
  resolveFolders: true,
};

const legacyInstance: GrafanaInstanceConfig = {
  ...instance,
  apis: { dashboards: 'legacy-search', alerts: 'prometheus' },
};

type Call = { url: string; init?: RequestInit };

function mockFetch(
  handler: (url: string) => { status?: number; body: unknown },
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchApi = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = handler(String(url));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetch: fetchApi, calls };
}

/** Routes App Platform dashboard + folder requests to separate bodies. */
function appPlatformFetch(options: {
  dashboards: { status?: number; body: unknown };
  folders?: { status?: number; body: unknown };
}) {
  return mockFetch(url => {
    if (url.includes('/api/folders')) {
      return options.folders ?? { body: [] };
    }
    return options.dashboards;
  });
}

describe('GrafanaHttpClient', () => {
  describe('listDashboards (app-platform)', () => {
    it('lists and normalizes dashboards from the App Platform API', async () => {
      const { fetch, calls } = appPlatformFetch({
        dashboards: {
          body: {
            kind: 'DashboardList',
            items: [
              {
                metadata: { name: 'abc123' },
                spec: { title: 'My Service', tags: ['team-a', 'prod'] },
              },
              {
                metadata: { name: 'def456' },
                spec: { title: 'Other', tags: [] },
              },
            ],
          },
        },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const dashboards = await client.listDashboards();

      expect(calls.map(c => c.url)).toEqual(
        expect.arrayContaining([
          'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
          'https://grafana.example.com/api/folders',
        ]),
      );
      expect(
        (calls[0].init?.headers as Record<string, string>).Authorization,
      ).toBe('Bearer secret-token');
      expect(dashboards).toEqual([
        {
          uid: 'abc123',
          title: 'My Service',
          url: 'https://grafana.example.com/d/abc123/my-service',
          tags: ['team-a', 'prod'],
          instanceName: 'prod',
        },
        {
          uid: 'def456',
          title: 'Other',
          url: 'https://grafana.example.com/d/def456/other',
          tags: [],
          instanceName: 'prod',
        },
      ]);
    });

    it('resolves folder titles and urls via /api/folders', async () => {
      const { fetch } = appPlatformFetch({
        dashboards: {
          body: {
            items: [
              {
                metadata: {
                  name: 'abc123',
                  annotations: { 'grafana.app/folder': 'team-a-folder' },
                },
                spec: { title: 'My Service' },
              },
              {
                metadata: {
                  name: 'unknown-folder',
                  annotations: { 'grafana.app/folder': 'missing' },
                },
                spec: { title: 'Orphan' },
              },
            ],
          },
        },
        folders: {
          body: [
            { uid: 'team-a-folder', title: 'Team A' },
            { uid: 'incomplete' },
          ],
        },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const dashboards = await client.listDashboards();

      expect(dashboards[0]).toMatchObject({
        uid: 'abc123',
        folderTitle: 'Team A',
        folderUrl:
          'https://grafana.example.com/dashboards/f/team-a-folder/team-a',
      });
      // A folder uid that /api/folders does not report is simply omitted.
      expect(dashboards[1].folderTitle).toBeUndefined();
      expect(dashboards[1].folderUrl).toBeUndefined();
    });

    it('degrades gracefully when the folder listing fails', async () => {
      const { fetch } = appPlatformFetch({
        dashboards: {
          body: {
            items: [
              {
                metadata: {
                  name: 'abc123',
                  annotations: { 'grafana.app/folder': 'team-a-folder' },
                },
                spec: { title: 'My Service' },
              },
            ],
          },
        },
        folders: { status: 403, body: { message: 'forbidden' } },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const dashboards = await client.listDashboards();

      expect(dashboards).toHaveLength(1);
      expect(dashboards[0].folderTitle).toBeUndefined();
    });

    it('tolerates sparse and missing App Platform fields', async () => {
      const { fetch } = appPlatformFetch({
        dashboards: {
          body: {
            items: [{ metadata: {} }, {}],
          },
        },
        folders: { body: { not: 'an array' } },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const dashboards = await client.listDashboards();

      expect(dashboards).toEqual([
        {
          uid: '',
          title: '',
          url: 'https://grafana.example.com/d//',
          tags: [],
          instanceName: 'prod',
        },
        {
          uid: '',
          title: '',
          url: 'https://grafana.example.com/d//',
          tags: [],
          instanceName: 'prod',
        },
      ]);
    });

    it('returns an empty list when the response has no items', async () => {
      const { fetch } = appPlatformFetch({ dashboards: { body: {} } });
      const client = new GrafanaHttpClient({ instance, fetch });

      expect(await client.listDashboards()).toEqual([]);
    });

    it('follows list pagination via the metadata.continue token', async () => {
      const firstPage = {
        items: [{ metadata: { name: 'a' }, spec: { title: 'A' } }],
        metadata: { continue: 'token-1' },
      };
      const secondPage = {
        items: [{ metadata: { name: 'b' }, spec: { title: 'B' } }],
        metadata: { continue: '' },
      };
      const { fetch, calls } = mockFetch(url => {
        if (url.includes('/api/folders')) {
          return { body: [] };
        }
        return { body: url.includes('continue=') ? secondPage : firstPage };
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const dashboards = await client.listDashboards();

      expect(dashboards.map(d => d.uid)).toEqual(['a', 'b']);
      expect(
        calls.map(c => c.url).filter(url => url.includes('/dashboards')),
      ).toEqual([
        'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
        'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards?continue=token-1',
      ]);
    });

    it('filters dashboards by tag and query client-side', async () => {
      const { fetch } = appPlatformFetch({
        dashboards: {
          body: {
            items: [
              {
                metadata: { name: 'a' },
                spec: { title: 'Alpha', tags: ['x'] },
              },
              { metadata: { name: 'b' }, spec: { title: 'Beta', tags: ['y'] } },
              {
                metadata: { name: 'c' },
                spec: { title: 'Alpine', tags: ['x'] },
              },
            ],
          },
        },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const byTag = await client.listDashboards({ tags: ['x'] });
      expect(byTag.map(d => d.uid)).toEqual(['a', 'c']);

      const byQuery = await client.listDashboards({ query: 'alp' });
      expect(byQuery.map(d => d.uid)).toEqual(['a', 'c']);
    });
  });

  describe('listDashboards (legacy-search)', () => {
    it('lists dashboards from the classic /api/search endpoint', async () => {
      const { fetch, calls } = mockFetch(() => ({
        body: [
          {
            uid: 'abc123',
            title: 'My Service',
            url: '/d/abc123/my-service',
            folderTitle: 'Team A',
            folderUrl: '/dashboards/f/team-a-folder/team-a',
            tags: ['team-a'],
          },
        ],
      }));
      const client = new GrafanaHttpClient({ instance: legacyInstance, fetch });

      const dashboards = await client.listDashboards();

      expect(calls[0].url).toBe(
        'https://grafana.example.com/api/search?type=dash-db',
      );
      expect(dashboards).toEqual([
        {
          uid: 'abc123',
          title: 'My Service',
          url: 'https://grafana.example.com/d/abc123/my-service',
          folderTitle: 'Team A',
          folderUrl:
            'https://grafana.example.com/dashboards/f/team-a-folder/team-a',
          tags: ['team-a'],
          instanceName: 'prod',
        },
      ]);
    });

    it('tolerates sparse legacy items and a non-array body', async () => {
      const sparse = new GrafanaHttpClient({
        instance: legacyInstance,
        fetch: mockFetch(() => ({ body: [{ uid: 'abc' }] })).fetch,
      });
      expect(await sparse.listDashboards()).toEqual([
        {
          uid: 'abc',
          title: '',
          url: 'https://grafana.example.com/d/abc',
          folderTitle: undefined,
          tags: [],
          instanceName: 'prod',
        },
      ]);

      const malformed = new GrafanaHttpClient({
        instance: legacyInstance,
        fetch: mockFetch(() => ({ body: { unexpected: true } })).fetch,
      });
      expect(await malformed.listDashboards()).toEqual([]);
    });
  });

  describe('listAlerts (prometheus)', () => {
    it('lists and normalizes alert rules with their state', async () => {
      const { fetch, calls } = mockFetch(() => ({
        body: {
          status: 'success',
          data: {
            groups: [
              {
                name: 'group-1',
                file: 'Team A',
                rules: [
                  {
                    name: 'High latency',
                    state: 'firing',
                    type: 'alerting',
                    labels: { team: 'team-a', severity: 'high' },
                  },
                  {
                    name: 'A recording rule',
                    type: 'recording',
                  },
                  {
                    name: 'Low disk',
                    state: 'inactive',
                    type: 'alerting',
                    labels: { team: 'team-b' },
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const alerts = await client.listAlerts();

      expect(calls[0].url).toBe(
        'https://grafana.example.com/api/prometheus/grafana/api/v1/rules',
      );
      // recording rules are excluded
      expect(alerts).toEqual([
        {
          name: 'High latency',
          state: 'firing',
          url: 'https://grafana.example.com/alerting/list',
          labels: { team: 'team-a', severity: 'high' },
          folderTitle: 'Team A',
          instanceName: 'prod',
        },
        {
          name: 'Low disk',
          state: 'inactive',
          url: 'https://grafana.example.com/alerting/list',
          labels: { team: 'team-b' },
          folderTitle: 'Team A',
          instanceName: 'prod',
        },
      ]);
    });

    it('maps unrecognized states to unknown and tolerates sparse rules', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                rules: [{ state: 'exploded' }],
              },
              { name: 'empty-group' },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const alerts = await client.listAlerts();

      expect(alerts).toEqual([
        {
          name: '',
          state: 'unknown',
          url: 'https://grafana.example.com/alerting/list',
          labels: {},
          folderTitle: undefined,
          instanceName: 'prod',
        },
      ]);
    });

    it('returns an empty list when the response has no groups', async () => {
      const { fetch } = mockFetch(() => ({ body: {} }));
      const client = new GrafanaHttpClient({ instance, fetch });

      expect(await client.listAlerts()).toEqual([]);
    });

    it('filters alerts by label selector', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                name: 'g',
                rules: [
                  {
                    name: 'one',
                    state: 'firing',
                    type: 'alerting',
                    labels: { team: 'team-a' },
                  },
                  {
                    name: 'two',
                    state: 'firing',
                    type: 'alerting',
                    labels: { team: 'team-b' },
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const alerts = await client.listAlerts({
        labelSelector: { team: 'team-a' },
      });
      expect(alerts.map(a => a.name)).toEqual(['one']);
    });
  });

  it('throws a descriptive error on a non-2xx response', async () => {
    const { fetch } = mockFetch(() => ({
      status: 401,
      body: { message: 'unauthorized' },
    }));
    const client = new GrafanaHttpClient({ instance, fetch });

    await expect(client.listDashboards()).rejects.toThrow(/401/);
  });

  describe('per-instance toggles', () => {
    it('returns empty without contacting Grafana when dashboards are none', async () => {
      const { fetch, calls } = mockFetch(() => ({ body: {} }));
      const client = new GrafanaHttpClient({
        instance: {
          ...instance,
          apis: { dashboards: 'none', alerts: 'prometheus' },
        },
        fetch,
      });

      expect(await client.listDashboards()).toEqual([]);
      expect(calls).toHaveLength(0);
    });

    it('returns empty without contacting Grafana when alerts are none', async () => {
      const { fetch, calls } = mockFetch(() => ({ body: {} }));
      const client = new GrafanaHttpClient({
        instance: {
          ...instance,
          apis: { dashboards: 'app-platform', alerts: 'none' },
        },
        fetch,
      });

      expect(await client.listAlerts()).toEqual([]);
      expect(calls).toHaveLength(0);
    });

    it('makes no requests at all when both data types are none', async () => {
      const { fetch, calls } = mockFetch(() => ({ body: {} }));
      const client = new GrafanaHttpClient({
        instance: { ...instance, apis: { dashboards: 'none', alerts: 'none' } },
        fetch,
      });

      expect(await client.listDashboards()).toEqual([]);
      expect(await client.listAlerts()).toEqual([]);
      expect(calls).toHaveLength(0);
    });

    it('skips the /api/folders call when resolveFolders is off', async () => {
      const { fetch, calls } = appPlatformFetch({
        dashboards: {
          body: {
            items: [
              {
                metadata: {
                  name: 'abc123',
                  annotations: { 'grafana.app/folder': 'team-a-folder' },
                },
                spec: { title: 'My Service' },
              },
            ],
          },
        },
        folders: { body: [{ uid: 'team-a-folder', title: 'Team A' }] },
      });
      const client = new GrafanaHttpClient({
        instance: { ...instance, resolveFolders: false },
        fetch,
      });

      const dashboards = await client.listDashboards();

      expect(calls.map(c => c.url)).toEqual([
        'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
      ]);
      expect(dashboards[0].folderTitle).toBeUndefined();
      expect(dashboards[0].folderUrl).toBeUndefined();
    });

    it('keeps legacy-search folder info even with resolveFolders off', async () => {
      const { fetch } = mockFetch(() => ({
        body: [
          {
            uid: 'abc',
            title: 'My Service',
            url: '/d/abc/my-service',
            folderTitle: 'Team A',
            folderUrl: '/dashboards/f/xyz/team-a',
            tags: [],
          },
        ],
      }));
      const client = new GrafanaHttpClient({
        instance: { ...legacyInstance, resolveFolders: false },
        fetch,
      });

      const [dashboard] = await client.listDashboards();
      expect(dashboard.folderTitle).toBe('Team A');
      expect(dashboard.folderUrl).toBe(
        'https://grafana.example.com/dashboards/f/xyz/team-a',
      );
    });
  });

  describe('listAlerts enrichment', () => {
    it('maps uid, health, annotations, and active instances onto alerts', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                name: 'group-1',
                file: 'Team A',
                rules: [
                  {
                    name: 'High latency',
                    state: 'firing',
                    type: 'alerting',
                    uid: 'rule-uid-1',
                    health: 'ok',
                    activeAt: '2026-08-30T10:00:00Z',
                    labels: { team: 'team-a' },
                    annotations: {
                      summary: 'p99 above 500ms',
                      __dashboardUid__: 'dash-1',
                      __panelId__: '4',
                    },
                    alerts: [
                      { state: 'Alerting', activeAt: '2026-08-30T10:00:00Z' },
                      { state: 'Pending', activeAt: '2026-08-30T10:05:00Z' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const [alert] = await client.listAlerts();

      expect(alert).toEqual({
        name: 'High latency',
        state: 'firing',
        url: 'https://grafana.example.com/alerting/grafana/rule-uid-1/view',
        labels: { team: 'team-a' },
        folderTitle: 'Team A',
        instanceName: 'prod',
        uid: 'rule-uid-1',
        health: 'ok',
        summary: 'p99 above 500ms',
        activeAt: '2026-08-30T10:00:00Z',
        activeCount: 2,
        dashboardUid: 'dash-1',
        panelId: 4,
      });
    });

    it('counts only alerting and pending instances in activeCount', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                name: 'g',
                rules: [
                  {
                    name: 'r',
                    state: 'inactive',
                    type: 'alerting',
                    alerts: [
                      { state: 'Alerting' },
                      { state: 'Pending' },
                      // A rule that has never fired still reports its
                      // instances, in the Normal state.
                      { state: 'Normal' },
                      { state: 'Error' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const [alert] = await client.listAlerts();
      expect(alert.activeCount).toBe(2);
    });

    it('recognizes instance states carrying a reason suffix', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                name: 'g',
                rules: [
                  {
                    name: 'r',
                    state: 'firing',
                    type: 'alerting',
                    alerts: [
                      // Grafana appends the state reason for no-data /
                      // keep-last handling, e.g. on Grafana Cloud 13.x.
                      { state: 'Alerting (NoData, KeepLast)' },
                      { state: 'Normal (NoData, KeepLast)' },
                      { state: 'Recovering' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const [alert] = await client.listAlerts();
      expect(alert.activeCount).toBe(2);
    });

    it('does not parse an empty __panelId__ annotation as panel 0', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                name: 'g',
                rules: [
                  {
                    name: 'r',
                    state: 'firing',
                    type: 'alerting',
                    annotations: { __panelId__: '' },
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const [alert] = await client.listAlerts();
      expect(alert.panelId).toBeUndefined();
    });

    it('omits zero-value activeAt, maps odd health to unknown', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          data: {
            groups: [
              {
                name: 'g',
                rules: [
                  {
                    name: 'Quiet rule',
                    state: 'inactive',
                    type: 'alerting',
                    uid: 'rule-uid-2',
                    health: 'melted',
                    activeAt: '0001-01-01T00:00:00Z',
                    alerts: [],
                  },
                ],
              },
            ],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const [alert] = await client.listAlerts();

      expect(alert.activeAt).toBeUndefined();
      expect(alert.health).toBe('unknown');
      expect(alert.activeCount).toBe(0);
      expect(alert.summary).toBeUndefined();
      expect(alert.dashboardUid).toBeUndefined();
      expect(alert.panelId).toBeUndefined();
      expect(alert.url).toBe(
        'https://grafana.example.com/alerting/grafana/rule-uid-2/view',
      );
    });
  });

  describe('getPanels', () => {
    const appPlatformDashboard = {
      kind: 'Dashboard',
      metadata: { name: 'abc123' },
      spec: {
        title: 'My Service',
        panels: [
          { id: 1, type: 'timeseries', title: 'Requests' },
          { id: 2, type: 'stat', title: 'Uptime', description: 'SLO' },
          { id: 3, type: 'table', title: 'Breakdown' },
        ],
      },
    };

    it('reads a single dashboard from the App Platform API', async () => {
      const { fetch, calls } = mockFetch(() => ({
        body: appPlatformDashboard,
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      const panels = await client.getPanels('abc123');

      expect(calls[0].url).toBe(
        'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards/abc123',
      );
      expect(panels).toEqual([
        {
          id: 1,
          title: 'Requests',
          type: 'timeseries',
          kind: 'timeseries',
          dashboardUid: 'abc123',
          instanceName: 'prod',
        },
        {
          id: 2,
          title: 'Uptime',
          type: 'stat',
          kind: 'stat',
          description: 'SLO',
          dashboardUid: 'abc123',
          instanceName: 'prod',
        },
        {
          id: 3,
          title: 'Breakdown',
          type: 'table',
          kind: 'unsupported',
          dashboardUid: 'abc123',
          instanceName: 'prod',
        },
      ]);
    });

    it('reads via the classic endpoint for legacy-search instances', async () => {
      const { fetch, calls } = mockFetch(() => ({
        body: {
          meta: { slug: 'my-service' },
          dashboard: {
            uid: 'abc123',
            panels: [{ id: 1, type: 'graph', title: 'Requests' }],
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance: legacyInstance, fetch });

      const panels = await client.getPanels('abc123');

      expect(calls[0].url).toBe(
        'https://grafana.example.com/api/dashboards/uid/abc123',
      );
      expect(panels).toEqual([
        expect.objectContaining({ id: 1, kind: 'timeseries' }),
      ]);
    });

    it('rejects when the dashboards API is disabled for the instance', async () => {
      const { fetch, calls } = mockFetch(() => ({ body: {} }));
      const client = new GrafanaHttpClient({
        instance: {
          ...instance,
          apis: { dashboards: 'none', alerts: 'prometheus' },
        },
        fetch,
      });

      await expect(client.getPanels('abc123')).rejects.toThrow(/disabled/);
      expect(calls).toHaveLength(0);
    });

    it('rejects when an App Platform version conversion failed', async () => {
      const { fetch } = mockFetch(() => ({
        body: {
          metadata: { name: 'abc123' },
          spec: {},
          status: {
            conversion: { failed: true, storedVersion: 'v2alpha1' },
          },
        },
      }));
      const client = new GrafanaHttpClient({ instance, fetch });

      await expect(client.getPanels('abc123')).rejects.toThrow(/v2alpha1/);
    });
  });

  describe('getPanelData', () => {
    const dashboardBody = {
      metadata: { name: 'abc123' },
      spec: {
        title: 'My Service',
        templating: { list: [{ name: 'env', current: { value: 'prod' } }] },
        panels: [
          {
            id: 1,
            type: 'timeseries',
            title: 'Requests',
            datasource: { uid: 'prom-1', type: 'prometheus' },
            maxDataPoints: 100,
            targets: [{ refId: 'A', expr: 'up{env="$env"}' }],
          },
          { id: 9, type: 'text', title: 'Notes' },
        ],
      },
    };

    const framesBody = {
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
    };

    function panelDataFetch(options?: {
      query?: { status?: number; body: unknown };
    }) {
      return mockFetch(url => {
        if (url.includes('/api/ds/query')) {
          return options?.query ?? { body: framesBody };
        }
        return { body: dashboardBody };
      });
    }

    it('queries the panel targets and normalizes the frames', async () => {
      const { fetch, calls } = panelDataFetch();
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1, {
        from: 'now-1h',
        to: 'now',
      });

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      expect(queryCall.url).toBe('https://grafana.example.com/api/ds/query');
      expect(queryCall.init?.method).toBe('POST');
      expect(
        (queryCall.init?.headers as Record<string, string>)['Content-Type'],
      ).toBe('application/json');
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body).toEqual({
        from: 'now-1h',
        to: 'now',
        queries: [
          {
            refId: 'A',
            expr: 'up{env="prod"}',
            datasource: { uid: 'prom-1', type: 'prometheus' },
            maxDataPoints: 100,
            intervalMs: 36_000,
          },
        ],
      });
      expect(data).toEqual({
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

    it('defaults the range to the last six hours', async () => {
      const { fetch, calls } = panelDataFetch();
      const client = new GrafanaHttpClient({ instance, fetch });

      await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.from).toBe('now-6h');
      expect(body.to).toBe('now');
    });

    it('reuses the dashboard model across panel data calls', async () => {
      const { fetch, calls } = panelDataFetch();
      const client = new GrafanaHttpClient({ instance, fetch });

      await client.getPanelData('abc123', 1);
      await client.getPanelData('abc123', 1);

      const dashboardCalls = calls.filter(c =>
        c.url.includes('/dashboards/abc123'),
      );
      expect(dashboardCalls).toHaveLength(1);
    });

    it('rejects for a panel that does not exist', async () => {
      const { fetch } = panelDataFetch();
      const client = new GrafanaHttpClient({ instance, fetch });

      await expect(client.getPanelData('abc123', 999)).rejects.toThrow(
        /No panel with id 999/,
      );
    });

    it('returns warnings instead of querying when no targets are usable', async () => {
      const { fetch, calls } = panelDataFetch();
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 9);

      expect(calls.some(c => c.url.includes('/api/ds/query'))).toBe(false);
      expect(data.panelId).toBe(9);
      expect(data.series).toEqual([]);
    });

    it('surfaces per-query errors from a partial 400 response', async () => {
      const { fetch } = panelDataFetch({
        query: {
          status: 400,
          body: {
            results: {
              A: { status: 500, error: 'query timed out', frames: [] },
            },
          },
        },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      expect(data.series).toEqual([]);
      expect(data.warnings).toEqual([
        expect.stringContaining('query timed out'),
      ]);
    });

    it('throws on non-2xx responses without a results body', async () => {
      const { fetch } = panelDataFetch({
        query: { status: 403, body: { message: 'forbidden' } },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      await expect(client.getPanelData('abc123', 1)).rejects.toThrow(/403/);
    });

    it('excludes hidden targets from the normalized series', async () => {
      const hiddenDashboard = {
        metadata: { name: 'abc123' },
        spec: {
          panels: [
            {
              id: 1,
              type: 'timeseries',
              title: 'Requests',
              datasource: { uid: 'prom-1' },
              targets: [
                { refId: 'A', expr: 'up', hide: true },
                { refId: 'B', expr: 'up' },
              ],
            },
          ],
        },
      };
      const frames = (refId: string) => ({
        schema: {
          refId,
          fields: [
            { name: 'time', type: 'time' },
            { name: refId, type: 'number' },
          ],
        },
        data: { values: [[1], [1]] },
      });
      const { fetch, calls } = mockFetch(url => {
        if (url.includes('/api/ds/query')) {
          return {
            body: {
              results: {
                // The hidden query fails: its series were never going to be
                // shown, so no user-facing warning must be produced either.
                A: { status: 500, error: 'query timed out' },
                B: { status: 200, frames: [frames('B')] },
              },
            },
          };
        }
        return { body: hiddenDashboard };
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries.map((q: { refId: string }) => q.refId)).toEqual([
        'A',
        'B',
      ]);
      expect(data.series.map(s => s.name)).toEqual(['B']);
      expect(data.warnings).toBeUndefined();
    });
  });

  describe('getPanelData datasource resolution', () => {
    const datasources = [
      { uid: 'loki-1', name: 'My Loki', type: 'loki' },
      { uid: 'prom-1', name: 'My Prometheus', type: 'prometheus' },
    ];

    function resolutionFetch(options: {
      targets: unknown[];
      datasources?: { status?: number; body: unknown };
      query?: { body: unknown };
    }) {
      return mockFetch(url => {
        if (url.includes('/api/ds/query')) {
          return options.query ?? { body: { results: {} } };
        }
        if (url.includes('/api/datasources')) {
          return options.datasources ?? { body: datasources };
        }
        return {
          body: {
            metadata: { name: 'abc123' },
            spec: {
              panels: [{ id: 1, type: 'timeseries', targets: options.targets }],
            },
          },
        };
      });
    }

    it('rewrites a ref whose uid is actually a datasource name', async () => {
      // Grafana Cloud provisions dashboards whose targets carry the
      // datasource NAME in the uid field; Grafana's own frontend resolves
      // uid-then-name, so the client must too.
      const { fetch, calls } = resolutionFetch({
        targets: [
          {
            refId: 'A',
            expr: 'up',
            datasource: { uid: 'My Loki', type: 'loki' },
          },
        ],
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries[0].datasource).toEqual({
        uid: 'loki-1',
        type: 'loki',
      });
    });

    it('resolves legacy string datasource names to uid refs', async () => {
      const { fetch, calls } = resolutionFetch({
        targets: [{ refId: 'A', expr: 'up', datasource: 'My Prometheus' }],
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries[0].datasource).toEqual({
        uid: 'prom-1',
        type: 'prometheus',
      });
    });

    it('skips queries whose datasource does not exist, with a warning', async () => {
      // A stale ref must not reach /api/ds/query: Grafana would reply
      // 404 for the WHOLE batch, failing the healthy queries with it.
      const { fetch, calls } = resolutionFetch({
        targets: [
          { refId: 'A', expr: 'up', datasource: { uid: 'deleted-ds' } },
          { refId: 'B', expr: 'up', datasource: { uid: 'prom-1' } },
        ],
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries.map((q: { refId: string }) => q.refId)).toEqual([
        'B',
      ]);
      expect(data.warnings).toEqual([
        expect.stringMatching(/Query A was skipped.*'deleted-ds'.*not found/),
      ]);
    });

    it('does not query at all when every datasource is unresolvable', async () => {
      const { fetch, calls } = resolutionFetch({
        targets: [
          { refId: 'A', expr: 'up', datasource: { uid: 'deleted-ds' } },
        ],
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      expect(calls.some(c => c.url.includes('/api/ds/query'))).toBe(false);
      expect(data.series).toEqual([]);
      expect(data.warnings).toHaveLength(1);
    });

    it('passes expression and built-in refs through unchecked', async () => {
      const { fetch, calls } = resolutionFetch({
        targets: [
          {
            refId: 'A',
            expression: 'B',
            type: 'reduce',
            datasource: { type: '__expr__', uid: '__expr__' },
          },
          { refId: 'B', expr: 'up', datasource: { uid: 'prom-1' } },
        ],
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries.map((q: { refId: string }) => q.refId)).toEqual([
        'A',
        'B',
      ]);
      expect(data.warnings).toBeUndefined();
    });

    it('sends refs unchanged when the datasource listing is unavailable', async () => {
      const { fetch, calls } = resolutionFetch({
        targets: [{ refId: 'A', expr: 'up', datasource: { uid: 'whatever' } }],
        datasources: { status: 403, body: { message: 'forbidden' } },
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries[0].datasource).toEqual({ uid: 'whatever' });
      expect(data.warnings).toBeUndefined();
    });

    it('defaults a valueless datasource variable from the instance', async () => {
      // Provisioned dashboards select their datasource through a
      // datasource-type variable that the Grafana UI evaluates on load —
      // the stored JSON carries no value, so the client mirrors the UI's
      // default: the first datasource of the variable's declared type.
      const { fetch, calls } = mockFetch(url => {
        if (url.includes('/api/ds/query')) {
          return { body: { results: {} } };
        }
        if (url.includes('/api/datasources')) {
          return { body: datasources };
        }
        return {
          body: {
            metadata: { name: 'abc123' },
            spec: {
              templating: {
                list: [{ name: 'DS_LOKI', type: 'datasource', query: 'loki' }],
              },
              panels: [
                {
                  id: 1,
                  type: 'timeseries',
                  datasource: { type: 'loki', uid: '${DS_LOKI}' },
                  targets: [{ refId: 'A', expr: 'up' }],
                },
              ],
            },
          },
        };
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries[0].datasource).toEqual({
        uid: 'loki-1',
        type: 'loki',
      });
      expect(data.warnings).toBeUndefined();
    });

    it('honors a datasource variable regex when picking the default', async () => {
      const { fetch, calls } = mockFetch(url => {
        if (url.includes('/api/ds/query')) {
          return { body: { results: {} } };
        }
        if (url.includes('/api/datasources')) {
          return {
            body: [
              { uid: 'prom-dev', name: 'dev prometheus', type: 'prometheus' },
              { uid: 'prom-prod', name: 'prod prometheus', type: 'prometheus' },
            ],
          };
        }
        return {
          body: {
            metadata: { name: 'abc123' },
            spec: {
              templating: {
                list: [
                  {
                    name: 'DS_PROM',
                    type: 'datasource',
                    query: 'prometheus',
                    regex: '/prod/',
                  },
                ],
              },
              panels: [
                {
                  id: 1,
                  type: 'timeseries',
                  datasource: { type: 'prometheus', uid: '${DS_PROM}' },
                  targets: [{ refId: 'A', expr: 'up' }],
                },
              ],
            },
          },
        };
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      await client.getPanelData('abc123', 1);

      const queryCall = calls.find(c => c.url.includes('/api/ds/query'))!;
      const body = JSON.parse(String(queryCall.init?.body));
      expect(body.queries[0].datasource).toEqual({
        uid: 'prom-prod',
        type: 'prometheus',
      });
    });

    it('keeps the skip warning when no datasource matches the variable', async () => {
      const { fetch, calls } = mockFetch(url => {
        if (url.includes('/api/ds/query')) {
          return { body: { results: {} } };
        }
        if (url.includes('/api/datasources')) {
          return { body: datasources }; // no 'grafana-incident-datasource'
        }
        return {
          body: {
            metadata: { name: 'abc123' },
            spec: {
              templating: {
                list: [
                  {
                    name: 'DS_INCIDENT',
                    type: 'datasource',
                    query: 'grafana-incident-datasource',
                  },
                ],
              },
              panels: [
                {
                  id: 1,
                  type: 'timeseries',
                  datasource: {
                    type: 'grafana-incident-datasource',
                    uid: '${DS_INCIDENT}',
                  },
                  targets: [{ refId: 'A', expr: 'up' }],
                },
              ],
            },
          },
        };
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      const data = await client.getPanelData('abc123', 1);

      expect(calls.some(c => c.url.includes('/api/ds/query'))).toBe(false);
      expect(data.warnings).toEqual([
        expect.stringContaining('could not be resolved'),
      ]);
    });

    it('reuses the datasource listing across panel data calls', async () => {
      const { fetch, calls } = resolutionFetch({
        targets: [{ refId: 'A', expr: 'up', datasource: { uid: 'prom-1' } }],
      });
      const client = new GrafanaHttpClient({ instance, fetch });

      await client.getPanelData('abc123', 1);
      await client.getPanelData('abc123', 1);

      expect(
        calls.filter(c => c.url.endsWith('/api/datasources')),
      ).toHaveLength(1);
    });
  });
});
