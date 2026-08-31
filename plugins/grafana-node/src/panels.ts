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

/**
 * Internal helpers for working with classic Grafana dashboard models: panel
 * extraction, dashboard template-variable interpolation, `/api/ds/query`
 * request building, and data-frame normalization.
 *
 * Grafana has no server-side template interpolation API — its own frontend
 * substitutes variables before sending queries — so a proxying client has to
 * do the same. Only dashboard variables with a `current` value are
 * substituted; Grafana built-ins such as `$__interval` and `$__rate_interval`
 * are passed through, because the datasource plugins resolve those
 * server-side from `intervalMs`/`maxDataPoints`.
 */

import { InputError } from '@backstage/errors';
import {
  GrafanaPanelKind,
  GrafanaPanelSeries,
} from '@marble-sh/backstage-plugin-grafana-common';

/** A raw (classic JSON) Grafana panel model plus the derived render kind. */
export type ExtractedPanel = {
  id: number;
  title: string;
  type: string;
  kind: GrafanaPanelKind;
  description?: string;
  /** The raw panel model, used to build queries. */
  model: Record<string, unknown>;
};

const TIMESERIES_TYPES = new Set(['timeseries', 'graph']);
const STAT_TYPES = new Set(['stat', 'gauge', 'singlestat']);

/** Maps a raw Grafana panel type to how the frontend renders it. */
export function classifyPanelKind(type: string): GrafanaPanelKind {
  if (TIMESERIES_TYPES.has(type)) {
    return 'timeseries';
  }
  if (STAT_TYPES.has(type)) {
    return 'stat';
  }
  return 'unsupported';
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/**
 * Extracts the panels of a classic dashboard JSON model, flattening panels
 * nested inside collapsed rows (expanded rows keep their children at the top
 * level) and skipping the row panels themselves.
 */
export function extractPanels(model: unknown): ExtractedPanel[] {
  const result: ExtractedPanel[] = [];
  const visit = (panels: unknown[]) => {
    for (const raw of panels) {
      const panel = asRecord(raw);
      if (!panel) {
        continue;
      }
      const type = typeof panel.type === 'string' ? panel.type : '';
      if (type === 'row') {
        visit(asArray(panel.panels));
        continue;
      }
      if (typeof panel.id !== 'number') {
        continue;
      }
      result.push({
        id: panel.id,
        title:
          typeof panel.title === 'string' && panel.title
            ? panel.title
            : `Panel ${panel.id}`,
        type,
        kind: classifyPanelKind(type),
        ...(typeof panel.description === 'string' && panel.description
          ? { description: panel.description }
          : {}),
        model: panel,
      });
    }
  };
  visit(asArray(asRecord(model)?.panels));
  return result;
}

/** Dashboard template variables, keyed by name, with their current values. */
export type TemplateVariables = Record<string, string | string[]>;

/** Reads the current values of a dashboard model's template variables. */
export function readTemplateVariables(model: unknown): TemplateVariables {
  const variables: TemplateVariables = {};
  const templating = asRecord(asRecord(model)?.templating);
  for (const raw of asArray(templating?.list)) {
    const variable = asRecord(raw);
    const name = variable?.name;
    const current = asRecord(variable?.current);
    if (typeof name !== 'string' || !name || !current) {
      continue;
    }
    const value = current.value;
    if (typeof value === 'string') {
      variables[name] = value;
    } else if (
      Array.isArray(value) &&
      value.every(v => typeof v === 'string')
    ) {
      variables[name] = value as string[];
    }
  }
  return variables;
}

const formatValue = (value: string | string[], format?: string): string => {
  const values = Array.isArray(value) ? value : [value];
  const expanded = values.map(v => (v === '$__all' ? '.*' : v));
  switch (format) {
    case 'csv':
      return expanded.join(',');
    case 'pipe':
      return expanded.join('|');
    case 'regex':
      return expanded.length === 1 && !values.includes('$__all')
        ? expanded[0]
        : `(${expanded.join('|')})`;
    default:
      // Grafana's default format depends on the datasource; a pipe-joined
      // group is the most broadly useful for the label matchers that
      // dominate real dashboards.
      return expanded.length === 1 && !values.includes('$__all')
        ? expanded[0]
        : `(${expanded.join('|')})`;
  }
};

/**
 * Substitutes `$var`, `${var}`, `${var:format}`, and `[[var]]` dashboard
 * variable references with their current values. Unknown variables (including
 * Grafana `$__` built-ins) are left untouched. Multi-value variables join
 * with a pipe (`csv` and `pipe` format hints are honored), and the special
 * `$__all` value expands to `.*`.
 */
export function interpolateTemplate(
  input: string,
  variables: TemplateVariables,
): string {
  return input.replace(
    /\$(\w+)|\${(\w+)(?::(\w+))?}|\[\[(\w+)\]\]/g,
    (match, bare, braced, format, bracketed) => {
      const name = bare ?? braced ?? bracketed;
      const value = variables[name];
      if (value === undefined) {
        return match;
      }
      return formatValue(value, format);
    },
  );
}

const interpolateDeep = (
  value: unknown,
  variables: TemplateVariables,
): unknown => {
  if (typeof value === 'string') {
    return interpolateTemplate(value, variables);
  }
  if (Array.isArray(value)) {
    return value.map(item => interpolateDeep(item, variables));
  }
  const record = asRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        interpolateDeep(item, variables),
      ]),
    );
  }
  return value;
};

