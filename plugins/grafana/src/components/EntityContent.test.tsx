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
import {
  TestApiProvider,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import {
  GrafanaAlert,
  GrafanaDashboard,
} from '@marble-sh/backstage-plugin-grafana-common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';
import { GrafanaApi, grafanaApiRef } from '../api';
import {
  GrafanaAlertsContent,
  GrafanaDashboardsContent,
} from './EntityContent';

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-service',
    annotations: {
      'grafana/instance': 'prod',
      'grafana/dashboard-selector': 'service',
      'grafana/alert-label-selector': 'service=my-service',
    },
  },
  spec: {},
};

const dashboards: GrafanaDashboard[] = [
  {
    uid: 'dash-1',
    title: 'Service Overview',
    url: 'https://grafana.example.com/d/dash-1/service-overview',
    folderTitle: 'Team A',
    tags: ['team-a'],
    instanceName: 'prod',
  },
  {
    uid: 'dash-2',
    title: 'Database Health',
    url: 'https://grafana.example.com/d/dash-2/database-health',
    tags: [],
    instanceName: 'prod',
  },
];

const alerts: GrafanaAlert[] = [
  {
    name: 'High latency',
    state: 'firing',
    url: 'https://grafana.example.com/alerting/grafana/rule-1/view',
    labels: { service: 'my-service' },
    folderTitle: 'Team A',
    instanceName: 'prod',
    uid: 'rule-1',
    health: 'error',
    summary: 'p99 above 500ms',
    activeAt: '2026-08-30T10:00:00Z',
    activeCount: 2,
  },
];

function makeApi(overrides: Partial<GrafanaApi> = {}): GrafanaApi {
  return {
    listInstances: jest.fn().mockResolvedValue([]),
    listDashboards: jest.fn().mockResolvedValue(dashboards),
    listAlerts: jest.fn().mockResolvedValue(alerts),
    listPanels: jest.fn().mockResolvedValue([]),
    getPanelData: jest
      .fn()
      .mockImplementation(async ({ panelId }) => ({ panelId, series: [] })),
    ...overrides,
  } as GrafanaApi;
}

function renderContent(api: GrafanaApi, children: ReactNode) {
  return renderInTestApp(
    <TestApiProvider apis={[[grafanaApiRef, api]]}>
      <EntityProvider entity={entity}>{children}</EntityProvider>
    </TestApiProvider>,
  );
}

describe('GrafanaDashboardsContent', () => {
  it('requests dashboards using the entity selectors', async () => {
    const api = makeApi();
    renderContent(api, <GrafanaDashboardsContent />);

    await screen.findByText('Service Overview');

    expect(api.listDashboards).toHaveBeenCalledWith({
      instanceName: 'prod',
      tags: [],
      query: 'service',
      uid: undefined,
    });
  });

  it('renders an accordion per dashboard, loading only the first', async () => {
    const api = makeApi();
    renderContent(api, <GrafanaDashboardsContent />);

    expect(await screen.findByText('Service Overview')).toBeInTheDocument();
    expect(screen.getByText('Database Health')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();

    // Only the first (expanded) dashboard fetched its panels.
    expect(api.listPanels).toHaveBeenCalledTimes(1);
    expect(api.listPanels).toHaveBeenCalledWith({
      instanceName: 'prod',
      dashboardUid: 'dash-1',
      refresh: false,
    });
  });

  it('bypasses the backend panel cache when the refresh button is clicked', async () => {
    const api = makeApi();
    renderContent(api, <GrafanaDashboardsContent />);

    await screen.findAllByText(/no panels that can be rendered here/);
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh panels' }),
    );
    await screen.findAllByText(/no panels that can be rendered here/);

    expect(api.listPanels).toHaveBeenLastCalledWith({
      instanceName: 'prod',
      dashboardUid: 'dash-1',
      refresh: true,
    });
  });

  it('loads the second dashboard when it is expanded', async () => {
    const api = makeApi();
    renderContent(api, <GrafanaDashboardsContent />);

    await screen.findByText('Database Health');
    await userEvent.click(screen.getByText('Database Health'));

    await screen.findAllByText(/no panels that can be rendered here/);
    expect(api.listPanels).toHaveBeenCalledWith({
      instanceName: 'prod',
      dashboardUid: 'dash-2',
      refresh: false,
    });
  });

  it('offers Grafana links per dashboard', async () => {
    renderContent(makeApi(), <GrafanaDashboardsContent />);

    const links = await screen.findAllByRole('link', {
      name: /Open in Grafana/i,
    });
    expect(links[0]).toHaveAttribute('href', dashboards[0].url);
  });

  it('re-fetches the panels with a new range when it changes', async () => {
    const api = makeApi({
      listPanels: jest.fn().mockResolvedValue([
        {
          id: 1,
          title: 'Requests',
          type: 'timeseries',
          kind: 'timeseries',
          dashboardUid: 'dash-1',
          instanceName: 'prod',
        },
      ]),
    });
    renderContent(api, <GrafanaDashboardsContent />);

    await screen.findByText('Requests');
    expect(api.getPanelData).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'now-6h', to: 'now' }),
    );

    await userEvent.click(screen.getByText('Last 6 hours'));
    await userEvent.click(await screen.findByText('Last hour'));

    await screen.findByText('Requests');
    expect(api.getPanelData).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'now-1h', to: 'now' }),
    );
  });

  it('shows an empty state when no dashboards match', async () => {
    renderContent(
      makeApi({ listDashboards: jest.fn().mockResolvedValue([]) }),
      <GrafanaDashboardsContent />,
    );

    expect(await screen.findByText(/No dashboards found/)).toBeInTheDocument();
  });
});

describe('GrafanaAlertsContent', () => {
  it('lists alerts with state, details, and a deep link', async () => {
    const api = makeApi();
    renderContent(api, <GrafanaAlertsContent />);

    expect(await screen.findByText('High latency')).toBeInTheDocument();
    expect(api.listAlerts).toHaveBeenCalledWith({
      instanceName: 'prod',
      labelSelector: { service: 'my-service' },
    });

    expect(screen.getByText('firing')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
    // Rule-level summary annotations are unrendered Go templates, so the
    // table deliberately has no summary column.
    expect(screen.queryByText('p99 above 500ms')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /High latency/i })).toHaveAttribute(
      'href',
      'https://grafana.example.com/alerting/grafana/rule-1/view',
    );
  });

  it('shows an empty state when no alerts match', async () => {
    renderContent(
      makeApi({ listAlerts: jest.fn().mockResolvedValue([]) }),
      <GrafanaAlertsContent />,
    );

    expect(await screen.findByText(/No alerts found/)).toBeInTheDocument();
  });
});
