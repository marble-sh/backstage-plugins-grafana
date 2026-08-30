# @marble-sh/backstage-plugin-grafana

A read-only [Grafana](https://grafana.com/) frontend plugin for Backstage,
supporting **both** the legacy frontend system and the
[new frontend system](https://backstage.io/docs/frontend-system/).

It surfaces Grafana dashboards and alerts inside Backstage by talking to the
companion [`@marble-sh/backstage-plugin-grafana-backend`](../grafana-backend/README.md)
REST API — it never contacts Grafana directly, so all credentials and caching
stay in the backend.

## What it provides

| Feature                                | Legacy system export             | New system extension                |
| -------------------------------------- | -------------------------------- | ----------------------------------- |
| Standalone `/grafana` instances page   | `GrafanaPage`                    | `page:grafana`                      |
| Entity overview card: dashboards       | `EntityGrafanaDashboardsCard`    | `entity-card:grafana/dashboards`    |
| Entity overview card: alerts           | `EntityGrafanaAlertsCard`        | `entity-card:grafana/alerts`        |
| Entity tab (`/grafana`): dashboards    | `EntityGrafanaDashboardsContent` | `entity-content:grafana/dashboards` |
| Entity tab (`/grafana-alerts`): alerts | `EntityGrafanaAlertsContent`     | `entity-content:grafana/alerts`     |
| API client for `/api/grafana/*`        | `grafanaApiRef`                  | `api:grafana`                       |

Dashboards render with their tags and a link to the containing folder (when the
folder is known); alerts render with a state chip colored by severity. In the
new frontend system the entity cards and tabs are only attached to entities that
carry a relevant Grafana annotation, so they never appear on unrelated entities.

## Entity annotations

| Annotation                     | Used by             | Meaning                                                                                      |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------- |
| `grafana/instance`             | dashboards + alerts | Which configured Grafana instance to query.                                                  |
| `grafana/tag-selector`         | dashboards          | Comma-separated dashboard tags to filter by.                                                 |
| `grafana/dashboard-selector`   | dashboards          | Comma-separated title substrings (any match).                                                |
| `grafana/dashboard-uid`        | dashboards          | A single dashboard uid (exact match). Set by catalog discovery on its dashboard `Resource`s. |
| `grafana/alert-label-selector` | alerts              | `key=value,...` alert label matchers.                                                        |

Example:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  annotations:
    grafana/instance: production
    grafana/tag-selector: team-a
    grafana/alert-label-selector: service=my-service
spec:
  type: service
  lifecycle: production
  owner: team-a
```

## Installation

```sh
yarn --cwd packages/app add @marble-sh/backstage-plugin-grafana
```

No frontend configuration is required — all Grafana configuration lives in the
[backend plugin](../grafana-backend/README.md).

### New frontend system

With [feature discovery](https://backstage.io/docs/frontend-system/architecture/app/#feature-discovery)
the plugin is picked up automatically once installed. Otherwise, enable it
explicitly from the `/alpha` export:

```tsx
// packages/app/src/App.tsx
import grafanaPlugin from '@marble-sh/backstage-plugin-grafana/alpha';

export default createApp({
  features: [
    // ...
    grafanaPlugin,
  ],
});
```

### Legacy frontend system

Route the page and place the entity components where you want them:

```tsx
// packages/app/src/App.tsx
import { GrafanaPage } from '@marble-sh/backstage-plugin-grafana';

const routes = (
  <FlatRoutes>
    {/* ... */}
    <Route path="/grafana" element={<GrafanaPage />} />
  </FlatRoutes>
);
```

```tsx
// packages/app/src/components/catalog/EntityPage.tsx
import {
  EntityGrafanaAlertsCard,
  EntityGrafanaDashboardsCard,
  EntityGrafanaDashboardsContent,
} from '@marble-sh/backstage-plugin-grafana';
import { isGrafanaAvailable } from '@marble-sh/backstage-plugin-grafana-common';

// On the overview tab:
<EntitySwitch>
  <EntitySwitch.Case if={isGrafanaAvailable}>
    <Grid item md={6}>
      <EntityGrafanaDashboardsCard />
    </Grid>
    <Grid item md={6}>
      <EntityGrafanaAlertsCard />
    </Grid>
  </EntitySwitch.Case>
</EntitySwitch>

// As its own tab:
<EntityLayout.Route path="/grafana" title="Grafana" if={isGrafanaAvailable}>
  <EntityGrafanaDashboardsContent />
</EntityLayout.Route>
```

`isGrafanaAvailable`, `isDashboardsAvailable`, and `isAlertsAvailable` (from the
common package) are the gating helpers.

## Differences from `@backstage-community/plugin-grafana`

This suite is an independent, backend-centric reimplementation — not a fork. If
you are migrating from the community plugin, note these deliberate differences:

- **Architecture:** all Grafana traffic goes through the
  [backend plugin](../grafana-backend/README.md) (with caching and scheduled
  refresh) instead of the frontend proxy, so tokens are never visible to the
  browser and no `proxy` configuration is used.
- **`grafana/dashboard-selector` semantics:** in the community plugin this
  annotation is an expression language (`tags @> 'x' && title != 'y'`). Here it
  is a **comma-separated list of case-insensitive title substrings** — a
  dashboard is selected when its title matches _any_ value (e.g.
  `payments, checkout` selects both sets of dashboards). Tag-based selection
  uses the separate `grafana/tag-selector` annotation, whose comma-separated
  tags must _all_ be present.
- **Instance selection:** instances are addressed by the `grafana/instance`
  annotation against named entries in `grafana.instances`, rather than the
  community plugin's host-based configuration.
- **`grafana/overview-dashboard` is not supported** (no embedded dashboard
  viewer yet). Entities carrying it will simply not get an embed.

## Local development

```sh
yarn start   # from this directory, serves the plugin in isolation
```

## Testing

```sh
yarn workspace @marble-sh/backstage-plugin-grafana test
```

Component tests use `@backstage/frontend-test-utils` with a mocked
`grafanaApiRef`; the legacy extensions are rendered with
`@backstage/test-utils`; the new-system extensions are exercised through
`createExtensionTester` (filters, loaders, and the API factory); and the API
client is unit-tested against mock discovery/fetch APIs.
