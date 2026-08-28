# 1. Read-only, backend-centric architecture

Date: 2026-08-27

## Status

Accepted

## Context

Backstage plugins can talk to third-party systems either directly from the
browser (via the proxy) or through a dedicated backend plugin. The frontend-only
approach is simpler, but it exposes Grafana credentials to every browser session,
cannot cache data server-side, and cannot participate in backend concerns such
as scheduled refresh or catalog ingestion.

Our requirements call for cached data (in a database or the cache service),
scheduled refresh, on-the-fly listing for entity relations, and auto-populating
the catalog — all of which are backend concerns.

## Decision

All communication with Grafana happens in the **backend**. The frontend, the
catalog module, and any other consumer talk only to a small read-only REST API
(`/api/grafana`) or reuse the shared node library. Grafana service-account
tokens live exclusively in backend configuration and are never sent to the
browser.

The suite is **read-only** by default. The single exception is the optional
scaffolder module, whose entire purpose is to provision resources; it is a
separate package so that read-only deployments never pull in a write path.

## Consequences

- Credentials stay server-side; the frontend needs no Grafana configuration.
- Caching, scheduling, and catalog ingestion are all possible.
- There is more code than a frontend-only proxy plugin, and the backend must be
  deployed for the frontend to work.
