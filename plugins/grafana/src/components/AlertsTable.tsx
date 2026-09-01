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

import { Link, Table, TableColumn } from '@backstage/core-components';
import { GrafanaAlert } from '@marble-sh/backstage-plugin-grafana-common';
import Chip from '@material-ui/core/Chip';
import Typography from '@material-ui/core/Typography';
import { stateColor } from './alertState';
import { formatTimeFull } from './format';

const columns: TableColumn<GrafanaAlert>[] = [
  {
    title: 'State',
    field: 'state',
    width: '10%',
    render: alert => (
      <>
        <Chip
          label={alert.state}
          size="small"
          color={stateColor(alert.state)}
        />
        {(alert.health === 'error' || alert.health === 'nodata') && (
          <Chip label={alert.health} size="small" variant="outlined" />
        )}
      </>
    ),
  },
  {
    title: 'Alert',
    field: 'name',
    highlight: true,
    render: alert => <Link to={alert.url}>{alert.name}</Link>,
  },
  {
    title: 'Folder',
    field: 'folderTitle',
  },
  {
    title: 'Active since',
    field: 'activeAt',
    render: alert =>
      alert.activeAt ? formatTimeFull(Date.parse(alert.activeAt)) : '',
  },
  {
    title: 'Instances',
    field: 'activeCount',
    align: 'right',
    width: '8%',
  },
];

/**
 * A table of Grafana alert rules with their live state: state and health,
 * a deep link to the rule, its folder, how long it has been active, and the
 * number of active instances. The rule's `summary` annotation is deliberately
 * not shown: the rules API returns it as an unrendered Go template
 * (`{{ $values.B }}`…), which reads as noise.
 *
 * @public
 */
export const AlertsTable = (props: {
  /** The alerts to list. */
  alerts: GrafanaAlert[];
}) => (
  <Table<GrafanaAlert>
    title="Grafana Alerts"
    columns={columns}
    data={props.alerts}
    options={{ paging: false, padding: 'dense' }}
    emptyContent={
      <Typography variant="body2" style={{ padding: 16 }}>
        No alerts found.
      </Typography>
    }
  />
);
