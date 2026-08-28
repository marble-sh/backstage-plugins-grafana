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
import Router from 'express-promise-router';
import { NotAllowedError } from '@backstage/errors';
import { parseLabelSelector } from '@marble-sh/backstage-plugin-grafana-node';
import { GrafanaService } from './GrafanaService';

const toArray = (value: unknown): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
};

const toString = (value: unknown): string | undefined =>
  value === undefined ? undefined : String(value);

// Accepts ?refresh=true, ?refresh=1, and the bare ?refresh flag.
const toBoolean = (value: unknown): boolean =>
  value !== undefined && ['true', '1', ''].includes(String(value));

/**
 * Creates the Express router that exposes the read-only Grafana REST API.
 *
 * All routes are relative to the plugin base path (`/api/grafana`).
 *
 * @public
 */
export async function createRouter(options: {
  grafanaService: GrafanaService;
  /**
   * Whether callers may force live Grafana reads (default `true`). When
   * `false`, `refresh` query parameters are ignored and the `POST …/refresh`
   * routes respond 403.
   */
  allowOnDemandRefresh?: boolean;
}): Promise<express.Router> {
  const { grafanaService } = options;
  const allowOnDemandRefresh = options.allowOnDemandRefresh ?? true;
  const router = Router();
  router.use(express.json());

  const toRefresh = (value: unknown): boolean =>
    allowOnDemandRefresh && toBoolean(value);

  const assertRefreshAllowed = () => {
    if (!allowOnDemandRefresh) {
      throw new NotAllowedError(
        'On-demand refresh is disabled by configuration (grafana.allowOnDemandRefresh)',
      );
    }
  };

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/instances', (_req, res) => {
    res.json({ items: grafanaService.getInstances() });
  });

  router.get('/instances/:name/dashboards', async (req, res) => {
    const items = await grafanaService.getDashboards({
      instanceName: req.params.name,
      tags: toArray(req.query.tag),
      query: toString(req.query.query),
      refresh: toRefresh(req.query.refresh),
    });
    res.json({ items });
  });

  router.get('/instances/:name/alerts', async (req, res) => {
    const items = await grafanaService.getAlerts({
      instanceName: req.params.name,
      labelSelector: parseLabelSelector(toString(req.query.labelSelector)),
      refresh: toRefresh(req.query.refresh),
    });
    res.json({ items });
  });

  router.post('/instances/:name/refresh', async (req, res) => {
    assertRefreshAllowed();
    await grafanaService.refresh(req.params.name);
    res.json({ status: 'ok' });
  });

  router.get('/dashboards', async (req, res) => {
    const items = await grafanaService.getDashboards({
      instanceName: toString(req.query.instance),
      tags: toArray(req.query.tag),
      query: toString(req.query.query),
      refresh: toRefresh(req.query.refresh),
    });
    res.json({ items });
  });

  router.get('/alerts', async (req, res) => {
    const items = await grafanaService.getAlerts({
      instanceName: toString(req.query.instance),
      labelSelector: parseLabelSelector(toString(req.query.labelSelector)),
      refresh: toRefresh(req.query.refresh),
    });
    res.json({ items });
  });

  router.post('/refresh', async (_req, res) => {
    assertRefreshAllowed();
    await grafanaService.refresh();
    res.json({ status: 'ok' });
  });

  return router;
}
