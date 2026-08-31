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
  InfoCard,
  Link,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  getAlertLabelSelector,
  getGrafanaInstanceName,
  parseLabelSelector,
} from '@marble-sh/backstage-plugin-grafana-common';
import Chip from '@material-ui/core/Chip';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import useAsync from 'react-use/lib/useAsync';
import { grafanaApiRef } from '../api';
import { stateColor } from './alertState';

/**
 * An entity card that lists the Grafana alerts for the current entity, selected
 * via the `grafana/instance` and `grafana/alert-label-selector` annotations.
 *
 * @public
 */
export const AlertsCard = () => {
  const { entity } = useEntity();
  const api = useApi(grafanaApiRef);

  const instanceName = getGrafanaInstanceName(entity);
  const labelSelector = parseLabelSelector(getAlertLabelSelector(entity));

  const { value, loading, error } = useAsync(
    () => api.listAlerts({ instanceName, labelSelector }),
    [instanceName, JSON.stringify(labelSelector)],
  );

  const alerts = value ?? [];

  return (
    <InfoCard title="Grafana Alerts">
      {loading && <Progress />}
      {error && <ResponseErrorPanel error={error} />}
      {!loading && !error && alerts.length === 0 && (
        <Typography variant="body2">No alerts found.</Typography>
      )}
      {!loading && !error && alerts.length > 0 && (
        <List dense>
          {alerts.map(alert => (
            <ListItem
              key={`${alert.instanceName}:${alert.folderTitle}:${alert.name}`}
            >
              <ListItemText
                primary={<Link to={alert.url}>{alert.name}</Link>}
                secondary={alert.folderTitle}
              />
              <Chip
                label={alert.state}
                size="small"
                color={stateColor(alert.state)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </InfoCard>
  );
};
