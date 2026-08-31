# Architecture Decision Records

This directory records the significant architectural decisions for the Grafana
Backstage plugins, using lightweight
[ADRs](https://adr.github.io/madr/).

| ADR                                                    | Title                                             |
| ------------------------------------------------------ | ------------------------------------------------- |
| [0001](./0001-read-only-backend-centric.md)            | Read-only, backend-centric architecture           |
| [0002](./0002-shared-node-library.md)                  | A shared `-node` library for reusable code        |
| [0003](./0003-prefer-app-platform-apis.md)             | Prefer Grafana's App Platform APIs                |
| [0004](./0004-catalog-entity-model.md)                 | Catalog entity model for instances & dashboards   |
| [0005](./0005-denormalized-snapshot-store.md)          | A deliberately denormalized snapshot store        |
| [0006](./0006-panel-graphs-via-backend-query-proxy.md) | Panel graphs via a backend datasource-query proxy |
