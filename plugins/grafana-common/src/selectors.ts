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
 * Parses a `key=value,key2=value2` label selector string (as used by the
 * `grafana/alert-label-selector` annotation) into a record. Whitespace around
 * keys and values is trimmed, and empty or malformed segments are ignored.
 *
 * @public
 */
export function parseLabelSelector(
  selector: string | undefined,
): Record<string, string> {
  if (!selector) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const segment of selector.split(',')) {
    const index = segment.indexOf('=');
    if (index <= 0) {
      continue;
    }
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parses a comma-separated tag list (as used by the `grafana/tag-selector`
 * annotation) into an array of trimmed, non-empty tags.
 *
 * @public
 */
export function parseTagSelector(selector: string | undefined): string[] {
  if (!selector) {
    return [];
  }
  return selector
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}
