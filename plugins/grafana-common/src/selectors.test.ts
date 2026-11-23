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

import {
  parseLabelSelector,
  parseTagSelector,
  parseVariables,
} from './selectors';

describe('parseLabelSelector', () => {
  it('parses a comma-separated key=value string', () => {
    expect(parseLabelSelector('team=a,severity=high')).toEqual({
      team: 'a',
      severity: 'high',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseLabelSelector(' team = a , severity = high ')).toEqual({
      team: 'a',
      severity: 'high',
    });
  });

  it('ignores segments with an empty key', () => {
    expect(parseLabelSelector('=value,team=a')).toEqual({ team: 'a' });
    expect(parseLabelSelector(' =value')).toEqual({});
  });

  it('ignores empty and malformed segments', () => {
    expect(parseLabelSelector('team=a,,broken,=novalue,key=')).toEqual({
      team: 'a',
      key: '',
    });
  });

  it('returns an empty object for undefined or empty input', () => {
    expect(parseLabelSelector(undefined)).toEqual({});
    expect(parseLabelSelector('')).toEqual({});
  });
});

describe('parseTagSelector', () => {
  it('splits a comma-separated list and trims', () => {
    expect(parseTagSelector('team-a, prod ,shared')).toEqual([
      'team-a',
      'prod',
      'shared',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseTagSelector('a,,b,')).toEqual(['a', 'b']);
  });

  it('returns an empty array for undefined or empty input', () => {
    expect(parseTagSelector(undefined)).toEqual([]);
    expect(parseTagSelector('')).toEqual([]);
  });
});

describe('parseVariables', () => {
  it('parses name=value pairs, trimming whitespace', () => {
    expect(
      parseVariables('organization=my-org, repository = my-repo '),
    ).toEqual({ organization: 'my-org', repository: 'my-repo' });
  });

  it('keeps = characters inside values and allows url-ish values', () => {
    expect(parseVariables('filter=a=b, repo=org/name')).toEqual({
      filter: 'a=b',
      repo: 'org/name',
    });
  });

  it('ignores malformed segments, invalid variable names, and empty values', () => {
    expect(
      parseVariables('no-equals, =value, 1bad=x, bad-name=x, ok_1=yes, empty='),
    ).toEqual({ ok_1: 'yes' });
  });

  it('returns an empty object for undefined or empty input', () => {
    expect(parseVariables(undefined)).toEqual({});
    expect(parseVariables('')).toEqual({});
  });
});
