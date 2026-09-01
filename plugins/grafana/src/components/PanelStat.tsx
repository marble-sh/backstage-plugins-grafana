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
import Typography from '@material-ui/core/Typography';
import { formatMetricValue } from './format';

/**
 * Returns the most recent non-null value of a panel's first series, matching
 * how Grafana's stat panels reduce a query by default.
 */
const latestValue = (data: GrafanaPanelData): number | undefined => {
  const points = data.series[0]?.points ?? [];
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i].value;
    if (value !== null) {
      return value;
    }
  }
  return undefined;
};

/**
 * A single-value tile for a panel's queried data, showing the latest value of
 * its first series. The series name is shown only when the query returned
 * several series, matching Grafana's stat panel in its default "auto" text
 * mode — a lone series is often named after the raw query expression
 * (Prometheus does this for label-less results), which adds nothing under a
 * titled panel.
 *
 * @public
 */
export const PanelStat = (props: {
  /** The normalized panel data to summarize. */
  data: GrafanaPanelData;
}) => {
  const value = latestValue(props.data);
  const name =
    props.data.series.length > 1 ? props.data.series[0]?.name : undefined;

  return (
    <>
      <Typography variant="h4" component="div">
        {value === undefined ? '—' : formatMetricValue(value)}
      </Typography>
      {value !== undefined && name && (
        <Typography variant="caption" color="textSecondary">
          {name}
        </Typography>
      )}
    </>
  );
};
