# 6. Panel graphs via a backend datasource-query proxy

Date: 2026-08-30

## Status

Accepted

## Context

The frontend originally listed dashboards and alerts as links into Grafana.
To show actual graphs on entity pages we need panel-level data. The options
were embedding Grafana panels in iframes (requires anonymous access or
credential exposure and breaks the backend-centric model of ADR 0001),
letting the frontend send raw datasource queries through the backend (an
arbitrary-query proxy is a much larger security surface), or having the
backend derive the queries itself from the dashboard's own definition.

Grafana facts that shaped the decision (verified against the Grafana source):

- `POST /api/ds/query` is the stable query API. Its App Platform successor
  (`query.grafana.app/v0alpha1`) is experimental and off by default, so per
  ADR 0003 the classic API is the sanctioned fallback.
- A single dashboard read (`dashboard.grafana.app/v1`, or
  `/api/dashboards/uid/:uid` for `legacy-search` instances) returns the full
  classic model: panels, targets, datasource refs, and template variables.
- Grafana has **no server-side template interpolation API** — its own
  frontend substitutes `$var`/`${var}`/`[[var]]` before querying. Datasource
  built-ins such as `$__interval` and `$__rate_interval` are resolved by the
  datasource plugins from `intervalMs`/`maxDataPoints`.
- In OSS Grafana, the Viewer role already carries `datasources:query`, so the
  existing service-account token needs no new permissions.

## Decision

The backend exposes two read-only, instance-scoped panel routes:
`GET …/dashboards/:uid/panels` (the dashboard's panels, classified as
`timeseries`, `stat`, or `unsupported`) and
`GET …/dashboards/:uid/panels/:panelId/data?from&to` (normalized time
series). The backend — never the frontend — reads the dashboard model,
substitutes template variables from their dashboard defaults
(`templating.list[].current`), builds the `/api/ds/query` request, and
normalizes the resulting data frames into plain named series. The frontend
only ever asks for "panel N of dashboard D", so no raw queries cross the
wire in either direction.

Consequences of the model:

- **Queries are dashboard-defined.** A user can only query what some Grafana
  dashboard already queries, mirroring Grafana's own viewer semantics.
- **Targets that cannot be resolved are skipped with a warning** rather than
  failing the panel: targets relying on the dashboard's _default_ datasource
  (not resolvable through the API) and datasource variables without a
  current value.
- **Hidden targets are still sent** (they may feed expression queries) but
  excluded from the returned series.
- **Panel data is inherently live**, so it bypasses the snapshot store
  (ADR 0005). A short cache (`grafana.panelDataCacheTtl`, default 30s)
  absorbs bursts, and `grafana.allowPanelQueries: false` turns the routes
  off (403) for deployments that need schedule-only Grafana traffic.
- The client/service interfaces gained the panel methods as **optional**
  members, so pre-existing custom implementations remain valid; the router
  answers 404 when they are absent.

## Consequences

- Entity pages render real graphs and stat tiles without Grafana credentials
  or iframes reaching the browser.
- Multi-value variable formatting is approximated (pipe-joined, `$__all` →
  `.*`) and dashboards that rely on the default datasource render partially
  — both are documented, and the dashboard link remains the escape hatch.
- When the App Platform query API reaches general availability, only the
  client internals need to change (revisit alongside ADR 0003).
