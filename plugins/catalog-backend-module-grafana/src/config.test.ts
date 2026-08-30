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

import { ConfigReader } from '@backstage/config';
import { readGrafanaDiscoveryConfig } from './config';

const read = (data: object) =>
  readGrafanaDiscoveryConfig(new ConfigReader(data));

describe('readGrafanaDiscoveryConfig', () => {
  it('applies defaults when grafana.catalog is absent', () => {
    const result = read({});
    expect(result.defaultOwner).toBe('group:default/grafana');
    expect(result.system).toBeUndefined();
    expect(result.namespace).toBe('default');
    expect(result.emitInstances).toBe(true);
    expect(result.emitDashboards).toBe(true);
    expect(result.emitTags).toBe(true);
    expect(result.emitOwnerGroup).toBe(true);
    expect(result.instances).toBeUndefined();
    expect(result.filter).toEqual({ tags: undefined, query: undefined });
    expect(result.schedule.frequency).toEqual({ minutes: 30 });
    expect(result.schedule.timeout).toEqual({ minutes: 3 });
  });

  it('reads the scoping options', () => {
    const result = read({
      grafana: {
        catalog: {
          namespace: 'observability',
          instances: ['prod'],
          filter: { tags: ['team-a'], query: 'payments' },
          emitTags: false,
        },
      },
    });
    expect(result.namespace).toBe('observability');
    expect(result.instances).toEqual(['prod']);
    expect(result.filter).toEqual({ tags: ['team-a'], query: 'payments' });
    expect(result.emitTags).toBe(false);
  });

  it('reads owner, system and emit flags', () => {
    const result = read({
      grafana: {
        catalog: {
          defaultOwner: 'group:default/observability',
          system: 'observability',
          emitInstances: false,
          emitDashboards: true,
          emitOwnerGroup: false,
        },
      },
    });
    expect(result.defaultOwner).toBe('group:default/observability');
    expect(result.system).toBe('observability');
    expect(result.emitInstances).toBe(false);
    expect(result.emitDashboards).toBe(true);
    expect(result.emitOwnerGroup).toBe(false);
  });

  it('reads a custom schedule', () => {
    const result = read({
      grafana: {
        catalog: {
          schedule: {
            frequency: { hours: 1 },
            timeout: { minutes: 5 },
          },
        },
      },
    });
    expect(result.schedule.frequency).toEqual({ hours: 1 });
    expect(result.schedule.timeout).toEqual({ minutes: 5 });
  });
});
