# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report them privately through GitHub:

1. Open the [Security](https://github.com/marble-sh/backstage-plugins-grafana/security) tab of this repository.
2. Choose **Report a vulnerability**.
3. Include affected package(s), a description, and reproduction steps. Redact any
   tokens or secrets.

You can expect an initial acknowledgement within a few business days.

## Scope

- Vulnerabilities in these `@marble-sh/*` Grafana plugins.
- For vulnerabilities in **Backstage** itself, follow the
  [Backstage security policy](https://github.com/backstage/backstage/blob/master/SECURITY.md).
- For vulnerabilities in **Grafana**, follow
  [Grafana's process](https://grafana.com/security/).

## Handling of credentials

These plugins are read-only by default and keep Grafana service-account tokens in
**backend** configuration only (never sent to the browser). If you find a code
path that leaks a token to the frontend or to logs, please treat it as a security
issue and report it as above.
