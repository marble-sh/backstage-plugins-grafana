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
import { ConfigReader } from '@backstage/config';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
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
        expect(names).toEqual(['grafana-instance-staging']);
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
