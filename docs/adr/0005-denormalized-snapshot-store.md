# 5. A deliberately denormalized snapshot store

Date: 2026-08-27

## Status

Accepted

## Context

The backend's database store persists, per configured Grafana instance, the
latest snapshot of that instance's dashboards and alerts. The single
`grafana__snapshots` table keys on the instance name and stores the dashboard
and alert collections as JSON-encoded `text` columns.

Measured against
[database normalization standards](https://en.wikipedia.org/wiki/Database_normalization),
this violates first normal form: the JSON columns hold non-atomic values
containing repeating groups (each dashboard with a nested tag array, each alert
with a label map). A normalized design would need roughly five tables —
snapshots, dashboards, dashboard tags, alerts (keyed by the rule uid where the
rules API provides one, with a surrogate key as fallback), and alert labels —
plus transactional replace-on-refresh logic and join-based reads.

The store, however, is a **cache, not a system of record**. Grafana remains the
source of truth; a snapshot is always written whole (one refresh per instance)
and read whole (filtering happens in process so a single cached snapshot can
serve many entities with different selectors — see the backend README). No code
path queries a subset of a snapshot in SQL.

## Decision

Keep the single-table, JSON-encoded snapshot design, and document it here as a
deliberate denormalization.

- The access pattern is strictly write-whole/read-whole per instance; rows are
  replaced atomically via an upsert keyed on the instance name, so none of the
  update anomalies that normalization protects against can be observed through
  the `GrafanaStore` interface.
- `fetched_at` is stored as an ISO-8601 string rather than a native timestamp
  for identical behavior across the SQLite and PostgreSQL drivers Backstage
  supports.
- This mirrors how comparable Backstage backend plugins persist snapshot-style
  caches.

## Consequences

- The schema stays a single, easily migrated table, and the store code is a
  thin serialize/deserialize layer.
- The snapshot contents are not queryable in SQL. If a future feature needs
  server-side filtering, per-row dashboard/alert queries, or incremental
  updates, this decision should be revisited and the table split into a
  normalized layout (a migration would rebuild it from live Grafana data, since
  a cache can always be repopulated).
