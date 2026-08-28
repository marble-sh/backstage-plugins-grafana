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

import { Route, Routes } from 'react-router-dom';
import { Entity } from '@backstage/catalog-model';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import {
  GrafanaAlert,
  GrafanaDashboard,
  GrafanaInstanceInfo,
} from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaApi, grafanaApiRef } from './api';
import {
  EntityGrafanaAlertsCard,
  EntityGrafanaAlertsContent,
  EntityGrafanaDashboardsCard,
  EntityGrafanaDashboardsContent,
  GrafanaPage,
  grafanaPlugin,
} from './plugin';
import { rootRouteRef } from './routes';

const instances: GrafanaInstanceInfo[] = [
  { name: 'prod', title: 'Production', url: 'https://grafana.example.com' },
];

const dashboards: GrafanaDashboard[] = [
  {
    uid: 'abc',
    title: 'Service Overview',
    url: 'https://grafana.example.com/d/abc/service-overview',
    tags: ['team-a'],
    instanceName: 'prod',
  },
];

const alerts: GrafanaAlert[] = [
  {
    name: 'High latency',
    state: 'firing',
    url: 'https://grafana.example.com/alerting/list',
    labels: { team: 'team-a' },
    instanceName: 'prod',
  },
];

const mockApi: GrafanaApi = {
  listInstances: async () => instances,
  listDashboards: async () => dashboards,
  listAlerts: async () => alerts,
};

const annotatedEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-service',
    annotations: { 'grafana/instance': 'prod' },
  },
  spec: {},
};

const withApis = (children: React.ReactNode) => (
  <TestApiProvider apis={[[grafanaApiRef, mockApi]]}>
    <EntityProvider entity={annotatedEntity}>{children}</EntityProvider>
  </TestApiProvider>
);

describe('grafanaPlugin (legacy frontend system)', () => {
  it('is created with the expected id, api, and route', () => {
    expect(grafanaPlugin.getId()).toBe('grafana');
    expect(grafanaPlugin.routes.root).toBe(rootRouteRef);
    const apiFactories = [...grafanaPlugin.getApis()];
    expect(apiFactories).toHaveLength(1);
    expect(apiFactories[0].api).toBe(grafanaApiRef);
  });

  it('renders the standalone page extension', async () => {
    await renderInTestApp(
      withApis(
        <Routes>
          <Route path="/" element={<GrafanaPage />} />
        </Routes>,
      ),
    );
    expect(await screen.findByText('Production')).toBeInTheDocument();
  });

  it('renders the entity card extensions', async () => {
    await renderInTestApp(
      withApis(
        <>
          <EntityGrafanaDashboardsCard />
          <EntityGrafanaAlertsCard />
        </>,
      ),
    );
    expect(await screen.findByText('Service Overview')).toBeInTheDocument();
    expect(await screen.findByText('High latency')).toBeInTheDocument();
  });

  it('renders the entity content extensions', async () => {
    await renderInTestApp(
      withApis(
        <>
          <EntityGrafanaDashboardsContent />
          <EntityGrafanaAlertsContent />
        </>,
      ),
    );
    expect(await screen.findByText('Service Overview')).toBeInTheDocument();
    expect(await screen.findByText('High latency')).toBeInTheDocument();
  });
});
