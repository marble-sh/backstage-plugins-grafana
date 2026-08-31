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

import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import { PanelTimeRange } from './DashboardPanels';

/** A selectable panel time range with a display label. */
export type TimeRangeOption = PanelTimeRange & { label: string };

/** The selectable time ranges, mirroring Grafana's common quick ranges. */
export const TIME_RANGES: TimeRangeOption[] = [
  { label: 'Last 15 minutes', from: 'now-15m', to: 'now' },
  { label: 'Last hour', from: 'now-1h', to: 'now' },
  { label: 'Last 6 hours', from: 'now-6h', to: 'now' },
  { label: 'Last 24 hours', from: 'now-24h', to: 'now' },
  { label: 'Last 7 days', from: 'now-7d', to: 'now' },
];

/** The default range, matching Grafana's own default of the last six hours. */
export const DEFAULT_TIME_RANGE = TIME_RANGES[2];

/** A compact selector over {@link TIME_RANGES}, keyed by the `from` value. */
export const TimeRangeSelect = (props: {
  value: TimeRangeOption;
  onChange: (range: TimeRangeOption) => void;
}) => (
  <TextField
    select
    size="small"
    variant="outlined"
    label="Time range"
    value={props.value.from}
    onChange={event => {
      const next = TIME_RANGES.find(range => range.from === event.target.value);
      if (next) {
        props.onChange(next);
      }
    }}
  >
    {TIME_RANGES.map(range => (
      <MenuItem key={range.from} value={range.from}>
        {range.label}
      </MenuItem>
    ))}
  </TextField>
);
