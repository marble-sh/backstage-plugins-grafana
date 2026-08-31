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

import express from 'express';
import request from 'supertest';
import { GrafanaService } from './GrafanaService';
import { createRouter } from './router';

function stubService(overrides: Partial<GrafanaService> = {}): {
  service: GrafanaService;
} {
  const service: GrafanaService = {
    getInstances: jest
      .fn()
      .mockReturnValue([{ name: 'prod', title: 'Prod', url: 'https://prod' }]),
    getDashboards: jest.fn().mockResolvedValue([]),
    getAlerts: jest.fn().mockResolvedValue([]),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { service };
}

async function makeApp(
  service: GrafanaService,
  options: { allowOnDemandRefresh?: boolean; allowPanelQueries?: boolean } = {},
) {
  const app = express();
  app.use(await createRouter({ grafanaService: service, ...options }));
  // Minimal stand-in for the backend's error middleware: map error names to
  // statuses the way the real app does (NotAllowedError -> 403, ...).
  const statuses: Record<string, number> = {
    NotAllowedError: 403,
    NotFoundError: 404,
    InputError: 400,
  };
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(statuses[err.name] ?? 500).json({ error: err.name });
    },
  );
  return app;
}

describe('createRouter', () => {
  it('GET /health returns ok', async () => {
    const { service } = stubService();
    const app = await makeApp(service);

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /instances lists instances', async () => {
    const { service } = stubService();
    const app = await makeApp(service);

    const res = await request(app).get('/instances');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{ name: 'prod', title: 'Prod', url: 'https://prod' }],
    });
  });

  it('GET /instances/:name/dashboards parses tag, query, uid and refresh', async () => {
    const getDashboards = jest
      .fn()
      .mockResolvedValue([
        { uid: 'a', title: 'A', url: 'u', tags: [], instanceName: 'prod' },
      ]);
    const { service } = stubService({ getDashboards });
    const app = await makeApp(service);

    const res = await request(app)
      .get('/instances/prod/dashboards')
      .query('tag=x&tag=y&query=foo&uid=aBc&refresh=true');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(getDashboards).toHaveBeenCalledWith({
      instanceName: 'prod',
      tags: ['x', 'y'],
      query: 'foo',
      uid: 'aBc',
      refresh: true,
    });
  });

  it('GET /instances/:name/alerts parses the label selector', async () => {
    const getAlerts = jest.fn().mockResolvedValue([]);
    const { service } = stubService({ getAlerts });
    const app = await makeApp(service);

    const res = await request(app)
      .get('/instances/prod/alerts')
      .query('labelSelector=team=a,severity=high');

    expect(res.status).toBe(200);
    expect(getAlerts).toHaveBeenCalledWith({
      instanceName: 'prod',
      labelSelector: { team: 'a', severity: 'high' },
      refresh: false,
    });
  });

  it('GET /dashboards aggregates across instances when none is given', async () => {
    const getDashboards = jest.fn().mockResolvedValue([]);
    const { service } = stubService({ getDashboards });
    const app = await makeApp(service);

    await request(app).get('/dashboards').query('query=foo');

    expect(getDashboards).toHaveBeenCalledWith({
      instanceName: undefined,
      tags: undefined,
      query: 'foo',
      refresh: false,
    });
  });

  it('GET /dashboards can target a specific instance via ?instance=', async () => {
    const getDashboards = jest.fn().mockResolvedValue([]);
    const { service } = stubService({ getDashboards });
    const app = await makeApp(service);

    await request(app).get('/dashboards').query('instance=prod');

    expect(getDashboards).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: 'prod' }),
    );
  });

  it('GET /alerts aggregates across instances and parses parameters', async () => {
    const getAlerts = jest.fn().mockResolvedValue([]);
    const { service } = stubService({ getAlerts });
    const app = await makeApp(service);

    const res = await request(app)
      .get('/alerts')
      .query('instance=prod&labelSelector=team=a&refresh=true');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(getAlerts).toHaveBeenCalledWith({
      instanceName: 'prod',
      labelSelector: { team: 'a' },
      refresh: true,
    });
  });

  it('POST /instances/:name/refresh triggers a refresh', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const { service } = stubService({ refresh });
    const app = await makeApp(service);

    const res = await request(app).post('/instances/prod/refresh');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(refresh).toHaveBeenCalledWith('prod');
  });

  it('POST /refresh refreshes all instances', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const { service } = stubService({ refresh });
    const app = await makeApp(service);

    const res = await request(app).post('/refresh');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(refresh).toHaveBeenCalledWith();
  });

  it.each([
    ['refresh=true', true],
    ['refresh=1', true],
    ['refresh', true],
    ['refresh=false', false],
    ['', false],
  ])('parses the refresh flag from "?%s"', async (query, expected) => {
    const getDashboards = jest.fn().mockResolvedValue([]);
    const { service } = stubService({ getDashboards });
    const app = await makeApp(service);

    await request(app).get('/dashboards').query(query);

    expect(getDashboards).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: expected }),
    );
  });

  describe('with allowOnDemandRefresh disabled', () => {
    it('ignores refresh query parameters on reads', async () => {
      const getDashboards = jest.fn().mockResolvedValue([]);
      const getAlerts = jest.fn().mockResolvedValue([]);
      const { service } = stubService({ getDashboards, getAlerts });
      const app = await makeApp(service, { allowOnDemandRefresh: false });

      const dashRes = await request(app)
        .get('/instances/prod/dashboards')
        .query('refresh=true');
      const alertRes = await request(app).get('/alerts').query('refresh=1');

      expect(dashRes.status).toBe(200);
      expect(alertRes.status).toBe(200);
      expect(getDashboards).toHaveBeenCalledWith(
        expect.objectContaining({ refresh: false }),
      );
      expect(getAlerts).toHaveBeenCalledWith(
        expect.objectContaining({ refresh: false }),
      );
    });

    it('rejects the refresh routes with 403', async () => {
      const refresh = jest.fn().mockResolvedValue(undefined);
      const { service } = stubService({ refresh });
      const app = await makeApp(service, { allowOnDemandRefresh: false });

      expect((await request(app).post('/refresh')).status).toBe(403);
      expect((await request(app).post('/instances/prod/refresh')).status).toBe(
        403,
      );
      expect(refresh).not.toHaveBeenCalled();
    });

    it('leaves plain reads untouched', async () => {
      const getDashboards = jest.fn().mockResolvedValue([]);
      const { service } = stubService({ getDashboards });
      const app = await makeApp(service, { allowOnDemandRefresh: false });

      const res = await request(app).get('/dashboards').query('query=foo');

      expect(res.status).toBe(200);
      expect(getDashboards).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'foo', refresh: false }),
      );
    });
  });

  describe('panel routes', () => {
    const panel = {
      id: 1,
      title: 'Requests',
      type: 'timeseries',
      kind: 'timeseries',
      dashboardUid: 'd1',
      instanceName: 'prod',
    };

    it('GET .../panels lists the panels of a dashboard', async () => {
      const getPanels = jest.fn().mockResolvedValue([panel]);
      const { service } = stubService({ getPanels });
      const app = await makeApp(service);

      const res = await request(app).get(
        '/instances/prod/dashboards/d1/panels',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [panel] });
      expect(getPanels).toHaveBeenCalledWith({
        instanceName: 'prod',
        dashboardUid: 'd1',
        refresh: false,
      });
    });

    it('GET .../panels honors refresh=true', async () => {
      const getPanels = jest.fn().mockResolvedValue([]);
      const { service } = stubService({ getPanels });
      const app = await makeApp(service);

      await request(app)
        .get('/instances/prod/dashboards/d1/panels')
        .query('refresh=true');

      expect(getPanels).toHaveBeenCalledWith({
        instanceName: 'prod',
        dashboardUid: 'd1',
        refresh: true,
      });
    });

    it('GET .../panels/:panelId/data queries a panel with a range', async () => {
      const data = { panelId: 3, series: [] };
      const getPanelData = jest.fn().mockResolvedValue(data);
      const { service } = stubService({ getPanelData });
      const app = await makeApp(service);

      const res = await request(app)
        .get('/instances/prod/dashboards/d1/panels/3/data')
        .query('from=now-1h&to=now');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(data);
      expect(getPanelData).toHaveBeenCalledWith({
        instanceName: 'prod',
        dashboardUid: 'd1',
        panelId: 3,
        from: 'now-1h',
        to: 'now',
        refresh: false,
      });
    });

    it('GET .../panels/:panelId/data honors refresh=true', async () => {
      const getPanelData = jest
        .fn()
        .mockResolvedValue({ panelId: 3, series: [] });
      const { service } = stubService({ getPanelData });
      const app = await makeApp(service);

      await request(app)
        .get('/instances/prod/dashboards/d1/panels/3/data')
        .query('refresh=true');

      expect(getPanelData).toHaveBeenCalledWith({
        instanceName: 'prod',
        dashboardUid: 'd1',
        panelId: 3,
        from: undefined,
        to: undefined,
        refresh: true,
      });
    });

    it('omits absent range parameters', async () => {
      const getPanelData = jest
        .fn()
        .mockResolvedValue({ panelId: 3, series: [] });
      const { service } = stubService({ getPanelData });
      const app = await makeApp(service);

      await request(app).get('/instances/prod/dashboards/d1/panels/3/data');

      expect(getPanelData).toHaveBeenCalledWith({
        instanceName: 'prod',
        dashboardUid: 'd1',
        panelId: 3,
        from: undefined,
        to: undefined,
        refresh: false,
      });
    });

    it('rejects a non-integer panel id with 400', async () => {
      const getPanelData = jest.fn();
      const { service } = stubService({ getPanelData });
      const app = await makeApp(service);

      const res = await request(app).get(
        '/instances/prod/dashboards/d1/panels/nope/data',
      );

      expect(res.status).toBe(400);
      expect(getPanelData).not.toHaveBeenCalled();
    });

    it('responds 404 when the service has no panel support', async () => {
      const { service } = stubService();
      const app = await makeApp(service);

      const panelsRes = await request(app).get(
        '/instances/prod/dashboards/d1/panels',
      );
      const dataRes = await request(app).get(
        '/instances/prod/dashboards/d1/panels/1/data',
      );

      expect(panelsRes.status).toBe(404);
      expect(dataRes.status).toBe(404);
    });

    it('responds 403 on both routes when panel queries are disabled', async () => {
      const getPanels = jest.fn();
      const getPanelData = jest.fn();
      const { service } = stubService({ getPanels, getPanelData });
      const app = await makeApp(service, { allowPanelQueries: false });

      const panelsRes = await request(app).get(
        '/instances/prod/dashboards/d1/panels',
      );
      const dataRes = await request(app).get(
        '/instances/prod/dashboards/d1/panels/1/data',
      );

      expect(panelsRes.status).toBe(403);
      expect(dataRes.status).toBe(403);
      expect(getPanels).not.toHaveBeenCalled();
      expect(getPanelData).not.toHaveBeenCalled();
    });
  });
});
