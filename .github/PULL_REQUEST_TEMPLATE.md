## Description

<!-- What does this change do, and why? Add screenshots for UI changes. -->

## Checklist

- [ ] Versioning: either a changeset (`yarn changeset`) **or** the right labels — `semver:minor`/`semver:major` if this is more than a patch, plus a type label (`bug`, `enhancement`, …) for the changelog category. A changeset is generated from the labels on merge if you don't add one. See [docs/versioning.md](https://github.com/marble-sh/backstage-plugins-grafana/blob/main/docs/versioning.md).
      Optional: a ` ```release-note ` block below overrides the PR title in the changelog.
- [ ] Tests added for new functionality / regression tests for bug fixes.
- [ ] Documentation added or updated (package README, config schema, ADR if architectural).
- [ ] Public API changes are reflected in the `report.api.md` files (`yarn build:api-reports`).
- [ ] `yarn lint:all`, `yarn tsc:full`, `yarn prettier:check`, and `yarn test` pass locally.
- [ ] Screenshots attached (for UI changes).
