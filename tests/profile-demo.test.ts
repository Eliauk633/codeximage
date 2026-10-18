import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileUsage, getDefaultProfileDemo, restoreProfileDemo, type ProfileDemoConfig } from '../src/profile-demo.ts';

const dayLength = 86_400_000;
const now = new Date(2026, 9, 17, 12);
const today = Date.UTC(2026, 9, 17);
const dateText = (date: number) => new Date(date).toISOString().slice(0, 10);

function verify(config: ProfileDemoConfig, at = now) {
  const result = createProfileUsage(config, at);
  assert.ok(result.ok, result.ok ? '' : result.error);
  const start = Date.parse(`${config.startDate}T00:00:00Z`);
  const end = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  assert.equal(result.days.length, (end - start) / dayLength + 1);
  assert.ok(result.days[0].tokens > 0, 'the first use date must have positive activity');
  assert.equal(result.days.filter(day => day.tokens === 0).length, config.gapDays);
  const peaks = result.days.filter(day => day.tokens === config.peakTokens);
  assert.equal(peaks.length, 1, 'there must be exactly one peak day');
  const startDay = new Date(start);
  const month = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth() + 1,
    Math.min(startDay.getUTCDate(), new Date(Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth() + 2, 0)).getUTCDate()));
  if (end >= month) assert.ok(peaks[0].date >= month, 'a mature history must place its peak after its first calendar month');
  const zeroDaysByWeek = new Map<number, number>();
  const mask = result.days.map((day, index) => {
    assert.equal(day.date, start + index * dayLength);
    assert.ok(Number.isSafeInteger(day.tokens) && day.tokens >= 0);
    if (day.tokens > 0) {
      assert.ok(day.tokens >= Math.max(1, config.minDailyTokens));
      assert.ok(day.tokens === config.peakTokens || (day.tokens <= config.maxDailyTokens && day.tokens < config.peakTokens));
    } else {
      const weekday = (new Date(day.date).getUTCDay() + 6) % 7;
      const monday = day.date - weekday * dayLength;
      zeroDaysByWeek.set(monday, (zeroDaysByWeek.get(monday) ?? 0) + 1);
    }
    return day.tokens > 0 ? '1' : '0';
  }).join('');
  assert.ok([...zeroDaysByWeek.values()].every(count => count <= 2), 'each Monday–Sunday week permits at most two zero days');
  const measured = {
    totalTokens: result.days.reduce((sum, day) => sum + day.tokens, 0),
    peakTokens: result.days.reduce((maximum, day) => Math.max(maximum, day.tokens), 0),
    longestStreak: mask.split('0').reduce((maximum, run) => Math.max(maximum, run.length), 0),
    currentStreak: /1*$/.exec(mask)![0].length,
  };
  assert.deepEqual(measured, {
    totalTokens: config.totalTokens, peakTokens: config.peakTokens,
    longestStreak: config.longestStreak, currentStreak: config.currentStreak,
  });
  assert.deepEqual(result.stats, measured);
  return result;
}

test('defaults generate exactly the five displayed values over 112 local calendar dates', () => {
  const config = getDefaultProfileDemo(now);
  assert.deepEqual(config, {
    totalTokens: 23_790_000_000, peakTokens: 1_330_000_000, durationMinutes: 1940,
    longestStreak: 45, currentStreak: 33, minDailyTokens: 100_000_000,
    maxDailyTokens: 500_000_000, startDate: '2026-06-28', gapDays: 2,
  });
  assert.equal(verify(config).days.length, 112);
});

