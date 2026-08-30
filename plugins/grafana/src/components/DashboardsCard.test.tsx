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

import { Entity } from '@backstage/catalog-model';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import {
  TestApiProvider,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { GrafanaApi, grafanaApiRef } from '../api';
import { DashboardsCard } from './DashboardsCard';

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test',
    annotations: {
      'grafana/instance': 'prod',
      'grafana/tag-selector': 'team-a, prod',
      'grafana/dashboard-selector': 'latency',
      'grafana/dashboard-uid': 'aBc42',
    },
  },
  spec: {},
};

function renderCard(api: Partial<GrafanaApi>) {
  const grafanaApi: GrafanaApi = {
    listInstances: jest.fn().mockResolvedValue([]),
    listDashboards: jest.fn().mockResolvedValue([]),
    listAlerts: jest.fn().mockResolvedValue([]),
    ...api,
  };
  return {
    grafanaApi,
    ...renderInTestApp(
      <TestApiProvider apis={[[grafanaApiRef, grafanaApi]]}>
        <EntityProvider entity={entity}>
          <DashboardsCard />
        </EntityProvider>
      </TestApiProvider>,
    ),
  };
}

describe('DashboardsCard', () => {
  it('requests dashboards using the entity selectors', async () => {
    const listDashboards = jest.fn().mockResolvedValue([]);
    const { grafanaApi } = renderCard({ listDashboards });

    await screen.findByText(/No dashboards/i);

    expect(grafanaApi.listDashboards).toHaveBeenCalledWith({
      instanceName: 'prod',
      tags: ['team-a', 'prod'],
      query: 'latency',
      uid: 'aBc42',
    });
  });

  it('renders dashboard links', async () => {
    renderCard({
      listDashboards: jest.fn().mockResolvedValue([
        {
          uid: 'abc',
          title: 'My Service',
          url: 'https://grafana.example.com/d/abc/my-service',
          tags: ['team-a'],
          instanceName: 'prod',
        },
      ]),
    });

    const link = await screen.findByRole('link', { name: /My Service/ });
    expect(link).toHaveAttribute(
      'href',
      'https://grafana.example.com/d/abc/my-service',
    );
  });

  it('links the containing folder when a folder url is known', async () => {
    renderCard({
      listDashboards: jest.fn().mockResolvedValue([
        {
          uid: 'abc',
          title: 'My Service',
          url: 'https://grafana.example.com/d/abc/my-service',
          folderTitle: 'Team A',
          folderUrl: 'https://grafana.example.com/dashboards/f/xyz/team-a',
          tags: [],
          instanceName: 'prod',
        },
        {
          uid: 'def',
          title: 'No Folder Link',
          url: 'https://grafana.example.com/d/def/no-folder-link',
          folderTitle: 'Plain Folder',
          tags: [],
          instanceName: 'prod',
        },
      ]),
    });

    const folderLink = await screen.findByRole('link', { name: /Team A/ });
    expect(folderLink).toHaveAttribute(
      'href',
      'https://grafana.example.com/dashboards/f/xyz/team-a',
    );
    // Without a folderUrl the folder title renders as plain text.
    expect(screen.getByText('Plain Folder')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Plain Folder/ }),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no dashboards', async () => {
    renderCard({ listDashboards: jest.fn().mockResolvedValue([]) });
    expect(await screen.findByText(/No dashboards/i)).toBeInTheDocument();
  });

  it('shows an error panel when the request fails', async () => {
    renderCard({
      listDashboards: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const matches = await screen.findAllByText(/boom/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});
