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
import {
  catalogProcessingExtensionPoint,
  EntityProvider,
} from '@backstage/plugin-catalog-node';
import { catalogModuleGrafana } from './module';

describe('catalogModuleGrafana', () => {
  it('registers the Grafana entity provider with the catalog', async () => {
    const addedProviders: EntityProvider[] = [];
    const extensionPoint = {
      addEntityProvider: (provider: EntityProvider | EntityProvider[]) => {
        addedProviders.push(...[provider].flat());
      },
    };

    await startTestBackend({
      extensionPoints: [[catalogProcessingExtensionPoint, extensionPoint]],
      features: [
        catalogModuleGrafana,
        mockServices.rootConfig.factory({
          data: {
            grafana: {
              instances: [
                {
                  name: 'prod',
                  baseUrl: 'https://grafana.example.com',
                  token: 'secret',
                },
              ],
            },
          },
        }),
      ],
    });

    expect(addedProviders).toHaveLength(1);
    expect(addedProviders[0].getProviderName()).toBe('GrafanaEntityProvider');
  });
});
