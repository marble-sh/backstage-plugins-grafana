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
  TestApiProvider,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import {
  GrafanaDashboard,
  GrafanaPanel,
  GrafanaPanelData,
} from '@marble-sh/backstage-plugin-grafana-common';
import { screen } from '@testing-library/react';
import { GrafanaApi, grafanaApiRef } from '../api';
import { DashboardPanels } from './DashboardPanels';

const dashboard: GrafanaDashboard = {
  uid: 'dash-1',
  title: 'Service Overview',
  url: 'https://grafana.example.com/d/dash-1/service-overview',
  tags: [],
  instanceName: 'prod',
};

const panels: GrafanaPanel[] = [
  {
    id: 1,
    title: 'Requests',
    type: 'timeseries',
    kind: 'timeseries',
    dashboardUid: 'dash-1',
    instanceName: 'prod',
  },
  {
    id: 2,
    title: 'Uptime',
    type: 'stat',
    kind: 'stat',
    dashboardUid: 'dash-1',
    instanceName: 'prod',
  },
  {
    id: 3,
    title: 'Breakdown',
    type: 'table',
    kind: 'unsupported',
    dashboardUid: 'dash-1',
    instanceName: 'prod',
  },
];

const emptyData = (panelId: number): GrafanaPanelData => ({
  panelId,
  series: [],
});

function renderPanels(api: Partial<GrafanaApi>) {
  const grafanaApi = {
    listInstances: jest.fn().mockResolvedValue([]),
    listDashboards: jest.fn().mockResolvedValue([]),
    listAlerts: jest.fn().mockResolvedValue([]),
    listPanels: jest.fn().mockResolvedValue(panels),
    getPanelData: jest
      .fn()
      .mockImplementation(async ({ panelId }) => emptyData(panelId)),
    ...api,
  } as GrafanaApi;
  return {
    grafanaApi,
    ...renderInTestApp(
      <TestApiProvider apis={[[grafanaApiRef, grafanaApi]]}>
        <DashboardPanels
          dashboard={dashboard}
          range={{ from: 'now-1h', to: 'now' }}
        />
      </TestApiProvider>,
    ),
  };
}

describe('DashboardPanels', () => {
  it('fetches data for every supported panel with the range', async () => {
    const { grafanaApi } = renderPanels({});

    expect(await screen.findByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();

    expect(grafanaApi.listPanels).toHaveBeenCalledWith({
      instanceName: 'prod',
      dashboardUid: 'dash-1',
      refresh: false,
    });
    expect(grafanaApi.getPanelData).toHaveBeenCalledTimes(2);
    expect(grafanaApi.getPanelData).toHaveBeenCalledWith({
      instanceName: 'prod',
      dashboardUid: 'dash-1',
      panelId: 1,
      from: 'now-1h',
      to: 'now',
      refresh: false,
    });
  });

  it('links unsupported panels to Grafana with their types', async () => {
    renderPanels({});

    expect(
      await screen.findByText(/1 panel \(table\) cannot be rendered here/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open the dashboard in Grafana/i }),
    ).toHaveAttribute('href', dashboard.url);
  });

  it('renders panel warnings', async () => {
    renderPanels({
      getPanelData: jest.fn().mockImplementation(async ({ panelId }) => ({
        panelId,
        series: [],
        warnings: [`Query A failed: timeout ${panelId}`],
      })),
    });

    expect(
      await screen.findByText('Query A failed: timeout 1'),
    ).toBeInTheDocument();
  });

  it('shows an all-unsupported empty state', async () => {
    renderPanels({
      listPanels: jest.fn().mockResolvedValue([panels[2]]),
    });

    expect(
      await screen.findByText(/no panels that can be rendered here/),
    ).toBeInTheDocument();
  });
});