test('daily usage includes low and high multi-day runs with decimals across the ordinary range', () => {
  const config = getDefaultProfileDemo(now);
  const days = verify(config).days;
  const active = days.filter(day => day.tokens > 0 && day.tokens !== config.peakTokens);
  const visibleValues = new Set(active.map(day => (day.tokens / 100_000_000).toFixed(2)));
  assert.ok(days.some((day, index) => day.tokens >= config.minDailyTokens && day.tokens <= 200_000_000
    && (days[index + 1]?.tokens ?? 0) >= config.minDailyTokens && days[index + 1].tokens <= 200_000_000), 'low usage can persist across consecutive days');
  assert.ok(days.some((day, index) => day.tokens >= 400_000_000 && day.tokens < config.peakTokens
    && (days[index + 1]?.tokens ?? 0) >= 400_000_000 && days[index + 1]?.tokens !== config.peakTokens), 'ordinary high usage can persist across consecutive days');
  for (const [lower, upper] of [[0, 2e8], [2e8, 3e8], [3e8, 4e8], [4e8, 5e8]]) {
    assert.ok(active.some(day => day.tokens > lower && day.tokens <= upper), `ordinary values cover ${lower}–${upper}`);
  }
  assert.ok(visibleValues.size >= active.length / 5, 'intermediate days retain decimal variation');
  assert.ok(active.some(day => day.tokens % 100_000_000 !== 0));
});

test('low usage has visible decimal variation instead of piling up at the configured minimum', () => {
  const config = { ...getDefaultProfileDemo(now), totalTokens: 23_700_000_000, peakTokens: 1_310_000_000,
    minDailyTokens: 50_000_000, maxDailyTokens: 1_310_000_000, startDate: '2026-06-22', gapDays: 6 };
  const low = verify(config).days.filter(day => day.tokens > 0 && day.tokens <= 200_000_000);
  assert.ok(low.length > 20, 'the real profile still has a substantial low-usage band');
  assert.ok(low.filter(day => day.tokens === config.minDailyTokens).length < low.length / 4, 'a flexible total must not clamp most low days to 50 million');
  assert.ok(new Set(low.map(day => (day.tokens / 100_000_000).toFixed(2))).size > low.length / 2, 'variation remains visible at two decimal places');
  assert.ok(Math.max(...low.map(day => day.tokens)) - Math.min(...low.map(day => day.tokens)) > 100_000_000, 'low values vary across the band');
});

test('one billion-token peak may exceed the 100–500 million ordinary range', () => {
  const config = { ...getDefaultProfileDemo(now), peakTokens: 1_000_000_000, maxDailyTokens: 500_000_000 };
  verify(config);
  const ordinaryCount = 109;
  for (const totalTokens of [1_000_000_000 + ordinaryCount * 100_000_000, 1_000_000_000 + ordinaryCount * 500_000_000]) verify({ ...config, totalTokens });
  for (const totalTokens of [11_899_999_999, 55_500_000_001]) {
    const result = createProfileUsage({ ...config, totalTokens }, now);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /累计/);
  }
});

test('peak dates are random eligible days after a clamped calendar month, or anywhere for short histories', () => {
  for (const [startDate, endDate, earliest] of [
    ['2026-01-31', '2026-02-28', '2026-02-28'],
    ['2024-01-31', '2024-02-29', '2024-02-29'],
    ['2026-12-31', '2027-01-31', '2027-01-31'],
    ['2026-06-22', '2026-08-22', '2026-07-22'],
    ['2026-10-01', '2026-10-17', '2026-10-01'],
  ]) {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    const count = (end - start) / dayLength + 1;
    const date = new Date(end);
    const at = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12);
    const selected = new Set<number>();
    for (let totalTokens = count + 9; totalTokens < count + 19; totalTokens++) {
      const config = { ...getDefaultProfileDemo(at), startDate, totalTokens, peakTokens: 10,
        minDailyTokens: 1, maxDailyTokens: 5, gapDays: 0, longestStreak: count, currentStreak: count };
      const result = verify(config, at);
      const peak = result.days.find(day => day.tokens === 10)!;
      assert.ok(peak.date >= Date.parse(`${earliest}T00:00:00Z`));
      selected.add(peak.date);
    }
    if (earliest !== endDate) assert.ok(selected.size > 1, 'peak is not fixed to the month boundary or first day');
  }
});

