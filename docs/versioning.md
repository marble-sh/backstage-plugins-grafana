# Versioning and release notes

This repository follows [Semantic Versioning 2.0.0](https://semver.org/) and
keeps changelogs in the spirit of [Keep a Changelog](https://keepachangelog.com/).
Every merged pull request produces a version bump and a changelog entry —
either from a hand-written changeset, or automatically from the PR's labels.

## SemVer policy

Given a version `MAJOR.MINOR.PATCH`:

| Bump      | When                                                                                                                         | PR label                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **MAJOR** | Backwards-incompatible changes: removed/renamed public API, changed config semantics, dropped Node/Backstage version support | `semver:major` or `breaking-change`                            |
| **MINOR** | New backwards-compatible functionality: new exports, new config options, new endpoints                                       | `semver:minor`                                                 |
| **PATCH** | Backwards-compatible fixes and internal changes: bug fixes, performance, docs, refactors, dependency bumps                   | `semver:patch` — or **no label at all** (patch is the default) |

Rules of precedence when multiple labels are present:
`semver:major`/`breaking-change` > `semver:minor` > patch.

"Public API" is what the `report.api.md` files document — if
`yarn build:api-reports` shows a removed or changed symbol, the change is at
least minor and probably major.

## How a merge becomes a release

1. **You open a PR.** The auto-labeler applies `area/*` labels; you (or a
   reviewer) add a type label (`bug`, `enhancement`, `security`, …) and, if the
   change is more than a patch, `semver:minor` or `semver:major`.
2. **The PR merges.** The **Version Bump** workflow
   (`.github/workflows/version-bump.yml`) checks whether the PR carried a
   hand-written changeset (`.changeset/*.md`):
   - **Yes** → it does nothing; your changeset is used as-is.
   - **No** → it generates `.changeset/auto-pr-<N>.md` covering every
     publishable package the PR touched, with the bump level from the labels
     above, and pushes it to `main`.
3. **The Release workflow** (changesets) opens or updates the
   **"Version Packages"** PR, which accumulates one changelog line per merged
   PR and bumps each affected `package.json`.
4. **Merging "Version Packages"** publishes the bumped packages to npm and
   tags releases. Each package's `CHANGELOG.md` records what every merged PR
   did, at which version.

So the "Version Packages" PR is the running answer to _"what has shipped since
the last release?"_ — one entry per merged PR, each linking back to it.

## Changelog entries

Auto-generated changeset summaries look like:

```
**Fixed:** handle dashboards without a folder uid ([#42](…/pull/42))
```

The **category prefix** comes from the PR's type label, mapped to
Keep a Changelog sections:

| PR label                                                                      | Changelog category |
| ----------------------------------------------------------------------------- | ------------------ |
| `enhancement`                                                                 | **Added**          |
| `bug`                                                                         | **Fixed**          |
| `security`                                                                    | **Security**       |
| anything else (`refactor`, `documentation`, `performance`, `dependencies`, …) | **Changed**        |

The **summary text** is the PR title, unless the PR description contains a
fenced `release-note` block, which takes precedence — use it when the title is
too terse for users:

````markdown
```release-note
The catalog provider now retries failed Grafana fetches with the last-known-good
snapshot instead of dropping entities.
```
````

To take full manual control for a given PR, commit a changeset yourself
(`yarn changeset`) — the workflow always defers to a hand-written one.

## Repo-level release notes

GitHub's **auto-generated release notes** are configured in
[`.github/release.yml`](../.github/release.yml): when you draft a GitHub
Release and click _Generate release notes_, merged PRs are grouped into
sections (💥 Breaking changes, ✨ Added, 🐛 Fixed, 🔒 Security, 📝
Documentation, 📦 Dependencies, 🔧 Changed) by the same labels. This
complements the per-package `CHANGELOG.md` files that changesets maintains.

## Which packages get bumped?

The generated changeset covers every **publishable** workspace under
`plugins/*` that the PR changed files in (private packages are skipped).
Changesets then cascades `updateInternalDependencies: patch` bumps to
dependents automatically. PRs that touch no plugin code (CI, docs at the repo
root, templates) produce no changeset and no release — by design.

## Gotchas

- The Version Bump workflow runs on `pull_request_target` and never executes
  PR code; it only reads PR metadata. Keep it that way when editing it.
- Pushes made with `GITHUB_TOKEN` don't trigger `on: push` workflows, so the
  workflow dispatches `release.yml` explicitly after pushing the changeset.
- `.github/release.yml` (release-notes config) and
  `.github/workflows/release.yml` (publish workflow) are different files that
  happen to share a name.
