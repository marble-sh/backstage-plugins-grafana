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
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { Config } from '@backstage/config';
import { readGrafanaInstances } from '@marble-sh/backstage-plugin-grafana-node';
import { createGrafanaDashboardCreateAction } from './actions';

/**
 * Validates `grafana.scaffolder.allowedInstances` against `grafana.instances`
 * at startup, so a configuration typo fails the backend boot (like the catalog
 * module does) instead of every scaffolder run.
 */
function assertValidGuardConfig(rootConfig: Config): void {
  const allowedInstances = rootConfig
    .getOptionalConfig('grafana.scaffolder')
    ?.getOptionalStringArray('allowedInstances');
  if (!allowedInstances) {
    return;
  }
  const known = new Set(
    readGrafanaInstances(rootConfig).map(instance => instance.name),
  );
  const unknown = allowedInstances.filter(name => !known.has(name));
  if (unknown.length > 0) {
    throw new InputError(
      `grafana.scaffolder.allowedInstances names unknown instance(s) '${unknown.join(
        "', '",
      )}'; configured instances are: ${[...known].join(', ')}`,
    );
  }
}

/**
 * Scaffolder backend module that registers Grafana provisioning actions.
 *
 * @public
 */
export const scaffolderModuleGrafana = createBackendModule({
  moduleId: 'grafana',
  pluginId: 'scaffolder',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ scaffolder, config }) {
        assertValidGuardConfig(config);
        scaffolder.addActions(createGrafanaDashboardCreateAction({ config }));
      },
    });
  },
});
