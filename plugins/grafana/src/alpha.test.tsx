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
  ApiBlueprint,
  coreExtensionData,
} from '@backstage/frontend-plugin-api';
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { screen } from '@testing-library/react';
import {
  GrafanaAlert,
  GrafanaDashboard,
  GrafanaInstanceInfo,
} from '@marble-sh/backstage-plugin-grafana-common';
import { GrafanaApi, GrafanaApiClient, grafanaApiRef } from './api';
import grafanaPlugin from './alpha';
import {
  entityGrafanaAlertsCard,
  entityGrafanaAlertsContent,
  entityGrafanaDashboardsCard,
  entityGrafanaDashboardsContent,
  grafanaApi,
  grafanaPage,
} from './alpha/extensions';

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
  listPanels: async () => [],
  getPanelData: async () => ({ panelId: 1, series: [] }),
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

describe('grafana plugin (new frontend system)', () => {
  it('registers every extension under the id the app resolves', () => {
    expect(grafanaPlugin.id).toBe('grafana');
    expect(grafanaPlugin.getExtension('api:grafana')).toBeDefined();
    expect(grafanaPlugin.getExtension('page:grafana')).toBeDefined();
    expect(
      grafanaPlugin.getExtension('entity-card:grafana/dashboards'),
    ).toBeDefined();
    expect(
      grafanaPlugin.getExtension('entity-card:grafana/alerts'),
    ).toBeDefined();
    expect(
      grafanaPlugin.getExtension('entity-content:grafana/dashboards'),
    ).toBeDefined();
    expect(
      grafanaPlugin.getExtension('entity-content:grafana/alerts'),
    ).toBeDefined();
  });

  it('declares the entity tab titles and paths', () => {
    const dashboardsTester = createExtensionTester(
      entityGrafanaDashboardsContent,
    );
    expect(dashboardsTester.get(EntityContentBlueprint.dataRefs.title)).toBe(
      'Grafana Dashboards',
    );
    expect(dashboardsTester.get(coreExtensionData.routePath)).toBe('grafana');

    const alertsTester = createExtensionTester(entityGrafanaAlertsContent);
    expect(alertsTester.get(EntityContentBlueprint.dataRefs.title)).toBe(
      'Grafana Alerts',
    );
    expect(alertsTester.get(coreExtensionData.routePath)).toBe(
      'grafana-alerts',
    );
  });

  it('only attaches to entities with the relevant annotations', () => {
    const dashboardsFilter = createExtensionTester(
      entityGrafanaDashboardsContent,
    ).get(EntityContentBlueprint.dataRefs.filterFunction);
    const alertsFilter = createExtensionTester(entityGrafanaAlertsContent).get(
      EntityContentBlueprint.dataRefs.filterFunction,
    );
    if (!dashboardsFilter || !alertsFilter) {
      throw new Error('the entity contents declare no filter');
    }

    const bare: Entity = {
      ...annotatedEntity,
      metadata: { name: 'bare', annotations: {} },
    };
    expect(dashboardsFilter(annotatedEntity)).toBe(true);
    expect(alertsFilter(annotatedEntity)).toBe(true);
    expect(dashboardsFilter(bare)).toBe(false);
    expect(alertsFilter(bare)).toBe(false);
  });

  it('renders the standalone instances page through the extension', async () => {
    renderInTestApp(createExtensionTester(grafanaPage).reactElement(), {
      apis: [[grafanaApiRef, mockApi]],
    });

    expect(await screen.findByText('Production')).toBeInTheDocument();
  });

  it('renders the dashboards card through the extension', async () => {
    renderInTestApp(
      <EntityProvider entity={annotatedEntity}>
        {createExtensionTester(entityGrafanaDashboardsCard).reactElement()}
      </EntityProvider>,
      { apis: [[grafanaApiRef, mockApi]] },
    );

    expect(await screen.findByText('Service Overview')).toBeInTheDocument();
  });

  it('renders the alerts card through the extension', async () => {
    renderInTestApp(
      <EntityProvider entity={annotatedEntity}>
        {createExtensionTester(entityGrafanaAlertsCard).reactElement()}
      </EntityProvider>,
      { apis: [[grafanaApiRef, mockApi]] },
    );

    expect(await screen.findByText('High latency')).toBeInTheDocument();
  });

  it('renders Service Overview in the entity tab contents through the extensions', async () => {
    renderInTestApp(
      <EntityProvider entity={annotatedEntity}>
        {createExtensionTester(entityGrafanaDashboardsContent).reactElement()}
      </EntityProvider>,
      { apis: [[grafanaApiRef, mockApi]] },
    );
    expect(await screen.findByText('Service Overview')).toBeInTheDocument();
  });

  it('renders High Latency in the entity tab contents through the extensions', async () => {
    renderInTestApp(
      <EntityProvider entity={annotatedEntity}>
        {createExtensionTester(entityGrafanaAlertsContent).reactElement()}
      </EntityProvider>,
      { apis: [[grafanaApiRef, mockApi]] },
    );
    expect(await screen.findByText('High latency')).toBeInTheDocument();
  });

  it('provides the grafana api through the api extension factory', async () => {
    const factory = createExtensionTester(grafanaApi).get(
      ApiBlueprint.dataRefs.factory,
    );

    expect(factory.api).toBe(grafanaApiRef);
    const client = factory.factory({
      discoveryApi: { getBaseUrl: async () => 'http://backend/api/grafana' },
      fetchApi: {
        fetch: async () =>
          new Response(JSON.stringify({ items: instances }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      },
    });

    expect(client).toBeInstanceOf(GrafanaApiClient);
    await expect((client as GrafanaApi).listInstances()).resolves.toEqual(
      instances,
    );
  });
});
