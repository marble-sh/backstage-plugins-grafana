---
'@marble-sh/backstage-plugin-grafana-common': minor
'@marble-sh/backstage-plugin-grafana-node': minor
'@marble-sh/backstage-plugin-grafana-backend': minor
'@marble-sh/backstage-plugin-grafana': minor
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': minor
---

Catalog discovery no longer leaves the `defaultOwner` relation dangling, and
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
