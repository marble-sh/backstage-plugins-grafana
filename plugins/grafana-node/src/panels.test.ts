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
  buildPanelQueries,
  extractPanels,
  interpolateTemplate,
  normalizeFrames,
  readTemplateVariables,
  resolveTimeRange,
} from './panels';

describe('extractPanels', () => {
  it('extracts top-level panels with their kind', () => {
    const panels = extractPanels({
      panels: [
        { id: 1, type: 'timeseries', title: 'Requests' },
        { id: 2, type: 'graph', title: 'Errors', description: 'rate' },
        { id: 3, type: 'stat', title: 'Uptime' },
        { id: 4, type: 'gauge', title: 'Saturation' },
        { id: 5, type: 'singlestat', title: 'Old stat' },
        { id: 6, type: 'table', title: 'Breakdown' },
      ],
    });

    expect(panels).toEqual([
      expect.objectContaining({ id: 1, kind: 'timeseries' }),
      expect.objectContaining({
        id: 2,
        kind: 'timeseries',
        description: 'rate',
      }),
      expect.objectContaining({ id: 3, kind: 'stat' }),
      expect.objectContaining({ id: 4, kind: 'stat' }),
      expect.objectContaining({ id: 5, kind: 'stat' }),
      expect.objectContaining({ id: 6, kind: 'unsupported', type: 'table' }),
    ]);
  });

  it('flattens panels nested in collapsed rows and skips the rows', () => {
    const panels = extractPanels({
      panels: [
        { id: 1, type: 'timeseries', title: 'Top level' },
        {
          id: 2,
          type: 'row',
          title: 'Collapsed row',
          collapsed: true,
          panels: [{ id: 3, type: 'timeseries', title: 'Nested' }],
        },
        { id: 4, type: 'row', title: 'Expanded row', collapsed: false },
      ],
    });

    expect(panels.map(p => p.id)).toEqual([1, 3]);
  });

  it('skips panels without a numeric id and defaults missing titles', () => {
    const panels = extractPanels({
      panels: [
        { type: 'timeseries', title: 'No id' },
        { id: 7, type: 'timeseries' },
      ],
    });

    expect(panels).toEqual([
      expect.objectContaining({ id: 7, title: 'Panel 7' }),
    ]);
  });

  it('returns empty for missing or malformed models', () => {
    expect(extractPanels(undefined)).toEqual([]);
    expect(extractPanels({})).toEqual([]);
    expect(extractPanels({ panels: 'nope' } as never)).toEqual([]);
  });
});

describe('readTemplateVariables', () => {
  it('reads current values from templating.list', () => {
    expect(
      readTemplateVariables({
        templating: {
          list: [
            { name: 'env', current: { text: 'Production', value: 'prod' } },
            { name: 'pods', current: { value: ['a', 'b'] } },
            { name: 'broken' },
            { current: { value: 'orphan' } },
          ],
        },
      }),
    ).toEqual({ env: 'prod', pods: ['a', 'b'] });
  });

  it('returns empty for models without templating', () => {
    expect(readTemplateVariables({})).toEqual({});
    expect(readTemplateVariables(undefined)).toEqual({});
  });
});

describe('interpolateTemplate', () => {
  const variables = {
    env: 'prod',
    pods: ['a', 'b'],
    all: ['$__all'],
  };

  it('substitutes $var, ${var}, and [[var]] syntaxes', () => {
    expect(interpolateTemplate('up{env="$env"}', variables)).toBe(
      'up{env="prod"}',
    );
    expect(interpolateTemplate('up{env="${env}"}', variables)).toBe(
      'up{env="prod"}',
    );
    expect(interpolateTemplate('up{env="[[env]]"}', variables)).toBe(
      'up{env="prod"}',
    );
  });

  it('joins multi-value variables with a pipe by default', () => {
    expect(interpolateTemplate('pod=~"$pods"', variables)).toBe('pod=~"(a|b)"');
  });

  it('supports the csv, pipe, and regex format hints', () => {
    expect(interpolateTemplate('${pods:csv}', variables)).toBe('a,b');
    expect(interpolateTemplate('${pods:pipe}', variables)).toBe('a|b');
    expect(interpolateTemplate('${pods:regex}', variables)).toBe('(a|b)');
    expect(interpolateTemplate('${env:csv}', variables)).toBe('prod');
  });

  it('expands the special $__all value to a match-everything regex', () => {
    expect(interpolateTemplate('pod=~"$all"', variables)).toBe('pod=~"(.*)"');
  });

  it('leaves unknown and built-in variables untouched', () => {
    expect(interpolateTemplate('rate(x[$__interval])', variables)).toBe(
      'rate(x[$__interval])',
    );
    expect(interpolateTemplate('$unknown and ${also:csv}', variables)).toBe(
      '$unknown and ${also:csv}',
    );
    // Longest match wins: $envoy is not $env + "oy".
    expect(interpolateTemplate('$envoy', variables)).toBe('$envoy');
  });
});

