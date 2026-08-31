---
'@marble-sh/backstage-plugin-grafana-node': patch
'@marble-sh/backstage-plugin-grafana-backend': minor
'@marble-sh/backstage-plugin-grafana': minor
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': minor
'@marble-sh/backstage-plugin-scaffolder-backend-module-grafana': patch
---

Hardening fixes from a cross-package audit:

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
