---
'@marble-sh/backstage-plugin-grafana': patch
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': patch
---

Added: a README FAQ explaining the panel warnings — how to persist template
variable defaults in Grafana ("Save current variable values as dashboard
default", Save As for provisioned dashboards), why unresolvable datasources
are skipped, and when multi-value selections produce invalid queries.

Added: Example catalog-info.yaml file with accompanying app-config.yaml
