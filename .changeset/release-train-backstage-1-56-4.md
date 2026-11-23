---
'@marble-sh/backstage-plugin-grafana': minor
'@marble-sh/backstage-plugin-grafana-backend': minor
'@marble-sh/backstage-plugin-grafana-common': minor
'@marble-sh/backstage-plugin-grafana-node': minor
'@marble-sh/backstage-plugin-scaffolder-backend-module-grafana': minor
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': patch
---

Entity-supplied dashboard variable values: the new `grafana/variables`
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
