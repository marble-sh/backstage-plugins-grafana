---
'@marble-sh/backstage-plugin-grafana-common': minor
'@marble-sh/backstage-plugin-grafana-node': minor
'@marble-sh/backstage-plugin-grafana-backend': minor
'@marble-sh/backstage-plugin-grafana': minor
---

Added: the dashboards tab now renders real graphs and the alerts tab a live
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
