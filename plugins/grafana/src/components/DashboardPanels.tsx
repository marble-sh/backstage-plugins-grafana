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

import { Link, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  GrafanaDashboard,
  GrafanaPanel,
} from '@marble-sh/backstage-plugin-grafana-common';
import Box from '@material-ui/core/Box';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import { useRef } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { grafanaApiRef } from '../api';
import { PanelChart } from './PanelChart';
import { PanelStat } from './PanelStat';

/** The time range panels are queried over. */
export type PanelTimeRange = {
  from: string;
  to: string;
};

/**
 * Tracks whether the current fetch was caused by a refresh-key bump (the
 * refresh button) rather than the initial load or a range change, so only
 * explicit refreshes bypass the backend's panel cache.
 */
const useIsRefresh = (refreshKey: number): (() => boolean) => {
  const lastRefreshKey = useRef(refreshKey);
  return () => {
    const isRefresh = refreshKey !== lastRefreshKey.current;
    lastRefreshKey.current = refreshKey;
    return isRefresh;
  };
};

const PanelDataCard = (props: {
  panel: GrafanaPanel;
  range: PanelTimeRange;
  refreshKey: number;
}) => {
  const { panel, range, refreshKey } = props;
  const api = useApi(grafanaApiRef);
  const isRefresh = useIsRefresh(refreshKey);

  const { value, loading, error } = useAsync(
    async () =>
      api.getPanelData?.({
        instanceName: panel.instanceName,
        dashboardUid: panel.dashboardUid,
        panelId: panel.id,
        from: range.from,
        to: range.to,
        refresh: isRefresh(),
      }),
    [
      panel.instanceName,
      panel.dashboardUid,
      panel.id,
      range.from,
      range.to,
      refreshKey,
    ],
  );

  return (
    <Box>
      <Typography variant="subtitle2" title={panel.description}>
        {panel.title}
      </Typography>
      {loading && <Progress />}
      {error && <ResponseErrorPanel error={error} />}
      {!loading && !error && value && (
        <>
          {panel.kind === 'stat' ? (
            <PanelStat data={value} />
          ) : (
            <PanelChart data={value} />
          )}
          {value.warnings?.map(warning => (
            <Typography
              key={warning}
              variant="caption"
              color="textSecondary"
              component="div"
            >
              {warning}
            </Typography>
          ))}
        </>
      )}
    </Box>
  );
};

/**
 * The queried panels of a single dashboard, laid out in a grid: time-series
 * panels as charts, stat panels as value tiles, and a link into Grafana for
 * whatever cannot be rendered.
 *
 * @public
 */
export const DashboardPanels = (props: {
  /** The dashboard whose panels are shown. */
  dashboard: GrafanaDashboard;
  /** The time range to query. */
  range: PanelTimeRange;
  /** Changing this value re-fetches every panel. */
  refreshKey?: number;
}) => {
  const { dashboard, range, refreshKey = 0 } = props;
  const api = useApi(grafanaApiRef);
  const isRefresh = useIsRefresh(refreshKey);

  const { value, loading, error } = useAsync(
    async () =>
      api.listPanels?.({
        instanceName: dashboard.instanceName,
        dashboardUid: dashboard.uid,
        refresh: isRefresh(),
      }),
    [dashboard.instanceName, dashboard.uid, refreshKey],
  );

  if (!api.listPanels || !api.getPanelData) {
    return (
      <Typography variant="body2">
        The configured Grafana API does not support panel rendering —{' '}
        <Link to={dashboard.url}>open the dashboard in Grafana</Link>.
      </Typography>
    );
  }
  if (loading) {
    return <Progress />;
  }
  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const panels = value ?? [];
  const supported = panels.filter(panel => panel.kind !== 'unsupported');
  const unsupported = panels.filter(panel => panel.kind === 'unsupported');

  return (
    <Box width="100%">
      {supported.length === 0 && (
        <Typography variant="body2">
          This dashboard has no panels that can be rendered here —{' '}
          <Link to={dashboard.url}>open it in Grafana</Link>.
        </Typography>
      )}
      <Grid container spacing={2}>
        {supported.map(panel => (
          <Grid
            key={panel.id}
            item
            xs={panel.kind === 'stat' ? 6 : 12}
            md={panel.kind === 'stat' ? 3 : 6}
          >
            <PanelDataCard
              panel={panel}
              range={range}
              refreshKey={refreshKey}
            />
          </Grid>
        ))}
      </Grid>
      {supported.length > 0 && unsupported.length > 0 && (
        <Box mt={1}>
          <Typography variant="caption" color="textSecondary">
            {unsupported.length} {unsupported.length === 1 ? 'panel' : 'panels'}{' '}
            ({[...new Set(unsupported.map(panel => panel.type))].join(', ')})
            cannot be rendered here —{' '}
            <Link to={dashboard.url}>open the dashboard in Grafana</Link>.
          </Typography>
        </Box>
      )}
    </Box>
  );
};
