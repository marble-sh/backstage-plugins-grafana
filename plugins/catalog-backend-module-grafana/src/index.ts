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
 * A catalog backend module that discovers Grafana instances and dashboards as
 * catalog Resource entities.
 *
 * @packageDocumentation
 */

export { catalogModuleGrafana as default } from './module';
export { GrafanaEntityProvider } from './GrafanaEntityProvider';
export { buildGrafanaEntities } from './buildEntities';
export type { GrafanaEntityOptions } from './buildEntities';
export { readGrafanaDiscoveryConfig } from './config';
export type { GrafanaDiscoveryConfig, GrafanaDiscoveryFilter } from './config';
