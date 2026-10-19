---
'@marble-sh/backstage-plugin-grafana-backend': patch
---

Added integration tests that boot the backend plugin and validate every REST
endpoint response against a schema. CI now runs them on every pull request.
