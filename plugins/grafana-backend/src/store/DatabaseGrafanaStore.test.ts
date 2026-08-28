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

import { TestDatabases } from '@backstage/backend-test-utils';
import { DatabaseGrafanaStore } from './DatabaseGrafanaStore';
import { GrafanaSnapshot } from './GrafanaStore';

const snapshot: GrafanaSnapshot = {
  dashboards: [
    {
      uid: 'a',
      title: 'A',
      url: 'https://g/d/a/a',
      tags: ['x'],
      instanceName: 'prod',
    },
  ],
  alerts: [
    {
      name: 'alert',
      state: 'firing',
      url: 'https://g/alerting/list',
      labels: { team: 'a' },
      instanceName: 'prod',
    },
  ],
  fetchedAt: '2026-08-26T00:00:00.000Z',
};

describe('DatabaseGrafanaStore', () => {
  const databases = TestDatabases.create();

  async function createStore(databaseId: 'SQLITE_3') {
    const knex = await databases.init(databaseId);
    const store = await DatabaseGrafanaStore.fromKnex(knex);
    return { store };
  }

  it('returns undefined for an unknown instance', async () => {
    const { store } = await createStore('SQLITE_3');
    expect(await store.get('missing')).toBeUndefined();
  });

  it('stores and retrieves a snapshot', async () => {
    const { store } = await createStore('SQLITE_3');
    await store.set('prod', snapshot);
    expect(await store.get('prod')).toEqual(snapshot);
  });

  it('upserts the snapshot on repeated set', async () => {
    const { store } = await createStore('SQLITE_3');
    await store.set('prod', snapshot);
    await store.set('prod', {
      ...snapshot,
      dashboards: [],
      fetchedAt: '2026-08-27T00:00:00.000Z',
    });

    const result = await store.get('prod');
    expect(result?.dashboards).toEqual([]);
    expect(result?.fetchedAt).toBe('2026-08-27T00:00:00.000Z');
  });

  it('keeps snapshots separate per instance', async () => {
    const { store } = await createStore('SQLITE_3');
    await store.set('prod', snapshot);
    await store.set('staging', { ...snapshot, alerts: [] });

    expect((await store.get('prod'))?.alerts).toHaveLength(1);
    expect((await store.get('staging'))?.alerts).toHaveLength(0);
  });

  describe('create', () => {
    it('runs migrations against the database service client', async () => {
      const knex = await databases.init('SQLITE_3');
      const database = { getClient: async () => knex };

      const store = await DatabaseGrafanaStore.create({ database });

      await store.set('prod', snapshot);
      expect(await store.get('prod')).toEqual(snapshot);
    });

    it('honors the skip-migrations database option', async () => {
      const knex = await databases.init('SQLITE_3');
      const migrateSpy = jest.spyOn(knex.migrate, 'latest');
      const database = {
        getClient: async () => knex,
        migrations: { skip: true },
      };

      await DatabaseGrafanaStore.create({ database });

      expect(migrateSpy).not.toHaveBeenCalled();
    });
  });
});