test('peak eligibility can choose a different valid gap layout rather than falsely reject a mature history', () => {
  const config = { ...getDefaultProfileDemo(now), startDate: '2026-01-01', totalTokens: 34, peakTokens: 10,
    minDailyTokens: 1, maxDailyTokens: 5, gapDays: 8, longestStreak: 7, currentStreak: 0 };
  const result = verify(config, new Date(2026, 1, 2, 12));
  assert.equal(result.days.find(day => day.tokens === 10)?.date, Date.UTC(2026, 1, 1));
  const impossible = createProfileUsage({ ...config, totalTokens: 40, gapDays: 1, longestStreak: 31 }, new Date(2026, 1, 1, 12));
  assert.equal(impossible.ok, false);
  if (!impossible.ok) assert.match(impossible.error, /峰值.*活跃|活跃.*峰值/);
});

test('the reported profile covers feasible dates instead of clustering avoidable zero-use weeks', () => {
  const config = { ...getDefaultProfileDemo(now), totalTokens: 23_700_000_000, peakTokens: 1_310_000_000,
    minDailyTokens: 80_000_000, maxDailyTokens: 1_310_000_000, startDate: '2026-06-22' };
  const result = verify(config);
  const inactive = result.days.filter(day => day.tokens === 0);
  assert.equal(inactive.length, 2, '118 days need only two interruptions to preserve 45/33-day runs');
  assert.ok(inactive.every((day, index) => index === 0 || day.date - inactive[index - 1].date > dayLength));
});

test('a requested gap total cannot override the two-zero-day limit of a natural week', () => {
  const config = { ...getDefaultProfileDemo(now), totalTokens: 10, peakTokens: 1,
    minDailyTokens: 1, maxDailyTokens: 1, longestStreak: 3, currentStreak: 2,
    startDate: dateText(today - 29 * dayLength), gapDays: 20 };
  const result = createProfileUsage(config, now);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /每自然周.*2.*间隔/);
});

test('the same configuration and local day are stable and duration does not alter usage', () => {
  const config = Object.freeze(getDefaultProfileDemo(now));
  const first = verify(config);
  assert.deepEqual(createProfileUsage(config, new Date(2026, 9, 17, 23, 59)), first);
  assert.deepEqual(createProfileUsage({ ...config, durationMinutes: 1234 }, now), first);
});

test('a bounded independent oracle agrees on fixed gaps and weekly streak feasibility', () => {
  const defaults = getDefaultProfileDemo(now);
  // Only this test enumerates small masks; the production generator constructs its runs directly.
  for (let length = 1; length <= 9; length += 1) {
    const start = today - (length - 1) * dayLength;
    const weekday = (new Date(start).getUTCDay() + 6) % 7;
    const possibilities = new Set<string>();
    for (let mask = 1 << (length - 1); mask < 1 << length; mask += 1) {
      const text = mask.toString(2);
      const zeroWeeks = new Map<number, number>();
      [...text].forEach((value, index) => {
        const week = Math.floor((weekday + index) / 7);
        if (value === '0') zeroWeeks.set(week, (zeroWeeks.get(week) ?? 0) + 1);
      });
      if ([...zeroWeeks.values()].some(count => count > 2)) continue;
      const count = [...text].filter(char => char === '1').length;
      const longest = Math.max(...text.split('0').map(run => run.length));
      const current = /1*$/.exec(text)![0].length;
      possibilities.add(`${longest},${current},${length - count}`);
    }
    for (let longest = 0; longest <= length; longest += 1) {
      for (let current = 0; current <= length; current += 1) {
        for (let gapDays = 0; gapDays <= length; gapDays += 1) {
          const expected = possibilities.has(`${longest},${current},${gapDays}`);
          const config = { ...defaults, totalTokens: length - gapDays + 1, peakTokens: 2,
            minDailyTokens: 0, maxDailyTokens: 1, longestStreak: longest, currentStreak: current,
            startDate: dateText(start), gapDays };
          const result = createProfileUsage(config, now);
          assert.equal(result.ok, expected, JSON.stringify({ length, longest, current, gapDays }));
          if (result.ok) verify(config);
        }
      }
    }
  }
});

