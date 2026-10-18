import assert from 'node:assert/strict';
import test from 'node:test';
import { activityDetails, activityTotals, createActivityCalendar, dailyActivityLevel, formatTokenAmount, type ActivityCalendar } from '../src/profile-activity.ts';

const sampleDays = (now: Date) => Array.from({ length: 365 }, (_, index) => ({ date: Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - (364 - index) * 86_400_000, tokens: 200_000_000 }));
const at = (month: number, day: number, year = 2026) => {
  const now = new Date(year, month - 1, day, 12);
  return createActivityCalendar(sampleDays(now), now);
};
const empty = () => {
  const calendar = at(10, 17);
  calendar.weeks = calendar.weeks.map(week => week.map(value => value === null ? null : 0));
  return calendar;
};
const slot = (calendar: ActivityCalendar, date: number) => {
  const index = (date - calendar.start) / 86_400_000;
  return [Math.floor(index / 7), index % 7] as const;
};

test('daily colors follow fixed token bands, including the exact upper boundaries', () => {
  for (const [tokens, level] of [
    [0, 0], [1, 1], [100_000_000, 1], [200_000_000, 1],
    [200_000_001, 2], [300_000_000, 2], [400_000_000, 2],
    [400_000_001, 3], [500_000_000, 3], [600_000_000, 3],
    [600_000_001, 4], [1_000_000_000, 4],
  ] as const) assert.equal(dailyActivityLevel(tokens), level, `${tokens} tokens`);
});

test('equal daily amounts keep their color when a distant peak enters or leaves the visible year', () => {
  const date = Date.UTC(2026, 9, 17);
  const ordinary = [0, 150_000_000, 300_000_000, 500_000_000, 700_000_000, 300_000_000];
  const days = ordinary.map((tokens, index) => ({ date: date - index * 86_400_000, tokens }));
  for (const peakDate of [Date.UTC(2025, 0, 1), Date.UTC(2026, 0, 1), Date.UTC(2026, 9, 18)]) {
    const calendar = createActivityCalendar([...days, { date: peakDate, tokens: 1_000_000_000 }], new Date(2026, 9, 17, 12));
    const levels = days.map(day => dailyActivityLevel(activityDetails(calendar, '每天', ...slot(calendar, day.date))!.tokens));
    assert.deepEqual(levels, [0, 1, 2, 3, 4, 2]);
  }
});

test('weekly and cumulative totals ignore padding and preserve source days', () => {
  const weeks = Object.freeze([Object.freeze([2, 3, null]), Object.freeze([0, 0, 0]), Object.freeze([7, 1, 2])]);
  assert.deepEqual(activityTotals(weeks), [5, 0, 10]);
  assert.deepEqual(activityTotals(weeks, true), [5, 5, 15]);
  assert.deepEqual(activityTotals([]), []);
  assert.deepEqual(weeks[0], [2, 3, null]);
});

test('October calendar ends today, not October 31, with no empty future week', () => {
  const calendar = at(10, 17);
  assert.equal(calendar.weeks.length, 53);
  assert.equal(calendar.weeks.flat().filter(value => value !== null).length, 365);
  assert.equal(activityDetails(calendar, '每天', 52, 6)?.label, '2026年10月17日');
  assert.equal(activityDetails(calendar, '每天', 53, 0), null);
  assert.ok(activityTotals(calendar.weeks).every(value => value > 0));
  const october = calendar.weeks.flatMap((week, w) => week.map((_, d) => activityDetails(calendar, '每天', w, d)))
    .filter(entry => entry?.label.startsWith('2026年10月'));
  assert.equal(october.length, 17);
});

test('every weekday clips future cells to the single current week in all modes', () => {
  for (let day = 18; day <= 24; day += 1) {
    const calendar = at(10, day);
    assert.equal(calendar.lastDay % 7, day - 18);
    for (let row = 0; row < 7; row += 1) {
      for (const mode of ['每天', '每周', '累计总量'] as const) {
        assert.equal(activityDetails(calendar, mode, 52, row) === null, row > day - 18);
      }
    }
    assert.ok(activityTotals(calendar.weeks).every(value => value > 0));
  }
});

test('before-start dates are zero and the calendar displays supplied exact daily values', () => {
  const now = new Date(2026, 9, 17, 12);
  const calendar = createActivityCalendar([{ date: Date.UTC(2026, 9, 16), tokens: 123_456_789 }, { date: Date.UTC(2026, 9, 17), tokens: 500_000_000 }], now);
  assert.equal(activityDetails(calendar, '每天', ...slot(calendar, Date.UTC(2026, 9, 15)))?.tokens, 0);
  assert.equal(activityDetails(calendar, '每天', ...slot(calendar, Date.UTC(2026, 9, 16)))?.tokens, 123_456_789);
  assert.equal(calendar.peakTokens, 500_000_000);
});

