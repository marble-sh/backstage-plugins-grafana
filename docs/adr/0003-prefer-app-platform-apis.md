# 3. Prefer Grafana's App Platform APIs

Date: 2026-08-27

## Status

Accepted

## Context

Grafana 12+ exposes a new Kubernetes-style "App Platform" API surface under
`/apis/<group>.grafana.app/<version>/...` alongside the classic `/api/...`
endpoints. The App Platform APIs are the strategic direction, but their
stability varies: dashboards are Generally Available (`dashboard.grafana.app/v1`),
while the alerting APIs are still alpha/beta and disabled by default, and they do
not expose live alert state.

## Decision

Prefer the newest generally-available API for each concern, and fall back to the
classic API only where the new one does not cover the need:

- **Dashboards** are read from `dashboard.grafana.app/v1` (with an opt-in
  `legacy-search` fallback to `/api/search` for older Grafana).
- **Alerts** are read from the stable Grafana-managed Prometheus rules API
  (`/api/prometheus/grafana/api/v1/rules`), because it reports live alert state
  and the App Platform alerting APIs are alpha/off-by-default.
- **Dashboard provisioning** (scaffolder) uses `dashboard.grafana.app/v1`.

The client exposes the API choice per instance via configuration, so integrators
can adapt as Grafana's APIs evolve.

## Consequences

- Dashboard reads use the modern, stable API by default.
- Alerting deliberately uses the classic API until the App Platform alerting APIs
  are GA and expose state; this is a documented, revisitable choice.
