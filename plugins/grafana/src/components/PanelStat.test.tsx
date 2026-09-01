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

import { render, screen } from '@testing-library/react';
import { PanelStat } from './PanelStat';

describe('PanelStat', () => {
  it('shows the latest non-null value of the first series without its name', () => {
    render(
      <PanelStat
        data={{
          panelId: 1,
          series: [
            {
              name: 'count(up{job=~"(.*)"}) or vector(0)',
              points: [
                { timeMs: 1, value: 98.6 },
                { timeMs: 2, value: 99.93 },
                { timeMs: 3, value: null },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('99.93')).toBeInTheDocument();
    // A lone series is often named after its query text (Prometheus does this
    // for label-less results) — like Grafana's stat panel, show only the value.
    expect(
      screen.queryByText('count(up{job=~"(.*)"}) or vector(0)'),
    ).not.toBeInTheDocument();
  });

  it('names the shown series when there are several to disambiguate', () => {
    render(
      <PanelStat
        data={{
          panelId: 1,
          series: [
            { name: 'uptime', points: [{ timeMs: 1, value: 98.6 }] },
            { name: 'downtime', points: [{ timeMs: 1, value: 1.4 }] },
          ],
        }}
      />,
    );

    expect(screen.getByText('98.6')).toBeInTheDocument();
    expect(screen.getByText('uptime')).toBeInTheDocument();
    expect(screen.queryByText('downtime')).not.toBeInTheDocument();
  });

  it('compacts large values', () => {
    render(
      <PanelStat
        data={{
          panelId: 1,
          series: [
            { name: 'requests', points: [{ timeMs: 1, value: 1_234_567 }] },
          ],
        }}
      />,
    );

    expect(screen.getByText('1.23m')).toBeInTheDocument();
  });

  it('shows a placeholder when there is no value', () => {
    render(<PanelStat data={{ panelId: 1, series: [] }} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
