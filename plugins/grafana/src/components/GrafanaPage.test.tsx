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
import { screen } from '@testing-library/react';
import { GrafanaApi, grafanaApiRef } from '../api';
import { GrafanaPage } from './GrafanaPage';

function renderPage(api: Partial<GrafanaApi>) {
  const grafanaApi: GrafanaApi = {
    listInstances: jest.fn().mockResolvedValue([]),
    listDashboards: jest.fn().mockResolvedValue([]),
    listAlerts: jest.fn().mockResolvedValue([]),
    ...api,
  };
  return renderInTestApp(
    <TestApiProvider apis={[[grafanaApiRef, grafanaApi]]}>
      <GrafanaPage />
    </TestApiProvider>,
  );
}

describe('GrafanaPage', () => {
  it('lists the configured Grafana instances', async () => {
    renderPage({
      listInstances: jest.fn().mockResolvedValue([
        { name: 'prod', title: 'Production', url: 'https://prod.example.com' },
        {
          name: 'cloud',
          title: 'Grafana Cloud',
          url: 'https://cloud.example.com',
        },
      ]),
    });

    expect(
      await screen.findByRole('link', { name: /Production/ }),
    ).toHaveAttribute('href', 'https://prod.example.com');
    expect(
      screen.getByRole('link', { name: /Grafana Cloud/ }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when no instances are configured', async () => {
    renderPage({ listInstances: jest.fn().mockResolvedValue([]) });
    expect(
      await screen.findByText(/No Grafana instances/i),
    ).toBeInTheDocument();
  });
});