const RELATIVE_TIME = /^now(?:-(\d+)([smhdw]))$/;
const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const toMs = (expression: string, nowMs: number): number => {
  if (expression === 'now') {
    return nowMs;
  }
  const relative = expression.match(RELATIVE_TIME);
  if (relative) {
    return nowMs - Number(relative[1]) * UNIT_MS[relative[2]];
  }
  if (/^\d{1,15}$/.test(expression)) {
    return Number(expression);
  }
  throw new InputError(
    `Invalid time expression '${expression}', expected 'now', 'now-<n><s|m|h|d|w>', or epoch milliseconds`,
  );
};

/**
 * Resolves a Grafana time range (`now`-relative expressions or epoch
 * milliseconds) to absolute epoch milliseconds, for computing query
 * intervals. The original expressions are still what gets sent to Grafana.
 */
export function resolveTimeRange(
  from: string,
  to: string,
  nowMs: number = Date.now(),
): { fromMs: number; toMs: number } {
  const fromMs = toMs(from, nowMs);
  const endMs = toMs(to, nowMs);
  if (fromMs >= endMs) {
    throw new InputError(
      `Invalid time range: 'from' (${from}) must be before 'to' (${to})`,
    );
  }
  return { fromMs, toMs: endMs };
}

const parseIntervalMs = (interval: unknown): number | undefined => {
  if (typeof interval !== 'string') {
    return undefined;
  }
  const match = interval.match(/^(\d+)([smhdw])$/);
  return match ? Number(match[1]) * UNIT_MS[match[2]] : undefined;
};

const DEFAULT_MAX_DATA_POINTS = 300;

/** The queries built for a panel, ready for `POST /api/ds/query`. */
export type PanelQueryBuild = {
  /** The queries to send, in target order. */
  queries: Array<Record<string, unknown>>;
  /** RefIds of hidden targets: queried (they may feed expressions) but not shown. */
  hiddenRefIds: string[];
  /** Human-readable notes about targets that had to be skipped. */
  warnings: string[];
};

const REF_IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Builds `/api/ds/query` queries for a panel: resolves each target's
 * datasource (target override, then panel datasource), interpolates dashboard
 * template variables, and computes `intervalMs`/`maxDataPoints` from the
 * requested range. Targets whose datasource cannot be determined are skipped
 * with a warning — Grafana resolves a dashboard's *default* datasource only
 * in its own frontend, so panels relying on it cannot be queried through the
 * API.
 */
