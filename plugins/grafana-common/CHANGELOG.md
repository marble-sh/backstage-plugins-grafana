# @marble-sh/backstage-plugin-grafana-common

## 1.0.0

### Major Changes

- b179a8f: Bumping to version 1.0.0, General Release!

## 0.2.0

### Minor Changes

- 72afd3d: Initial release of the Grafana plugin suite: a read-only, backend-centric
  Grafana integration built on Backstage's new backend system, with a frontend
  that supports both the legacy and the new frontend systems.

  - `grafana-common` — shared entity annotations and data-transfer types.
  - `grafana-node` — shared Grafana HTTP client (App Platform APIs, with folder
    resolution), instance config reader + schema, and filters. Dashboard
    selection supports comma-separated multi-value queries, and per-instance
    flags can disable dashboards, alerts, or folder resolution.
  - `grafana-backend` — read-only REST API with cache/database storage,
    scheduled refresh, and `allowOnDemandRefresh` / `fetchOnDemand` flags to
    make Grafana traffic fully deterministic. Discovery scoping and scaffolder
    guard-rail options round out the configuration surface.
  - `grafana` — entity dashboard/alert cards and content plus a standalone
    instances page, for both frontend systems (new system via the `/alpha`
    export).
  - `catalog-backend-module-grafana` — discovers Grafana instances and dashboards
    as catalog `Resource` entities with dependency relations.
  - `scaffolder-backend-module-grafana` — a `grafana:dashboard:create` scaffolder
    action.
