# @marble-sh/backstage-plugin-grafana-common

Common functionality shared by the Grafana Backstage plugins. This package is
isomorphic (usable from both frontend and backend) and has no heavy
dependencies, so it can be safely imported anywhere.

It provides:

- **Entity annotations** and helpers for selecting Grafana content per entity.
- **Data-transfer types** describing the shapes returned by the Grafana backend
  REST API.

## Entity annotations

| Annotation                     | Helper                   | Meaning                                                            |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------ |
| `grafana/instance`             | `getGrafanaInstanceName` | Which configured Grafana instance the entity belongs to.           |
| `grafana/dashboard-selector`   | `getDashboardSelector`   | Comma-separated title substrings; any match selects the dashboard. |
| `grafana/dashboard-uid`        | `getDashboardUid`        | A single dashboard uid (exact, case-sensitive match).              |
| `grafana/tag-selector`         | `getTagSelector`         | A comma-separated list of dashboard tags.                          |
| `grafana/alert-label-selector` | `getAlertLabelSelector`  | A `key=value,...` list of alert label matchers.                    |

`isGrafanaAvailable(entity)` returns `true` when an entity carries any of the
above annotations, and is used to gate the Grafana entity tabs and cards.

```ts
import {
  isGrafanaAvailable,
  getGrafanaInstanceName,
} from '@marble-sh/backstage-plugin-grafana-common';

if (isGrafanaAvailable(entity)) {
  const instance = getGrafanaInstanceName(entity); // e.g. "production"
}
```

## Types

The package exports the response and entity types used by the plugins, including
`GrafanaInstanceInfo`, `GrafanaDashboard`, `GrafanaAlert`, and the
`List*Response` bodies returned by the backend.

## Testing

```sh
yarn workspace @marble-sh/backstage-plugin-grafana-common test
```
