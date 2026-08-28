# Contributing

Thanks for your interest in improving the `@marble-sh` Grafana plugins for
Backstage! This is a standalone Backstage plugin monorepo whose layout mirrors
the [`backstage/community-plugins`](https://github.com/backstage/community-plugins)
convention.

## Prerequisites

- **Node.js** 22 or 24.
- **Yarn** 4 (pinned via `packageManager` and committed under `.yarn/`). Enable
  it with `corepack enable` — do not install Yarn globally.

## Getting started

```sh
corepack enable
yarn install
```

Everything is driven from the repo root:

| Command                  | What it does                                             |
| ------------------------ | -------------------------------------------------------- |
| `yarn test`              | Run the test suite (watch mode; use `CI=true` for once). |
| `yarn test:all`          | Run all tests with coverage.                             |
| `yarn tsc:full`          | Full type check with declarations.                       |
| `yarn lint:all`          | Lint every package.                                      |
| `yarn prettier:check`    | Check formatting (`prettier:fix` to apply).              |
| `yarn build:all`         | Build every package.                                     |
| `yarn build:api-reports` | Regenerate the `report.api.md` API reports.              |
| `yarn new`               | Scaffold a new package (`@marble-sh` scope).             |

To work on a single package:

```sh
yarn workspace @marble-sh/backstage-plugin-grafana-backend test --watchAll=false
```

To develop the frontend plugin against a standalone dev app (see
[`plugins/grafana/dev/`](plugins/grafana/dev/)):

```sh
yarn workspace @marble-sh/backstage-plugin-grafana start
```

> Tip: prefix commands with `corepack` in CI-like shells so the pinned Yarn is
> used. `yarn test` at the root runs Jest in watch mode; use
> `CI=true yarn test` for a single run.

## Development workflow

This project is developed **test-first** (red → green → refactor):

1. Write a failing test that captures the desired behavior.
2. Implement the minimum to make it pass.
3. Refactor with the tests green.

Other expectations:

- **Document as you go.** Every public export needs a TSDoc comment and a
  `@public` release tag (the API report check enforces this). Configuration
  goes in a documented `config.d.ts` with `@visibility` tags; mark tokens
  `@visibility secret`.
- **Grafana APIs:** prefer the newest generally-available API, falling back to
  the classic HTTP API only where the new one doesn't cover the need. See
  [ADR 0003](docs/adr/0003-prefer-app-platform-apis.md).
- **Architecture:** the frontend never talks to Grafana directly — all Grafana
  access lives in the backend or the shared `-node` library. See
  [ADR 0001](docs/adr/0001-read-only-backend-centric.md) and
  [ADR 0002](docs/adr/0002-shared-node-library.md).

## Versioning and changesets

All packages follow [Semantic Versioning](https://semver.org/), released via
[changesets](https://github.com/changesets/changesets). You have two ways to
version a change — the full policy lives in
[docs/versioning.md](docs/versioning.md):

- **Labels (default).** If your PR carries no changeset, one is generated on
  merge from its labels: `semver:minor` or `semver:major`/`breaking-change`
  set the bump (**patch** if unlabeled), and the type label sets the
  changelog category (`bug` → Fixed, `enhancement` → Added, `security` →
  Security, else Changed). The summary is the PR title, unless the PR
  description contains a fenced ` ```release-note ` block, which wins.
- **A hand-written changeset**, when you want precise control (different
  bumps per package, a longer summary):

  ```sh
  yarn changeset
  ```

  Pick the affected packages and a semver bump, and write a short,
  user-facing summary. A committed changeset always overrides the labels.

If a PR changes any `report.api.md` (public API surface), it is at least a
minor bump — never leave it unlabeled.

## Release

Merged changesets accumulate in an automated **"chore: version packages"**
PR, which bumps each affected `package.json` and writes the `CHANGELOG.md`
entries — one per merged PR. Merging it publishes the bumped packages to npm
and tags releases.

## Pull requests

- Keep PRs focused; fill in the PR template checklist.
- Label your PR (see [Versioning](#versioning-and-changesets) above) — the
  auto-labeler applies `area/*` labels from the changed paths, but the type
  and `semver:*` labels are yours to set.
- Make sure `yarn fix:check`, `yarn lint:all`, `yarn tsc:full`,
  `yarn prettier:check`, `yarn build:api-reports`, and `yarn test` all pass. CI
  runs the same steps on Node 22 and 24.
- Use clear commit messages ([Conventional Commits](https://www.conventionalcommits.org/)
  are encouraged, e.g. `feat(grafana): ...`).
- PRs are **squash-merged**, so the PR title becomes the commit message and
  the default changelog entry — write it user-facing.
- You can request an AI pre-review by adding `copilot` as a reviewer; it is
  briefed via `.github/copilot-instructions.md` to check semver labels
  against the actual API change.

By contributing, you agree that your contributions are licensed under the
project's [Apache-2.0 license](LICENSE).
