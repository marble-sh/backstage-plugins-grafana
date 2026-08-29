#!/usr/bin/env node
/*
 * Copyright 2026 Cassidy Marble
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Publishes every public workspace from a `yarn pack` tarball.
 *
 * `changeset publish` shells out to plain `npm publish`, which bypasses
 * Yarn's pack hooks — the published manifests keep the raw `workspace:^`
 * and `backstage:^` ranges and are uninstallable outside this monorepo.
 * Packing with Yarn materializes those ranges into real semver, and
 * publishing the resulting tarball with the npm CLI keeps npm OIDC
 * trusted publishing working (Yarn's own publish command cannot perform
 * the OIDC token exchange).
 *
 * Already-published versions are skipped, so a partially failed release
 * run can be safely retried (the `--tolerate-republish` behavior).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', ...opts });

const workspaces = run('yarn', ['workspaces', 'list', '--no-private', '--json'])
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));

const tmp = mkdtempSync(join(tmpdir(), 'release-publish-'));
const failures = [];

for (const { name, location } of workspaces) {
  const { version } = JSON.parse(
    readFileSync(join(location, 'package.json'), 'utf8'),
  );
  const spec = `${name}@${version}`;

  try {
    run('npm', ['view', spec, 'version'], { stdio: 'ignore' });
    console.log(`Skipping ${spec} (already published)`);
    continue;
  } catch {
    // Not on the registry yet — publish it.
  }

  const tarball = join(tmp, `${name.replace(/[@/]/g, '-')}-${version}.tgz`);
  try {
    run('yarn', ['workspace', name, 'pack', '--out', tarball], {
      stdio: 'inherit',
    });
    run('npm', ['publish', tarball, '--access', 'public'], {
      stdio: 'inherit',
    });
    console.log(`Published ${spec}`);
  } catch (error) {
    // Keep going so one bad package doesn't strand the rest of the release.
    failures.push(spec);
    console.error(`Failed to publish ${spec}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(`Failed to publish: ${failures.join(', ')}`);
  process.exit(1);
}
