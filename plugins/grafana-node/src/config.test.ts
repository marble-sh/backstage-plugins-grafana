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
import { readGrafanaInstances } from './config';

const read = (data: object) => readGrafanaInstances(new ConfigReader(data));

describe('readGrafanaInstances', () => {
  it('returns an empty list when no instances are configured', () => {
    expect(read({})).toEqual([]);
    expect(read({ grafana: {} })).toEqual([]);
  });

  it('reads an instance and applies defaults', () => {
    expect(
      read({
        grafana: {
          instances: [
            {
              name: 'prod',
              baseUrl: 'https://grafana.example.com/',
              token: 'abc',
            },
          ],
        },
      }),
    ).toEqual([
      {
        name: 'prod',
        title: 'prod',
        baseUrl: 'https://grafana.example.com',
        token: 'abc',
        namespace: 'default',
        apis: { dashboards: 'app-platform', alerts: 'prometheus' },
        resolveFolders: true,
      },
    ]);
  });

  it('derives the cloud namespace from stackId', () => {
    const [instance] = read({
      grafana: {
        instances: [
          {
            name: 'cloud',
            baseUrl: 'https://myorg.grafana.net',
            token: 'abc',
            stackId: '12345',
          },
        ],
      },
    });
    expect(instance.namespace).toBe('stacks-12345');
  });

  it('prefers an explicit namespace over stackId', () => {
    const [instance] = read({
      grafana: {
        instances: [
          {
            name: 'org2',
            baseUrl: 'https://grafana.example.com',
            token: 'abc',
            namespace: 'org-2',
            stackId: '12345',
          },
        ],
      },
    });
    expect(instance.namespace).toBe('org-2');
  });

  it('honors explicit title and api overrides', () => {
    const [instance] = read({
      grafana: {
        instances: [
          {
            name: 'legacy',
            title: 'Legacy Grafana',
            baseUrl: 'https://old.example.com',
            token: 'abc',
            apis: { dashboards: 'legacy-search', alerts: 'prometheus' },
          },
        ],
      },
    });
    expect(instance.title).toBe('Legacy Grafana');
    expect(instance.apis.dashboards).toBe('legacy-search');
  });

  it('reads the none api choices and resolveFolders off', () => {
    const [instance] = read({
      grafana: {
        instances: [
          {
            name: 'quiet',
            baseUrl: 'https://grafana.example.com',
            token: 'abc',
            apis: { dashboards: 'none', alerts: 'none' },
            resolveFolders: false,
          },
        ],
      },
    });
    expect(instance.apis).toEqual({ dashboards: 'none', alerts: 'none' });
    expect(instance.resolveFolders).toBe(false);
  });

  it('throws on an unknown api choice', () => {
    expect(() =>
      read({
        grafana: {
          instances: [
            {
              name: 'bad',
              baseUrl: 'https://grafana.example.com',
              token: 'abc',
              apis: { dashboards: 'carrier-pigeon' },
            },
          ],
        },
      }),
    ).toThrow(/apis.dashboards 'carrier-pigeon'/);
    expect(() =>
      read({
        grafana: {
          instances: [
            {
              name: 'bad',
              baseUrl: 'https://grafana.example.com',
              token: 'abc',
              apis: { alerts: 'smoke-signals' },
            },
          ],
        },
      }),
    ).toThrow(/apis.alerts 'smoke-signals'/);
  });

  it('throws on duplicate instance names', () => {
    expect(() =>
      read({
        grafana: {
          instances: [
            { name: 'dup', baseUrl: 'https://a.example.com', token: 'x' },
            { name: 'dup', baseUrl: 'https://b.example.com', token: 'y' },
          ],
        },
      }),
    ).toThrow(/[Dd]uplicate/);
  });
});
