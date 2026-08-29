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

import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { GrafanaApiClient } from './api';

function setup(response: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const discoveryApi: DiscoveryApi = {
    getBaseUrl: jest
      .fn()
      .mockResolvedValue('http://localhost:7007/api/grafana'),
  };
  const fetchApi: FetchApi = {
    fetch: fetchMock as unknown as FetchApi['fetch'],
  };
  const client = new GrafanaApiClient({ discoveryApi, fetchApi });
  return { client, fetchMock };
}

const calledUrl = (fetchMock: jest.Mock): URL =>
  new URL(fetchMock.mock.calls[0][0]);

describe('GrafanaApiClient', () => {
  it('lists instances', async () => {
    const { client, fetchMock } = setup({
      items: [{ name: 'prod', title: 'Prod', url: 'https://g' }],
    });

    const instances = await client.listInstances();

    expect(calledUrl(fetchMock).pathname).toBe('/api/grafana/instances');
    expect(instances).toEqual([
      { name: 'prod', title: 'Prod', url: 'https://g' },
    ]);
  });

  it('lists dashboards for a specific instance with filters', async () => {
    const { client, fetchMock } = setup({
      items: [
        { uid: 'a', title: 'A', url: 'u', tags: ['x'], instanceName: 'prod' },
      ],
    });

    const dashboards = await client.listDashboards({
      instanceName: 'prod',
      tags: ['x', 'y'],
      query: 'foo',
      uid: 'aBc',
      refresh: true,
    });

    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe('/api/grafana/instances/prod/dashboards');
    expect(url.searchParams.getAll('tag')).toEqual(['x', 'y']);
    expect(url.searchParams.get('query')).toBe('foo');
    expect(url.searchParams.get('uid')).toBe('aBc');
    expect(url.searchParams.get('refresh')).toBe('true');
    expect(dashboards).toHaveLength(1);
  });

  it('lists dashboards across all instances when none is given', async () => {
    const { client, fetchMock } = setup({ items: [] });

    await client.listDashboards({ query: 'foo' });

    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe('/api/grafana/dashboards');
    expect(url.searchParams.get('query')).toBe('foo');
  });

  it('lists alerts with a label selector', async () => {
    const { client, fetchMock } = setup({ items: [] });

    await client.listAlerts({
      instanceName: 'prod',
      labelSelector: { team: 'a', severity: 'high' },
    });

    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe('/api/grafana/instances/prod/alerts');
    expect(url.searchParams.get('labelSelector')).toBe('team=a,severity=high');
  });

  it('passes the refresh flag when listing alerts', async () => {
    const { client, fetchMock } = setup({ items: [] });

    await client.listAlerts({ refresh: true });

    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe('/api/grafana/alerts');
    expect(url.searchParams.get('refresh')).toBe('true');
  });

  it('throws on a non-2xx response', async () => {
    const { client } = setup({ error: 'boom' }, 500);
    await expect(client.listInstances()).rejects.toThrow();
  });
});
