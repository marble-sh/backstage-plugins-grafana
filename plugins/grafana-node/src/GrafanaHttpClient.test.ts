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
});
