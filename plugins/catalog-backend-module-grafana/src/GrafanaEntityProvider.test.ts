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

import { SchedulerServiceTaskRunner } from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { Entity } from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/config';
import {
  CatalogService,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { GrafanaClient } from '@marble-sh/backstage-plugin-grafana-node';
import { GrafanaEntityProvider } from './GrafanaEntityProvider';
import { GrafanaDiscoveryConfig } from './config';

const instanceConfig = (name: string) => ({
  name,
  title: name,
  baseUrl: `https://${name}.example.com`,
  token: 'secret',
  namespace: 'default',
  apis: { dashboards: 'app-platform' as const, alerts: 'prometheus' as const },
  resolveFolders: true,
});

const discovery: GrafanaDiscoveryConfig = {
  schedule: { frequency: { minutes: 30 }, timeout: { minutes: 3 } },
  defaultOwner: 'group:default/grafana',
  namespace: 'default',
  emitInstances: true,
  emitDashboards: true,
  emitTags: true,
  emitOwnerGroup: true,
  filter: {},
};

class ImmediateTaskRunner implements SchedulerServiceTaskRunner {
  async run(task: {
    id: string;
    fn: () => Promise<void> | void;
  }): Promise<void> {
    await task.fn();
  }
}

function fakeClient(dashboards: any[]): GrafanaClient {
  return {
    listDashboards: jest.fn().mockResolvedValue(dashboards),
    listAlerts: jest.fn().mockResolvedValue([]),
  };
}

describe('GrafanaEntityProvider', () => {
  it('has a stable provider name', () => {
    const provider = new GrafanaEntityProvider({
      instances: [],
      discovery,
      logger: mockServices.logger.mock(),
      taskRunner: new ImmediateTaskRunner(),
    });
    expect(provider.getProviderName()).toBe('GrafanaEntityProvider');
  });

  it('reads dashboards and applies a full mutation on the scheduled run', async () => {
    const provider = new GrafanaEntityProvider({
      instances: [instanceConfig('prod')],
      discovery,
      logger: mockServices.logger.mock(),
      taskRunner: new ImmediateTaskRunner(),
      clientFactory: () =>
        fakeClient([
          {
            uid: 'abc',
            title: 'My Dash',
            url: 'https://prod.example.com/d/abc/my-dash',
            tags: [],
            instanceName: 'prod',
          },
        ]),
    });

    const connection: jest.Mocked<EntityProviderConnection> = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };

    await provider.connect(connection);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const mutation = connection.applyMutation.mock.calls[0][0] as any;
    expect(mutation.type).toBe('full');
    const names = mutation.entities.map((e: any) => e.entity.metadata.name);
    expect(names).toEqual([
      'grafana-instance-prod',
      'grafana-dashboard-prod-abc',
    ]);
    expect(mutation.entities[0].locationKey).toBe('grafana:prod');
  });

  it('aborts the refresh when an instance fails with no previous result', async () => {
    const logger = mockServices.logger.mock();
    const provider = new GrafanaEntityProvider({
      instances: [instanceConfig('broken'), instanceConfig('ok')],
      discovery,
      logger,
      taskRunner: new ImmediateTaskRunner(),
      clientFactory: instance =>
        instance.name === 'broken'
          ? {
              listDashboards: jest.fn().mockRejectedValue(new Error('nope')),
              listAlerts: jest.fn().mockResolvedValue([]),
            }
          : fakeClient([]),
    });

    const connection: jest.Mocked<EntityProviderConnection> = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };

    // The very first refresh has nothing to fall back to: applying a full
    // mutation without the failing instance would delete its entities, so the
    // refresh must abort without mutating the catalog.
    await expect(provider.connect(connection)).rejects.toThrow('nope');
    expect(connection.applyMutation).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('keeps the last good entities when an instance fails transiently', async () => {
    const logger = mockServices.logger.mock();
    let failNow = false;
    const provider = new GrafanaEntityProvider({
      instances: [instanceConfig('flaky'), instanceConfig('ok')],
      discovery,
      logger,
      taskRunner: new ImmediateTaskRunner(),
      clientFactory: instance => ({
        listDashboards: jest.fn().mockImplementation(async () => {
          if (instance.name === 'flaky' && failNow) {
            throw new Error('grafana is down');
          }
          return instance.name === 'flaky'
            ? [
                {
                  uid: 'abc',
                  title: 'Flaky Dash',
                  url: 'https://flaky.example.com/d/abc/flaky-dash',
                  tags: [],
                  instanceName: 'flaky',
                },
              ]
            : [];
        }),
        listAlerts: jest.fn().mockResolvedValue([]),
      }),
    });

    const connection: jest.Mocked<EntityProviderConnection> = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };

    await provider.connect(connection);
    const firstNames = (
      connection.applyMutation.mock.calls[0][0] as any
    ).entities.map((e: any) => e.entity.metadata.name);
    expect(firstNames).toContain('grafana-dashboard-flaky-abc');

    failNow = true;
    await provider.refresh();

    // The flaky instance's previously discovered entities are re-emitted so
    // the full mutation does not remove them.
    const secondNames = (
      connection.applyMutation.mock.calls[1][0] as any
    ).entities.map((e: any) => e.entity.metadata.name);
    expect(secondNames).toEqual(firstNames);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws when refreshed before being connected', async () => {
    const provider = new GrafanaEntityProvider({
      instances: [],
      discovery,
      logger: mockServices.logger.mock(),
      taskRunner: new ImmediateTaskRunner(),
    });

    await expect(provider.refresh()).rejects.toThrow(/not connected/);
  });

  it('passes the discovery filter through to the client', async () => {
    const listDashboards = jest.fn().mockResolvedValue([]);
    const provider = new GrafanaEntityProvider({
      instances: [instanceConfig('prod')],
      discovery: { ...discovery, filter: { tags: ['team-a'], query: 'pay' } },
      logger: mockServices.logger.mock(),
      taskRunner: new ImmediateTaskRunner(),
      clientFactory: () => ({
        listDashboards,
        listAlerts: jest.fn().mockResolvedValue([]),
      }),
    });
    const connection: jest.Mocked<EntityProviderConnection> = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };

    await provider.connect(connection);

    expect(listDashboards).toHaveBeenCalledWith({
      tags: ['team-a'],
      query: 'pay',
    });
  });

  describe('owner placeholder group', () => {
    const ownerGroupFrom = (origin: string): Entity => ({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Group',
      metadata: {
        name: 'grafana',
        namespace: 'default',
        annotations: {
          'backstage.io/managed-by-location': origin,
          'backstage.io/managed-by-origin-location': origin,
        },
      },
      spec: { type: 'team', children: [] },
    });

    const makeProvider = (options: {
      catalog?: CatalogService;
      discovery?: GrafanaDiscoveryConfig;
      logger?: ReturnType<typeof mockServices.logger.mock>;
    }) =>
      new GrafanaEntityProvider({
        instances: [instanceConfig('prod')],
        discovery: options.discovery ?? discovery,
        logger: options.logger ?? mockServices.logger.mock(),
        taskRunner: new ImmediateTaskRunner(),
        clientFactory: () => fakeClient([]),
        catalog: options.catalog,
        auth: mockServices.auth(),
      });

    const connect = async (provider: GrafanaEntityProvider) => {
      const connection: jest.Mocked<EntityProviderConnection> = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      await provider.connect(connection);
      return connection;
    };

    const emittedGroups = (
      connection: jest.Mocked<EntityProviderConnection>,
      call = 0,
    ) =>
      (connection.applyMutation.mock.calls[call][0] as any).entities.filter(
        (e: any) => e.entity.kind === 'Group',
      );

    it('creates a placeholder group when the owner is missing from the catalog', async () => {
      const provider = makeProvider({ catalog: catalogServiceMock() });
      const connection = await connect(provider);

      const groups = emittedGroups(connection);
      expect(groups).toHaveLength(1);
      expect(groups[0].locationKey).toBe('grafana:owner-group');
      expect(groups[0].entity).toMatchObject({
        kind: 'Group',
        metadata: {
          name: 'grafana',
          namespace: 'default',
          annotations: {
            'backstage.io/managed-by-location': 'grafana:owner-group',
            'backstage.io/managed-by-origin-location': 'grafana:owner-group',
          },
        },
        spec: { type: 'virtual', children: [] },
      });
    });

    it('yields to an owner defined by another source', async () => {
      const provider = makeProvider({
        catalog: catalogServiceMock({
          entities: [ownerGroupFrom('url:https://example.com/org.yaml')],
        }),
      });
      const connection = await connect(provider);

      expect(emittedGroups(connection)).toHaveLength(0);
    });

    it('keeps re-emitting a placeholder that is its own', async () => {
      const provider = makeProvider({
        catalog: catalogServiceMock({
          entities: [ownerGroupFrom('grafana:owner-group')],
        }),
      });
      const connection = await connect(provider);

      expect(emittedGroups(connection)).toHaveLength(1);
    });

    it('emits nothing when emitOwnerGroup is disabled', async () => {
      const getEntityByRef = jest.fn();
      const provider = makeProvider({
        catalog: {
          getEntityByRef,
        } as Partial<CatalogService> as CatalogService,
        discovery: { ...discovery, emitOwnerGroup: false },
      });
      const connection = await connect(provider);

      expect(emittedGroups(connection)).toHaveLength(0);
      expect(getEntityByRef).not.toHaveBeenCalled();
    });

    it('emits nothing when the owner is not a group', async () => {
      const getEntityByRef = jest.fn();
      const provider = makeProvider({
        catalog: {
          getEntityByRef,
        } as Partial<CatalogService> as CatalogService,
        discovery: { ...discovery, defaultOwner: 'user:default/cassidy' },
      });
      const connection = await connect(provider);

      expect(emittedGroups(connection)).toHaveLength(0);
      expect(getEntityByRef).not.toHaveBeenCalled();
    });

    it('emits nothing and warns when defaultOwner is not a valid ref', async () => {
      const logger = mockServices.logger.mock();
      const provider = makeProvider({
        catalog: catalogServiceMock(),
        discovery: { ...discovery, defaultOwner: 'group:' },
        logger,
      });
      const connection = await connect(provider);

      expect(emittedGroups(connection)).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not a valid entity ref'),
        expect.any(Error),
      );
    });

    it('keeps the previous decision when the catalog lookup fails', async () => {
      const getEntityByRef = jest.fn().mockResolvedValueOnce(undefined);
      const logger = mockServices.logger.mock();
      const provider = makeProvider({
        catalog: {
          getEntityByRef,
        } as Partial<CatalogService> as CatalogService,
        logger,
      });
      const connection = await connect(provider);
      expect(emittedGroups(connection, 0)).toHaveLength(1);

      getEntityByRef.mockRejectedValueOnce(new Error('catalog down'));
      await provider.refresh();

      // The previously emitted placeholder survives the failing lookup, so
      // the full mutation does not delete-and-recreate it.
      expect(emittedGroups(connection, 1)).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('keeping the previously emitted placeholder'),
        expect.any(Error),
      );
    });

    it('emits no group at all when discovery produced no entities', async () => {
      const getEntityByRef = jest.fn();
      const provider = new GrafanaEntityProvider({
        instances: [],
        discovery,
        logger: mockServices.logger.mock(),
        taskRunner: new ImmediateTaskRunner(),
        catalog: {
          getEntityByRef,
        } as Partial<CatalogService> as CatalogService,
        auth: mockServices.auth(),
      });
      const connection = await connect(provider);

      expect(
        (connection.applyMutation.mock.calls[0][0] as any).entities,
      ).toHaveLength(0);
      expect(getEntityByRef).not.toHaveBeenCalled();
    });
  });

  describe('fromConfig', () => {
    const rootConfigWith = (catalog: object) =>
      new ConfigReader({
        grafana: {
          instances: [
            { name: 'prod', baseUrl: 'https://prod.example.com', token: 't' },
            {
              name: 'staging',
              baseUrl: 'https://staging.example.com',
              token: 't',
            },
          ],
          catalog,
        },
      });

    const services = () => ({
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock({
        createScheduledTaskRunner: () => new ImmediateTaskRunner(),
      }),
      catalog: catalogServiceMock(),
      auth: mockServices.auth(),
    });

    it('throws when the allow-list names an unknown instance', () => {
      expect(() =>
        GrafanaEntityProvider.fromConfig(
          rootConfigWith({ instances: ['prod', 'nope'] }),
          services(),
        ),
      ).toThrow(/unknown instance\(s\) 'nope'/);
    });

    it('discovers only the allow-listed instances', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (input: any) => {
          const url = String(input);
          const body = url.includes('/api/folders') ? [] : { items: [] };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        });
      try {
        const provider = GrafanaEntityProvider.fromConfig(
          rootConfigWith({ instances: ['staging'] }),
          services(),
        );
        const connection: jest.Mocked<EntityProviderConnection> = {
          applyMutation: jest.fn(),
          refresh: jest.fn(),
        };

        await provider.connect(connection);

        const contacted = fetchSpy.mock.calls.map(call => String(call[0]));
        expect(contacted.every(url => url.includes('staging.example'))).toBe(
          true,
        );
        const names = (
          connection.applyMutation.mock.calls[0][0] as any
        ).entities.map((e: any) => e.entity.metadata.name);
        // The placeholder owner group is emitted alongside the instance.
        expect(names).toEqual(['grafana-instance-staging', 'grafana']);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  it('builds a real Grafana client when no factory is injected', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('offline'));
    try {
      const provider = new GrafanaEntityProvider({
        instances: [instanceConfig('prod')],
        discovery,
        logger: mockServices.logger.mock(),
        taskRunner: new ImmediateTaskRunner(),
      });
      const connection: jest.Mocked<EntityProviderConnection> = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      // The default client factory produces a GrafanaHttpClient that reaches
      // for the real network (mocked to fail here).
      await expect(provider.connect(connection)).rejects.toThrow('offline');
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
