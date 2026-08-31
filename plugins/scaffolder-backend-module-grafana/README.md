# @marble-sh/backstage-plugin-scaffolder-backend-module-grafana

A scaffolder backend module that adds Grafana provisioning actions to the
[Backstage Software Templates](https://backstage.io/docs/features/software-templates/)
scaffolder.

> This is the **only write path** in the Grafana plugin suite — every other
> package is strictly read-only. The action writes to Grafana using the same
> `grafana.instances` configuration (and service-account tokens) as the rest of
> the suite.

## Actions

### `grafana:dashboard:create`

Creates (or, with `overwrite`, updates) a dashboard in a configured Grafana
instance via the App Platform `dashboard.grafana.app/v1` API.

| Input          | Type       | Required | Description                                                                                                                       |
| -------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `title`        | `string`   | yes      | The dashboard title.                                                                                                              |
| `instanceName` | `string`   | no       | Which configured instance to target. Optional when only one is configured.                                                        |
| `uid`          | `string`   | no       | Dashboard uid (`metadata.name`). Grafana generates one when omitted.                                                              |
| `folderUid`    | `string`   | no       | The uid of the folder to create the dashboard in.                                                                                 |
| `tags`         | `string[]` | no       | Dashboard tags.                                                                                                                   |
| `dashboard`    | `object`   | no       | Extra dashboard spec fields (panels, templating, …) merged into the spec.                                                         |
| `overwrite`    | `boolean`  | no       | Update the dashboard with the given `uid` (requires `uid`). Idempotent: when no such dashboard exists yet, it is created instead. |

Outputs: `uid`, `url`, and `instanceName`.

An `overwrite` run first reads the current dashboard and carries its
`metadata.resourceVersion` into the update, so it plays by the App Platform
API's optimistic-concurrency rules.

Example template step:

```yaml
steps:
  - id: create-dashboard
    name: Create Grafana dashboard
    action: grafana:dashboard:create
    input:
      instanceName: production
      title: ${{ parameters.name }} overview
      tags:
        - ${{ parameters.name }}
  - id: log
    name: Log
    action: debug:log
    input:
      message: 'Created ${{ steps["create-dashboard"].output.url }}'
```

## Installation

```sh
yarn --cwd packages/backend add @marble-sh/backstage-plugin-scaffolder-backend-module-grafana
```

```ts
// packages/backend/src/index.ts
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(
  import('@marble-sh/backstage-plugin-scaffolder-backend-module-grafana'),
);
```

The action reads its connection details from `grafana.instances` (see the
[backend plugin](../grafana-backend/README.md) for that configuration).

Unlike the read-only plugins, this module **writes** to Grafana, so a Viewer
token is not enough: the target instance's service account needs
`dashboards:read` and `dashboards:create` — plus `dashboards:write` when
templates use `overwrite: true` — in the folders your templates target. The
simplest setup is the **Editor** basic role; with RBAC (Grafana
Enterprise/Cloud) use `fixed:dashboards:writer` scoped to those folders. See
[Creating the Grafana service account and token](../grafana-backend/README.md#creating-the-grafana-service-account-and-token)
for the walkthrough.

## Guard rails (`grafana.scaffolder`)

Because this module is the suite's only write path, two config options restrict
what templates may do:

```yaml
grafana:
  scaffolder:
    allowedInstances: [staging] # defaults to every configured instance
    allowOverwrite: false # defaults to true
```

- **`allowedInstances`** — which instances the actions may write to.
  - unset (default): every instance under `grafana.instances` is writable.
  - a list of names: writes to any other instance fail with a
    `NotAllowedError`, and automatic instance selection (when `instanceName`
    is omitted) only considers the listed instances — so a template can omit
    `instanceName` whenever exactly one instance is writable, regardless of
    how many are configured. An empty list makes nothing writable. A listed
    name that doesn't exist under `grafana.instances` fails backend startup
    with a configuration error (and, defensively, any action run).
- **`allowOverwrite`** — whether `grafana:dashboard:create` may update
  existing dashboards.
  - `true` (default): the action's `overwrite: true` input updates the
    dashboard with the given `uid` in place.
  - `false`: any run requesting `overwrite` fails with a `NotAllowedError`;
    the action can only create new dashboards.

## Testing

```sh
yarn workspace @marble-sh/backstage-plugin-scaffolder-backend-module-grafana test
```

The action is unit-tested with an injected `fetch` and
`createMockActionContext`; the module is verified to register its action via
`startTestBackend`.
