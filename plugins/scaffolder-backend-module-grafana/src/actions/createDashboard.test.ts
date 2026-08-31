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
import { JsonObject } from '@backstage/types';
import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import { createGrafanaDashboardCreateAction } from './createDashboard';

const configWith = (instances: object[], scaffolder?: object) =>
  new ConfigReader({ grafana: { instances, scaffolder } });

const prodInstance = {
  name: 'prod',
  baseUrl: 'https://grafana.example.com',
  token: 'secret-token',
};

function mockFetch(response: unknown, status = 200) {
  // A fresh Response per call: the handler may issue several requests (a GET
  // probe before an update), and a Response body can only be read once.
  return jest.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

function run(options: {
  instances?: object[];
  scaffolder?: object;
  input: JsonObject;
  fetch: typeof fetch;
}) {
  const action = createGrafanaDashboardCreateAction({
    config: configWith(options.instances ?? [prodInstance], options.scaffolder),
    fetch: options.fetch,
  });
  const ctx = createMockActionContext({
    workspacePath: '/tmp/ws',
    input: options.input,
  });
  const handler = () =>
    action.handler(ctx as unknown as Parameters<typeof action.handler>[0]);
  return { action, ctx, handler };
}

describe('grafana:dashboard:create', () => {
  it('creates a dashboard via the App Platform API and outputs its uid and url', async () => {
    const fetch = mockFetch({ metadata: { name: 'generated-uid' } });
    const { ctx, handler } = run({
      input: { title: 'My Dashboard', tags: ['team-a'] },
      fetch,
    });

    await handler();

    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    const body = JSON.parse(init.body);
    expect(body.spec.title).toBe('My Dashboard');
    expect(body.spec.tags).toEqual(['team-a']);

    expect(ctx.output).toHaveBeenCalledWith('uid', 'generated-uid');
    expect(ctx.output).toHaveBeenCalledWith(
      'url',
      'https://grafana.example.com/d/generated-uid/my-dashboard',
    );
  });

  it('sends the requested uid and folder', async () => {
    const fetch = mockFetch({ metadata: { name: 'my-uid' } });
    const { handler } = run({
      input: { title: 'T', uid: 'my-uid', folderUid: 'folder-1' },
      fetch,
    });

    await handler();

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.metadata.name).toBe('my-uid');
    expect(body.metadata.annotations['grafana.app/folder']).toBe('folder-1');
  });

  it('updates via PUT with the current resourceVersion when overwrite is set and the dashboard exists', async () => {
    const fetch = mockFetch({
      metadata: { name: 'my-uid', resourceVersion: '42' },
    });
    const { handler } = run({
      input: { title: 'T', uid: 'my-uid', overwrite: true },
      fetch,
    });

    await handler();

    const itemUrl =
      'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards/my-uid';
    const [probeUrl, probeInit] = (fetch as jest.Mock).mock.calls[0];
    expect(probeUrl).toBe(itemUrl);
    expect(probeInit.method).toBe('GET');

    const [url, init] = (fetch as jest.Mock).mock.calls[1];
    expect(init.method).toBe('PUT');
    expect(url).toBe(itemUrl);
    expect(JSON.parse(init.body).metadata.resourceVersion).toBe('42');
  });

  it('falls back to a create when overwrite is set but the dashboard does not exist', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ metadata: { name: 'my-uid' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as unknown as typeof globalThis.fetch;
    const { ctx, handler } = run({
      input: { title: 'T', uid: 'my-uid', overwrite: true },
      fetch,
    });

    await handler();

    const [url, init] = (fetch as jest.Mock).mock.calls[1];
    expect(init.method).toBe('POST');
    expect(url).toBe(
      'https://grafana.example.com/apis/dashboard.grafana.app/v1/namespaces/default/dashboards',
    );
    expect(JSON.parse(init.body).metadata.resourceVersion).toBeUndefined();
    expect(ctx.output).toHaveBeenCalledWith('uid', 'my-uid');
  });

  it('uses the only configured instance when instanceName is omitted', async () => {
    const fetch = mockFetch({ metadata: { name: 'x' } });
    const { ctx, handler } = run({ input: { title: 'T' }, fetch });
    await expect(handler()).resolves.not.toThrow();
    expect(ctx.output).toHaveBeenCalledWith('instanceName', 'prod');
  });

  it('throws when multiple instances exist and none is specified', async () => {
    const fetch = mockFetch({ metadata: { name: 'x' } });
    const { handler } = run({
      instances: [
        prodInstance,
        { name: 'staging', baseUrl: 'https://s.example.com', token: 't' },
      ],
      input: { title: 'T' },
      fetch,
    });
    await expect(handler()).rejects.toThrow(/instanceName/);
  });

  it('targets the named instance when several are configured', async () => {
    const fetch = mockFetch({ metadata: { name: 'x' } });
    const { ctx, handler } = run({
      instances: [
        prodInstance,
        { name: 'staging', baseUrl: 'https://s.example.com', token: 't' },
      ],
      input: { title: 'T', instanceName: 'staging' },
      fetch,
    });

    await expect(handler()).resolves.not.toThrow();
    expect(ctx.output).toHaveBeenCalledWith('instanceName', 'staging');
    expect(String((fetch as jest.Mock).mock.calls[0][0])).toContain(
      'https://s.example.com/',
    );
  });

  it('throws for an unknown instanceName', async () => {
    const fetch = mockFetch({ metadata: { name: 'x' } });
    const { handler } = run({
      input: { title: 'T', instanceName: 'nope' },
      fetch,
    });
    await expect(handler()).rejects.toThrow(/nope/);
  });

  it('throws when no instances are configured at all', async () => {
    const fetch = mockFetch({ metadata: { name: 'x' } });
    const { handler } = run({ instances: [], input: { title: 'T' }, fetch });
    await expect(handler()).rejects.toThrow(/No Grafana instances/);
  });

  it('throws on a non-2xx response', async () => {
    const fetch = mockFetch({ message: 'boom' }, 500);
    const { handler } = run({ input: { title: 'T' }, fetch });
    await expect(handler()).rejects.toThrow();
  });

  describe('with grafana.scaffolder guard rails', () => {
    const twoInstances = [
      prodInstance,
      { name: 'staging', baseUrl: 'https://s.example.com', token: 't' },
    ];

    it('allows writes to an allow-listed instance', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { ctx, handler } = run({
        instances: twoInstances,
        scaffolder: { allowedInstances: ['staging'] },
        input: { title: 'T', instanceName: 'staging' },
        fetch,
      });

      await expect(handler()).resolves.not.toThrow();
      expect(ctx.output).toHaveBeenCalledWith('instanceName', 'staging');
    });

    it('rejects writes to a configured but unlisted instance', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { handler } = run({
        instances: twoInstances,
        scaffolder: { allowedInstances: ['staging'] },
        input: { title: 'T', instanceName: 'prod' },
        fetch,
      });

      await expect(handler()).rejects.toThrow(
        /'prod' is not writable by the scaffolder/,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('auto-selects among writable instances only', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { ctx, handler } = run({
        instances: twoInstances,
        scaffolder: { allowedInstances: ['staging'] },
        input: { title: 'T' }, // no instanceName
        fetch,
      });

      await expect(handler()).resolves.not.toThrow();
      expect(ctx.output).toHaveBeenCalledWith('instanceName', 'staging');
    });

    it('throws when the allow-list leaves nothing writable', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { handler } = run({
        instances: twoInstances,
        scaffolder: { allowedInstances: [] },
        input: { title: 'T' },
        fetch,
      });

      await expect(handler()).rejects.toThrow(/writable by the scaffolder/);
    });

    it('throws when the allow-list names an unknown instance', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { handler } = run({
        scaffolder: { allowedInstances: ['nope'] },
        input: { title: 'T' },
        fetch,
      });

      await expect(handler()).rejects.toThrow(/unknown instance\(s\) 'nope'/);
    });

    it('rejects overwrite when allowOverwrite is off', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { handler } = run({
        scaffolder: { allowOverwrite: false },
        input: { title: 'T', uid: 'abc', overwrite: true },
        fetch,
      });

      await expect(handler()).rejects.toThrow(/allowOverwrite/);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('still creates dashboards when allowOverwrite is off', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const { handler } = run({
        scaffolder: { allowOverwrite: false },
        input: { title: 'T' },
        fetch,
      });

      await expect(handler()).resolves.not.toThrow();
    });

    it('enforces both guard rails at once', async () => {
      const fetch = mockFetch({ metadata: { name: 'x' } });
      const guard = {
        allowedInstances: ['staging'],
        allowOverwrite: false,
      };

      // Create in the allowed instance: fine.
      const create = run({
        instances: twoInstances,
        scaffolder: guard,
        input: { title: 'T', instanceName: 'staging' },
        fetch,
      });
      await expect(create.handler()).resolves.not.toThrow();

      // Overwrite in the allowed instance: blocked by allowOverwrite.
      const update = run({
        instances: twoInstances,
        scaffolder: guard,
        input: {
          title: 'T',
          instanceName: 'staging',
          uid: 'x',
          overwrite: true,
        },
        fetch,
      });
      await expect(update.handler()).rejects.toThrow(/allowOverwrite/);

      // Create in the unlisted instance: blocked by the allow-list.
      const wrong = run({
        instances: twoInstances,
        scaffolder: guard,
        input: { title: 'T', instanceName: 'prod' },
        fetch,
      });
      await expect(wrong.handler()).rejects.toThrow(/not writable/);
    });
  });
});
