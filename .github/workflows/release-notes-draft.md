---
# GitHub Agentic Workflow (public preview): drafts user-facing release notes
# on the changesets "Version Packages" PR.
#
# This file is the source; it must be compiled to a .lock.yml with
# `gh aw compile` before it runs (see init-workflows.md at the repo root).

on:
  pull_request:
    types: [opened, synchronize]
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

network: defaults

engine: copilot

tools:
  github:
    toolsets: [default]

safe-outputs:
  add-comment:

max-ai-credits: 50
---

# Draft release notes for the Version Packages PR

Only act if the current pull request is the changesets **"Version Packages"**
PR (titled "chore: version packages", from the `changeset-release/main`
branch, authored by github-actions). For any other pull request, stop
immediately without commenting.

This PR aggregates all pending changesets: its diff bumps `package.json`
versions and prepends entries to the per-package `CHANGELOG.md` files. Each
entry references the pull request it came from.

Write a **user-facing release-notes draft** and post it as a single comment
on this PR (replace/update your previous comment if you already posted one
for an earlier revision instead of stacking new ones):

1. Read the CHANGELOG additions in this PR's diff to see which packages are
   being released, at which versions, with which entries.
2. Follow each referenced pull request; read its description and, where the
   description is thin, skim its code changes to understand the actual
   user-visible impact.
3. Organize the draft using Keep a Changelog sections in this order, omitting
   empty ones: **Breaking changes**, **Added**, **Changed**, **Fixed**,
   **Security**. The changelog entries are already prefixed with a category
   (e.g. `**Fixed:**`) — use those, but correct a category if the actual
   change clearly belongs elsewhere.
4. Write for plugin users (Backstage integrators), not for contributors:
   lead with impact and any action required (config changes, new
   annotations, migration steps), not with implementation details.
5. Start the comment with `## 📋 Release notes draft`, then a one-paragraph
   summary of the release, then the sections. List the packages and their
   new versions in a short table at the end. Note that the draft can be
   pasted into the GitHub Release description after merge.

Keep the draft concise: one bullet per change, linking the originating PR.
