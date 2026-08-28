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
  DatabaseService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { Knex } from 'knex';
import { GrafanaSnapshot, GrafanaStore } from './GrafanaStore';

const migrationsDir = resolvePackagePath(
  '@marble-sh/backstage-plugin-grafana-backend',
  'migrations',
);

const TABLE = 'grafana__snapshots';

type SnapshotRow = {
  instance: string;
  dashboards: string;
  alerts: string;
  fetched_at: string;
};

/**
 * A {@link GrafanaStore} backed by the Backstage database service. Snapshots are
 * durable and survive restarts.
 *
 * @public
 */
export class DatabaseGrafanaStore implements GrafanaStore {
  private constructor(private readonly knex: Knex) {}

  /**
   * Creates the store from the database core service, running migrations
   * unless the integrator has configured them to be skipped.
   */
  static async create(options: {
    database: DatabaseService;
  }): Promise<DatabaseGrafanaStore> {
    const knex = await options.database.getClient();
    if (options.database.migrations?.skip) {
      return new DatabaseGrafanaStore(knex);
    }
    return DatabaseGrafanaStore.fromKnex(knex);
  }

  /**
   * Creates the store from a raw Knex client, running migrations. Primarily
   * intended for testing.
   */
  static async fromKnex(knex: Knex): Promise<DatabaseGrafanaStore> {
    await knex.migrate.latest({
      directory: migrationsDir,
      tableName: 'grafana__knex_migrations',
    });
    return new DatabaseGrafanaStore(knex);
  }

  /** {@inheritDoc GrafanaStore.get} */
  async get(instanceName: string): Promise<GrafanaSnapshot | undefined> {
    const row = await this.knex<SnapshotRow>(TABLE)
      .where({ instance: instanceName })
      .first();
    if (!row) {
      return undefined;
    }
    return {
      dashboards: JSON.parse(row.dashboards),
      alerts: JSON.parse(row.alerts),
      fetchedAt: row.fetched_at,
    };
  }

  /** {@inheritDoc GrafanaStore.set} */
  async set(instanceName: string, snapshot: GrafanaSnapshot): Promise<void> {
    const row: SnapshotRow = {
      instance: instanceName,
      dashboards: JSON.stringify(snapshot.dashboards),
      alerts: JSON.stringify(snapshot.alerts),
      fetched_at: snapshot.fetchedAt,
    };
    await this.knex<SnapshotRow>(TABLE)
      .insert(row)
      .onConflict('instance')
      .merge();
  }
}
