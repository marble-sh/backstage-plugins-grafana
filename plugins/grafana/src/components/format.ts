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

const TWO_DAYS_MS = 2 * 86_400_000;

/** Formats a metric value compactly (1234567 -> "1.2M"). */
export const formatMetricValue = (value: number): string =>
  new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  })
    .format(value)
    .toLowerCase();

/** Formats an axis tick: time-of-day for short ranges, dates for long ones. */
export const formatTimeTick = (timeMs: number, spanMs: number): string =>
  new Intl.DateTimeFormat(
    undefined,
    spanMs > TWO_DAYS_MS
      ? { month: 'short', day: 'numeric' }
      : { hour: '2-digit', minute: '2-digit', hour12: false },
  )
    .format(timeMs)
    .toLowerCase();

/** Formats a full timestamp, for tooltips and "active since" columns. */
export const formatTimeFull = (timeMs: number): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(timeMs)
    .toLowerCase();
