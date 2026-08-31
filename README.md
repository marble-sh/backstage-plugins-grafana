# Grafana plugins for Backstage

[![CI](https://github.com/marble-sh/backstage-plugins-grafana/actions/workflows/ci.yml/badge.svg)](https://github.com/marble-sh/backstage-plugins-grafana/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

A ground-up, test-driven [Grafana](https://grafana.com/) integration for
[Backstage](https://backstage.io/), built against the **new** Backstage backend
system and Grafana's newest
[App Platform APIs](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/apis/).
The frontend plugin supports **both** the legacy and the new frontend systems.

This is a standalone plugin monorepo. Its layout mirrors the
[Backstage community-plugins](https://github.com/backstage/community-plugins)
workspace convention, so it can be developed and released independently and, if
desired, contributed upstream later.

## Architecture

The frontend never talks to Grafana directly. All authentication, caching, and
data-stitching live in the backend, which exposes a small read-only REST API
for the frontend. The catalog and scaffolder modules run server-side and reach
Grafana through the shared `grafana-node` client (as the diagram shows), using
the same instance configuration and tokens.

```
                +------------------------------+
   Grafana <----|  grafana-backend (REST API)  |----> cache / database
     ^          |  - Grafana HTTP client       |
     |          |  - store + scheduled refresh |
     |          +---------------+--------------+
     |                          | /api/grafana
     |                +---------v----------+
     |                |  grafana (frontend)|
     |                |  entity tabs/cards |
     |                |  + standalone page |
     |                +--------------------+
     |
     |          +-------------------------------+
     +----------| catalog-backend-module-grafana|
                | auto-discovers instances &    |
                | dashboards as catalog entities|
                +-------------------------------+

  grafana-node  = shared Grafana HTTP client + instance config (backend + module)
  grafana-common = shared entity annotations + data-transfer types (all packages)
```

## Packages

| Package                                                                                                        | Status   | Description                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| [`@marble-sh/backstage-plugin-grafana-common`](./plugins/grafana-common)                                       | ✅ ready | Shared entity annotations and data-transfer types.                          |
| [`@marble-sh/backstage-plugin-grafana-node`](./plugins/grafana-node)                                           | ✅ ready | Shared Grafana HTTP client, instance config reader, and filters.            |
| [`@marble-sh/backstage-plugin-grafana-backend`](./plugins/grafana-backend)                                     | ✅ ready | REST API, Grafana client, caching store, and scheduled refresh.             |
| [`@marble-sh/backstage-plugin-grafana`](./plugins/grafana)                                                     | ✅ ready | Frontend (legacy + new system): entity cards/content and a standalone page. |
| [`@marble-sh/backstage-plugin-catalog-backend-module-grafana`](./plugins/catalog-backend-module-grafana)       | ✅ ready | Auto-discovers Grafana instances and dashboards as catalog entities.        |
| [`@marble-sh/backstage-plugin-scaffolder-backend-module-grafana`](./plugins/scaffolder-backend-module-grafana) | ✅ ready | Scaffolder action to provision Grafana dashboards.                          |

## Quickstart

Install and register the backend, then configure at least one instance:

```sh
yarn --cwd packages/backend add @marble-sh/backstage-plugin-grafana-backend
```

```ts
// packages/backend/src/index.ts
backend.add(import('@marble-sh/backstage-plugin-grafana-backend'));
```

```yaml
# app-config.yaml
grafana:
  instances:
    - name: production
      baseUrl: https://grafana.internal.example.com
      # A Grafana service-account token; Viewer covers all read-only features.
      # See the backend README for creation steps and exact permissions.
      token: ${GRAFANA_PROD_TOKEN}
```

Then install the frontend and annotate your entities:

```sh
yarn --cwd packages/app add @marble-sh/backstage-plugin-grafana
```

```yaml
# catalog-info.yaml
metadata:
  annotations:
    grafana/instance: production
    grafana/tag-selector: my-team
```

See the [backend README](./plugins/grafana-backend/README.md) for the full
configuration reference, the REST API, and
[how to create the Grafana service account and token](./plugins/grafana-backend/README.md#creating-the-grafana-service-account-and-token)
with the exact permissions each feature needs. The
[frontend README](./plugins/grafana/README.md) covers wiring up either frontend
system, the
[entity annotation reference](./plugins/grafana/README.md#entity-annotations),
and the deliberate
[differences from `@backstage-community/plugin-grafana`](./plugins/grafana/README.md#differences-from-backstage-communityplugin-grafana).

## Development

This repo uses Yarn 4 and the Backstage CLI. Native dependencies (used by tests)
require build scripts, which are enabled in `.yarnrc.yml`.

```sh
yarn install         # install all workspaces
yarn test            # run all tests
yarn tsc             # typecheck
yarn lint:all        # lint
yarn build:all       # build every package
```

Every package is developed **test-first** (red → green → refactor). All Grafana
API and Backstage decisions are grounded in the official documentation, and the
newest Grafana API spec is preferred, with well-defined fallbacks to the classic
HTTP API where the new one does not yet cover a need.

CI runs the same checks on every pull request (Node 22 and 24). Repository
documentation is indexed in [docs/](./docs/README.md), how PR labels drive
version bumps and changelogs ([docs/versioning.md](./docs/versioning.md)),
how to extend the plugins with your own stores, clients, entity processing,
and UI overrides ([docs/extending.md](./docs/extending.md)), and the
architecture decisions ([docs/adr](./docs/adr)).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev
workflow, tests, and versioning (PR labels or changesets). Please also read the
[Code of Conduct](./CODE_OF_CONDUCT.md). Security issues should be reported per
the [Security Policy](./SECURITY.md).

## License

[Apache-2.0](./LICENSE)
