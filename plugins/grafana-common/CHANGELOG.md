# @marble-sh/backstage-plugin-grafana-common

## 1.4.0

### Minor Changes

- 22d7fbc: Entity-supplied dashboard variable values: the new `grafana/variables`
  annotation (`name=value,name2=value2`) overrides the values saved on the
  dashboard when an entity's panels are queried — like `var-<name>` URL
  parameters in Grafana's own UI — so one shared dashboard can render each
  entity's own data, and otherwise-valueless declared variables no longer skip
  their targets. The frontend sends the annotation's pairs as repeatable
  `var-<name>` parameters on the panel-data route (validated: at most 32
  variables, values up to 1000 characters, names `[A-Za-z_][A-Za-z0-9_]*`), and
  the backend keys its panel cache by the overrides so entities with different
  values never share cached data. New exports: `GRAFANA_ANNOTATION_VARIABLES`,
  `getGrafanaVariables`, `parseVariables` (common), `TemplateVariables` and a
  `variables` option on `GetPanelDataOptions` (node/backend), `variables` on
  `GetPanelDataRequest` and `DashboardPanels` (frontend).
  
  Operators can scope this surface with the new
  `grafana.allowedVariableOverrides` option: when set, only the listed names may
  be overridden (`[]` denies every override); absent means all names are
  allowed. The allowlist scopes names only — allowed values are still
  interpolated into query text raw — so the backend README documents the shared
  service-account trust model and recommends allowing only names that cannot
  reshape a query, or denying all overrides.
  
  A separate optional `scaffolderToken` (secret) lets the scaffolder module's
  write actions use a write-capable service account while `token` stays
  read-only; the action prefers it and falls back to `token`. The backend plugin
  and catalog provider strip `scaffolderToken` from the instance configs they
  load, so read paths never hold write credentials.
  
  The backend now emits two OpenTelemetry metrics (no-ops unless the host app
  runs an OTel SDK): `grafana.instance.refresh.count` (counter; attributes
  `instance`, `result` = `ok`|`error`) and `grafana.instance.snapshot.age`
  (gauge, seconds; attribute `instance`), making unreachable or stale estate
  stacks alertable. See `docs/observability.md` and the example dashboard.
  
  Backstage is bumped from 1.55.3 to 1.56.4. The `filter` config of the
  new-frontend-system entity cards (`./alpha`) now also accepts a plain string
  filter expression, following the upstream `EntityCardBlueprint` widening. The
  lockfile refresh picks up the zod 4.6.7 fix for GHSA-mrhx-c7xc-m3w5 (memory
  exhaustion while validating oversized constrained collections — zod validates
  request input in the Grafana backend), plus the fast-uri 3.1.9 and
  postcss-selector-parser 6.1.5 security updates.
  
  Internal changes with no behavior change: the legacy `grafana/host-id`
  fallback reader no longer references its own deprecated export; formatting-only
  source changes from the Prettier 3 upgrade; and test-only devDependency
  updates (Testing Library 16, supertest 7). CI now validates knip reports and
  deprecated API usage, and the release tooling moves to changesets CLI 3 with
  action v2.

## 1.3.0

### Minor Changes

- deef73a: The deprecated `grafana/host-id` annotation is now read as a fallback alias
  for `grafana/instance` (used only when `grafana/instance` is absent), keeping
  entities annotated by predecessor plugins working while their catalog
  descriptors migrate. New entities should set `grafana/instance`; the alias
  will be removed in a future major release.

## 1.2.2

### Patch Changes

- b164dcc: Bump backstage dependencies to 1.55.1

## 1.2.1

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

## 1.0.2

### Patch Changes

- d5daa0c: Fixed: `release:publish` now actually invokes `scripts/release-publish.mjs`.
  The previous fix added the script but left the release script running
  `changeset publish`, so 1.0.1 was published with the same raw `workspace:^`
  and `backstage:^` ranges as 1.0.0 and remains uninstallable outside this
  monorepo. This release is the first one packed with Yarn (materialized
  dependency ranges).

## 1.0.1

### Patch Changes

- 577eaca: Fixed: published manifests now carry real semver dependency ranges. Versions
  0.2.0 and 1.0.0 were published via `changeset publish` (plain `npm publish`),
  which skips Yarn's pack hooks and leaked the raw `workspace:^` and
  `backstage:^` protocols into the registry manifests, making the packages
  uninstallable outside this monorepo. Releases now publish `yarn pack` tarballs
  through the npm CLI.

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
