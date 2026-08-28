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
import { HumanDuration, durationToMilliseconds } from '@backstage/types';
import { GrafanaSnapshot, GrafanaStore } from './GrafanaStore';

/**
 * A {@link GrafanaStore} backed by the Backstage cache service. Snapshots are
 * ephemeral and expire after the configured TTL.
 *
 * @public
 */
export class CacheGrafanaStore implements GrafanaStore {
  private readonly cache: CacheService;
  private readonly ttlMillis: number;

  constructor(options: { cache: CacheService; ttl: HumanDuration }) {
    this.cache = options.cache;
    this.ttlMillis = durationToMilliseconds(options.ttl);
  }

  private key(instanceName: string): string {
    return `grafana-snapshot:${instanceName}`;
  }

  /** {@inheritDoc GrafanaStore.get} */
  async get(instanceName: string): Promise<GrafanaSnapshot | undefined> {
    const value = await this.cache.get(this.key(instanceName));
    return value as GrafanaSnapshot | undefined;
  }

  /** {@inheritDoc GrafanaStore.set} */
  async set(instanceName: string, snapshot: GrafanaSnapshot): Promise<void> {
    await this.cache.set(this.key(instanceName), snapshot as any, {
      ttl: this.ttlMillis,
    });
  }
}