export function buildPanelQueries(options: {
  panel: Record<string, unknown>;
  model: unknown;
  range: { from: string; to: string };
  nowMs?: number;
}): PanelQueryBuild {
  const { panel, model, range } = options;
  const variables = readTemplateVariables(model);
  const { fromMs, toMs: endMs } = resolveTimeRange(
    range.from,
    range.to,
    options.nowMs,
  );

  const maxDataPoints =
    typeof panel.maxDataPoints === 'number'
      ? panel.maxDataPoints
      : DEFAULT_MAX_DATA_POINTS;
  const computedIntervalMs = Math.max(
    Math.ceil((endMs - fromMs) / maxDataPoints),
    1,
  );
  const intervalMs = Math.max(
    computedIntervalMs,
    parseIntervalMs(panel.interval) ?? 0,
  );

  const resolveDatasource = (target: Record<string, unknown>): unknown => {
    const ref = target.datasource ?? panel.datasource;
    if (typeof ref === 'string') {
      // Legacy string form: a datasource name (which Grafana still resolves
      // itself) or a `$variable`.
      const resolved = interpolateTemplate(ref, variables);
      return resolved.includes('$') ? undefined : resolved;
    }
    const record = asRecord(ref);
    if (record && typeof record.uid === 'string') {
      const uid = interpolateTemplate(record.uid, variables);
      if (uid.includes('$')) {
        return undefined;
      }
      return {
        uid,
        ...(typeof record.type === 'string' && record.type !== ''
          ? { type: record.type }
          : {}),
      };
    }
    return undefined;
  };

  const queries: Array<Record<string, unknown>> = [];
  const hiddenRefIds: string[] = [];
  const warnings: string[] = [];

  // Grafana keys `/api/ds/query` results by refId, so a generated fallback
  // refId must never collide with one another target declares explicitly.
  const usedRefIds = new Set(
    asArray(panel.targets)
      .map(raw => asRecord(raw)?.refId)
      .filter((refId): refId is string => typeof refId === 'string' && !!refId),
  );
  const nextFreeRefId = (): string => {
    for (let i = 0; ; i++) {
      const candidate =
        i < REF_IDS.length
          ? REF_IDS[i]
          : `${REF_IDS[i % REF_IDS.length]}${Math.floor(i / REF_IDS.length)}`;
      if (!usedRefIds.has(candidate)) {
        usedRefIds.add(candidate);
        return candidate;
      }
    }
  };

  asArray(panel.targets).forEach(raw => {
    const target = asRecord(raw);
    if (!target) {
      return;
    }
    const refId =
      typeof target.refId === 'string' && target.refId
        ? target.refId
        : nextFreeRefId();
    const datasource = resolveDatasource(target);
    if (datasource === undefined) {
      warnings.push(
        target.datasource ?? panel.datasource
          ? `Query ${refId} was skipped: its datasource could not be resolved`
          : `Query ${refId} was skipped: it uses the dashboard's default datasource, which cannot be resolved through the API`,
      );
      return;
    }
    const { datasource: _ds, refId: _refId, hide, ...rest } = target;
    if (hide === true) {
      hiddenRefIds.push(refId);
    }
    queries.push({
      refId,
      ...(interpolateDeep(rest, variables) as Record<string, unknown>),
      datasource,
      maxDataPoints,
      intervalMs,
    });
  });

  return { queries, hiddenRefIds, warnings };
}

const formatLabels = (labels: Record<string, string>): string =>
  `{${Object.keys(labels)
    .sort()
    .map(key => `${key}="${labels[key]}"`)
    .join(', ')}}`;

/** The normalized outcome of a set of Grafana data frames. */
export type NormalizedFrames = {
  series: GrafanaPanelSeries[];
  warnings: string[];
};

/**
 * Normalizes Grafana data-frame JSON (`schema.fields` + columnar
 * `data.values`) into named time series. Frames without a time field are
 * skipped with a warning; non-numeric fields are ignored.
 */
export function normalizeFrames(frames: unknown[]): NormalizedFrames {
  const series: GrafanaPanelSeries[] = [];
  const warnings: string[] = [];

  for (const raw of frames) {
    const frame = asRecord(raw);
    const schema = asRecord(frame?.schema);
    if (!frame || !schema) {
      continue;
    }
    const fields = asArray(schema.fields).map(asRecord);
    const values = asArray(asRecord(frame.data)?.values);
    const timeIndex = fields.findIndex(field => field?.type === 'time');
    if (timeIndex < 0) {
      const label =
        typeof schema.refId === 'string' ? ` for query ${schema.refId}` : '';
      warnings.push(`A result frame${label} has no time field and was skipped`);
      continue;
    }
    const times = asArray(values[timeIndex]);

    fields.forEach((field, index) => {
      if (!field || index === timeIndex || field.type !== 'number') {
        return;
      }
      const config = asRecord(field.config);
      const labels = asRecord(field.labels) as
        | Record<string, string>
        | undefined;
      const name =
        (typeof config?.displayNameFromDS === 'string' &&
          config.displayNameFromDS) ||
        (typeof config?.displayName === 'string' && config.displayName) ||
        (labels && Object.keys(labels).length > 0 && formatLabels(labels)) ||
        (typeof schema.name === 'string' && schema.name) ||
        (typeof field.name === 'string' && field.name) ||
        'value';
      const fieldValues = asArray(values[index]);
      series.push({
        name,
        ...(labels && Object.keys(labels).length > 0 ? { labels } : {}),
        points: times.map((time, i) => ({
          timeMs: Number(time),
          value:
            typeof fieldValues[i] === 'number'
              ? (fieldValues[i] as number)
              : null,
        })),
      });
    });
  }

  return { series, warnings };
}
