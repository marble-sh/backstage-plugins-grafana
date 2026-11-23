# @marble-sh/backstage-plugin-scaffolder-backend-module-grafana

## 1.1.0

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

### Patch Changes

- Updated dependencies [22d7fbc]
  - @marble-sh/backstage-plugin-grafana-node@1.3.0

## 1.0.4

### Patch Changes

- b164dcc: Bump backstage dependencies to 1.55.1
- Updated dependencies [b164dcc]
  - @marble-sh/backstage-plugin-grafana-node@1.2.2

## 1.0.3

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

- 9664e66: Documentation consistency pass: the backend README no longer claims the
  catalog module consumes the REST API (it uses the shared node client
  server-side); the scaffolder README/config schema document startup
  validation of `allowedInstances` and the idempotent
  `overwrite` (resourceVersion carry, create fallback); fan-out
  failure-skipping and panel-route `refresh` are documented; and the
  grafana-node README credits all three consumers.
- Updated dependencies [33ad02e]
- Updated dependencies [9664e66]
  - @marble-sh/backstage-plugin-grafana-node@1.2.1

## 1.0.2

### Patch Changes

- d5daa0c: Fixed: `release:publish` now actually invokes `scripts/release-publish.mjs`.
  The previous fix added the script but left the release script running
  `changeset publish`, so 1.0.1 was published with the same raw `workspace:^`
  and `backstage:^` ranges as 1.0.0 and remains uninstallable outside this
  monorepo. This release is the first one packed with Yarn (materialized
  dependency ranges).
- Updated dependencies [d5daa0c]
  - @marble-sh/backstage-plugin-grafana-node@1.0.2

## 1.0.1

### Patch Changes

- 577eaca: Fixed: published manifests now carry real semver dependency ranges. Versions
  0.2.0 and 1.0.0 were published via `changeset publish` (plain `npm publish`),
  which skips Yarn's pack hooks and leaked the raw `workspace:^` and
  `backstage:^` protocols into the registry manifests, making the packages
  uninstallable outside this monorepo. Releases now publish `yarn pack` tarballs
  through the npm CLI.
- Updated dependencies [577eaca]
  - @marble-sh/backstage-plugin-grafana-node@1.0.1

## 1.0.0

### Major Changes

- b179a8f: Bumping to version 1.0.0, General Release!

### Patch Changes

- Updated dependencies [b179a8f]
  - @marble-sh/backstage-plugin-grafana-node@1.0.0

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
  - @marble-sh/backstage-plugin-grafana-node@0.2.0
