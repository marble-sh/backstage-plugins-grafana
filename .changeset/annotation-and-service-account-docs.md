---
'@marble-sh/backstage-plugin-grafana': patch
'@marble-sh/backstage-plugin-grafana-common': patch
'@marble-sh/backstage-plugin-grafana-backend': patch
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': patch
'@marble-sh/backstage-plugin-scaffolder-backend-module-grafana': patch
---

Documentation: a full entity-annotation reference (exact matching semantics,
how the annotations combine, visibility gating, and error behavior for
unknown instance names) in the frontend and common READMEs, and a new
"Creating the Grafana service account and token" walkthrough in the backend
README — UI steps, the Grafana Cloud `glsa_` vs `glc_` token distinction,
and a per-feature permission table (Viewer covers all read paths;
`datasources:query` caveat for panel graphs under Enterprise/Cloud data
source permissions; Editor / `fixed:dashboards:writer` for the scaffolder
module).
