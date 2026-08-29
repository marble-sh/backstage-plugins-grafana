---
'@marble-sh/backstage-plugin-grafana-common': patch
'@marble-sh/backstage-plugin-grafana-node': patch
'@marble-sh/backstage-plugin-grafana-backend': patch
'@marble-sh/backstage-plugin-grafana': patch
'@marble-sh/backstage-plugin-catalog-backend-module-grafana': patch
'@marble-sh/backstage-plugin-scaffolder-backend-module-grafana': patch
---

Fixed: published manifests now carry real semver dependency ranges. Versions
0.2.0 and 1.0.0 were published via `changeset publish` (plain `npm publish`),
which skips Yarn's pack hooks and leaked the raw `workspace:^` and
`backstage:^` protocols into the registry manifests, making the packages
uninstallable outside this monorepo. Releases now publish `yarn pack` tarballs
through the npm CLI.