test('integer token allocation reaches both minimum and maximum feasible totals with an exact peak', () => {
  const base = { ...getDefaultProfileDemo(now), peakTokens: 17, minDailyTokens: 3, maxDailyTokens: 20,
    longestStreak: 3, currentStreak: 2, startDate: dateText(today - 5 * dayLength), gapDays: 1 };
  // Six days allow only 111011: five active days, one peak and four bounded values.
  for (const totalTokens of [29, 30, 44, 80, 81]) verify({ ...base, totalTokens });
});

test('large daily capacities preserve one-token budgets near both feasible total boundaries', () => {
  const peakTokens = 99_999_999_999_000;
  const sparse = { ...getDefaultProfileDemo(now), peakTokens, minDailyTokens: 1, maxDailyTokens: peakTokens,
    longestStreak: 8, currentStreak: 8, gapDays: 0, startDate: '2026-10-10' };
  for (const extra of [0, 1, 2, 9, 500, 993]) verify({ ...sparse, totalTokens: peakTokens + 7 + extra });
  const full = { ...sparse, peakTokens: 50_000_000_000_000, maxDailyTokens: 50_000_000_000_000,
    longestStreak: 2, currentStreak: 2, startDate: '2026-10-16' };
  for (const totalTokens of [99_999_999_999_998, 99_999_999_999_999]) verify({ ...full, totalTokens });
});

test('bounded token allocations agree with an exact independent total interval', () => {
  for (let length = 1; length <= 7; length += 1) {
    for (let peak = 1; peak <= 4; peak += 1) {
      for (let minimum = 0; minimum <= peak; minimum += 1) {
        for (let total = 0; total <= length * peak + 1; total += 1) {
          const config = { ...getDefaultProfileDemo(now), totalTokens: total, peakTokens: peak,
            minDailyTokens: minimum, maxDailyTokens: peak, longestStreak: length,
            currentStreak: length, gapDays: 0, startDate: dateText(today - (length - 1) * dayLength) };
          const expected = (length === 1 || Math.max(1, minimum) < peak)
            && total >= peak + (length - 1) * Math.max(1, minimum) && total <= peak + (length - 1) * (peak - 1);
          const result = createProfileUsage(config, now);
          assert.equal(result.ok, expected, JSON.stringify({ length, total, peak, minimum }));
          if (result.ok) verify(config);
        }
      }
    }
  }
});

test('natural weeks split at Monday instead of treating every seven-day window as a week', () => {
  const at = new Date(2026, 9, 21, 12);
  const config = { ...getDefaultProfileDemo(at), totalTokens: 4, peakTokens: 2,
    minDailyTokens: 0, maxDailyTokens: 1, longestStreak: 2, currentStreak: 2,
    gapDays: 3, startDate: '2026-10-16' };
  // Friday 1, Saturday/Sunday/Monday 0, Tuesday/Wednesday 1: each calendar week has at most two gaps.
  verify(config, at);
  const sameWeek = createProfileUsage({ ...config, startDate: '2026-10-19' }, new Date(2026, 9, 24, 12));
  assert.equal(sameWeek.ok, false);
  if (!sameWeek.ok) assert.match(sameWeek.error, /每自然周.*2/);
});

