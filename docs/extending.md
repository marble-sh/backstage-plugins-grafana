# Extending the Grafana plugins

Every package in this suite is built from small, exported pieces, so most
customizations are a matter of recomposing public API rather than forking. This
guide walks through each extension hook with working examples.

For turning behavior on and off (rather than replacing it), see the
configuration flags in the
[backend](../plugins/grafana-backend/README.md#behavior-flags),
[catalog module](../plugins/catalog-backend-module-grafana/README.md#configuration),
and [scaffolder module](../plugins/scaffolder-backend-module-grafana/README.md#guard-rails-grafanascaffolder)
READMEs.

## Backend

### Bring your own store

`GrafanaStore` is the interface between the service and its snapshot storage.
The built-in implementations (`CacheGrafanaStore`, `DatabaseGrafanaStore`) are
public, and so is the interface — implement it to store snapshots anywhere:

```ts
import {
  GrafanaSnapshot,
  GrafanaStore,
} from '@marble-sh/backstage-plugin-grafana-backend';

export class RedisGrafanaStore implements GrafanaStore {
  async get(instanceName: string): Promise<GrafanaSnapshot | undefined> {
    /* ... */
  }
  async set(instanceName: string, snapshot: GrafanaSnapshot): Promise<void> {
    /* ... */
  }
}
```

### Bring your own client (or fetch)

`GrafanaClient` is the read interface to a single Grafana instance. Implement
it directly, or reuse `GrafanaHttpClient` with an injected `fetch` to add
mTLS, an egress proxy, request logging, or recording:

```ts
import { GrafanaHttpClient } from '@marble-sh/backstage-plugin-grafana-node';

const client = new GrafanaHttpClient({
  instance,
  fetch: async (input, init) => {
    // decorate, record, route through a proxy agent, ...
    return fetch(input, init);
  },
});
```

### Assemble a custom backend plugin

`createRouter`, `DefaultGrafanaService`, the stores, and the config readers are
all exported, so a custom plugin can swap any single layer and keep the rest:

```ts
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import {
  createRouter,
  DefaultGrafanaService,
  readGrafanaConfig,
} from '@marble-sh/backstage-plugin-grafana-backend';
import { GrafanaHttpClient } from '@marble-sh/backstage-plugin-grafana-node';

export const myGrafanaPlugin = createBackendPlugin({
  pluginId: 'grafana',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
      },
      async init({ logger, config, httpRouter }) {
        const { instances } = readGrafanaConfig(config);
        const grafanaService = new DefaultGrafanaService({
          instances: instances.map(instance => ({
            config: instance,
            client: new GrafanaHttpClient({ instance }),
          })),
          store: new RedisGrafanaStore(), // your store from above
          logger,
        });
        httpRouter.use(await createRouter({ grafanaService }));
      },
    });
  },
});
```

> The stock `grafana` backend plugin does not yet expose backend-system
> extension points of its own (e.g. a store or client-factory extension
> point), so a module targeting `pluginId: 'grafana'` currently has nothing to
> hook into — full reassembly as above is the supported path. Extension points
> are a natural future addition; open an issue if you need one.

## Catalog discovery

### Custom client or entity post-processing

`GrafanaEntityProvider`'s constructor takes an injectable `clientFactory`, and
`buildGrafanaEntities` / `readGrafanaDiscoveryConfig` / `readGrafanaInstances`
are public. Register your own provider instance from a custom catalog module
instead of (or alongside) the stock one:

```ts
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import {
  GrafanaEntityProvider,
  readGrafanaDiscoveryConfig,
} from '@marble-sh/backstage-plugin-catalog-backend-module-grafana';
import { readGrafanaInstances } from '@marble-sh/backstage-plugin-grafana-node';

export const catalogModuleMyGrafana = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-grafana',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        catalog: catalogProcessingExtensionPoint,
      },
      async init({ logger, config, scheduler, catalog }) {
        const discovery = readGrafanaDiscoveryConfig(config);
        catalog.addEntityProvider(
          new GrafanaEntityProvider({
            instances: readGrafanaInstances(config),
            discovery,
            logger,
            taskRunner: scheduler.createScheduledTaskRunner(discovery.schedule),
            clientFactory: instance => myCustomClientFor(instance),
          }),
        );
      },
    });
  },
});
```

### Enriching discovered entities

The provider emits plain `Resource` entities through the standard catalog
pipeline, so any installed
[catalog processor](https://backstage.io/docs/features/software-catalog/external-integrations#custom-processors)
can enrich, validate, or relate them. Match on `spec.type` —
`grafana-instance` / `grafana-dashboard` — or on the `grafana/instance`
annotation.

## Scaffolder

`createGrafanaDashboardCreateAction({ config, fetch })` is exported with an
injectable `fetch`. Wire a wrapped or instrumented variant from your own
module instead of installing this package's default module:

```ts
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { createGrafanaDashboardCreateAction } from '@marble-sh/backstage-plugin-scaffolder-backend-module-grafana';

// inside your module's init:
scaffolder.addActions(
  createGrafanaDashboardCreateAction({ config, fetch: auditedFetch }),
);
```

The `grafana.scaffolder` guard rails (instance allow-list, overwrite toggle)
apply to any action created through this factory, since they are read from
config inside the handler.

## Frontend

### Swap the API client

Everything the UI renders flows through `grafanaApiRef`. Provide your own
`GrafanaApi` implementation to change data fetching without touching a single
component.

Legacy frontend system — override the API in your app:

```ts
import {
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { grafanaApiRef } from '@marble-sh/backstage-plugin-grafana';

const apis = [
  createApiFactory({
    api: grafanaApiRef,
    deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
    factory: ({ discoveryApi, fetchApi }) =>
      new MyGrafanaApi({ discoveryApi, fetchApi }),
  }),
];
```

New frontend system — an api extension in any app module with the same ref
replaces the plugin's one.

### Configure, disable, or replace extensions (new system)

Each extension is addressable in `app-config.yaml` under `app.extensions`:

```yaml
app:
  extensions:
    - entity-card:grafana/alerts: false # remove the alerts card
    - entity-content:grafana/dashboards:
        config:
          title: Dashboards # rename the tab
```

The extension ids are listed in the
[frontend README](../plugins/grafana/README.md#what-it-provides).

### Compose manually (legacy system)

`GrafanaPage`, `EntityGrafanaDashboardsCard`, `EntityGrafanaAlertsCard`, and
the two `…Content` components are plain exports; gate them with the public
helpers `isGrafanaAvailable` / `isDashboardsAvailable` / `isAlertsAvailable`
from `@marble-sh/backstage-plugin-grafana-common` and place them anywhere in
your `EntityPage`.

## Operational hooks

- `POST /api/grafana/refresh` and `POST /api/grafana/instances/:name/refresh`
  accept authenticated requests, so external automation (for example a Grafana
  provisioning pipeline) can trigger a re-read the moment dashboards change.
  Both respect the `grafana.allowOnDemandRefresh` flag.
- The scheduled refresh (`grafana.schedule`) and discovery schedule
  (`grafana.catalog.schedule`) accept cron expressions for exact timing.
