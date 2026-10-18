import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsDates, buildAnalyticsSeries, buildUsageHistory, formatAnalyticsDate, totalSeries, usageGrouping } from '../src/usage-analytics.ts';

const now = new Date(2026, 9, 17, 14, 30).getTime();

test('analytics periods use local calendar days, include today and have no future dates', () => {
  for (const days of [7, 30] as const) {
    const dates = analyticsDates(now, days);
    assert.equal(dates.length, days);
    assert.equal(formatAnalyticsDate(dates.at(-1)!), '2026/10/17');
    assert.ok(dates.every(date => date.getTime() <= now));
    assert.equal(new Set(dates.map(date => formatAnalyticsDate(date))).size, days);
    const previous = analyticsDates(now, days, 1);
    const expected = new Date(dates[0]); expected.setDate(expected.getDate() - 1);
    assert.equal(formatAnalyticsDate(previous.at(-1)!), formatAnalyticsDate(expected));
  }
});

test('calendar periods span the year boundary and leap day without skipping dates', () => {
  const year = analyticsDates(new Date(2027, 0, 2).getTime(), 7);
  assert.equal(formatAnalyticsDate(year[0]), '2026/12/27');
  assert.equal(formatAnalyticsDate(year.at(-1)!), '2027/1/2');
  const leap = analyticsDates(new Date(2024, 2, 2).getTime(), 7);
  assert.ok(leap.some(date => formatAnalyticsDate(date) === '2024/2/29'));
  assert.equal(new Set(leap.map(date => formatAnalyticsDate(date))).size, 7);
});

test('reference week counters equal the sum of their displayed series', () => {
  const dates = analyticsDates(now, 7);
  assert.equal(totalSeries(buildAnalyticsSeries('plugins', dates)), 1435);
  assert.equal(totalSeries(buildAnalyticsSeries('skills', dates)), 53);
  assert.equal(totalSeries(buildAnalyticsSeries('messages', dates)), 792);
});

test('30 day charts keep the same values for overlapping dates and grouping preserves totals', () => {
  const week = analyticsDates(now, 7), month = analyticsDates(now, 30);
  for (const type of ['plugins', 'skills', 'messages'] as const) {
    const short = buildAnalyticsSeries(type, week), long = buildAnalyticsSeries(type, month);
    short.forEach((series, index) => assert.deepEqual(long[index].values.slice(-7), series.values));
    assert.ok(totalSeries(long) > totalSeries(short));
  }
  const models = buildAnalyticsSeries('messages', week);
  const platforms = buildAnalyticsSeries('messages', week, true);
  assert.equal(totalSeries(models), totalSeries(platforms));
  week.forEach((_, index) => assert.equal(models.reduce((sum, s) => sum + s.values[index], 0), platforms.reduce((sum, s) => sum + s.values[index], 0)));
});

test('usage grouping changes categories without altering each day total', () => {
  const dates = analyticsDates(now, 7);
  const baseline = buildUsageHistory(dates, '按功能');
  const totals = dates.map((_, i) => baseline.reduce((sum, series) => sum + series.values[i], 0));
  for (const group of usageGrouping) {
    const grouped = buildUsageHistory(dates, group);
    assert.deepEqual(dates.map((_, i) => grouped.reduce((sum, series) => sum + series.values[i], 0)), totals);
    assert.ok(grouped.every(series => series.values.every(value => Number.isInteger(value) && value >= 0)));
  }
});


test('early morning and daylight saving transitions keep one point per local day', () => {
  for (const date of [new Date(2026, 2, 9, 0, 5), new Date(2026, 10, 2, 0, 5), new Date(2027, 0, 1, 0, 1)]) {
    const dates = analyticsDates(date.getTime(), 7);
    assert.ok(dates.every(day => day.getTime() <= date.getTime()));
    assert.equal(new Set(dates.map(day => formatAnalyticsDate(day))).size, 7);
    assert.equal(formatAnalyticsDate(dates.at(-1)!), formatAnalyticsDate(date));
    assert.ok(dates.every((day, index) => index === 0 || day.getTime() > dates[index - 1].getTime()));
  }
});
