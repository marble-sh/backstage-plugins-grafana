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

import type { BackendFeature } from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import type { JsonObject } from '@backstage/types';
import request from 'supertest';
import { z } from 'zod';
import type {
  GetPanelDataResponse,
  GrafanaAlert,
  GrafanaDashboard,
  GrafanaInstanceInfo,
  GrafanaPanel,
  ListAlertsResponse,
  ListDashboardsResponse,
  ListInstancesResponse,
  ListPanelsResponse,
} from '@marble-sh/backstage-plugin-grafana-common';
import { grafanaPlugin } from './plugin';

jest.setTimeout(30_000);

const PROD_HOST = 'prod.grafana.example.com';
const STAGING_HOST = 'staging.grafana.example.com';
const PROD_BASE_URL = `https://${PROD_HOST}`;
const STAGING_BASE_URL = `https://${STAGING_HOST}`;
const PROD_TOKEN = 'prod-token';
const STAGING_TOKEN = 'staging-token';
const USER_AUTH = mockCredentials.user.header();

const prodInstance = {
  name: 'prod',
  title: 'Production',
  baseUrl: PROD_BASE_URL,
  token: PROD_TOKEN,
};
const stagingInstance = {
  name: 'staging',
  title: 'Staging',
  baseUrl: STAGING_BASE_URL,
  token: STAGING_TOKEN,
};

const oneInstanceConfig = {
  grafana: { store: 'cache', instances: [prodInstance] },
} satisfies JsonObject;
const twoInstanceConfig = {
  grafana: { store: 'cache', instances: [prodInstance, stagingInstance] },
} satisfies JsonObject;

/**
 * Response schemas. Each schema is tied to the shared response type with
 * `satisfies`, so a change to the public type that the endpoint does not
 * actually satisfy fails `tsc`.
 */
const okResponseSchema = z.object({ status: z.literal('ok') }).strict();

const instanceSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
  })
  .strict() satisfies z.ZodType<GrafanaInstanceInfo>;

const listInstancesSchema = z
  .object({ items: z.array(instanceSchema) })
  .strict() satisfies z.ZodType<ListInstancesResponse>;

const dashboardSchema = z
  .object({
    uid: z.string(),
    title: z.string(),
    url: z.string().url(),
    folderTitle: z.string().optional(),
    folderUrl: z.string().url().optional(),
    tags: z.array(z.string()),
    instanceName: z.string(),
  })
  .strict() satisfies z.ZodType<GrafanaDashboard>;

const listDashboardsSchema = z
  .object({ items: z.array(dashboardSchema) })
  .strict() satisfies z.ZodType<ListDashboardsResponse>;

const alertStateSchema = z.enum([
  'firing',
  'pending',
  'inactive',
  'normal',
  'no_data',
  'error',
  'unknown',
]);
const alertHealthSchema = z.enum(['ok', 'error', 'nodata', 'unknown']);

const alertSchema = z
  .object({
    name: z.string(),
    state: alertStateSchema,
    url: z.string().url(),
    labels: z.record(z.string(), z.string()),
    folderTitle: z.string().optional(),
    instanceName: z.string(),
    uid: z.string().optional(),
    health: alertHealthSchema.optional(),
    summary: z.string().optional(),
    activeAt: z.string().optional(),
    activeCount: z.number().int().nonnegative().optional(),
    dashboardUid: z.string().optional(),
    panelId: z.number().int().optional(),
  })
  .strict() satisfies z.ZodType<GrafanaAlert>;

const listAlertsSchema = z
  .object({ items: z.array(alertSchema) })
  .strict() satisfies z.ZodType<ListAlertsResponse>;

const panelKindSchema = z.enum(['timeseries', 'stat', 'unsupported']);

const panelSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    type: z.string(),
    kind: panelKindSchema,
    description: z.string().optional(),
    dashboardUid: z.string(),
    instanceName: z.string(),
  })
  .strict() satisfies z.ZodType<GrafanaPanel>;

const listPanelsSchema = z
  .object({ items: z.array(panelSchema) })
  .strict() satisfies z.ZodType<ListPanelsResponse>;

const panelPointSchema = z
  .object({ timeMs: z.number(), value: z.number().nullable() })
  .strict();

