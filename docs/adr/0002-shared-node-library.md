# 2. A shared `-node` library for reusable code

Date: 2026-08-27

## Status

Accepted

## Context

Both the backend plugin and the catalog module need the same Grafana HTTP
client, the `grafana.instances` configuration reader, and the filtering
helpers. Backstage's guidance is that a backend module must not depend on the
plugin package it extends, and more generally, sharing runtime code between two
backend plugins by importing one from the other is awkward (it drags in Express
and the whole plugin graph).

## Decision

Extract the reusable node-side code — `GrafanaHttpClient`,
`readGrafanaInstances`, and the filter helpers — into a dedicated
`node-library` package, `@marble-sh/backstage-plugin-grafana-node`. Both the
backend plugin and the catalog (and scaffolder) modules depend on it. Shared
annotations and data-transfer types live in a separate isomorphic
`common-library` package, `@marble-sh/backstage-plugin-grafana-common`, so the
frontend can use them too.

## Consequences

- No plugin-to-plugin dependency; each consumer depends only on plain libraries.
- The client and config parsing are tested once, in the library.
- This mirrors the Backstage `plugin-<id>-node` / `plugin-<id>-common` package
  architecture, easing a future contribution to `backstage/community-plugins`.
