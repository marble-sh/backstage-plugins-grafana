---
'@marble-sh/backstage-plugin-grafana-common': minor
'@marble-sh/backstage-plugin-grafana': minor
---

The deprecated `grafana/host-id` annotation is now read as a fallback alias
for `grafana/instance` (used only when `grafana/instance` is absent), keeping
entities annotated by predecessor plugins working while their catalog
descriptors migrate. New entities should set `grafana/instance`; the alias
will be removed in a future major release.
