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
import { AlertsCard } from './AlertsCard';

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test',
    annotations: {
      'grafana/instance': 'prod',
      'grafana/alert-label-selector': 'team=team-a,severity=high',
    },
  },
  spec: {},
};

function renderCard(api: Partial<GrafanaApi>) {
  const grafanaApi: GrafanaApi = {
    listInstances: jest.fn().mockResolvedValue([]),
    listDashboards: jest.fn().mockResolvedValue([]),
    listAlerts: jest.fn().mockResolvedValue([]),
    listPanels: jest.fn().mockResolvedValue([]),
    getPanelData: jest.fn().mockResolvedValue({ panelId: 1, series: [] }),
    ...api,
  };
  return {
    grafanaApi,
    ...renderInTestApp(
      <TestApiProvider apis={[[grafanaApiRef, grafanaApi]]}>
        <EntityProvider entity={entity}>
          <AlertsCard />
        </EntityProvider>
      </TestApiProvider>,
    ),
  };
}

describe('AlertsCard', () => {
  it('requests alerts using the entity instance and label selector', async () => {
    const { grafanaApi } = renderCard({
      listAlerts: jest.fn().mockResolvedValue([]),
    });

    await screen.findByText(/No alerts/i);

    expect(grafanaApi.listAlerts).toHaveBeenCalledWith({
      instanceName: 'prod',
      labelSelector: { team: 'team-a', severity: 'high' },
    });
  });

  it('renders alerts with their name and state', async () => {
    renderCard({
      listAlerts: jest.fn().mockResolvedValue([
        {
          name: 'High latency',
          state: 'firing',
          url: 'https://grafana.example.com/alerting/list',
          labels: { team: 'team-a' },
          instanceName: 'prod',
        },
      ]),
    });

    expect(
      await screen.findByRole('link', { name: /High latency/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/firing/i)).toBeInTheDocument();
  });

  it('colors the state chip by severity', async () => {
    const base = {
      url: 'https://grafana.example.com/alerting/list',
      labels: {},
      instanceName: 'prod',
    };
    renderCard({
      listAlerts: jest.fn().mockResolvedValue([
        { ...base, name: 'firing alert', state: 'firing' },
        { ...base, name: 'pending alert', state: 'pending' },
        { ...base, name: 'nodata alert', state: 'no_data' },
        { ...base, name: 'normal alert', state: 'normal' },
        { ...base, name: 'weird alert', state: 'unknown' },
      ]),
    });

    // firing/error → secondary, pending/no_data → primary, others → default.
    expect(await screen.findByText('firing')).toBeInTheDocument();
    expect(screen.getByText('firing').closest('.MuiChip-root')).toHaveClass(
      'MuiChip-colorSecondary',
    );
    expect(screen.getByText('pending').closest('.MuiChip-root')).toHaveClass(
      'MuiChip-colorPrimary',
    );
    expect(screen.getByText('no_data').closest('.MuiChip-root')).toHaveClass(
      'MuiChip-colorPrimary',
    );
    expect(screen.getByText('normal').closest('.MuiChip-root')).not.toHaveClass(
      'MuiChip-colorPrimary',
    );
    expect(
      screen.getByText('unknown').closest('.MuiChip-root'),
    ).not.toHaveClass('MuiChip-colorSecondary');
  });

  it('shows an empty state when there are no alerts', async () => {
    renderCard({ listAlerts: jest.fn().mockResolvedValue([]) });
    expect(await screen.findByText(/No alerts/i)).toBeInTheDocument();
  });

  it('shows an error panel when the request fails', async () => {
    renderCard({
      listAlerts: jest.fn().mockRejectedValue(new Error('kaboom')),
    });
    const matches = await screen.findAllByText(/kaboom/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});
