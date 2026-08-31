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

import { GrafanaPanelData } from '@marble-sh/backstage-plugin-grafana-common';
import { render, screen } from '@testing-library/react';
import { Children, cloneElement, isValidElement, ReactNode } from 'react';
import { MAX_CHART_SERIES, PanelChart } from './PanelChart';

// jsdom has no layout, so ResponsiveContainer measures 0x0 and renders
// nothing. Substitute a fixed-size container for tests.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div>
        {Children.map(children, child =>
          isValidElement(child)
            ? cloneElement(child, { width: 600, height: 300 } as never)
            : child,
        )}
      </div>
    ),
  };
});

const series = (name: string): GrafanaPanelData['series'][number] => ({
  name,
  points: [
    { timeMs: 1_700_000_000_000, value: 1 },
    { timeMs: 1_700_000_060_000, value: 2 },
  ],
});

describe('PanelChart', () => {
  it('renders a legend naming each series', async () => {
    render(
      <PanelChart
        data={{ panelId: 1, series: [series('api'), series('worker')] }}
      />,
    );

    expect(await screen.findByText('api')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
  });

  it('renders an empty state when there are no points', () => {
    render(<PanelChart data={{ panelId: 1, series: [] }} />);

    expect(screen.getByText(/No data for this time range/)).toBeInTheDocument();
  });

  it('caps the drawn series and says so', () => {
    const many = Array.from({ length: MAX_CHART_SERIES + 3 }, (_, i) =>
      series(`series-${i}`),
    );
    render(<PanelChart data={{ panelId: 1, series: many }} />);

    expect(
      screen.getByText(
        new RegExp(
          `Showing ${MAX_CHART_SERIES} of ${MAX_CHART_SERIES + 3} series`,
        ),
      ),
    ).toBeInTheDocument();
  });
});
