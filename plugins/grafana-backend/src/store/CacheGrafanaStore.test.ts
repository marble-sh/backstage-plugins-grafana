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

import { CacheService } from '@backstage/backend-plugin-api';
import { CacheGrafanaStore } from './CacheGrafanaStore';
import { GrafanaSnapshot } from './GrafanaStore';

class FakeCache implements CacheService {
  readonly entries = new Map<string, { value: unknown; ttl?: number }>();

  async get(key: string): Promise<any> {
    return this.entries.has(key) ? this.entries.get(key)!.value : undefined;
  }

  async set(key: string, value: any, opts?: { ttl?: number }): Promise<void> {
    this.entries.set(key, { value, ttl: opts?.ttl });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  withOptions(): CacheService {
    return this;
  }
}

const snapshot: GrafanaSnapshot = {
  dashboards: [
    {
      uid: 'a',
      title: 'A',
      url: 'https://g/d/a/a',
      tags: [],
      instanceName: 'prod',
    },
  ],
  alerts: [],
  fetchedAt: '2026-08-26T00:00:00.000Z',
};

describe('CacheGrafanaStore', () => {
  it('stores and retrieves a snapshot per instance', async () => {
    const cache = new FakeCache();
    const store = new CacheGrafanaStore({ cache, ttl: { minutes: 15 } });

    expect(await store.get('prod')).toBeUndefined();

    await store.set('prod', snapshot);

    expect(await store.get('prod')).toEqual(snapshot);
    expect(await store.get('staging')).toBeUndefined();
  });

  it('applies the configured ttl in milliseconds', async () => {
    const cache = new FakeCache();
    const store = new CacheGrafanaStore({ cache, ttl: { minutes: 15 } });

    await store.set('prod', snapshot);

    const stored = [...cache.entries.values()][0];
    expect(stored.ttl).toBe(15 * 60 * 1000);
  });

  it('namespaces cache keys by instance', async () => {
    const cache = new FakeCache();
    const store = new CacheGrafanaStore({ cache, ttl: { minutes: 1 } });

    await store.set('prod', snapshot);

    expect([...cache.entries.keys()]).toEqual(['grafana-snapshot:prod']);
  });
});
