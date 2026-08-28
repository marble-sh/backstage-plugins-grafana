# Copilot instructions for this repository

This is a Yarn 4 workspace of six Backstage plugins (`plugins/*`) published to
npm under the personal `@marble-sh` scope. Releases are automated with
changesets; version bumps are driven by PR labels (see `docs/versioning.md`).

## Reviewing pull requests

When reviewing a PR, check the versioning contract first — labels drive the
version bump that happens automatically on merge:

- **Semver labels must match the change.** If the PR changes any
  `report.api.md` (public API surface), it must carry `semver:minor` (new
  API) or `semver:major`/`breaking-change` (removed/changed API). Flag any PR
  that alters public API but has no semver label — it would be released as a
  patch by default.
- **Type labels drive the changelog category**: `bug` → Fixed, `enhancement`
  → Added, `security` → Security, anything else → Changed. Flag a PR whose
  label contradicts its content (e.g. a fix labeled `enhancement`).
- A hand-written changeset in `.changeset/` overrides the labels; if one is
  present, check that its bump levels are consistent with the change instead.
- Flag breaking changes hiding in "safe" places: config semantics changes in
  `config.d.ts`, changed REST endpoint behavior, removed exports, changed
  database migrations.

Also verify the repo's standing conventions:

- Strict TDD: behavior changes come with tests (`src/**/*.test.ts(x)`).
- Config options are documented in the owning package's `config.d.ts` with
  `@visibility` tags (secrets are `@visibility secret`) and in its README.
- Every exported symbol has a release tag (`@public`) and doc comment; API
  report changes are committed (`yarn build:api-reports`).
- No hardcoded Grafana URLs or tokens; the frontend never calls Grafana
  directly (backend-only, service-account Bearer token from config).

## Working in this repository

- Install: `corepack enable && yarn install --immutable` (Yarn 4 via
  Corepack — never npm, never plain global yarn).
- Test: `CI=true yarn test` (without `CI=true` Jest starts in watch mode and
  hangs). Single package: `yarn workspace <pkg> test <pattern> --watchAll=false`.
- Checks that must pass: `yarn fix:check`, `yarn prettier:check`,
  `yarn lint:all`, `yarn tsc:full`, `yarn build:api-reports --ci`,
  `yarn build:all`, `yarn test:all`.
- Database tests run on in-memory SQLite with
  `BACKSTAGE_TEST_DISABLE_DOCKER=1`; no Docker needed.
- New code follows the new Backstage backend system
  (`createBackendPlugin`/`createBackendModule`); the frontend supports both
  frontend systems (legacy exports at the package root, new system under
  `./alpha`).
