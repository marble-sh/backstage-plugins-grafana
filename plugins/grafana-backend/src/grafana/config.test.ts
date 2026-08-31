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
import { readGrafanaConfig } from './config';

const read = (data: object) => readGrafanaConfig(new ConfigReader(data));

describe('readGrafanaConfig', () => {
  it('returns empty defaults when no grafana config is present', () => {
    const result = read({});
    expect(result.instances).toEqual([]);
    expect(result.store).toBe('cache');
    expect(result.cacheTtl).toEqual({ minutes: 15 });
    expect(result.schedule).toBeUndefined();
    expect(result.allowOnDemandRefresh).toBe(true);
    expect(result.fetchOnDemand).toBe(true);
    expect(result.allowPanelQueries).toBe(true);
    expect(result.panelDataCacheTtl).toEqual({ seconds: 30 });
  });

  it('reads the on-demand flags', () => {
    const result = read({
      grafana: {
        allowOnDemandRefresh: false,
        fetchOnDemand: false,
        allowPanelQueries: false,
      },
    });
    expect(result.allowOnDemandRefresh).toBe(false);
    expect(result.fetchOnDemand).toBe(false);
    expect(result.allowPanelQueries).toBe(false);
  });

  it('reads the panel data cache ttl', () => {
    const result = read({
      grafana: { panelDataCacheTtl: { minutes: 2 } },
    });
    expect(result.panelDataCacheTtl).toEqual({ minutes: 2 });
  });

  it('includes the configured instances', () => {
    const result = read({
      grafana: {
        instances: [
          {
            name: 'prod',
            baseUrl: 'https://grafana.example.com',
            token: 'abc',
          },
        ],
      },
    });
    expect(result.instances.map(i => i.name)).toEqual(['prod']);
  });

  it('reads the store and cacheTtl', () => {
    const result = read({
      grafana: {
        store: 'database',
        cacheTtl: { hours: 1 },
        instances: [],
      },
    });
    expect(result.store).toBe('database');
    expect(result.cacheTtl).toEqual({ hours: 1 });
  });

  it('throws on an invalid store', () => {
    expect(() => read({ grafana: { store: 'nope', instances: [] } })).toThrow(
      /store/,
    );
  });

  it('parses the refresh schedule', () => {
    const result = read({
      grafana: {
        instances: [],
        schedule: {
          frequency: { minutes: 30 },
          timeout: { minutes: 3 },
        },
      },
    });
    expect(result.schedule).toBeDefined();
    expect(result.schedule?.frequency).toEqual({ minutes: 30 });
  });
});
