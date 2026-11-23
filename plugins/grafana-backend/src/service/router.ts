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
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
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

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VARIABLES = 32;
const MAX_VARIABLE_VALUE_LENGTH = 1000;

// Collects `var-<name>` query parameters (Grafana's own URL convention) into
// template-variable overrides. Repeated parameters become multi-values.
const toVariables = (
  query: Record<string, unknown>,
  allowedNames?: string[],
): Record<string, string | string[]> | undefined => {
  const allowed = allowedNames ? new Set(allowedNames) : undefined;
  const variables: Record<string, string | string[]> = {};
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith('var-')) {
      continue;
    }
    const name = key.slice('var-'.length);
    if (!VARIABLE_NAME.test(name)) {
      throw new InputError(
        `Invalid variable name '${name}', expected [A-Za-z_][A-Za-z0-9_]*`,
      );
    }
    if (allowed && !allowed.has(name)) {
      throw new NotAllowedError(
        `Overriding template variable '${name}' is not allowed by configuration (grafana.allowedVariableOverrides)`,
      );
    }
    const values = toArray(raw) ?? [];
    if (values.some(value => value.length > MAX_VARIABLE_VALUE_LENGTH)) {
      throw new InputError(
        `Variable '${name}' value exceeds ${MAX_VARIABLE_VALUE_LENGTH} characters`,
      );
    }
    variables[name] = values.length === 1 ? values[0] : values;
  }
  const names = Object.keys(variables);
  if (names.length > MAX_VARIABLES) {
    throw new InputError(
      `Too many template variables: ${names.length} given, at most ${MAX_VARIABLES} allowed`,
    );
  }
  return names.length > 0 ? variables : undefined;
};

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
  /**
   * Whether the panel routes are served (default `true`). Panel listings and
   * panel data always read live from Grafana, so `false` disables them (403)
   * for deployments that want schedule-only Grafana traffic.
   */
  allowPanelQueries?: boolean;
  /**
   * When set, only these template variable names may be overridden via
   * `var-<name>` parameters on the panel data route; any other `var-<name>`
   * parameter responds 403. An empty list rejects every override. When
   * absent (default), any variable reference occurring in the panel's
   * queries may be overridden — including Grafana built-ins such as
   * `$__interval`, not only variables declared on the dashboard.
   */
  allowedVariableOverrides?: string[];
}): Promise<express.Router> {
  const { grafanaService } = options;
  const allowOnDemandRefresh = options.allowOnDemandRefresh ?? true;
  const allowPanelQueries = options.allowPanelQueries ?? true;
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

  const assertPanelQueriesAllowed = () => {
    if (!allowPanelQueries) {
      throw new NotAllowedError(
        'Panel queries are disabled by configuration (grafana.allowPanelQueries)',
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
      uid: toString(req.query.uid),
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

  router.get('/instances/:name/dashboards/:uid/panels', async (req, res) => {
    assertPanelQueriesAllowed();
    if (!grafanaService.getPanels) {
      throw new NotFoundError(
        'Panel queries are not supported by the configured Grafana service',
      );
    }
    const items = await grafanaService.getPanels({
      instanceName: req.params.name,
      dashboardUid: req.params.uid,
      refresh: toRefresh(req.query.refresh),
    });
    res.json({ items });
  });

  router.get(
    '/instances/:name/dashboards/:uid/panels/:panelId/data',
    async (req, res) => {
      assertPanelQueriesAllowed();
      if (!grafanaService.getPanelData) {
        throw new NotFoundError(
          'Panel queries are not supported by the configured Grafana service',
        );
      }
      if (!/^\d+$/.test(req.params.panelId)) {
        throw new InputError(
          `Invalid panel id '${req.params.panelId}', expected an integer`,
        );
      }
      const variables = toVariables(
        req.query,
        options.allowedVariableOverrides,
      );
      const data = await grafanaService.getPanelData({
        instanceName: req.params.name,
        dashboardUid: req.params.uid,
        panelId: Number(req.params.panelId),
        from: toString(req.query.from),
        to: toString(req.query.to),
        ...(variables ? { variables } : {}),
        refresh: toRefresh(req.query.refresh),
      });
      res.json(data);
    },
  );

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
      uid: toString(req.query.uid),
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
