# @marble-sh/backstage-plugin-grafana

## 1.3.2

### Patch Changes

- effc0e0: Fixed: two sources of noise on entity dashboard and alert views. Stat value
  tiles no longer print the series name under the value when the query
  returned a single series — for label-less results (`count(...) or
vector(0)`) Prometheus names the series after the full query expression, so
  the tile showed raw PromQL under the number; the name is now shown only when
  there are several series to disambiguate, matching Grafana's stat panel in
  its default "auto" text mode. The alerts table no longer has a Summary
  column: the Prometheus rules API returns the rule-level `summary` annotation
  as an unrendered Go template (`{{ $values.B }}`…), which read as noise. The
  annotation is still returned by the backend API for custom consumers.

## 1.3.1

### Patch Changes

- 1c32d06: Added: a README FAQ explaining the panel warnings — how to persist template
  variable defaults in Grafana ("Save current variable values as dashboard
  default", Save As for provisioned dashboards), why unresolvable datasources
  are skipped, and when multi-value selections produce invalid queries.

  Added: Example catalog-info.yaml file with accompanying app-config.yaml

## 1.3.0

### Minor Changes

- 33ad02e: Hardening fixes from a cross-package audit:

  - **Backend**: a read that fans out over all instances now skips (and logs)
    an unreachable instance instead of failing the whole request; a named
    instance still propagates its error. The panel routes accept
    `refresh=true` (gated by `allowOnDemandRefresh`) to bypass the panel
    cache, and the frontend's "Refresh panels" button uses it — previously
    the button silently served cached data. Startup warns when
    `store: database` is combined with no `schedule` (snapshots would never
    expire).
  - **Frontend**: `GrafanaApi.listPanels`/`getPanelData` are now optional, as
    the changelog already promised — pre-existing custom implementations
    compile again; the dashboards tab falls back to a Grafana link when they
    are absent.
  - **Node library**: the per-instance dashboard-model cache evicts expired
    entries instead of growing forever; an empty `__panelId__` annotation is
    no longer parsed as panel `0`; generated fallback refIds can no longer
    collide with an explicitly declared refId (Grafana keys query results by
    refId); failed _hidden_ queries no longer surface user-facing warnings.
  - **Catalog module**: discovered dashboard entities now carry only
    `grafana/dashboard-uid`, not a title-based `grafana/dashboard-selector` —
    the selectors AND together, so a stale title (dashboard renamed in
    Grafana between discovery runs) hid the dashboard its own uid still
    matched.
  - **Scaffolder module**: `grafana.scaffolder.allowedInstances` is validated
    at startup (like the catalog module) instead of on every run; an
    `overwrite` update reads the current dashboard first, carries its
    `metadata.resourceVersion` into the `PUT`, and degrades to a plain create
    when the dashboard does not exist yet, keeping template runs idempotent.

### Patch Changes

- c9c9f23: Documentation: a full entity-annotation reference (exact matching semantics,
  how the annotations combine, visibility gating, and error behavior for
  unknown instance names) in the frontend and common READMEs, and a new
  "Creating the Grafana service account and token" walkthrough in the backend
  README — UI steps, the Grafana Cloud `glsa_` vs `glc_` token distinction,
  and a per-feature permission table (Viewer covers all read paths;
  `datasources:query` caveat for panel graphs under Enterprise/Cloud data
  source permissions; Editor / `fixed:dashboards:writer` for the scaffolder
  module).
- 9664e66: Documentation consistency pass: the backend README no longer claims the
  catalog module consumes the REST API (it uses the shared node client
  server-side); the scaffolder README/config schema document startup
  validation of `allowedInstances` and the idempotent
  `overwrite` (resourceVersion carry, create fallback); fan-out
  failure-skipping and panel-route `refresh` are documented; and the
  grafana-node README credits all three consumers.
- Updated dependencies [c9c9f23]
  - @marble-sh/backstage-plugin-grafana-common@1.2.1

## 1.2.0

### Minor Changes

- a31b91d: Added: the dashboards tab now renders real graphs and the alerts tab a live
  detail table. The backend gained read-only panel routes
  (`GET …/dashboards/:uid/panels` and `GET …/panels/:panelId/data?from&to`)
  that read a dashboard's model, resolve its template variables' current
  values, query the panel targets through Grafana's `/api/ds/query`, and
  return normalized time series — gated by the new `grafana.allowPanelQueries`
  flag and cached per `grafana.panelDataCacheTtl` (default 30s). The frontend
  draws `timeseries`/`graph` panels as charts and `stat`/`gauge`/`singlestat`
  panels as value tiles, per-dashboard and lazily, with a time-range picker
  and refresh. Alerts are enriched with rule uid (deep links), health,
  active-since, active instance count, dashboard/panel links, and the
  `summary` annotation. `GrafanaClient`/`GrafanaService` gained _optional_
  `getPanels`/`getPanelData` members, so existing custom implementations
  remain compatible.

### Patch Changes

- Updated dependencies [a31b91d]
  - @marble-sh/backstage-plugin-grafana-common@1.2.0

## 1.1.0

### Minor Changes

- 476051b: Catalog discovery no longer leaves the `defaultOwner` relation dangling, and
  every discovered dashboard `Resource` now shows exactly its own dashboard.

  - The entity provider creates a placeholder `Group` (`spec.type: virtual`) for
    `defaultOwner` while no other catalog source defines that ref; a definition
    from any other source (e.g. a hand-written catalog-info.yaml) always takes
    precedence. Disable with `grafana.catalog.emitOwnerGroup: false` — also the
    handover switch for replacing an existing placeholder with your own
    definition (see the module README).
  - New `grafana/dashboard-uid` annotation (exact, case-sensitive uid match),
    supported end-to-end: `getDashboardUid` in `-common`, `DashboardFilter.uid`
    in `-node`, a `uid` query parameter on the backend dashboard routes,
    `ListDashboardsRequest.uid` + `DashboardsCard` support in the frontend, and
    emitted by catalog discovery on every dashboard `Resource`.

### Patch Changes

- Updated dependencies [476051b]
  - @marble-sh/backstage-plugin-grafana-common@1.1.0

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
