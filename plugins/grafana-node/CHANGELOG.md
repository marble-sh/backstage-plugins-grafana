# @marble-sh/backstage-plugin-grafana-node

## 1.0.2

### Patch Changes

- d5daa0c: Fixed: `release:publish` now actually invokes `scripts/release-publish.mjs`.
  The previous fix added the script but left the release script running
  `changeset publish`, so 1.0.1 was published with the same raw `workspace:^`
  and `backstage:^` ranges as 1.0.0 and remains uninstallable outside this
  monorepo. This release is the first one packed with Yarn (materialized
  dependency ranges).
- Updated dependencies [d5daa0c]
  - @marble-sh/backstage-plugin-grafana-common@1.0.2

## 1.0.1

### Patch Changes

- 577eaca: Fixed: published manifests now carry real semver dependency ranges. Versions
  0.2.0 and 1.0.0 were published via `changeset publish` (plain `npm publish`),
  which skips Yarn's pack hooks and leaked the raw `workspace:^` and
  `backstage:^` protocols into the registry manifests, making the packages
  uninstallable outside this monorepo. Releases now publish `yarn pack` tarballs
  through the npm CLI.
- Updated dependencies [577eaca]
  - @marble-sh/backstage-plugin-grafana-common@1.0.1

## 1.0.0

### Major Changes

- b179a8f: Bumping to version 1.0.0, General Release!

### Patch Changes

- Updated dependencies [b179a8f]
  - @marble-sh/backstage-plugin-grafana-common@1.0.0

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

### Patch Changes

- Updated dependencies [72afd3d]
  - @marble-sh/backstage-plugin-grafana-common@0.2.0
