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
import { useTheme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMetricValue, formatTimeFull, formatTimeTick } from './format';

/**
 * Categorical series palette, in a fixed slot order chosen for
 * colorblind-safe adjacent pairs; validated for Backstage's light (#fff) and
 * dark (#424242) surfaces. Hues follow the series index and are never cycled:
 * series beyond the last slot are not drawn (a count note is shown instead).
 */
const SERIES_COLORS_LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];
const SERIES_COLORS_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

/** The maximum number of series drawn on a single panel chart. */
export const MAX_CHART_SERIES = SERIES_COLORS_LIGHT.length;

type ChartRow = { t: number } & Record<string, number | null>;

const toRows = (data: GrafanaPanelData, seriesCount: number): ChartRow[] => {
  const rows = new Map<number, ChartRow>();
  for (let i = 0; i < seriesCount; i++) {
    for (const point of data.series[i].points) {
      const row = rows.get(point.timeMs) ?? { t: point.timeMs };
      row[`s${i}`] = point.value;
      rows.set(point.timeMs, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
};

/**
 * A time-series line chart for a panel's queried data.
 *
 * @public
 */
export const PanelChart = (props: {
  /** The normalized panel data to draw. */
  data: GrafanaPanelData;
  /** The chart height in pixels. Defaults to 200. */
  height?: number;
}) => {
  const theme = useTheme();
  const colors =
    theme.palette.type === 'dark' ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;

  const total = props.data.series.length;
  const shown = Math.min(total, MAX_CHART_SERIES);
  const rows = toRows(props.data, shown);

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No data for this time range.
      </Typography>
    );
  }

  const spanMs = rows[rows.length - 1].t - rows[0].t;
  const textColor = theme.palette.text.secondary;

  return (
    <>
      <ResponsiveContainer width="100%" height={props.height ?? 200}>
        <LineChart data={rows} margin={{ top: 8, right: 8 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => formatTimeTick(t, spanMs)}
            tick={{ fill: textColor, fontSize: 12 }}
            stroke={theme.palette.divider}
          />
          <YAxis
            width={48}
            tickFormatter={(v: number) => formatMetricValue(v)}
            tick={{ fill: textColor, fontSize: 12 }}
            stroke={theme.palette.divider}
          />
          <Tooltip
            labelFormatter={t => `date: ${formatTimeFull(t ? +t : 0)}`}
            formatter={value =>
              typeof value === 'number' ? formatMetricValue(value) : '—'
            }
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
            }}
            labelStyle={{ color: theme.palette.text.primary }}
            itemStyle={{ color: textColor }}
          />
          {shown >= 2 && (
            <Legend
              formatter={(value: string) => (
                <span style={{ color: textColor, fontSize: 12 }}>{value}</span>
              )}
            />
          )}
          {props.data.series.slice(0, shown).map((series, index) => (
            <Line
              key={`s${index}`}
              dataKey={`s${index}`}
              name={series.name}
              stroke={colors[index]}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {total > shown && (
        <Typography variant="caption" color="textSecondary">
          Showing {shown} of {total} series — open the dashboard in Grafana for
          the rest.
        </Typography>
      )}
    </>
  );
};
