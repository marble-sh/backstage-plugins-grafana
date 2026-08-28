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

import { Config } from '@backstage/config';
import {
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import { GrafanaEntityOptions } from './buildEntities';

/**
 * Filters narrowing which dashboards discovery ingests.
 *
 * @public
 */
export type GrafanaDiscoveryFilter = {
  /** Only discover dashboards carrying all of these tags. */
  tags?: string[];
  /** Comma-separated title substrings; dashboards matching any are discovered. */
  query?: string;
};

/**
 * The fully-resolved configuration for the Grafana catalog discovery module.
 *
 * @public
 */
export type GrafanaDiscoveryConfig = GrafanaEntityOptions & {
  schedule: SchedulerServiceTaskScheduleDefinition;
  /** Instance names to discover; `undefined` means every configured instance. */
  instances?: string[];
  /** Dashboard filter applied during discovery. */
  filter: GrafanaDiscoveryFilter;
};

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { minutes: 30 },
  timeout: { minutes: 3 },
};

const DEFAULT_OWNER = 'group:default/grafana';

/**
 * Reads the `grafana.catalog` configuration into a resolved
 * {@link GrafanaDiscoveryConfig}, applying defaults.
 *
 * @public
 */
export function readGrafanaDiscoveryConfig(
  rootConfig: Config,
): GrafanaDiscoveryConfig {
  const config = rootConfig.getOptionalConfig('grafana.catalog');

  const scheduleConfig = config?.getOptionalConfig('schedule');

  return {
    schedule: scheduleConfig
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
      : DEFAULT_SCHEDULE,
    defaultOwner: config?.getOptionalString('defaultOwner') ?? DEFAULT_OWNER,
    system: config?.getOptionalString('system'),
    namespace: config?.getOptionalString('namespace') ?? 'default',
    emitInstances: config?.getOptionalBoolean('emitInstances') ?? true,
    emitDashboards: config?.getOptionalBoolean('emitDashboards') ?? true,
    emitTags: config?.getOptionalBoolean('emitTags') ?? true,
    instances: config?.getOptionalStringArray('instances'),
    filter: {
      tags: config?.getOptionalStringArray('filter.tags'),
      query: config?.getOptionalString('filter.query'),
    },
  };
}
