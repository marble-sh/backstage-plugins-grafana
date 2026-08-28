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
  getDashboardSelector,
  getGrafanaInstanceName,
  getTagSelector,
  parseTagSelector,
} from '@marble-sh/backstage-plugin-grafana-common';
import Chip from '@material-ui/core/Chip';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import useAsync from 'react-use/lib/useAsync';
import { grafanaApiRef } from '../api';

/**
 * An entity card that lists the Grafana dashboards for the current entity,
 * selected via the `grafana/instance`, `grafana/tag-selector`, and
 * `grafana/dashboard-selector` annotations.
 *
 * @public
 */
export const DashboardsCard = () => {
  const { entity } = useEntity();
  const api = useApi(grafanaApiRef);

  const instanceName = getGrafanaInstanceName(entity);
  const tags = parseTagSelector(getTagSelector(entity));
  const query = getDashboardSelector(entity);

  const { value, loading, error } = useAsync(
    () => api.listDashboards({ instanceName, tags, query }),
    [instanceName, tags.join(','), query],
  );

  const dashboards = value ?? [];

  return (
    <InfoCard title="Grafana Dashboards">
      {loading && <Progress />}
      {error && <ResponseErrorPanel error={error} />}
      {!loading && !error && dashboards.length === 0 && (
        <Typography variant="body2">No dashboards found.</Typography>
      )}
      {!loading && !error && dashboards.length > 0 && (
        <List dense>
          {dashboards.map(dashboard => (
            <ListItem key={`${dashboard.instanceName}:${dashboard.uid}`}>
              <ListItemText
                primary={<Link to={dashboard.url}>{dashboard.title}</Link>}
                secondary={
                  dashboard.folderTitle && dashboard.folderUrl ? (
                    <Link to={dashboard.folderUrl}>
                      {dashboard.folderTitle}
                    </Link>
                  ) : (
                    dashboard.folderTitle
                  )
                }
              />
              {dashboard.tags.map(tag => (
                <Chip key={tag} label={tag} size="small" />
              ))}
            </ListItem>
          ))}
        </List>
      )}
    </InfoCard>
  );
};