const panelSeriesSchema = z
  .object({
    name: z.string(),
    labels: z.record(z.string(), z.string()).optional(),
    points: z.array(panelPointSchema),
  })
  .strict();

const panelDataSchema = z
  .object({
    panelId: z.number().int(),
    series: z.array(panelSeriesSchema),
    warnings: z.array(z.string()).optional(),
  })
  .strict() satisfies z.ZodType<GetPanelDataResponse>;

const errorResponseSchema = z
  .object({
    error: z.object({ name: z.string(), message: z.string() }).passthrough(),
    request: z.object({ method: z.string(), url: z.string() }).strict(),
    response: z.object({ statusCode: z.number().int() }).strict(),
  })
  .strict();

function expectJson<T>(
  res: { headers: Record<string, string | undefined>; body: unknown },
  schema: z.ZodType<T>,
  label: string,
): T {
  if (!/^application\/json/.test(res.headers['content-type'] ?? '')) {
    throw new Error(
      `${label} did not return JSON (content-type: ${res.headers['content-type']})`,
    );
  }
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) {
    throw new Error(
      `${label} failed response validation:\n${JSON.stringify(
        parsed.error.issues,
        null,
        2,
      )}\nBody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
  return parsed.data;
}

type AppPlatformDashboard = {
  metadata?: { name?: string; annotations?: Record<string, string> };
  spec?: { title?: string; tags?: string[] };
};

type GrafanaFolder = { uid?: string; title?: string };

type LegacySearchDashboard = {
  uid?: string;
  title?: string;
  url?: string;
  folderTitle?: string;
  folderUrl?: string;
  tags?: string[];
};

type PrometheusGroup = {
  folder?: string;
  file?: string;
  rules?: Array<Record<string, unknown>>;
};

type GrafanaDatasource = { uid?: string; name?: string; type?: string };

type InstanceFixture = {
  token: string;
  dashboardPages?: Array<{ items: AppPlatformDashboard[] }>;
  legacyDashboards?: LegacySearchDashboard[];
  folders?: GrafanaFolder[];
  alerts?: { data?: { groups?: PrometheusGroup[] } };
  dashboardModels?: Record<string, Record<string, unknown>>;
  datasources?: GrafanaDatasource[];
  panelQuery?: Record<string, unknown>;
  dashboardsError?: number;
  alertsError?: number;
};

const appDashboards: AppPlatformDashboard[] = [
  {
    metadata: {
      name: 'abc',
      annotations: { 'grafana.app/folder': 'folder-1' },
    },
    spec: { title: 'My Dashboard', tags: ['team-a'] },
  },
  {
    metadata: { name: 'def' },
    spec: { title: 'Other Dashboard', tags: [] },
  },
];

const alertRules: PrometheusGroup[] = [
  {
    folder: 'Team A',
    rules: [
      {
        name: 'High latency',
        state: 'firing',
        type: 'alerting',
        uid: 'rule-1',
        health: 'ok',
        labels: { team: 'team-a' },
        annotations: {
          summary: 'Latency is high',
          __dashboardUid__: 'abc',
          __panelId__: '1',
        },
        activeAt: '2026-10-19T12:00:00Z',
        alerts: [
          { state: 'firing' },
          { state: 'pending' },
          { state: 'normal' },
        ],
      },
      {
        name: 'Recording rule',
        type: 'recording',
        uid: 'rule-2',
      },
    ],
  },
];

const dashboardModel: Record<string, unknown> = {
  title: 'My Dashboard',
  templating: { list: [] },
  panels: [
    {
      id: 1,
      type: 'timeseries',
      title: 'Requests',
      description: 'Request rate',
      datasource: { uid: 'prom-1', type: 'prometheus' },
      targets: [{ refId: 'A', expr: 'up' }],
    },
    {
      id: 2,
      type: 'stat',
      title: 'Errors',
      datasource: { uid: 'prom-1', type: 'prometheus' },
      targets: [{ refId: 'A', expr: 'errors' }],
    },
    {
      id: 3,
      type: 'table',
      title: 'Table',
      datasource: { uid: 'prom-1', type: 'prometheus' },
      targets: [{ refId: 'A', expr: 'table' }],
    },
    {
      id: 4,
      type: 'row',
      title: 'Collapsed row',
      panels: [
        {
          id: 5,
          type: 'graph',
          title: 'Nested Graph',
          datasource: { uid: 'prom-1', type: 'prometheus' },
          targets: [{ refId: 'A', expr: 'nested' }],
        },
      ],
    },
  ],
};

const panelQueryResult: Record<string, unknown> = {
  results: {
    A: {
      status: 200,
      frames: [
        {
          schema: {
            refId: 'A',
            fields: [
              { name: 'time', type: 'time' },
              {
                name: 'Value',
                type: 'number',
                labels: { instance: 'a' },
              },
            ],
          },
          data: {
            values: [
              [1000, 2000, 3000],
              [1, null, 3],
            ],
          },
        },
      ],
    },
  },
};

const defaultFixtures: Record<string, InstanceFixture> = {
  [PROD_HOST]: {
    token: PROD_TOKEN,
    dashboardPages: [{ items: appDashboards }],
    folders: [{ uid: 'folder-1', title: 'Team A' }],
    alerts: { data: { groups: alertRules } },
    dashboardModels: { abc: dashboardModel },
    datasources: [{ uid: 'prom-1', name: 'Prometheus', type: 'prometheus' }],
    panelQuery: panelQueryResult,
  },
  [STAGING_HOST]: {
    token: STAGING_TOKEN,
    dashboardPages: [
      {
        items: [
          {
            metadata: { name: 'ghi' },
            spec: { title: 'Staging Dashboard', tags: ['team-b'] },
          },
        ],
      },
    ],
    folders: [],
    alerts: { data: { groups: [] } },
    dashboardModels: {},
    datasources: [],
    panelQuery: { results: {} },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function handleGrafanaRequest(
  url: URL,
  method: string,
  fixture: InstanceFixture,
): Response {
  const path = url.pathname;

  if (method === 'GET' && path === '/api/folders') {
    return jsonResponse(fixture.folders ?? []);
  }
  if (method === 'GET' && path === '/api/datasources') {
    return jsonResponse(fixture.datasources ?? []);
  }
  if (method === 'GET' && path === '/api/prometheus/grafana/api/v1/rules') {
    if (fixture.alertsError) {
      return jsonResponse({ message: 'alerts failed' }, fixture.alertsError);
    }
    return jsonResponse(fixture.alerts ?? { data: { groups: [] } });
  }
  if (method === 'GET' && path === '/api/search') {
    return jsonResponse(fixture.legacyDashboards ?? []);
  }
  if (method === 'GET' && path.startsWith('/api/dashboards/uid/')) {
    const uid = decodeURIComponent(path.slice('/api/dashboards/uid/'.length));
    const model = fixture.dashboardModels?.[uid];
    return model
      ? jsonResponse({ dashboard: model })
      : jsonResponse({ message: 'not found' }, 404);
  }
  if (method === 'GET' && path.includes('/apis/dashboard.grafana.app/')) {
    if (/\/dashboards$/.test(path)) {
      if (fixture.dashboardsError) {
        return jsonResponse(
          { message: 'dashboards failed' },
          fixture.dashboardsError,
        );
      }
      const pages = fixture.dashboardPages ?? [];
      const continuation = url.searchParams.get('continue');
      const pageIndex = continuation ? Number(continuation) : 0;
      const page = pages[pageIndex];
      if (!page) {
        return jsonResponse({ message: 'no such page' }, 404);
      }
      const next =
        pageIndex + 1 < pages.length ? String(pageIndex + 1) : undefined;
      return jsonResponse({
        items: page.items,
        ...(next ? { metadata: { continue: next } } : {}),
      });
    }

    const uid = decodeURIComponent(path.split('/').pop() ?? '');
    const model = fixture.dashboardModels?.[uid];
    if (!model) {
      return jsonResponse({ message: 'not found' }, 404);
    }
    return jsonResponse({ metadata: { name: uid }, spec: model });
  }
  if (method === 'POST' && path === '/api/ds/query') {
    return jsonResponse(fixture.panelQuery ?? { results: {} });
  }

  throw new Error(`Unexpected Grafana request: ${method} ${url}`);
}

/** Normalizes a `fetch` input to a URL string. */
function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

/**
 * Installs a deterministic Grafana stub. The backend's HTTP client captures
 * `fetch` when it is constructed, so this must run before `startTestBackend`.
 */
function installGrafanaStub(
  overrides: Record<string, Partial<InstanceFixture>> = {},
): jest.SpyInstance {
  const fixtures: Record<string, InstanceFixture> = {
    [PROD_HOST]: { ...defaultFixtures[PROD_HOST], ...overrides[PROD_HOST] },
    [STAGING_HOST]: {
      ...defaultFixtures[STAGING_HOST],
      ...overrides[STAGING_HOST],
    },
  };

  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(requestUrl(input));
    const fixture = fixtures[url.host];
    if (!fixture) {
      throw new Error(`Unexpected Grafana host: ${url.host}`);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    if (headers.get('authorization') !== `Bearer ${fixture.token}`) {
      throw new Error(`Unexpected Authorization for ${method} ${url}`);
    }

    return handleGrafanaRequest(url, method, fixture);
  });
}

async function startBackend(
  options: { data?: JsonObject; strictAuth?: boolean } = {},
) {
  const config = mockServices.rootConfig.factory({
    data: options.data ?? oneInstanceConfig,
  });
  const features: BackendFeature[] = options.strictAuth
    ? [
        grafanaPlugin,
        mockServices.httpAuth.factory({
          defaultCredentials: mockCredentials.none(),
        }),
        config,
      ]
    : [grafanaPlugin, config];

  const { server } = await startTestBackend({ features });
  return server;
}

function authHeader(res: request.Test): request.Test {
  return res.set('Authorization', USER_AUTH);
}

describe('grafana backend integration', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('authentication', () => {
    it('serves the health endpoint without credentials', async () => {
      installGrafanaStub();
      const server = await startBackend({ strictAuth: true });

      const res = await request(server).get('/api/grafana/health');

      expect(res.status).toBe(200);
      expect(
        expectJson(res, okResponseSchema, 'GET /api/grafana/health'),
      ).toEqual({ status: 'ok' });
    });

    it('rejects protected routes without credentials', async () => {
      installGrafanaStub();
      const server = await startBackend({ strictAuth: true });

      const res = await request(server).get('/api/grafana/instances');

      expect(res.status).toBe(401);
      const body = expectJson(
        res,
        errorResponseSchema,
        'GET /api/grafana/instances without credentials',
      );
      expect(body.error.name).toBe('AuthenticationError');
      expect(body.response.statusCode).toBe(401);
      expect(body.request.method).toBe('GET');
    });

    it('accepts user and service credentials', async () => {
      installGrafanaStub();
      const server = await startBackend({ strictAuth: true });

      const user = await authHeader(
        request(server).get('/api/grafana/instances'),
      );
      const service = await request(server)
        .get('/api/grafana/instances')
        .set('Authorization', mockCredentials.service.header());

      expect(user.status).toBe(200);
      expect(service.status).toBe(200);
      expectJson(user, listInstancesSchema, 'GET /instances (user)');
      expectJson(service, listInstancesSchema, 'GET /instances (service)');
    });
  });

  describe('GET /instances', () => {
    it('lists the configured instances', async () => {
      installGrafanaStub();
      const server = await startBackend({ data: twoInstanceConfig });

      const res = await authHeader(
        request(server).get('/api/grafana/instances'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listInstancesSchema,
        'GET /api/grafana/instances',
      );
      expect(body.items).toEqual([
        { name: 'prod', title: 'Production', url: PROD_BASE_URL },
        { name: 'staging', title: 'Staging', url: STAGING_BASE_URL },
      ]);
    });

    it('returns an empty list when no instances are configured', async () => {
      const server = await startBackend({ data: { grafana: {} } });

      const res = await authHeader(
        request(server).get('/api/grafana/instances'),
      );

      expect(res.status).toBe(200);
      expect(
        expectJson(res, listInstancesSchema, 'GET /instances (empty)'),
      ).toEqual({ items: [] });
    });
  });

  describe('dashboards', () => {
    it('lists dashboards for an instance, including folder details', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const res = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listDashboardsSchema,
        'GET /instances/prod/dashboards',
      );
      expect(body.items).toEqual([
        {
          uid: 'abc',
          title: 'My Dashboard',
          url: `${PROD_BASE_URL}/d/abc/my-dashboard`,
          folderTitle: 'Team A',
          folderUrl: `${PROD_BASE_URL}/dashboards/f/folder-1/team-a`,
          tags: ['team-a'],
          instanceName: 'prod',
        },
        {
          uid: 'def',
          title: 'Other Dashboard',
          url: `${PROD_BASE_URL}/d/def/other-dashboard`,
          tags: [],
          instanceName: 'prod',
        },
      ]);
    });

    it('filters dashboards by tag, title query, and uid', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const tagged = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/dashboards')
          .query({ tag: 'team-a' }),
      );
      const queried = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/dashboards')
          .query({ query: 'Other' }),
      );
      const byUid = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/dashboards')
          .query({ uid: 'abc' }),
      );

      expect(tagged.status).toBe(200);
      expect(queried.status).toBe(200);
      expect(byUid.status).toBe(200);
      expect(
        expectJson(tagged, listDashboardsSchema, 'dashboards by tag').items.map(
          dashboard => dashboard.uid,
        ),
      ).toEqual(['abc']);
      expect(
        expectJson(
          queried,
          listDashboardsSchema,
          'dashboards by query',
        ).items.map(dashboard => dashboard.uid),
      ).toEqual(['def']);
      expect(
        expectJson(byUid, listDashboardsSchema, 'dashboards by uid').items.map(
          dashboard => dashboard.uid,
        ),
      ).toEqual(['abc']);
    });

    it('bypasses the stored snapshot when refresh=true', async () => {
      const spy = installGrafanaStub();
      const server = await startBackend();

      const first = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );
      const callsAfterFirst = spy.mock.calls.length;

      const refreshed = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/dashboards')
          .query({ refresh: true }),
      );

      expect(first.status).toBe(200);
      expect(refreshed.status).toBe(200);
      expectJson(first, listDashboardsSchema, 'dashboards first read');
      expectJson(refreshed, listDashboardsSchema, 'dashboards refresh=true');
      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('follows App Platform pagination', async () => {
      const spy = installGrafanaStub({
        [PROD_HOST]: {
          dashboardPages: [
            { items: [appDashboards[0]] },
            { items: [appDashboards[1]] },
          ],
        },
      });
      const server = await startBackend();

      const res = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listDashboardsSchema,
        'paginated dashboards',
      );
      expect(body.items.map(dashboard => dashboard.uid)).toEqual([
        'abc',
        'def',
      ]);
      const listCalls = spy.mock.calls.filter(([input]) => {
        const path = new URL(String(input)).pathname;
        return path.endsWith('/dashboards');
      });
      expect(listCalls).toHaveLength(2);
      expect(
        spy.mock.calls.some(([input]) => String(input).includes('continue=1')),
      ).toBe(true);
    });

    it('lists dashboards through the legacy search API', async () => {
      const spy = installGrafanaStub({
        [PROD_HOST]: {
          legacyDashboards: [
            {
              uid: 'legacy-1',
              title: 'Legacy Dashboard',
              url: '/d/legacy-1/legacy-dashboard',
              folderTitle: 'Legacy Folder',
              folderUrl: '/dashboards/f/f1/legacy-folder',
              tags: ['legacy'],
            },
          ],
        },
      });
      const server = await startBackend({
        data: {
          grafana: {
            instances: [
              {
                ...prodInstance,
                apis: { dashboards: 'legacy-search' },
              },
            ],
          },
        },
      });

      const res = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(res, listDashboardsSchema, 'legacy dashboards');
      expect(body.items).toEqual([
        {
          uid: 'legacy-1',
          title: 'Legacy Dashboard',
          url: `${PROD_BASE_URL}/d/legacy-1/legacy-dashboard`,
          folderTitle: 'Legacy Folder',
          folderUrl: `${PROD_BASE_URL}/dashboards/f/f1/legacy-folder`,
          tags: ['legacy'],
          instanceName: 'prod',
        },
      ]);
      expect(
        spy.mock.calls.some(([input]) =>
          String(input).includes('/api/search?type=dash-db'),
        ),
      ).toBe(true);
    });

    it('returns empty results without contacting Grafana when dashboards are disabled', async () => {
      const spy = installGrafanaStub();
      const server = await startBackend({
        data: {
          grafana: {
            instances: [
              {
                ...prodInstance,
                apis: { dashboards: 'none', alerts: 'none' },
              },
            ],
          },
        },
      });

      const dashboards = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );
      const alerts = await authHeader(
        request(server).get('/api/grafana/instances/prod/alerts'),
      );

      expect(dashboards.status).toBe(200);
      expect(alerts.status).toBe(200);
      expect(
        expectJson(dashboards, listDashboardsSchema, 'dashboards disabled')
          .items,
      ).toEqual([]);
      expect(
        expectJson(alerts, listAlertsSchema, 'alerts disabled').items,
      ).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('lists dashboards across all instances', async () => {
      installGrafanaStub();
      const server = await startBackend({ data: twoInstanceConfig });

      const res = await authHeader(
        request(server).get('/api/grafana/dashboards'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listDashboardsSchema,
        'GET /api/grafana/dashboards',
      );
      expect(
        body.items.map(
          dashboard => `${dashboard.instanceName}:${dashboard.uid}`,
        ),
      ).toEqual(['prod:abc', 'prod:def', 'staging:ghi']);
    });

    it('targets a single instance through the global route', async () => {
      installGrafanaStub();
      const server = await startBackend({ data: twoInstanceConfig });

      const res = await authHeader(
        request(server)
          .get('/api/grafana/dashboards')
          .query({ instance: 'staging' }),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listDashboardsSchema,
        'GET /dashboards?instance=staging',
      );
      expect(body.items.map(dashboard => dashboard.instanceName)).toEqual([
        'staging',
      ]);
    });

    it('skips a failing instance during a fan-out read', async () => {
      installGrafanaStub({
        [STAGING_HOST]: { dashboardsError: 500 },
      });
      const server = await startBackend({ data: twoInstanceConfig });

      const res = await authHeader(
        request(server).get('/api/grafana/dashboards'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listDashboardsSchema,
        'GET /dashboards with a failing instance',
      );
      expect(body.items.map(dashboard => dashboard.instanceName)).toEqual([
        'prod',
        'prod',
      ]);
    });

    it('propagates a named instance failure', async () => {
      installGrafanaStub({
        [PROD_HOST]: { dashboardsError: 500 },
      });
      const server = await startBackend();

      const res = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );

      expect(res.status).toBe(500);
      const body = expectJson(
        res,
        errorResponseSchema,
        'upstream dashboards failure',
      );
      expect(body.response.statusCode).toBe(500);
    });
  });

  describe('alerts', () => {
    it('lists alerts with every optional field', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const res = await authHeader(
        request(server).get('/api/grafana/instances/prod/alerts'),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listAlertsSchema,
        'GET /instances/prod/alerts',
      );
      expect(body.items).toEqual([
        {
          name: 'High latency',
          state: 'firing',
          url: `${PROD_BASE_URL}/alerting/grafana/rule-1/view`,
          labels: { team: 'team-a' },
          folderTitle: 'Team A',
          instanceName: 'prod',
          uid: 'rule-1',
          health: 'ok',
          summary: 'Latency is high',
          activeAt: '2026-10-19T12:00:00Z',
          activeCount: 2,
          dashboardUid: 'abc',
          panelId: 1,
        },
      ]);
    });

    it('filters alerts by label selector', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const matching = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/alerts')
          .query({ labelSelector: 'team=team-a' }),
      );
      const nonMatching = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/alerts')
          .query({ labelSelector: 'team=other' }),
      );

      expect(matching.status).toBe(200);
      expect(nonMatching.status).toBe(200);
      expect(
        expectJson(matching, listAlertsSchema, 'matching alerts').items,
      ).toHaveLength(1);
      expect(
        expectJson(nonMatching, listAlertsSchema, 'non-matching alerts').items,
      ).toEqual([]);
    });

    it('lists alerts across all instances', async () => {
      installGrafanaStub();
      const server = await startBackend({ data: twoInstanceConfig });

      const res = await authHeader(request(server).get('/api/grafana/alerts'));

      expect(res.status).toBe(200);
      const body = expectJson(res, listAlertsSchema, 'GET /api/grafana/alerts');
      expect(body.items.map(alert => alert.instanceName)).toEqual(['prod']);
    });

    it('propagates a named instance alert failure', async () => {
      installGrafanaStub({
        [PROD_HOST]: { alertsError: 500 },
      });
      const server = await startBackend();

      const res = await authHeader(
        request(server).get('/api/grafana/instances/prod/alerts'),
      );

      expect(res.status).toBe(500);
      expectJson(res, errorResponseSchema, 'upstream alerts failure');
    });
  });

  describe('panels', () => {
    it('lists panels, flattening rows and classifying kinds', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const res = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/abc/panels',
        ),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        listPanelsSchema,
        'GET /instances/prod/dashboards/abc/panels',
      );
      expect(body.items).toEqual([
        {
          id: 1,
          title: 'Requests',
          type: 'timeseries',
          kind: 'timeseries',
          description: 'Request rate',
          dashboardUid: 'abc',
          instanceName: 'prod',
        },
        {
          id: 2,
          title: 'Errors',
          type: 'stat',
          kind: 'stat',
          dashboardUid: 'abc',
          instanceName: 'prod',
        },
        {
          id: 3,
          title: 'Table',
          type: 'table',
          kind: 'unsupported',
          dashboardUid: 'abc',
          instanceName: 'prod',
        },
        {
          id: 5,
          title: 'Nested Graph',
          type: 'graph',
          kind: 'timeseries',
          dashboardUid: 'abc',
          instanceName: 'prod',
        },
      ]);
    });

    it('returns panel data with labels, null gaps, and timestamps', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const res = await authHeader(
        request(server)
          .get('/api/grafana/instances/prod/dashboards/abc/panels/1/data')
          .query({ from: 'now-1h', to: 'now' }),
      );

      expect(res.status).toBe(200);
      const body = expectJson(
        res,
        panelDataSchema,
        'GET /instances/prod/dashboards/abc/panels/1/data',
      );
      expect(body).toEqual({
        panelId: 1,
        series: [
          {
            name: '{instance="a"}',
            labels: { instance: 'a' },
            points: [
              { timeMs: 1000, value: 1 },
              { timeMs: 2000, value: null },
              { timeMs: 3000, value: 3 },
            ],
          },
        ],
      });
    });

    it('returns warnings for unusable result frames', async () => {
      installGrafanaStub({
        [PROD_HOST]: {
          panelQuery: {
            results: {
              A: {
                status: 200,
                frames: [
                  {
                    schema: {
                      refId: 'A',
                      fields: [{ name: 'value', type: 'number' }],
                    },
                    data: { values: [[1, 2]] },
                  },
                ],
              },
            },
          },
        },
      });
      const server = await startBackend();

      const res = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/abc/panels/1/data',
        ),
      );

      expect(res.status).toBe(200);
      const body = expectJson(res, panelDataSchema, 'panel data warnings');
      expect(body.series).toEqual([]);
      expect(body.warnings).toEqual([
        'A result frame for query A has no time field and was skipped',
      ]);
    });

    it('returns 404 for an unknown dashboard', async () => {
      installGrafanaStub({ [PROD_HOST]: { dashboardModels: {} } });
      const server = await startBackend();

      const res = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/missing/panels',
        ),
      );

      expect(res.status).toBe(404);
      expectJson(res, errorResponseSchema, 'unknown dashboard');
    });

    it('returns 404 for an unknown panel', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const res = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/abc/panels/99/data',
        ),
      );

      expect(res.status).toBe(404);
      expectJson(res, errorResponseSchema, 'unknown panel');
    });

    it('rejects a non-integer panel id', async () => {
      installGrafanaStub();
      const server = await startBackend();

      const res = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/abc/panels/nope/data',
        ),
      );

      expect(res.status).toBe(400);
      const body = expectJson(res, errorResponseSchema, 'invalid panel id');
      expect(body.error.name).toBe('InputError');
    });

    it('caches panel data until a refresh is requested', async () => {
      const spy = installGrafanaStub();
      const server = await startBackend();
      const path = '/api/grafana/instances/prod/dashboards/abc/panels/1/data';
      const queryCalls = () =>
        spy.mock.calls.filter(([input]) =>
          String(input).includes('/api/ds/query'),
        ).length;

      const first = await authHeader(request(server).get(path));
      const second = await authHeader(request(server).get(path));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expectJson(first, panelDataSchema, 'panel data first read');
      expectJson(second, panelDataSchema, 'panel data cached read');
      expect(queryCalls()).toBe(1);

      const refreshed = await authHeader(
        request(server).get(path).query({ refresh: true }),
      );

      expect(refreshed.status).toBe(200);
      expectJson(refreshed, panelDataSchema, 'panel data refreshed read');
      expect(queryCalls()).toBe(2);
    });

    it('rejects both panel routes with 403 when panel queries are disabled', async () => {
      const spy = installGrafanaStub();
      const server = await startBackend({
        data: {
          grafana: {
            instances: [prodInstance],
            allowPanelQueries: false,
          },
        },
      });

      const panels = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/abc/panels',
        ),
      );
      const data = await authHeader(
        request(server).get(
          '/api/grafana/instances/prod/dashboards/abc/panels/1/data',
        ),
      );

      expect(panels.status).toBe(403);
      expect(data.status).toBe(403);
      expect(
        expectJson(panels, errorResponseSchema, 'panels disabled').error.name,
      ).toBe('NotAllowedError');
      expect(
        expectJson(data, errorResponseSchema, 'panel data disabled').error.name,
      ).toBe('NotAllowedError');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('refreshes one instance and serves the stored snapshot', async () => {
      const spy = installGrafanaStub();
      const server = await startBackend();

      const refresh = await authHeader(
        request(server).post('/api/grafana/instances/prod/refresh'),
      );

      expect(refresh.status).toBe(200);
      expect(
        expectJson(refresh, okResponseSchema, 'POST instance refresh'),
      ).toEqual({ status: 'ok' });

      const callsAfterRefresh = spy.mock.calls.length;
      const read = await authHeader(
        request(server).get('/api/grafana/instances/prod/dashboards'),
      );

      expect(read.status).toBe(200);
      expectJson(read, listDashboardsSchema, 'dashboards after refresh');
      expect(spy.mock.calls.length).toBe(callsAfterRefresh);
    });

    it('refreshes all instances and tolerates one failure', async () => {
      const spy = installGrafanaStub({
        [STAGING_HOST]: { dashboardsError: 500 },
      });
      const server = await startBackend({ data: twoInstanceConfig });

      const res = await authHeader(
        request(server).post('/api/grafana/refresh'),
      );

      expect(res.status).toBe(200);
      expect(
        expectJson(res, okResponseSchema, 'POST /api/grafana/refresh'),
      ).toEqual({ status: 'ok' });
      expect(
        spy.mock.calls.some(([input]) => String(input).includes(PROD_HOST)),
      ).toBe(true);
      expect(
        spy.mock.calls.some(([input]) => String(input).includes(STAGING_HOST)),
      ).toBe(true);
    });

    it('rejects both refresh routes with 403 when on-demand refresh is disabled', async () => {
      const spy = installGrafanaStub();
      const server = await startBackend({
        data: {
          grafana: {
            instances: [prodInstance],
            allowOnDemandRefresh: false,
          },
        },
      });

      const single = await authHeader(
        request(server).post('/api/grafana/instances/prod/refresh'),
      );
      const all = await authHeader(
        request(server).post('/api/grafana/refresh'),
      );

      expect(single.status).toBe(403);
      expect(all.status).toBe(403);
      expect(
        expectJson(single, errorResponseSchema, 'instance refresh disabled')
          .error.name,
      ).toBe('NotAllowedError');
      expect(
        expectJson(all, errorResponseSchema, 'refresh disabled').error.name,
      ).toBe('NotAllowedError');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('unknown instances', () => {
    it.each([
      ['get', '/api/grafana/instances/nope/dashboards'],
      ['get', '/api/grafana/instances/nope/alerts'],
      ['get', '/api/grafana/instances/nope/dashboards/abc/panels'],
      ['get', '/api/grafana/instances/nope/dashboards/abc/panels/1/data'],
      ['post', '/api/grafana/instances/nope/refresh'],
    ])('returns 404 for %s %s', async (method, path) => {
      installGrafanaStub();
      const server = await startBackend();
      const res = await authHeader(
        method === 'get'
          ? request(server).get(path)
          : request(server).post(path),
      );

      expect(res.status).toBe(404);
      const body = expectJson(
        res,
        errorResponseSchema,
        `${method.toUpperCase()} ${path}`,
      );
      expect(body.error.name).toBe('NotFoundError');
    });
  });
});