test('impossible configurations report specific Chinese causes instead of changing requested values', () => {
  const base = getDefaultProfileDemo(now);
  const cases: [Partial<ProfileDemoConfig>, RegExp][] = [
    [{ totalTokens: 0, peakTokens: 0, longestStreak: 0, currentStreak: 0, minDailyTokens: 0 }, /开始.*累计|累计.*开始/],
    [{ peakTokens: 0 }, /峰值/],
    [{ totalTokens: 1 }, /累计.*峰值|峰值.*累计/],
    [{ minDailyTokens: base.peakTokens + 1 }, /最小|下限|范围/],
    [{ minDailyTokens: base.peakTokens, maxDailyTokens: base.peakTokens }, /峰值|范围/],
    [{ longestStreak: 0 }, /最长连续/],
    [{ currentStreak: 46 }, /当前连续.*最长|最长.*当前连续/],
    [{ longestStreak: 113 }, /历史|日期|天/],
    [{ startDate: '2026-10-17', longestStreak: 1, currentStreak: 0, gapDays: 0, totalTokens: base.peakTokens }, /开始|首日/],
    [{ startDate: '2026-10-14', longestStreak: 3, currentStreak: 2, gapDays: 1, totalTokens: 3 * base.peakTokens }, /最长连续|间隔|之前/],
    [{ startDate: '2026-10-16', longestStreak: 1, currentStreak: 1, gapDays: 1, totalTokens: base.peakTokens }, /开始|首日|间隔/],
    [{ gapDays: 112 }, /开始|首日|最多/],
    [{ gapDays: 0 }, /间隔.*最长连续|最长连续.*间隔/],
    [{ startDate: '2026-10-18' }, /未来|今天|开始日期/],
    [{ totalTokens: 2_000_000_000 }, /累计.*不足|至少|最低/],
    [{ totalTokens: 1e14 }, /累计.*过大|最多|上限/],
  ];
  for (const [patch, pattern] of cases) {
    const config = { ...base, ...patch };
    const previous = { ...config };
    const result = createProfileUsage(config, now);
    assert.equal(result.ok, false, `expected rejection for ${Object.keys(patch).join(',')}`);
    if (!result.ok) assert.match(result.error, pattern);
    assert.deepEqual(config, previous);
  }
});

test('fixed active days require exact integer totals inside their token bounds', () => {
  const result = createProfileUsage({ ...getDefaultProfileDemo(now), totalTokens: 11, peakTokens: 5,
    minDailyTokens: 4, maxDailyTokens: 5, longestStreak: 1, currentStreak: 1,
    startDate: dateText(today - 8 * dayLength), gapDays: 4 }, now);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /累计|活跃日|间隔/);
});

test('restore retains structurally valid configuration across midnight, rollback and future start dates', () => {
  const saved = { ...getDefaultProfileDemo(now), totalTokens: 0, durationMinutes: 60_000_000, startDate: '2026-10-18' };
  assert.deepEqual(restoreProfileDemo(saved, new Date(2026, 9, 1)), saved);
  assert.deepEqual(restoreProfileDemo(saved, new Date(2026, 9, 19)), saved);
  assert.deepEqual(restoreProfileDemo({ ...saved, session: 'unknown', bearer: 'unknown' }, now), saved);
});

test('legacy configurations infer gaps from the previous maximum feasible active-day count', () => {
  const { gapDays: removed, ...legacy } = getDefaultProfileDemo(now);
  void removed;
  assert.deepEqual(restoreProfileDemo(legacy, now), { ...legacy, gapDays: 2 });
  const scarce = { ...legacy, totalTokens: 10, peakTokens: 1, minDailyTokens: 1, maxDailyTokens: 1,
    longestStreak: 3, currentStreak: 2, startDate: dateText(today - 29 * dayLength) };
  const migrated = restoreProfileDemo(scarce, now);
  assert.deepEqual(migrated, { ...scarce, gapDays: 20 });
  const conflict = createProfileUsage(migrated, now);
  assert.equal(conflict.ok, false, 'migration must preserve old totals even if the new weekly limit makes them impossible');
  if (!conflict.ok) assert.match(conflict.error, /每自然周/);
  const whole = { ...legacy, totalTokens: 7, peakTokens: 1, minDailyTokens: 1, maxDailyTokens: 1,
    longestStreak: 7, currentStreak: 7, startDate: dateText(today - 6 * dayLength) };
  assert.deepEqual(restoreProfileDemo(whole, now), { ...whole, gapDays: 0 });
});

