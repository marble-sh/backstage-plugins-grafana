# @marble-sh/backstage-plugin-grafana-node

Node-side library shared by the Grafana Backstage plugins. It contains the
pieces that the [backend plugin](../grafana-backend/README.md), the
[catalog module](../catalog-backend-module-grafana/README.md), and the
[scaffolder module](../scaffolder-backend-module-grafana/README.md) all need,
so none of them has to depend on another plugin package:

- **`GrafanaHttpClient`** — a read-only client for a single Grafana instance.
  Dashboards are read from the App Platform `dashboard.grafana.app/v1` API
  (following its Kubernetes-style `metadata.continue` pagination; or, opt-in,
  the classic `/api/search` endpoint), with folder titles and links resolved
  via `/api/folders`; alerts come from the Grafana-managed Prometheus rules
  API, enriched with rule uid, health, active instances, and annotations. It
  can also read a single dashboard's model to list its panels (`getPanels`)
  and query a panel's data (`getPanelData`) through `POST /api/ds/query`,
  interpolating the dashboard's template variables from their current values
  (honoring a custom `allValue`, and resolving auto-interval placeholders to
  the computed query interval) and normalizing the returned data frames into
  plain time series. Datasource refs are checked against `/api/datasources`
  before querying: refs carrying a datasource _name_ in the uid field — as
  Grafana Cloud's provisioned dashboards do — are resolved to the real uid,
  and unknown refs are skipped with a warning instead of failing the whole
  query batch. Valueless `datasource`-type template variables — which the
  Grafana UI evaluates on every dashboard load, so stored dashboards carry no
  selection — default to the first datasource of the variable's declared
  type (narrowed by its name regex when set), mirroring the UI. Targets
  still referencing a template variable that has no saved value are likewise
  skipped with a warning, since the datasource would reject the raw `$var`
  text. The `fetch` implementation is injectable for testing.
- **`readGrafanaInstances` / `readGrafanaInstance`** — parse the shared
  `grafana.instances` configuration into resolved `GrafanaInstanceConfig`s,
  deriving the App Platform namespace for Grafana Cloud and self-hosted
  deployments.
- **`filterDashboards` / `filterAlerts` / `parseLabelSelector`** — pure helpers
  for narrowing results by tag, title, or label selector.

This package is a plain node library (no Backstage runtime dependencies beyond
config), which is why it is safe to import from both a backend plugin and a
backend module.

It also carries the config schema for the shared `grafana.instances` list (see
[`config.d.ts`](./config.d.ts)) — including the `@visibility secret` marking on
tokens — so that schema is present whichever combination of the backend plugin,
catalog module, and scaffolder module an app installs.

## Testing

```sh
yarn workspace @marble-sh/backstage-plugin-grafana-node test
```
