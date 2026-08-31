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
import {
  InputError,
  NotAllowedError,
  NotFoundError,
  ResponseError,
} from '@backstage/errors';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  FetchApi,
  GrafanaInstanceConfig,
  readGrafanaInstances,
  slugify,
} from '@marble-sh/backstage-plugin-grafana-node';

type ScaffolderGuardConfig = {
  allowedInstances?: string[];
  allowOverwrite: boolean;
};

function readGuardConfig(rootConfig: Config): ScaffolderGuardConfig {
  const config = rootConfig.getOptionalConfig('grafana.scaffolder');
  return {
    allowedInstances: config?.getOptionalStringArray('allowedInstances'),
    allowOverwrite: config?.getOptionalBoolean('allowOverwrite') ?? true,
  };
}

function resolveInstance(
  instances: GrafanaInstanceConfig[],
  guard: ScaffolderGuardConfig,
  name?: string,
): GrafanaInstanceConfig {
  const { allowedInstances } = guard;
  if (allowedInstances) {
    const known = new Set(instances.map(instance => instance.name));
    const unknown = allowedInstances.filter(allowed => !known.has(allowed));
    if (unknown.length > 0) {
      throw new InputError(
        `grafana.scaffolder.allowedInstances names unknown instance(s) '${unknown.join(
          "', '",
        )}'; configured instances are: ${[...known].join(', ')}`,
      );
    }
  }

  if (name) {
    const found = instances.find(instance => instance.name === name);
    if (!found) {
      throw new NotFoundError(
        `No Grafana instance configured with name '${name}'`,
      );
    }
    if (allowedInstances && !allowedInstances.includes(found.name)) {
      throw new NotAllowedError(
        `Grafana instance '${found.name}' is not writable by the scaffolder (grafana.scaffolder.allowedInstances)`,
      );
    }
    return found;
  }

  // Automatic selection only considers writable instances.
  const writable = allowedInstances
    ? instances.filter(instance => allowedInstances.includes(instance.name))
    : instances;
  if (writable.length === 0) {
    throw new InputError(
      'No Grafana instances are configured and writable by the scaffolder',
    );
  }
  if (writable.length > 1) {
    throw new InputError(
      'Multiple Grafana instances are configured; set input.instanceName to choose one',
    );
  }
  return writable[0];
}

/**
 * Creates the `grafana:dashboard:create` scaffolder action, which creates (or
 * updates) a dashboard in a configured Grafana instance via the App Platform
 * `dashboard.grafana.app/v1` API.
 *
 * @public
 */
export function createGrafanaDashboardCreateAction(options: {
  config: Config;
  fetch?: FetchApi;
}) {
  const fetchApi = options.fetch ?? fetch;

  return createTemplateAction({
    id: 'grafana:dashboard:create',
    description:
      'Creates or updates a Grafana dashboard via the App Platform API',
    schema: {
      input: {
        instanceName: z =>
          z
            .string({
              description:
                'The configured Grafana instance to target. Optional when only one instance is configured.',
            })
            .optional(),
        title: z => z.string({ description: 'The dashboard title' }),
        uid: z =>
          z
            .string({
              description:
                'The dashboard uid (metadata.name). When omitted, Grafana generates one.',
            })
            .optional(),
        folderUid: z =>
          z
            .string({ description: 'The uid of the folder to create it in' })
            .optional(),
        tags: z =>
          z.array(z.string(), { description: 'Dashboard tags' }).optional(),
        dashboard: z =>
          z
            .record(z.any(), {
              description:
                'Additional dashboard spec fields (panels, templating, etc.), merged into the request spec.',
            })
            .optional(),
        overwrite: z =>
          z
            .boolean({
              description:
                'Update the dashboard if it already exists (requires uid).',
            })
            .optional(),
      },
      output: {
        uid: z => z.string({ description: 'The uid of the dashboard' }),
        url: z => z.string({ description: 'The URL of the dashboard' }),
        instanceName: z =>
          z.string({
            description: 'The instance the dashboard was created in',
          }),
      },
    },
    async handler(ctx) {
      const { title, uid, folderUid, tags, dashboard, overwrite } = ctx.input;
      const guard = readGuardConfig(options.config);
      const instance = resolveInstance(
        readGrafanaInstances(options.config),
        guard,
        ctx.input.instanceName,
      );

      if (overwrite && !guard.allowOverwrite) {
        throw new NotAllowedError(
          'Updating existing dashboards is disabled by configuration (grafana.scaffolder.allowOverwrite)',
        );
      }

      const collection = `/apis/dashboard.grafana.app/v1/namespaces/${instance.namespace}/dashboards`;
      const itemPath = `${collection}/${encodeURIComponent(uid ?? '')}`;
      const headers = {
        Authorization: `Bearer ${instance.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // An update must carry the current resourceVersion (Kubernetes-style
      // optimistic concurrency). When the dashboard does not exist yet, an
      // `overwrite` run degrades to a plain create, keeping template runs
      // idempotent.
      let isUpdate = false;
      let resourceVersion: string | undefined;
      if (overwrite && uid) {
        const current = await fetchApi(`${instance.baseUrl}${itemPath}`, {
          method: 'GET',
          headers,
        });
        if (current.ok) {
          const currentBody = (await current.json()) as {
            metadata?: { resourceVersion?: string };
          };
          resourceVersion = currentBody.metadata?.resourceVersion;
          isUpdate = true;
        } else if (current.status !== 404) {
          throw await ResponseError.fromResponse(current);
        }
      }

      ctx.logger.info(
        `${
          isUpdate ? 'Updating' : 'Creating'
        } Grafana dashboard '${title}' in instance '${instance.name}'`,
      );

      const response = await fetchApi(
        `${instance.baseUrl}${isUpdate ? itemPath : collection}`,
        {
          method: isUpdate ? 'PUT' : 'POST',
          headers,
          body: JSON.stringify({
            metadata: {
              ...(uid ? { name: uid } : {}),
              ...(resourceVersion ? { resourceVersion } : {}),
              ...(folderUid
                ? { annotations: { 'grafana.app/folder': folderUid } }
                : {}),
            },
            spec: {
              title,
              schemaVersion: 41,
              tags: tags ?? [],
              panels: [],
              ...(dashboard ?? {}),
            },
          }),
        },
      );

      if (!response.ok) {
        throw await ResponseError.fromResponse(response);
      }

      const body = (await response.json()) as { metadata?: { name?: string } };
      const resultUid = body.metadata?.name ?? uid ?? '';
      const url = `${instance.baseUrl}/d/${resultUid}/${slugify(title)}`;

      ctx.output('uid', resultUid);
      ctx.output('url', url);
      ctx.output('instanceName', instance.name);
    },
  });
}
