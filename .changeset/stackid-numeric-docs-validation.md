---
'@marble-sh/backstage-plugin-grafana-node': patch
'@marble-sh/backstage-plugin-grafana-backend': patch
---

Reject a non-numeric Grafana Cloud `stackId` at config-read time with an
error that explains the numeric-id-vs-slug distinction and how to look the id
up, instead of silently deriving an invalid App Platform namespace that fails
every refresh with 403 "invalid namespace". Documented the numeric requirement
and both lookup methods (Cloud portal URL, `GET /api/frontend/settings`) in
the backend README and the config schema.
