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
import Accordion from '@material-ui/core/Accordion';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import RefreshIcon from '@material-ui/icons/Refresh';
import { useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { grafanaApiRef } from '../api';
import { AlertsTable } from './AlertsTable';
import { DashboardPanels } from './DashboardPanels';
import { useAlertsRequest, useDashboardsRequest } from './hooks';
import {
  DEFAULT_TIME_RANGE,
  TimeRangeOption,
  TimeRangeSelect,
} from './TimeRangeSelect';

/**
 * Entity content that renders the entity's Grafana dashboards as live graphs:
 * one expandable section per selected dashboard, whose time-series and stat
 * panels are queried through the backend and drawn in place. Panels load when
 * a section is expanded, over a selectable time range.
 *
 * @public
 */
export const GrafanaDashboardsContent = () => {
  const api = useApi(grafanaApiRef);
  const request = useDashboardsRequest();
  const [range, setRange] = useState<TimeRangeOption>(DEFAULT_TIME_RANGE);
  const [refreshKey, setRefreshKey] = useState(0);

  const { value, loading, error } = useAsync(
    () => api.listDashboards(request),
    [
      request.instanceName,
      (request.tags ?? []).join(','),
      request.query,
      request.uid,
    ],
  );

  if (loading) {
    return <Progress />;
  }
  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const dashboards = value ?? [];
  if (dashboards.length === 0) {
    return <Typography variant="body2">No dashboards found.</Typography>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="flex-end" alignItems="center" mb={2}>
        <TimeRangeSelect value={range} onChange={setRange} />
        <Tooltip title="Refresh panels">
          <IconButton
            aria-label="Refresh panels"
            onClick={() => setRefreshKey(key => key + 1)}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      {dashboards.map((dashboard, index) => (
        <Accordion
          key={`${dashboard.instanceName}:${dashboard.uid}`}
          defaultExpanded={index === 0}
          TransitionProps={{ mountOnEnter: true, unmountOnExit: true }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              width="100%"
              pr={1}
            >
              <Box>
                <Typography variant="subtitle1">{dashboard.title}</Typography>
                {dashboard.folderTitle && (
                  <Typography variant="caption" color="textSecondary">
                    {dashboard.folderTitle}
                  </Typography>
                )}
              </Box>
              <Box display="flex" alignItems="center" gridGap={8}>
                {dashboard.tags.map(tag => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
                <Link to={dashboard.url} onClick={e => e.stopPropagation()}>
                  Open in Grafana
                </Link>
              </Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <DashboardPanels
              dashboard={dashboard}
              range={range}
              refreshKey={refreshKey}
            />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

/**
 * Entity content that lists the entity's Grafana alerts with their live
 * state, health, active-since time, and summary, deep-linked into Grafana.
 *
 * @public
 */
export const GrafanaAlertsContent = () => {
  const api = useApi(grafanaApiRef);
  const request = useAlertsRequest();

  const { value, loading, error } = useAsync(
    () => api.listAlerts(request),
    [request.instanceName, JSON.stringify(request.labelSelector)],
  );

  if (loading) {
    return <Progress />;
  }
  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  return <AlertsTable alerts={value ?? []} />;
};