test('damaged gap fields recover independently while valid but impossible saved values remain intact', () => {
  const saved = { ...getDefaultProfileDemo(now), durationMinutes: 1234 };
  for (const gapDays of [undefined, null, '2', -1, 0.5, Infinity, 100_001]) {
    assert.deepEqual(restoreProfileDemo({ ...saved, gapDays }, now), saved);
    const result = createProfileUsage({ ...saved, gapDays } as ProfileDemoConfig, now);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /间隔天数.*整数/);
  }
  const impossible = { ...saved, gapDays: 100_000 };
  assert.deepEqual(restoreProfileDemo(impossible, now), impossible);
  assert.deepEqual(restoreProfileDemo(impossible, new Date(2026, 0, 1)), impossible);
  const { gapDays: removed, ...legacy } = saved;
  void removed;
  assert.deepEqual(restoreProfileDemo(legacy, new Date(2026, 0, 1)), { ...legacy, gapDays: 0 });
});

test('restore rejects malformed dates, missing fields, non-integers and values beyond supported limits', () => {
  const defaults = getDefaultProfileDemo(now);
  for (const value of [undefined, null, [], {}, { ...defaults, durationMinutes: undefined },
    ...[
      { totalTokens: '100' }, { totalTokens: -1 }, { totalTokens: 1e14 + 1 }, { totalTokens: Infinity },
      { peakTokens: 0.5 }, { longestStreak: 100_001 }, { currentStreak: -1 },
      { durationMinutes: -1 }, { durationMinutes: 60_000_001 },
      { startDate: '2026-02-30' }, { startDate: '1900-02-29' }, { startDate: '2026-1-01' },
      { startDate: '1899-12-31' }, { startDate: '2026-10-17T00:00:00Z' },
    ].map(patch => ({ ...defaults, ...patch })),
  ]) assert.deepEqual(restoreProfileDemo(value, now), defaults);
  assert.equal(restoreProfileDemo({ ...defaults, startDate: '2000-02-29' }, now).startDate, '2000-02-29');
});

test('full history begins in 1900 and is not truncated to the 365-day calendar window', () => {
  const length = (today - Date.UTC(1900, 0, 1)) / dayLength + 1;
  const config = { ...getDefaultProfileDemo(now), startDate: '1900-01-01', gapDays: 0,
    totalTokens: length + 1, peakTokens: 2, minDailyTokens: 0, maxDailyTokens: 1,
    longestStreak: length, currentStreak: length };
  const result = verify(config);
  assert.equal(result.days[0].date, Date.UTC(1900, 0, 1));
  assert.ok(result.days.length > 46_000);
  assert.equal(result.days.at(-1)?.date, today);
});

test('100000 days and 1e14 tokens remain exact without searching numeric ranges', () => {
  const end = new Date(Date.UTC(1900, 0, 1) + 99_999 * dayLength);
  const at = new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 12);
  const config = { ...getDefaultProfileDemo(at), startDate: '1900-01-01', totalTokens: 1e14,
    peakTokens: 2e9, minDailyTokens: 0, maxDailyTokens: 1e9,
    longestStreak: 100_000, currentStreak: 100_000, gapDays: 0 };
  assert.equal(verify(config, at).days.length, 100_000);
  const tooLate = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, 12);
  const rejected = createProfileUsage(config, tooLate);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.error, /100,?000|100000|10 万/);
});

test('local calendar dates remain consecutive across a daylight-saving transition', () => {
  const at = new Date(2026, 2, 12, 23, 30);
  const config = { ...getDefaultProfileDemo(at), startDate: '2026-03-07', totalTokens: 7,
    peakTokens: 2, minDailyTokens: 1, maxDailyTokens: 1, longestStreak: 6, currentStreak: 6, gapDays: 0 };
  const result = verify(config, at);
  assert.equal(result.days[0].date, Date.UTC(2026, 2, 7));
  assert.equal(result.days.at(-1)?.date, Date.UTC(2026, 2, 12));
});
