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

import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { scaffolderModuleGrafana } from './module';

describe('scaffolderModuleGrafana', () => {
  it('registers the grafana:dashboard:create action', async () => {
    const addedActions: { id: string }[] = [];
    const extensionPoint = {
      addActions: (...actions: { id: string }[]) => {
        addedActions.push(...actions);
      },
    };

    await startTestBackend({
      extensionPoints: [[scaffolderActionsExtensionPoint, extensionPoint]],
      features: [
        scaffolderModuleGrafana,
        mockServices.rootConfig.factory({
          data: { grafana: { instances: [] } },
        }),
      ],
    });

    expect(addedActions.map(action => action.id)).toContain(
      'grafana:dashboard:create',
    );
  });

  it('fails startup when allowedInstances names an unknown instance', async () => {
    const extensionPoint = { addActions: () => {} };

    await expect(
      startTestBackend({
        extensionPoints: [[scaffolderActionsExtensionPoint, extensionPoint]],
        features: [
          scaffolderModuleGrafana,
          mockServices.rootConfig.factory({
            data: {
              grafana: {
                instances: [
                  {
                    name: 'prod',
                    baseUrl: 'https://g.example.com',
                    token: 't',
                  },
                ],
                scaffolder: { allowedInstances: ['prod', 'nope'] },
              },
            },
          }),
        ],
      }),
    ).rejects.toThrow(/allowedInstances names unknown instance\(s\) 'nope'/);
  });
});
