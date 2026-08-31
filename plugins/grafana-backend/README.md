# @marble-sh/backstage-plugin-grafana-backend

A read-only [Grafana](https://grafana.com/) backend plugin for Backstage,
targeting the **new backend system**.

The backend performs **all** communication with Grafana. It reads dashboards and
alerts, caches them (in the Backstage cache **or** database), optionally
refreshes them on a schedule, and exposes a small read-only REST API under
`/api/grafana`. The frontend plugin
([`@marble-sh/backstage-plugin-grafana`](../grafana/README.md)) and the catalog
module talk only to this API — they never contact Grafana directly, so all
credentials stay in the backend.

## Features

- Reads dashboards from the modern **App Platform** API
  (`dashboard.grafana.app/v1`, Grafana 12+), or — opt-in per instance via
  `apis.dashboards: legacy-search` — from the classic `/api/search` endpoint
  for older Grafana versions. Folder titles and links are resolved for both.
- Reads alert rules and their live state from the stable Grafana-managed
  Prometheus rules API (`/api/prometheus/grafana/api/v1/rules`), including
  rule uid (for deep links), health, active-since time, active instance
  count, dashboard/panel links, and the `summary` annotation.
- Serves **panel listings and live panel data**: reads a dashboard's model,
  substitutes its template variables' current values, queries the panel's
  targets through `POST /api/ds/query`, and returns plain normalized time
  series — so the frontend can draw real graphs without ever talking to
  Grafana. See [ADR 0006](../../docs/adr/0006-panel-graphs-via-backend-query-proxy.md).
- Works with both **Grafana Cloud** and **self-hosted** Grafana, using a
  service-account token.
- Supports **multiple instances**, each addressable by name.
- Caches data in the Backstage **cache** service (ephemeral, TTL-based) or the
  **database** service (durable), selectable by configuration.
- Optional **scheduled refresh** to keep the cache warm.
- Serves data live on demand (cache miss) or forcibly via `?refresh=true`.

## Installation

Add the dependency to your backend package:

```sh
yarn --cwd packages/backend add @marble-sh/backstage-plugin-grafana-backend
```

Then register the plugin in your backend:

```ts
// packages/backend/src/index.ts
const backend = createBackend();
// ...
backend.add(import('@marble-sh/backstage-plugin-grafana-backend'));
backend.start();
```

## Configuration

All configuration lives under the `grafana` key. The store/schedule schema is
documented in this package's [`config.d.ts`](./config.d.ts); the shared
`grafana.instances` schema lives in
[`grafana-node`](../grafana-node/config.d.ts), where every consumer of the
instance list picks it up.

```yaml
grafana:
  # Where fetched data is stored between refreshes:
  #   cache    (default) – ephemeral, honors cacheTtl
  #   database          – durable, survives restarts and is shared across replicas.
  #                       Database snapshots never expire, so configure a
  #                       `schedule` with it — otherwise data only updates on
  #                       explicit refreshes (the backend warns at startup).
  store: cache
  cacheTtl: { minutes: 15 }

  # Behavior flags (all default to true; see "Behavior flags" below).
  allowOnDemandRefresh: true
  fetchOnDemand: true
  allowPanelQueries: true
  # How long live panel data is cached (see "Behavior flags" below).
  panelDataCacheTtl: { seconds: 30 }

  # Optional background refresh. Omit to fetch lazily on request instead.
  schedule:
    frequency: { minutes: 15 }
    timeout: { minutes: 2 }
    initialDelay: { seconds: 30 }

  instances:
    # A self-hosted Grafana (organization 1 → namespace "default").
    - name: production
      title: Production Grafana
      baseUrl: https://grafana.internal.example.com
      token: ${GRAFANA_PROD_TOKEN} # service-account token, Viewer is enough

    # A Grafana Cloud stack (namespace derived as "stacks-<stackId>").
    - name: cloud
      title: Grafana Cloud
      baseUrl: https://myorg.grafana.net
      stackId: '123456'
      token: ${GRAFANA_CLOUD_TOKEN}
```

### Instance options

| Key              | Required | Description                                                                                             |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `name`           | yes      | Unique, stable id. Referenced by the `grafana/instance` entity annotation and by the REST API.          |
| `baseUrl`        | yes      | Base URL of the Grafana instance, without a trailing slash.                                             |
| `token`          | yes      | Service-account token used as a Bearer token. Read-only (Viewer) permissions are enough. Marked secret. |
| `title`          | no       | Human-readable title. Defaults to `name`.                                                               |
| `namespace`      | no       | App Platform namespace. Defaults to `default` (self-hosted) or `stacks-<stackId>` (cloud).              |
| `stackId`        | no       | **Numeric** Grafana Cloud stack id (not the stack slug), used to derive the namespace (see below).      |
| `apis`           | no       | Override or disable the API used per data type (see below).                                             |
| `resolveFolders` | no       | `false` skips the `/api/folders` folder lookup (see below). Defaults to `true`.                         |

### API selection

```yaml
apis:
  dashboards: app-platform # or "legacy-search" for older Grafana, or "none"
  alerts: prometheus # or "none"
```

Every state, per data type:

- `dashboards: app-platform` (default) uses `dashboard.grafana.app/v1`
  (Grafana 12+).
- `dashboards: legacy-search` uses the classic `/api/search` endpoint.
- `dashboards: none` — the instance serves no dashboards: dashboard listings
  return empty for it without contacting Grafana, and catalog discovery emits
  no dashboard entities for it.
- `alerts: prometheus` (default) uses the Grafana-managed Prometheus rules API.
- `alerts: none` — the instance serves no alerts: alert listings return empty
  for it without contacting Grafana. Set this on instances that do not use
  Grafana-managed alerting; otherwise their snapshot refreshes fail on the
  alerting call.

### Folder resolution (`resolveFolders`)

- `true` (default): when dashboards come from the App Platform API, one extra
  `/api/folders` request per refresh resolves folder uids to titles and links.
- `false`: that request is skipped and App Platform dashboards carry no folder
  information. `legacy-search` dashboards are unaffected either way — their
  search response already includes folder details.

### Behavior flags

Three top-level flags control when the backend talks to Grafana. All default
to `true`; each can be set independently.

- **`allowOnDemandRefresh`** — may API callers force live reads?

  - `true` (default): `?refresh=true` (also `?refresh=1` or the bare flag)
    bypasses the store, and `POST /refresh` / `POST /instances/:name/refresh`
    trigger immediate refreshes.
  - `false`: `refresh` query parameters are silently ignored (the request is
    served exactly as if the parameter were absent) and both `POST …/refresh`
    routes respond `403 NotAllowedError`. The scheduled refresh is unaffected.

- **`fetchOnDemand`** — does a store miss trigger a live read?

  - `true` (default): a miss fetches from Grafana on the spot and stores the
    snapshot.
  - `false`: a miss returns empty results and stores nothing; data appears
    once any refresh runs.

- **`allowPanelQueries`** — are the panel routes served?
  - `true` (default): `GET …/dashboards/:uid/panels` and
    `GET …/panels/:panelId/data` read live from Grafana (the dashboard model
    plus the `/api/ds/query` datasource API), briefly cached per
    `grafana.panelDataCacheTtl` (default 30 seconds) to absorb bursts.
  - `false`: both routes respond `403`. Panel data cannot come from the
    snapshot store, so deployments that need strictly schedule-only Grafana
    traffic should set this alongside the other two flags.

All four combinations:

| `allowOnDemandRefresh` | `fetchOnDemand` | Resulting behavior                                                                                                                                                               |
| ---------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true`                 | `true`          | (Default.) Misses fetch lazily; users may force refreshes.                                                                                                                       |
| `true`                 | `false`         | Misses return empty, but an explicit `?refresh=true` or `POST …/refresh` still reads live and fills the store.                                                                   |
| `false`                | `true`          | Users cannot force refreshes, but a cold store still fills itself lazily on first read.                                                                                          |
| `false`                | `false`         | Grafana is contacted **only** by the schedule (configure one, or the API serves empty forever). With `allowPanelQueries: false` as well, Grafana traffic is fully deterministic. |

### Deriving the namespace

Grafana's App Platform APIs are namespaced:

- Self-hosted, organization 1 → `default`
- Self-hosted, other organizations → `org-<id>` (set `namespace` explicitly)
- Grafana Cloud → `stacks-<stackId>` (set `stackId`, or `namespace` directly)

`stackId` is the **numeric** stack id, not the stack slug — for a stack at
`myorg.grafana.net`, `myorg` is the slug, not the id. A non-numeric `stackId`
is rejected at startup. Two ways to find the id:

- In the Grafana Cloud portal, open the stack; the URL is
  `grafana.com/orgs/<org>/stacks/<id>`.
- Ask the instance itself, using the same service-account token this plugin
  uses:

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" \
    https://<slug>.grafana.net/api/frontend/settings | jq -r .namespace
  # → "stacks-1216502"  — the number is the stackId
  ```

## REST API

All routes are mounted under `/api/grafana` and (except `/health`) require a
valid Backstage credential.

| Method | Path                                                    | Description                                                |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/health`                                               | Health check (unauthenticated).                            |
| GET    | `/instances`                                            | List configured instances.                                 |
| GET    | `/instances/:name/dashboards`                           | Dashboards for one instance.                               |
| GET    | `/instances/:name/dashboards/:uid/panels`               | The panels of one dashboard (live read).                   |
| GET    | `/instances/:name/dashboards/:uid/panels/:panelId/data` | Normalized time series for one panel (live query).         |
| GET    | `/instances/:name/alerts`                               | Alerts for one instance.                                   |
| POST   | `/instances/:name/refresh`                              | Force a refresh of one instance.                           |
| GET    | `/dashboards`                                           | Dashboards across all instances (or `?instance=` for one). |
| GET    | `/alerts`                                               | Alerts across all instances (or `?instance=` for one).     |
| POST   | `/refresh`                                              | Force a refresh of all instances.                          |

### Query parameters

- `tag` — repeatable; only dashboards carrying **all** given tags are returned.
- `query` — comma-separated, case-insensitive title substrings; dashboards
  matching **any** value are returned.
- `uid` — only the dashboard with exactly this uid (case-sensitive) is
  returned; combines with the other filters.
- `labelSelector` — `key=value,key2=value2`; only alerts matching **all** pairs.
- `instance` — (on `/dashboards` and `/alerts`) restrict to a single instance.
- `refresh` — `true` or `1` (or the bare flag) to bypass the store and read
  live from Grafana. On the panel routes it bypasses the panel cache
  (`panelDataCacheTtl`) instead. Ignored when
  `allowOnDemandRefresh: false`.
- `from` / `to` — (on the panel data route) the query range, as Grafana time
  expressions: `now`, `now-<n><s|m|h|d|w>`, or epoch milliseconds. Default
  `now-6h` … `now`.

Example:

```sh
curl -H "Authorization: Bearer <backstage-token>" \
  "http://localhost:7007/api/grafana/instances/production/dashboards?tag=team-a&refresh=true"
```

## How caching works

Each request resolves to a per-instance snapshot (all dashboards + all alerts):

1. Unless `refresh=true`, the snapshot is read from the configured store.
2. On a miss (or when `refresh=true`), the backend reads live from Grafana and
   writes the snapshot back to the store.
3. Requested tag/query/label filters are then applied to the snapshot.

Because filtering happens after retrieval, a single cached snapshot serves many
entities with different selectors, keeping Grafana API traffic low.

Panel listings and panel data are different: they are inherently live (a graph
of a stale range is wrong, not cached), so they bypass the snapshot store
entirely. Instead they are kept in the cache service for a short
`panelDataCacheTtl` (default 30 seconds) keyed by instance, dashboard, panel,
and range — enough to absorb a dashboard opening (which queries every panel at
once) and several viewers of the same entity, without making graphs stale. The
Grafana-side dashboard-model read is additionally deduplicated in the client,
so one burst reads the model once.

## Local development

```sh
yarn start   # from this directory, runs the plugin in a standalone backend
```

## Testing

```sh
yarn workspace @marble-sh/backstage-plugin-grafana-backend test
```

The plugin is developed test-first. Unit tests cover the HTTP client (with an
injected `fetch`), config parsing, both stores (the database store against an
in-memory SQLite), the caching service, and the router. An integration test
boots the plugin with `startTestBackend` and a mocked Grafana.
