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
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('grafana__snapshots', table => {
    table.comment('Latest Grafana data snapshot per configured instance');
    table
      .string('instance')
      .primary()
      .notNullable()
      .comment('The configured Grafana instance name');
    table
      .text('dashboards')
      .notNullable()
      .comment('JSON-encoded array of dashboards');
    table.text('alerts').notNullable().comment('JSON-encoded array of alerts');
    table
      .text('fetched_at')
      .notNullable()
      .comment('ISO-8601 timestamp of when the snapshot was read from Grafana');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('grafana__snapshots');
};
