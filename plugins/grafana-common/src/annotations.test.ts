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

import { Entity } from '@backstage/catalog-model';
import {
  GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR,
  GRAFANA_ANNOTATION_DASHBOARD_SELECTOR,
  GRAFANA_ANNOTATION_INSTANCE,
  GRAFANA_ANNOTATION_TAG_SELECTOR,
  getAlertLabelSelector,
  getDashboardSelector,
  getGrafanaInstanceName,
  getTagSelector,
  isAlertsAvailable,
  isDashboardsAvailable,
  isGrafanaAvailable,
} from './annotations';

const entityWith = (annotations: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'test', annotations },
  spec: {},
});

describe('grafana annotations', () => {
  it('exposes the well-known annotation keys', () => {
    expect(GRAFANA_ANNOTATION_INSTANCE).toBe('grafana/instance');
    expect(GRAFANA_ANNOTATION_DASHBOARD_SELECTOR).toBe(
      'grafana/dashboard-selector',
    );
    expect(GRAFANA_ANNOTATION_TAG_SELECTOR).toBe('grafana/tag-selector');
    expect(GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR).toBe(
      'grafana/alert-label-selector',
    );
  });

  describe('getGrafanaInstanceName', () => {
    it('returns the configured instance name', () => {
      const entity = entityWith({ [GRAFANA_ANNOTATION_INSTANCE]: 'prod' });
      expect(getGrafanaInstanceName(entity)).toBe('prod');
    });

    it('returns undefined when the annotation is missing', () => {
      expect(getGrafanaInstanceName(entityWith({}))).toBeUndefined();
    });
  });

  describe('selector getters', () => {
    it('reads the dashboard, tag, and alert selectors', () => {
      const entity = entityWith({
        [GRAFANA_ANNOTATION_DASHBOARD_SELECTOR]: 'payments',
        [GRAFANA_ANNOTATION_TAG_SELECTOR]: 'team-a',
        [GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR]: 'team=team-a,severity=high',
      });

      expect(getDashboardSelector(entity)).toBe('payments');
      expect(getTagSelector(entity)).toBe('team-a');
      expect(getAlertLabelSelector(entity)).toBe('team=team-a,severity=high');
    });

    it('returns undefined for selectors that are not set', () => {
      const entity = entityWith({});
      expect(getDashboardSelector(entity)).toBeUndefined();
      expect(getTagSelector(entity)).toBeUndefined();
      expect(getAlertLabelSelector(entity)).toBeUndefined();
    });
  });

  describe('isGrafanaAvailable', () => {
    it('is true when any grafana annotation is present', () => {
      expect(
        isGrafanaAvailable(entityWith({ [GRAFANA_ANNOTATION_INSTANCE]: 'x' })),
      ).toBe(true);
      expect(
        isGrafanaAvailable(
          entityWith({ [GRAFANA_ANNOTATION_DASHBOARD_SELECTOR]: 'x' }),
        ),
      ).toBe(true);
      expect(
        isGrafanaAvailable(
          entityWith({ [GRAFANA_ANNOTATION_TAG_SELECTOR]: 'x' }),
        ),
      ).toBe(true);
      expect(
        isGrafanaAvailable(
          entityWith({ [GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR]: 'x' }),
        ),
      ).toBe(true);
    });

    it('is false when no grafana annotation is present', () => {
      expect(isGrafanaAvailable(entityWith({}))).toBe(false);
      expect(
        isGrafanaAvailable({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: { name: 'no-annotations' },
          spec: {},
        }),
      ).toBe(false);
    });
  });

  describe('isDashboardsAvailable', () => {
    it.each([
      [{ [GRAFANA_ANNOTATION_INSTANCE]: 'prod' }, true],
      [{ [GRAFANA_ANNOTATION_DASHBOARD_SELECTOR]: 'payments' }, true],
      [{ [GRAFANA_ANNOTATION_TAG_SELECTOR]: 'team-a' }, true],
      [{ [GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR]: 'team=a' }, false],
      [{}, false],
    ])('returns the right result for %j', (annotations, expected) => {
      expect(isDashboardsAvailable(entityWith(annotations))).toBe(expected);
    });
  });

  describe('isAlertsAvailable', () => {
    it.each([
      [{ [GRAFANA_ANNOTATION_INSTANCE]: 'prod' }, true],
      [{ [GRAFANA_ANNOTATION_ALERT_LABEL_SELECTOR]: 'team=a' }, true],
      [{ [GRAFANA_ANNOTATION_DASHBOARD_SELECTOR]: 'payments' }, false],
      [{ [GRAFANA_ANNOTATION_TAG_SELECTOR]: 'team-a' }, false],
      [{}, false],
    ])('returns the right result for %j', (annotations, expected) => {
      expect(isAlertsAvailable(entityWith(annotations))).toBe(expected);
    });
  });
});