describe('resolveTimeRange', () => {
  const now = 1_700_000_000_000;

  it('resolves relative expressions against now', () => {
    expect(resolveTimeRange('now-1h', 'now', now)).toEqual({
      fromMs: now - 3_600_000,
      toMs: now,
    });
    expect(resolveTimeRange('now-30m', 'now-5m', now)).toEqual({
      fromMs: now - 1_800_000,
      toMs: now - 300_000,
    });
    expect(resolveTimeRange('now-7d', 'now', now).fromMs).toBe(
      now - 7 * 24 * 3_600_000,
    );
  });

  it('accepts epoch-millisecond strings', () => {
    expect(resolveTimeRange('1699990000000', '1700000000000', now)).toEqual({
      fromMs: 1_699_990_000_000,
      toMs: 1_700_000_000_000,
    });
  });

  it('rejects malformed expressions and inverted ranges', () => {
    expect(() => resolveTimeRange('yesterday', 'now', now)).toThrow(
      /Invalid time/,
    );
    expect(() => resolveTimeRange('now-1x', 'now', now)).toThrow(
      /Invalid time/,
    );
    expect(() => resolveTimeRange('now', 'now-1h', now)).toThrow(
      /before|after/i,
    );
  });
});

describe('buildPanelQueries', () => {
  const model = {
    templating: {
      list: [
        { name: 'env', current: { value: 'prod' } },
        { name: 'ds', current: { value: 'prom-uid' } },
      ],
    },
  };

  it('builds interpolated queries with computed interval fields', () => {
    const { queries, hiddenRefIds, warnings } = buildPanelQueries({
      panel: {
        id: 1,
        datasource: { uid: 'ds-1', type: 'prometheus' },
        maxDataPoints: 100,
        targets: [
          { refId: 'A', expr: 'up{env="$env"}' },
          {
            refId: 'B',
            expr: 'down',
            datasource: { uid: 'ds-2', type: 'loki' },
          },
        ],
      },
      model,
      range: { from: 'now-1h', to: 'now' },
    });

    expect(warnings).toEqual([]);
    expect(hiddenRefIds).toEqual([]);
    expect(queries).toEqual([
      {
        refId: 'A',
        expr: 'up{env="prod"}',
        datasource: { uid: 'ds-1', type: 'prometheus' },
        maxDataPoints: 100,
        intervalMs: 36_000,
      },
      {
        refId: 'B',
        expr: 'down',
        datasource: { uid: 'ds-2', type: 'loki' },
        maxDataPoints: 100,
        intervalMs: 36_000,
      },
    ]);
  });

  it('resolves datasource variables and string datasources', () => {
    const { queries } = buildPanelQueries({
      panel: {
        id: 1,
        datasource: { uid: '${ds}' },
        targets: [
          { refId: 'A', expr: 'up' },
          { refId: 'B', expr: 'up', datasource: 'My Named Source' },
        ],
      },
      model,
      range: { from: 'now-1h', to: 'now' },
    });

    expect(queries[0].datasource).toEqual({ uid: 'prom-uid' });
    expect(queries[1].datasource).toBe('My Named Source');
  });

  it('keeps hidden targets in the request but reports their refIds', () => {
    const { queries, hiddenRefIds } = buildPanelQueries({
      panel: {
        id: 1,
        datasource: { uid: 'ds-1' },
        targets: [
          { refId: 'A', expr: 'up', hide: true },
          {
            refId: 'B',
            datasource: { type: '__expr__', uid: '__expr__' },
            expression: 'A',
            type: 'reduce',
          },
        ],
      },
      model,
      range: { from: 'now-1h', to: 'now' },
    });

    expect(queries).toHaveLength(2);
    expect(hiddenRefIds).toEqual(['A']);
  });

  it('skips targets whose datasource cannot be resolved', () => {
    const { queries, warnings } = buildPanelQueries({
      panel: {
        id: 1,
        targets: [{ refId: 'A', expr: 'up' }],
      },
      model,
      range: { from: 'now-1h', to: 'now' },
    });

    expect(queries).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining('default datasource')]);
  });

  it('assigns default refIds and honors a panel interval floor', () => {
    const { queries } = buildPanelQueries({
      panel: {
        id: 1,
        datasource: { uid: 'ds-1' },
        interval: '5m',
        targets: [{ expr: 'up' }],
      },
      model,
      range: { from: 'now-1h', to: 'now' },
    });

    expect(queries[0].refId).toBe('A');
    expect(queries[0].intervalMs).toBe(300_000);
    expect(queries[0].maxDataPoints).toBe(300);
  });

  it('never assigns a fallback refId that another target declares', () => {
    const { queries } = buildPanelQueries({
      panel: {
        id: 1,
        datasource: { uid: 'ds-1' },
        // The first target has no refId; a naive positional fallback would
        // give it 'A', colliding with the second target's explicit 'A' —
        // and Grafana keys `/api/ds/query` results by refId.
        targets: [{ expr: 'up' }, { refId: 'A', expr: 'up' }, { expr: 'up' }],
      },
      model,
      range: { from: 'now-1h', to: 'now' },
    });

    const refIds = queries.map(query => query.refId);
    expect(refIds).toContain('A');
    expect(new Set(refIds).size).toBe(refIds.length);
  });
});