test('cumulative view includes history before the visible year, but excludes future data', () => {
  const now = new Date(2026, 9, 17, 12);
  const calendar = createActivityCalendar([{ date: Date.UTC(2024, 0, 1), tokens: 700 }, { date: Date.UTC(2026, 9, 17), tokens: 300 }, { date: Date.UTC(2026, 9, 18), tokens: 5000 }], now);
  assert.equal(calendar.priorTokens, 700);
  assert.equal(calendar.peakTokens, 700);
  assert.equal(activityDetails(calendar, '累计总量', 52, 6)?.tokens, 1000);
  assert.equal(activityTotals(calendar.weeks, true, calendar.priorTokens).at(-1), 1000);
  assert.equal(activityDetails(calendar, '每周', 52, 6)?.tokens, 300);
});

test('daily labels and exact token counts use the selected calendar date', () => {
  const calendar = empty();
  const [w, d] = slot(calendar, Date.UTC(2026, 0, 1));
  calendar.weeks[w][d] = 123_456_789;
  assert.deepEqual(activityDetails(calendar, '每天', w, d), {
    label: '2026年1月1日', tokens: 123_456_789, exactTokens: '123,456,789',
  });
});

test('weekly ranges cross years and stop at today for an incomplete week', () => {
  const calendar = empty();
  const [week] = slot(calendar, Date.UTC(2026, 0, 1));
  calendar.weeks[week] = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(activityDetails(calendar, '每周', week, 4), {
    label: '2025年12月28日 – 2026年1月3日', tokens: 28, exactTokens: '28',
  });
  const monday = at(10, 19);
  assert.equal(activityDetails(monday, '每周', 52, 0)?.label, '2026年10月18日 – 2026年10月19日');
  assert.equal(activityDetails(monday, '每周', 52, 1)?.tokens, monday.weeks[52][0]! + monday.weeks[52][1]!);
});

test('cumulative totals include only dates through the selected week', () => {
  const calendar = empty();
  calendar.weeks[0][calendar.firstDay] = 7;
  calendar.weeks[1][0] = 2;
  calendar.weeks[2][0] = 100;
  assert.equal(activityDetails(calendar, '累计总量', 1, 0)?.tokens, 9);
  const current = at(10, 19);
  const last = activityDetails(current, '累计总量', 52, 1);
  assert.equal(last?.label, '截至 2026年10月19日');
  assert.equal(last?.tokens, activityTotals(current.weeks).reduce((sum, value) => sum + value, 0));
});

test('invalid indexes and missing or padding cells are not selectable', () => {
  const calendar = empty();
  for (const [week, day] of [[-1, 6], [53, 0], [1, -1], [1, 7], [1.5, 0], [1, 0.5], [NaN, 0], [1, Infinity], [0, 0]]) {
    assert.equal(activityDetails(calendar, '每天', week, day), null);
  }
  assert.equal(activityDetails({ ...calendar, weeks: [] }, '每天', 0, 6), null);
  assert.equal(activityDetails(calendar, '每天', 52, 6)?.tokens, 0);
});

test('month labels follow actual columns and never include a future month', () => {
  for (const calendar of [at(10, 17), at(11, 1), at(1, 1), at(2, 29, 2024)]) {
    for (const month of calendar.months) {
      const weekDates = calendar.weeks[month.column].map((value, day) => value === null ? null : new Date(calendar.start + (month.column * 7 + day) * 86_400_000));
      assert.ok(weekDates.some(date => date?.getUTCDate() === 1 && `${date.getUTCMonth() + 1}月` === month.label));
    }
  }
  assert.equal(at(10, 17).months.at(-1)?.label, '10月');
  assert.equal(at(11, 1).months.at(-1)?.label, '11月');
});

test('local day boundaries, year changes and leap day use calendar arithmetic', () => {
  for (const [year, month, day] of [[2026, 1, 1], [2024, 2, 29], [2026, 3, 8], [2026, 11, 1]]) {
    for (const hour of [0, 23]) {
      const now = new Date(year, month - 1, day, hour, 30);
      const calendar = createActivityCalendar(sampleDays(now), now);
      assert.equal(calendar.end, Date.UTC(year, month - 1, day));
      assert.equal(calendar.weeks.flat().filter(value => value !== null).length, 365);
      assert.equal(activityDetails(calendar, '每天', 52, calendar.lastDay % 7)?.label, `${year}年${month}月${day}日`);
    }
  }
});

test('hundred-million values always retain two decimal places', () => {
  for (const [amount, expected] of [
    [0, '0'], [9999, '9,999'], [10_000, '1万'], [18_000, '1.8万'],
    [100_000_000, '1.00亿'], [123_456_789, '1.23亿'], [500_000_000, '5.00亿'],
  ] as const) assert.equal(formatTokenAmount(amount), expected);
});
