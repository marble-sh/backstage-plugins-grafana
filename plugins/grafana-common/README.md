# @marble-sh/backstage-plugin-grafana-common

Common functionality shared by the Grafana Backstage plugins. This package is
isomorphic (usable from both frontend and backend) and has no heavy
dependencies, so it can be safely imported anywhere.

It provides:

- **Entity annotations** and helpers for selecting Grafana content per entity.
- **Data-transfer types** describing the shapes returned by the Grafana backend
  REST API.

## Entity annotations

| Annotation                     | Helper                   | Meaning                                                                                                          |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `grafana/instance`             | `getGrafanaInstanceName` | The `grafana.instances[].name` the entity belongs to (exact match). Absent = query all configured instances.     |
| `grafana/dashboard-selector`   | `getDashboardSelector`   | Comma-separated, case-insensitive title substrings; **any** match selects the dashboard.                         |
| `grafana/dashboard-uid`        | `getDashboardUid`        | A single dashboard uid (exact, case-sensitive match). Written by catalog discovery on its dashboard `Resource`s. |
| `grafana/tag-selector`         | `getTagSelector`         | Comma-separated dashboard tags; the dashboard must carry **all** of them.                                        |
| `grafana/alert-label-selector` | `getAlertLabelSelector`  | `key=value,...` alert label matchers; the rule's labels must contain **all** pairs.                              |

The dashboard annotations combine with AND — a dashboard must pass every one
the entity carries. Empty annotation values are treated as absent. The full
matching semantics are documented in the
[frontend plugin README](../grafana/README.md#entity-annotations).

Three gating helpers decide whether an entity has Grafana content to show:

- `isDashboardsAvailable(entity)` — any of `grafana/instance`,
  `grafana/dashboard-selector`, `grafana/dashboard-uid`, or
  `grafana/tag-selector` is present.
- `isAlertsAvailable(entity)` — `grafana/instance` or
  `grafana/alert-label-selector` is present.
- `isGrafanaAvailable(entity)` — either of the above; used to gate the Grafana
  entity tabs and cards.

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