describe('normalizeFrames', () => {
  it('normalizes a time/number frame into series points', () => {
    const { series, warnings } = normalizeFrames([
      {
        schema: {
          refId: 'A',
          fields: [
            { name: 'time', type: 'time' },
            {
              name: 'Value',
              type: 'number',
              labels: { instance: 'a' },
              config: { displayNameFromDS: 'instance a' },
            },
          ],
        },
        data: {
          values: [
            [1000, 2000, 3000],
            [1, null, 3],
          ],
        },
      },
    ]);

    expect(warnings).toEqual([]);
    expect(series).toEqual([
      {
        name: 'instance a',
        labels: { instance: 'a' },
        points: [
          { timeMs: 1000, value: 1 },
          { timeMs: 2000, value: null },
          { timeMs: 3000, value: 3 },
        ],
      },
    ]);
  });

  it('derives series names from labels, frame name, then field name', () => {
    const { series } = normalizeFrames([
      {
        schema: {
          fields: [
            { name: 'time', type: 'time' },
            { name: 'Value', type: 'number', labels: { pod: 'x', env: 'p' } },
          ],
        },
        data: { values: [[1], [2]] },
      },
      {
        schema: {
          name: 'my-legend',
          fields: [
            { name: 'time', type: 'time' },
            { name: 'Value', type: 'number' },
          ],
        },
        data: { values: [[1], [2]] },
      },
      {
        schema: {
          fields: [
            { name: 'time', type: 'time' },
            { name: 'requests', type: 'number' },
          ],
        },
        data: { values: [[1], [2]] },
      },
    ]);

    expect(series.map(s => s.name)).toEqual([
      '{env="p", pod="x"}',
      'my-legend',
      'requests',
    ]);
  });

  it('skips non-numeric fields and frames without a time field', () => {
    const { series, warnings } = normalizeFrames([
      {
        schema: {
          refId: 'B',
          fields: [{ name: 'Value', type: 'number' }],
        },
        data: { values: [[42]] },
      },
      {
        schema: {
          fields: [
            { name: 'time', type: 'time' },
            { name: 'host', type: 'string' },
            { name: 'Value', type: 'number' },
          ],
        },
        data: { values: [[1], ['a'], [7]] },
      },
    ]);

    expect(series).toEqual([
      { name: 'Value', points: [{ timeMs: 1, value: 7 }] },
    ]);
    expect(warnings).toEqual([expect.stringContaining('time field')]);
  });

  it('tolerates malformed frames', () => {
    const { series } = normalizeFrames([null, {}, { schema: {} }] as never[]);
    expect(series).toEqual([]);
  });
});
