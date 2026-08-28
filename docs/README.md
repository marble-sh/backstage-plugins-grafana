# Repository documentation

Documentation about the repository itself. For documentation about each
plugin, see the package READMEs under [`plugins/*`](../plugins/); for how to
contribute, start with [CONTRIBUTING.md](../CONTRIBUTING.md).

## Contents

- [versioning.md](./versioning.md) — the SemVer policy: how PR labels drive
  version bumps and changelog categories, hand-written changesets, and
  release notes.
- [extending.md](./extending.md) — developer hooks: bringing your own
  stores, clients, entity processing, and UI overrides.
- [adr/](./adr/) — architecture decision records.
- [state/](./state/) — the AI agent's durable working notes for this build
  (locked decisions, verified API facts, gotchas). Not user documentation.

## Package READMEs

| Package                                                                                     | Role                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [grafana-common](../plugins/grafana-common/README.md)                                       | Shared annotations + DTO types            |
| [grafana-node](../plugins/grafana-node/README.md)                                           | Shared Grafana client + instance config   |
| [grafana-backend](../plugins/grafana-backend/README.md)                                     | REST API, stores, scheduled refresh       |
| [grafana](../plugins/grafana/README.md)                                                     | Frontend (legacy + new system)            |
| [catalog-backend-module-grafana](../plugins/catalog-backend-module-grafana/README.md)       | Catalog discovery of instances/dashboards |
| [scaffolder-backend-module-grafana](../plugins/scaffolder-backend-module-grafana/README.md) | `grafana:dashboard:create` action         |
