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
  GrafanaAlert,
  GrafanaDashboard,
} from '@marble-sh/backstage-plugin-grafana-common';
import { filterAlerts, filterDashboards } from './filters';

const dashboard = (
  uid: string,
  title: string,
  tags: string[],
): GrafanaDashboard => ({
  uid,
  title,
  url: `https://g/d/${uid}`,
  tags,
  instanceName: 'prod',
});

const alert = (name: string, labels: Record<string, string>): GrafanaAlert => ({
  name,
  state: 'firing',
  url: 'https://g/alerting/list',
  labels,
  instanceName: 'prod',
});

describe('filterDashboards', () => {
  const dashboards = [
    dashboard('a', 'Alpha', ['x', 'shared']),
    dashboard('b', 'Beta', ['y', 'shared']),
    dashboard('c', 'Alpine', ['x']),
  ];

  it('returns all dashboards with an empty filter', () => {
    expect(filterDashboards(dashboards)).toHaveLength(3);
  });

  it('matches a uid exactly and case-sensitively', () => {
    expect(filterDashboards(dashboards, { uid: 'a' }).map(d => d.uid)).toEqual([
      'a',
    ]);
    expect(filterDashboards(dashboards, { uid: 'A' })).toHaveLength(0);
    // The uid combines with the other filters rather than replacing them.
    expect(
      filterDashboards(dashboards, { uid: 'a', tags: ['y'] }),
    ).toHaveLength(0);
  });

  it('requires all requested tags to be present', () => {
    expect(
      filterDashboards(dashboards, { tags: ['x'] }).map(d => d.uid),
    ).toEqual(['a', 'c']);
    expect(
      filterDashboards(dashboards, { tags: ['x', 'shared'] }).map(d => d.uid),
    ).toEqual(['a']);
  });

  it('matches the query against the title case-insensitively', () => {
    expect(
      filterDashboards(dashboards, { query: 'alp' }).map(d => d.uid),
    ).toEqual(['a', 'c']);
  });

  it('combines tag and query filters', () => {
    expect(
      filterDashboards(dashboards, { tags: ['x'], query: 'alpine' }).map(
        d => d.uid,
      ),
    ).toEqual(['c']);
  });

  it('selects the union of comma-separated query values', () => {
    // Comma-separated values select any dashboard matching ANY value.
    expect(
      filterDashboards(dashboards, { query: 'beta, alpine' }).map(d => d.uid),
    ).toEqual(['b', 'c']);
  });

  it('lists a dashboard matching several query values only once', () => {
    expect(
      filterDashboards(dashboards, { query: 'alp, alpha' }).map(d => d.uid),
    ).toEqual(['a', 'c']);
  });

  it('ignores empty query segments', () => {
    expect(
      filterDashboards(dashboards, { query: ' beta ,, ' }).map(d => d.uid),
    ).toEqual(['b']);
  });

  it('does not filter on a query of only separators', () => {
    expect(filterDashboards(dashboards, { query: ' , ,' })).toHaveLength(3);
  });

  it('combines tags with a multi-value query', () => {
    // Tags still narrow (AND) while the query values widen (OR): the query
    // matches a+b+c, the tag then keeps only the x-tagged ones.
    expect(
      filterDashboards(dashboards, { tags: ['x'], query: 'beta, alp' }).map(
        d => d.uid,
      ),
    ).toEqual(['a', 'c']);
  });
});

describe('filterAlerts', () => {
  const alerts = [
    alert('one', { team: 'a', severity: 'high' }),
    alert('two', { team: 'b', severity: 'high' }),
  ];

  it('returns all alerts with no selector', () => {
    expect(filterAlerts(alerts)).toHaveLength(2);
  });

  it('requires all selector labels to match', () => {
    expect(
      filterAlerts(alerts, { labelSelector: { severity: 'high' } }).map(
        a => a.name,
      ),
    ).toEqual(['one', 'two']);
    expect(
      filterAlerts(alerts, {
        labelSelector: { team: 'a', severity: 'high' },
      }).map(a => a.name),
    ).toEqual(['one']);
  });
});
