# Monitoring Backstage itself: example dashboard and alerts

The plugins in this repository _display_ Grafana content for your entities —
they don't make your Backstage instance observable by themselves. This page is
a quick how-to for getting Backstage's own telemetry into Grafana and wiring
the result back into the portal through this suite, including answers to the
three most-asked questions:

| Question                               | Signal                                                                                                            | Needs            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------- |
| How many entities, broken down by type | `catalog_entities_count` gauge, `kind` label (built into the catalog backend)                                     | metrics          |
| Which plugin is throwing errors        | every backend log line carries a `plugin` field (`level="error"` filter), plus 5xx rate per `/api/<plugin>` route | logs (+ metrics) |
| How many users signed in today         | **no built-in signal** — add one log line to your sign-in resolver (below), then count unique users in Loki       | logs + 1 line    |

## 1. Turn on metrics

Backstage's backend emits OpenTelemetry metrics; you only have to start the
SDK before the backend loads, with a Prometheus exporter
([upstream tutorial](https://backstage.io/docs/tutorials/setup-opentelemetry/)):

```js
// packages/backend/instrumentation.js — load with: node --require ./instrumentation.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

new NodeSDK({
  metricReader: new PrometheusExporter({ port: 9464 }), // GET /metrics
  instrumentations: [getNodeAutoInstrumentations()],
}).start();
```

This serves, among others:

- `catalog_entities_count{kind=…}`, `catalog_registered_locations_count`,
  `catalog_relations_count`, `catalog_processed_entities_count_total`,
  `catalog_processing_duration_*` — catalog size and health.
- `scaffolder_task_count_total{result=…}`, `scaffolder_task_duration_*` —
  template runs and outcomes.
- `http_server_request_duration_{bucket,sum,count}` (seconds) with
  `http_route`, `http_request_method`, `http_response_status_code` — RED
  metrics; `/api/<plugin-id>` route prefixes give a per-plugin breakdown.
- From this suite's backend plugin:
  `grafana_instance_refresh_count_total{instance,result}` and
  `grafana_instance_snapshot_age{instance}` (seconds) — which configured
  Grafana instances are refreshing, failing, or stale (see the
  [backend README](../plugins/grafana-backend/README.md#metrics)).

Scrape `:9464/metrics` with whatever you already run (Prometheus, Grafana
Alloy, an agent) and remote-write into the Grafana instance's Prometheus
datasource.

## 2. Ship logs (optional, enables the last two questions)

Backstage logs are JSON with `level`, `message`, and a `plugin` field on every
plugin-scoped line. Ship container logs to a Loki datasource and you can ask
"errors by plugin":

```logql
sum by (plugin) (count_over_time({namespace="backstage"} | json | level=`error` [5m]))
```

For unique sign-ins there is no built-in event — add one line inside your
app's sign-in resolver:

```ts
ctx.logger.info('user signed in', { userEntityRef });
```

and count distinct users:

```logql
count(sum by (userEntityRef) (count_over_time({namespace="backstage"}
  | json | message=`user signed in` [24h])))
```

Without logs, auth session-refresh traffic
(`http_server_request_duration_count{http_route=~"/api/auth/.*"}`) is a
coarse proxy for active sessions.

## 3. Import the example dashboard

[`examples/backstage-observability-dashboard.json`](./examples/backstage-observability-dashboard.json)
is an importable starting point: in Grafana choose **Dashboards → New →
Import**, upload the file, pick your Prometheus and Loki datasources, and set
the `namespace` variable to wherever Backstage's logs come from. Panels whose
datasource you don't have (Loki) simply stay empty.

## 4. Pair it with alerts

Create Grafana-managed alert rules on the same queries and give them a stable
label so the portal can select them — for example `service=backstage`:

| Alert                       | Query sketch                                                              | Suggested         |
| --------------------------- | ------------------------------------------------------------------------- | ----------------- |
| Backend down                | `up{job="backstage"} == 0` (or your scrape's equivalent)                  | for 5m, high      |
| Plugin error spike          | 5xx ratio per `/api/<plugin>` route above 5%                              | for 10m, medium   |
| Catalog stopped churning    | `increase(catalog_processed_entities_count_total[30m]) == 0`              | for 30m, medium   |
| Template failures           | `increase(scaffolder_task_count_total{result="failed"}[1h]) > 0`          | immediate, medium |
| Grafana instance unreadable | `increase(grafana_instance_refresh_count_total{result="error"}[30m]) > 3` | for 30m, medium   |

## 5. Wire it into the portal

On the entity that represents your Backstage instance, set this suite's
annotations so the dashboard and alerts appear on its Grafana tabs:

```yaml
metadata:
  annotations:
    grafana/instance: <your configured instance name>
    grafana/dashboard-selector: Backstage Observability
    grafana/alert-label-selector: service=backstage
```

See the [frontend README](../plugins/grafana/README.md) for the full
annotation reference.
