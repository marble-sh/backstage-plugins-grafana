# @marble-sh/backstage-plugin-catalog-backend-module-grafana

A catalog backend module that **auto-discovers Grafana instances and dashboards
as catalog entities**, so your Grafana estate shows up in the Software Catalog
and can participate in relations.

It registers an `EntityProvider` that periodically reads every configured
Grafana instance and emits:

- one **`Resource`** (`spec.type: grafana-instance`) per Grafana instance, and
- one **`Resource`** (`spec.type: grafana-dashboard`) per discovered dashboard,

with each dashboard declaring `spec.dependsOn` on its instance Resource. That
produces `dependsOn` / `dependencyOf` relations, so an instance's entity page
lists all of its dashboards, and each dashboard links back to its instance.

Every generated entity carries the required
`backstage.io/managed-by-location` and
`backstage.io/managed-by-origin-location` annotations and a `grafana/instance`
annotation (dashboards also get a `grafana/dashboard-selector`), so the
[frontend plugin](../grafana/README.md) tabs light up on the generated entities
automatically.

Discovery is resilient to outages: when reading an instance fails, its
previously discovered entities are re-emitted (a full refresh replaces the
provider's entire entity set, so skipping the instance would delete them); if
an instance fails before any successful read, the refresh is aborted and
retried on the next scheduled run, leaving the catalog untouched. Entity names
are sanitized to satisfy catalog validation — names that would exceed 63
characters, and dashboard uids containing uppercase characters, get a short
stable hash appended to stay unique.

## Installation

```sh
yarn --cwd packages/backend add @marble-sh/backstage-plugin-catalog-backend-module-grafana
```

```ts
// packages/backend/src/index.ts
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@marble-sh/backstage-plugin-catalog-backend-module-grafana'),
);
```

## Configuration

Connection details are read from the shared `grafana.instances` config (the
same block the [backend plugin](../grafana-backend/README.md) uses). Discovery
behavior is configured under `grafana.catalog`:

```yaml
grafana:
  instances:
    - name: production
      baseUrl: https://grafana.internal.example.com
      token: ${GRAFANA_PROD_TOKEN}

  catalog:
    # How often discovery runs (defaults to every 30 minutes / 3-minute timeout).
    schedule:
      frequency: { minutes: 30 }
      timeout: { minutes: 3 }
    # Owner assigned to every generated entity (defaults to group:default/grafana).
    defaultOwner: group:default/observability
    # Optional system for every generated entity.
    system: observability
    # Catalog namespace for the generated entities (defaults to "default").
    namespace: monitoring
    # Only discover these instances (defaults to all under grafana.instances).
    instances: [production]
    # Only ingest a subset of dashboards (defaults to everything).
    filter:
      tags: [team-a]
      query: payments, checkout
    # Toggle what is emitted (all default to true).
    emitInstances: true
    emitDashboards: true
    emitTags: true
```

Every option and its states:

| Option           | Unset / default                            | When set                                                                                                                                |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule`       | Every 30 minutes, 3-minute timeout.        | Discovery runs on your schedule.                                                                                                        |
| `defaultOwner`   | `group:default/grafana`.                   | Every generated entity gets this `spec.owner`.                                                                                          |
| `system`         | No `spec.system` on generated entities.    | Every generated entity gets this `spec.system`.                                                                                         |
| `namespace`      | Entities live in the `default` namespace.  | Entities — and the `dependsOn` references between them — use this namespace.                                                            |
| `instances`      | Every instance under `grafana.instances`.  | Only the listed instances are discovered. A name that doesn't exist under `grafana.instances` fails startup with a configuration error. |
| `filter.tags`    | No tag filtering.                          | Only dashboards carrying **all** listed tags are ingested.                                                                              |
| `filter.query`   | No title filtering.                        | Only dashboards whose title contains **any** of the comma-separated values (case-insensitive) are ingested.                             |
| `emitInstances`  | `true`: one `Resource` per instance.       | `false`: no instance entities, and dashboard entities carry no `dependsOn` (there is nothing to point at).                              |
| `emitDashboards` | `true`: one `Resource` per dashboard.      | `false`: no dashboard entities, and Grafana is not queried for dashboards during discovery at all.                                      |
| `emitTags`       | `true`: dashboard tags become entity tags. | `false`: generated entities carry no tags (`filter.tags` still works — it filters what is ingested, not what the entities carry).       |

An instance with `apis.dashboards: none` (see the
[backend README](../grafana-backend/README.md#api-selection)) contributes its
instance `Resource` but no dashboards.

See [`config.d.ts`](./config.d.ts) for the full, documented schema.

## Generated entity shape

```yaml
# Instance
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: grafana-instance-production
  title: Production Grafana
  annotations:
    backstage.io/managed-by-location: grafana:production
    grafana/instance: production
  links:
    - url: https://grafana.internal.example.com
      title: Open Grafana
spec:
  type: grafana-instance
  owner: group:default/observability
---
# Dashboard
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: grafana-dashboard-production-abc123
  title: My Service
  annotations:
    backstage.io/managed-by-location: grafana:production
    grafana/instance: production
    grafana/dashboard-selector: My Service
  links:
    - url: https://grafana.internal.example.com/d/abc123/my-service
      title: Open dashboard
spec:
  type: grafana-dashboard
  owner: group:default/observability
  dependsOn:
    - resource:default/grafana-instance-production
```

## Testing

```sh
yarn workspace @marble-sh/backstage-plugin-catalog-backend-module-grafana test
```

The entity-building logic is unit-tested in isolation; the provider is tested
with a fake task runner and a mocked catalog connection; and the module is
verified to register its provider via `startTestBackend`.
