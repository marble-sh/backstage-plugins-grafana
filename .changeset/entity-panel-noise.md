---
'@marble-sh/backstage-plugin-grafana': patch
---

Fixed: two sources of noise on entity dashboard and alert views. Stat value
tiles no longer print the series name under the value when the query
returned a single series — for label-less results (`count(...) or
vector(0)`) Prometheus names the series after the full query expression, so
the tile showed raw PromQL under the number; the name is now shown only when
there are several series to disambiguate, matching Grafana's stat panel in
its default "auto" text mode. The alerts table no longer has a Summary
column: the Prometheus rules API returns the rule-level `summary` annotation
as an unrendered Go template (`{{ $values.B }}`…), which read as noise. The
annotation is still returned by the backend API for custom consumers.
