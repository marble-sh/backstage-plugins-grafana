---
'@marble-sh/backstage-plugin-grafana-common': patch
'@marble-sh/backstage-plugin-grafana-node': patch
'@marble-sh/backstage-plugin-grafana-backend': patch
'@marble-sh/backstage-plugin-grafana': patch
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': patch
'@marble-sh/backstage-plugin-scaffolder-backend-module-grafana': patch
---

Fixed: `release:publish` now actually invokes `scripts/release-publish.mjs`.
The previous fix added the script but left the release script running
`changeset publish`, so 1.0.1 was published with the same raw `workspace:^`
and `backstage:^` ranges as 1.0.0 and remains uninstallable outside this
monorepo. This release is the first one packed with Yarn (materialized
dependency ranges).
