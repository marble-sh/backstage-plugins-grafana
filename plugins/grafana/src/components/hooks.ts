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

import { useEntity } from '@backstage/plugin-catalog-react';
import {
  getAlertLabelSelector,
  getDashboardSelector,
  getDashboardUid,
  getGrafanaInstanceName,
  getGrafanaVariables,
  getTagSelector,
  parseLabelSelector,
  parseTagSelector,
  parseVariables,
} from '@marble-sh/backstage-plugin-grafana-common';
import { ListAlertsRequest, ListDashboardsRequest } from '../api';

/** Reads the current entity's dashboard selector annotations into a request. */
export const useDashboardsRequest = (): ListDashboardsRequest => {
  const { entity } = useEntity();
  return {
    instanceName: getGrafanaInstanceName(entity),
    tags: parseTagSelector(getTagSelector(entity)),
    query: getDashboardSelector(entity),
    uid: getDashboardUid(entity),
  };
};

/** Reads the current entity's alert selector annotations into a request. */
export const useAlertsRequest = (): ListAlertsRequest => {
  const { entity } = useEntity();
  return {
    instanceName: getGrafanaInstanceName(entity),
    labelSelector: parseLabelSelector(getAlertLabelSelector(entity)),
  };
};

/**
 * Reads the current entity's `grafana/variables` annotation into dashboard
 * template variable overrides, or `undefined` when the entity has none.
 */
export const useGrafanaVariables = (): Record<string, string> | undefined => {
  const { entity } = useEntity();
  const variables = parseVariables(getGrafanaVariables(entity));
  return Object.keys(variables).length > 0 ? variables : undefined;
};
