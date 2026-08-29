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
  AuthService,
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  GroupEntity,
  parseEntityRef,
  ResourceEntity,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import {
  CatalogService,
  DeferredEntity,
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import {
  GrafanaClient,
  GrafanaHttpClient,
  GrafanaInstanceConfig,
  readGrafanaInstances,
} from '@marble-sh/backstage-plugin-grafana-node';
import { buildGrafanaEntities } from './buildEntities';
import { GrafanaDiscoveryConfig, readGrafanaDiscoveryConfig } from './config';

/**
 * The location key (and location annotation value) of the placeholder owner
 * group, distinct from every per-instance `grafana:<name>` location key.
 */
const OWNER_GROUP_LOCATION = 'grafana:owner-group';

/**
 * A catalog `EntityProvider` that discovers Grafana instances and their
 * dashboards, emitting a `Resource` for each and linking every dashboard to its
 * instance via `spec.dependsOn`.
 *
 * @public
 */
export class GrafanaEntityProvider implements EntityProvider {
  private readonly instances: GrafanaInstanceConfig[];
  private readonly discovery: GrafanaDiscoveryConfig;
  private readonly logger: LoggerService;
  private readonly taskRunner: SchedulerServiceTaskRunner;
  private readonly clientFactory: (
    instance: GrafanaInstanceConfig,
  ) => GrafanaClient;
  private readonly catalog?: CatalogService;
  private readonly auth?: AuthService;
  private connection?: EntityProviderConnection;
  // The most recent successfully built entities per instance. A full mutation
  // replaces everything this provider ever emitted, so a transiently failing
  // instance must not simply be skipped — that would delete its entities.
  private readonly lastGoodEntities = new Map<string, ResourceEntity[]>();
  // The placeholder owner group emitted on the previous refresh, if any, so a
  // failing catalog lookup does not delete-and-recreate it across refreshes.
  private lastOwnerGroup?: GroupEntity;
  private warnedMissingCatalog = false;

  /**
   * Builds a provider from the root config and the logger/scheduler services.
   *
   * Throws if `grafana.catalog.instances` names an instance that is not
   * configured under `grafana.instances`.
   */
  static fromConfig(
    rootConfig: Config,
    options: {
      logger: LoggerService;
      scheduler: SchedulerService;
      catalog?: CatalogService;
      auth?: AuthService;
    },
  ): GrafanaEntityProvider {
    const discovery = readGrafanaDiscoveryConfig(rootConfig);
    let instances = readGrafanaInstances(rootConfig);

    if (discovery.instances) {
      const known = new Set(instances.map(instance => instance.name));
      const unknown = discovery.instances.filter(name => !known.has(name));
      if (unknown.length > 0) {
        throw new InputError(
          `grafana.catalog.instances names unknown instance(s) '${unknown.join(
            "', '",
          )}'; configured instances are: ${[...known].join(', ')}`,
        );
      }
      const allowed = new Set(discovery.instances);
      instances = instances.filter(instance => allowed.has(instance.name));
    }

    return new GrafanaEntityProvider({
      instances,
      discovery,
      logger: options.logger,
      taskRunner: options.scheduler.createScheduledTaskRunner(
        discovery.schedule,
      ),
      catalog: options.catalog,
      auth: options.auth,
    });
  }

  constructor(options: {
    instances: GrafanaInstanceConfig[];
    discovery: GrafanaDiscoveryConfig;
    logger: LoggerService;
    taskRunner: SchedulerServiceTaskRunner;
    clientFactory?: (instance: GrafanaInstanceConfig) => GrafanaClient;
    /** Used to check for an existing owner entity; without it (and `auth`), no placeholder owner group is created. */
    catalog?: CatalogService;
    /** Provides the credentials for the `catalog` lookups. */
    auth?: AuthService;
  }) {
    this.instances = options.instances;
    this.discovery = options.discovery;
    this.logger = options.logger;
    this.taskRunner = options.taskRunner;
    this.clientFactory =
      options.clientFactory ??
      (instance => new GrafanaHttpClient({ instance }));
    this.catalog = options.catalog;
    this.auth = options.auth;
  }

  /** The unique, stable name identifying this provider's entity bucket. */
  getProviderName(): string {
    return 'GrafanaEntityProvider';
  }

  /** Stores the connection and schedules the recurring discovery task. */
  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.taskRunner.run({
      id: `${this.getProviderName()}:refresh`,
      fn: async () => {
        await this.refresh();
      },
    });
  }

  /**
   * Reads every configured instance and replaces the provider's entities.
   *
   * When an instance fails transiently, its previously discovered entities are
   * re-emitted so the full mutation does not remove them from the catalog. If
   * an instance fails before any successful read, the whole refresh is aborted
   * (leaving the catalog untouched) and retried on the next scheduled run.
   */
  async refresh(): Promise<void> {
    if (!this.connection) {
      throw new Error('GrafanaEntityProvider is not connected');
    }

    const entities: DeferredEntity[] = [];
    for (const instance of this.instances) {
      let built: ResourceEntity[];
      try {
        const client = this.clientFactory(instance);
        const dashboards = this.discovery.emitDashboards
          ? await client.listDashboards(this.discovery.filter)
          : [];
        built = buildGrafanaEntities(instance, dashboards, this.discovery);
        this.lastGoodEntities.set(instance.name, built);
      } catch (error) {
        const previous = this.lastGoodEntities.get(instance.name);
        if (!previous) {
          this.logger.error(
            `Failed to read Grafana instance '${instance.name}' for catalog discovery and no previous result is available; aborting this refresh`,
            error as Error,
          );
          throw error;
        }
        this.logger.warn(
          `Failed to read Grafana instance '${instance.name}' for catalog discovery; keeping its ${previous.length} previously discovered entities`,
          error as Error,
        );
        built = previous;
      }
      entities.push(
        ...built.map(entity => ({
          entity,
          locationKey: `grafana:${instance.name}`,
        })),
      );
    }

    if (entities.length > 0) {
      const ownerGroup = await this.resolveOwnerGroup();
      if (ownerGroup) {
        entities.push({
          entity: ownerGroup,
          locationKey: OWNER_GROUP_LOCATION,
        });
      }
    }

    await this.connection.applyMutation({ type: 'full', entities });
    this.logger.info(
      `Grafana catalog discovery emitted ${entities.length} entities`,
    );
  }

  /**
   * Returns the placeholder `Group` for `defaultOwner`, or `undefined` when
   * none should be emitted this refresh.
   *
   * A placeholder is only emitted while the owner ref does not exist in the
   * catalog from any other source: a hand-written definition (present before
   * the placeholder is first created) always wins, and the placeholder keeps
   * being re-emitted only while it is itself the catalog's version of the
   * entity. When the lookup fails transiently, the previous decision is kept.
   */
  private async resolveOwnerGroup(): Promise<GroupEntity | undefined> {
    if (!this.discovery.emitOwnerGroup) {
      return undefined;
    }
    if (!this.catalog || !this.auth) {
      if (!this.warnedMissingCatalog) {
        this.warnedMissingCatalog = true;
        this.logger.warn(
          'emitOwnerGroup is enabled but the provider was constructed without the catalog and auth services; no placeholder owner group will be created',
        );
      }
      return undefined;
    }

    let owner;
    try {
      owner = parseEntityRef(this.discovery.defaultOwner, {
        defaultKind: 'group',
        defaultNamespace: this.discovery.namespace,
      });
    } catch (error) {
      this.logger.warn(
        `Cannot create a placeholder owner group: defaultOwner '${this.discovery.defaultOwner}' is not a valid entity ref`,
        error as Error,
      );
      return undefined;
    }
    if (owner.kind.toLocaleLowerCase('en-US') !== 'group') {
      return undefined;
    }

    let existing;
    try {
      const credentials = await this.auth.getOwnServiceCredentials();
      existing = await this.catalog.getEntityByRef(owner, { credentials });
    } catch (error) {
      this.logger.warn(
        `Failed to look up owner '${stringifyEntityRef(
          owner,
        )}' in the catalog; ${
          this.lastOwnerGroup
            ? 'keeping the previously emitted placeholder group'
            : 'not creating a placeholder group this refresh'
        }`,
        error as Error,
      );
      return this.lastOwnerGroup;
    }

    const origin = existing?.metadata.annotations?.[ANNOTATION_ORIGIN_LOCATION];
    if (existing && origin !== OWNER_GROUP_LOCATION) {
      // The owner is defined by another source (e.g. a hand-written
      // catalog-info.yaml) — never compete with it.
      this.lastOwnerGroup = undefined;
      return undefined;
    }

    const group: GroupEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        name: owner.name,
        namespace: owner.namespace,
        description:
          'Placeholder owner for entities discovered from Grafana. Define this group in any other catalog source to replace it.',
        annotations: {
          [ANNOTATION_LOCATION]: OWNER_GROUP_LOCATION,
          [ANNOTATION_ORIGIN_LOCATION]: OWNER_GROUP_LOCATION,
        },
      },
      spec: { type: 'virtual', children: [] },
    };
    this.lastOwnerGroup = group;
    return group;
  }
}
