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

import '@testing-library/jest-dom';

// TODO: Remove the below code when backstage has been updated to mui v5.

// eslint-disable-next-line no-console
const realConsoleError = console.error.bind(console);

// Material UI's @material-ui/core@v4 uses deprecated functions.
// As these are transitive dependencies to backstage itself there's nothing I can do here.
const muiErrors = [
  'findDOMNode is deprecated and will be removed',
  'Support for defaultProps will be removed',
];

const checkArg = (arg: any) => {
  if (typeof arg === 'string') {
    for (const error of muiErrors) {
      if (arg.includes(error)) {
        return true;
      }
    }
  }
  return false;
};

jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {
  if (args.some((arg: any) => checkArg(arg))) {
    return;
  }
  realConsoleError(...args);
});
