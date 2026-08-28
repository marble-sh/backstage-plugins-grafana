# 4. Catalog entity model for instances and dashboards

Date: 2026-08-27

## Status

Accepted

## Context

The catalog module auto-discovers Grafana and represents it in the Software
Catalog. We needed to choose entity kinds and how to relate instances to their
dashboards.

## Decision

- Each Grafana **instance** becomes a `Resource` with `spec.type:
grafana-instance`.
- Each **dashboard** becomes a `Resource` with `spec.type: grafana-dashboard`.
- A dashboard declares `spec.dependsOn` on its instance Resource, producing
  `dependsOn` / `dependencyOf` relations. An instance's page therefore lists its
  dashboards, and each dashboard links back to its instance.

`Resource` (rather than `Component`) is used because dashboards and instances are
infrastructure that services depend on, not owned software components. Generated
entities are emitted by an `EntityProvider` using a full mutation, and each
carries the required `backstage.io/managed-by-location` and
`backstage.io/managed-by-origin-location` annotations plus `grafana/instance`
(dashboards also get `grafana/dashboard-selector`) so the frontend content
appears on them automatically. Entity names and tags are sanitized to satisfy
catalog validation.

## Consequences

- Grafana appears in the catalog graph and can be an explicit dependency of other
  entities in future.
- Names are derived from the instance name and dashboard uid, so they are stable
  across refreshes.
- Because a full mutation replaces the provider's bucket, dashboards deleted in
  Grafana are removed from the catalog on the next run. To keep transient
  Grafana outages from having the same effect, the provider re-emits an
  instance's last successfully discovered entities when a read fails, and
  aborts the refresh entirely when a failing instance has no previous result.
