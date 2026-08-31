---
'@marble-sh/backstage-plugin-grafana': patch
'@marble-sh/backstage-plugin-grafana-node': patch
'@marble-sh/backstage-plugin-grafana-backend': patch
'@marble-sh/backstage-plugin-scaffolder-backend-module-grafana': patch
---

Documentation consistency pass: the backend README no longer claims the
catalog module consumes the REST API (it uses the shared node client
server-side); the scaffolder README/config schema document startup
validation of `allowedInstances` and the idempotent
`overwrite` (resourceVersion carry, create fallback); fan-out
failure-skipping and panel-route `refresh` are documented; and the
grafana-node README credits all three consumers.
