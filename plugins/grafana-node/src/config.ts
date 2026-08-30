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

import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';

/**
 * Which Grafana API is used to read each kind of data from an instance.
 * `none` disables that data type for the instance entirely.
 *
 * @public
 */
export type GrafanaInstanceApis = {
  dashboards: 'app-platform' | 'legacy-search' | 'none';
  alerts: 'prometheus' | 'none';
};

/**
 * A fully-resolved Grafana instance configuration, with all defaults applied.
 *
 * @public
 */
export type GrafanaInstanceConfig = {
  name: string;
  title: string;
  baseUrl: string;
  token: string;
  namespace: string;
  apis: GrafanaInstanceApis;
  /** Whether dashboard folder titles/links are resolved via `/api/folders`. */
  resolveFolders: boolean;
};

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const deriveNamespace = (options: {
  namespace?: string;
  stackId?: string;
}): string => {
  if (options.namespace) {
    return options.namespace;
  }
  if (options.stackId) {
    if (!/^\d+$/.test(options.stackId)) {
      throw new InputError(
        `Invalid grafana instance stackId '${options.stackId}': expected the ` +
          `numeric Grafana Cloud stack id, not the stack slug/subdomain. Find ` +
          `it in the Cloud portal URL (grafana.com/orgs/<org>/stacks/<id>) or ` +
          `via GET <baseUrl>/api/frontend/settings, whose "namespace" field ` +
          `is "stacks-<id>".`,
      );
    }
    return `stacks-${options.stackId}`;
  }
  return 'default';
};

const DASHBOARD_APIS = ['app-platform', 'legacy-search', 'none'] as const;
const ALERT_APIS = ['prometheus', 'none'] as const;

function readApiChoice<T extends string>(
  config: Config,
  key: string,
  allowed: readonly T[],
  defaultValue: T,
): T {
  const value = config.getOptionalString(key) ?? defaultValue;
  if (!allowed.includes(value as T)) {
    throw new InputError(
      `Invalid grafana instance config ${key} '${value}', expected one of: ${allowed.join(
        ', ',
      )}`,
    );
  }
  return value as T;
}

/**
 * Reads a single `grafana.instances[]` entry into a resolved
 * {@link GrafanaInstanceConfig}, applying all defaults.
 *
 * @public
 */
export function readGrafanaInstance(config: Config): GrafanaInstanceConfig {
  const name = config.getString('name');
  const baseUrl = stripTrailingSlash(config.getString('baseUrl'));
  const token = config.getString('token');

  return {
    name,
    title: config.getOptionalString('title') ?? name,
    baseUrl,
    token,
    namespace: deriveNamespace({
      namespace: config.getOptionalString('namespace'),
      stackId: config.getOptionalString('stackId'),
    }),
    apis: {
      dashboards: readApiChoice(
        config,
        'apis.dashboards',
        DASHBOARD_APIS,
        'app-platform',
      ),
      alerts: readApiChoice(config, 'apis.alerts', ALERT_APIS, 'prometheus'),
    },
    resolveFolders: config.getOptionalBoolean('resolveFolders') ?? true,
  };
}

/**
 * Reads and validates the `grafana.instances` array from the root config into
 * a list of resolved {@link GrafanaInstanceConfig}s. Throws if two instances
 * share the same `name`.
 *
 * @public
 */
export function readGrafanaInstances(
  rootConfig: Config,
): GrafanaInstanceConfig[] {
  const instanceConfigs =
    rootConfig.getOptionalConfigArray('grafana.instances') ?? [];
  const instances = instanceConfigs.map(readGrafanaInstance);

  const names = instances.map(instance => instance.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) {
    throw new InputError(
      `Duplicate grafana instance name '${duplicate}' in configuration`,
    );
  }

  return instances;
}
