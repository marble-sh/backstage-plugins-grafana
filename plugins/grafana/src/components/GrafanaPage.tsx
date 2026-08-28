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
  Content,
  Header,
  InfoCard,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import Grid from '@material-ui/core/Grid';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import useAsync from 'react-use/lib/useAsync';
import { grafanaApiRef } from '../api';

/**
 * A standalone page that lists all configured Grafana instances.
 *
 * @public
 */
export const GrafanaPage = () => {
  const api = useApi(grafanaApiRef);
  const { value, loading, error } = useAsync(() => api.listInstances(), []);
  const instances = value ?? [];

  return (
    <Page themeId="tool">
      <Header title="Grafana" subtitle="Dashboards and alerts" />
      <Content>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <InfoCard title="Instances">
              {loading && <Progress />}
              {error && <ResponseErrorPanel error={error} />}
              {!loading && !error && instances.length === 0 && (
                <Typography variant="body2">
                  No Grafana instances are configured.
                </Typography>
              )}
              {!loading && !error && instances.length > 0 && (
                <List dense>
                  {instances.map(instance => (
                    <ListItem key={instance.name}>
                      <ListItemText
                        primary={
                          <Link to={instance.url}>{instance.title}</Link>
                        }
                        secondary={instance.name}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </InfoCard>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
