import test from 'node:test';
import assert from 'node:assert/strict';
import { createGapLayout } from '../src/profile-gap-layout.ts';

function describe(mask: number[], weekday: number) {
  let longest = 0;
  let current = 0;
  let gaps = 0;
  const weekly = new Map<number, number>();
  for (let index = 0; index < mask.length; index += 1) {
    assert.ok(mask[index] === 0 || mask[index] === 1);
    if (mask[index]) current += 1;
    else {
      current = 0;
      gaps += 1;
      const week = Math.floor((weekday + index) / 7);
      weekly.set(week, (weekly.get(week) ?? 0) + 1);
    }
    longest = Math.max(longest, current);
  }
  return { longest, current, gaps, weeklyMaximum: Math.max(0, ...weekly.values()) };
}

function verify(length: number, weekday: number, longest: number, current: number, gaps: number, requiredActiveDay?: number) {
  const result = createGapLayout(length, weekday, longest, current, gaps, requiredActiveDay);
  assert.ok(result, `Expected feasible: ${[length, weekday, longest, current, gaps]}`);
  assert.equal(result.length, length);
  assert.equal(result[0], 1);
  if (requiredActiveDay !== undefined) assert.equal(result[requiredActiveDay], 1);
  const actual = describe(result, weekday);
  assert.deepEqual([actual.longest, actual.current, actual.gaps], [longest, current, gaps]);
  assert.ok(actual.weeklyMaximum <= 2);
  return result;
}

test('matches every possible short history, including all seven week alignments', () => {
  for (let length = 1; length <= 17; length += 1) {
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const feasible = new Set<string>();
      for (let bits = 0; bits < 2 ** (length - 1); bits += 1) {
        const mask = Array.from({ length }, (_, day) => day === 0 ? 1 : (bits >> (day - 1)) & 1);
        const actual = describe(mask, weekday);
        if (actual.weeklyMaximum <= 2) feasible.add(`${actual.longest},${actual.current},${actual.gaps}`);
      }
      for (let longest = 1; longest <= length; longest += 1) {
        for (let current = 0; current <= longest; current += 1) {
          for (let gaps = 0; gaps < length; gaps += 1) {
            const possible = feasible.has(`${longest},${current},${gaps}`);
            const result = createGapLayout(length, weekday, longest, current, gaps);
            assert.equal(result !== null, possible, `Feasibility mismatch: ${[length, weekday, longest, current, gaps]}`);
            if (result) {
              const actual = describe(result, weekday);
              assert.equal(result[0], 1);
              assert.deepEqual([actual.longest, actual.current, actual.gaps], [longest, current, gaps]);
              assert.ok(actual.weeklyMaximum <= 2);
            }
          }
        }
      }
    }
  }
});

test('can reserve a late peak date when the unrestricted layout leaves the eligible dates empty', () => {
  // 2026-01-01 through 2026-02-02: the first eligible peak date is February 1.
  const unrestricted = verify(33, 3, 7, 0, 8);
  assert.deepEqual(unrestricted.slice(31), [0, 0]);
  const reserved = verify(33, 3, 7, 0, 8, 31);
  assert.equal(reserved[31], 1);
  assert.equal(createGapLayout(33, 3, 7, 0, 8, 32), null, 'the current streak requires the final date to be zero');
});

test('a required active date matches an independent enumeration of short histories', () => {
  for (let length = 1; length <= 10; length += 1) {
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const feasible = new Set<string>();
      for (let bits = 0; bits < 2 ** (length - 1); bits += 1) {
        const mask = Array.from({ length }, (_, day) => day === 0 ? 1 : (bits >> (day - 1)) & 1);
        const actual = describe(mask, weekday);
        if (actual.weeklyMaximum > 2) continue;
        for (let day = 0; day < length; day += 1) {
          if (mask[day]) feasible.add(`${actual.longest},${actual.current},${actual.gaps},${day}`);
        }
      }
      for (let longest = 1; longest <= length; longest += 1) {
        for (let current = 0; current <= longest; current += 1) {
          for (let gaps = 0; gaps < length; gaps += 1) {
            for (let day = 0; day < length; day += 1) {
              const possible = feasible.has(`${longest},${current},${gaps},${day}`);
              const result = createGapLayout(length, weekday, longest, current, gaps, day);
              assert.equal(result !== null, possible, `Required-active mismatch: ${[length, weekday, longest, current, gaps, day]}`);
              if (result) {
                const actual = describe(result, weekday);
                assert.equal(result[0], 1);
                assert.equal(result[day], 1);
                assert.deepEqual([actual.longest, actual.current, actual.gaps], [longest, current, gaps]);
                assert.ok(actual.weeklyMaximum <= 2);
              }
            }
          }
        }
      }
    }
  }
});

test('can place the longest run after the first run', () => {
  const result = verify(6, 5, 2, 0, 3);
  assert.deepEqual(result, [1, 0, 0, 1, 1, 0]);
});

test('preserves screenshot streaks with the requested exact gap totals', () => {
  for (const gaps of [2, 5, 10]) {
    for (let weekday = 0; weekday <= 6; weekday += 1) verify(118, weekday, 45, 33, gaps);
  }
});

test('flexible gap dates spread over weekdays instead of one heatmap row', () => {
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    for (const requiredActiveDay of [undefined, 52]) {
      const mask = verify(118, weekday, 45, 33, 6, requiredActiveDay);
      const rows = Array(7).fill(0);
      mask.forEach((active, day) => { if (!active) rows[(weekday + day) % 7] += 1; });
      assert.ok(rows.filter(count => count > 0).length >= 5, `six gaps should occupy at least five available rows: ${rows}`);
      assert.ok(Math.max(...rows) <= 2, `one weekday should not dominate: ${rows}`);
      assert.deepEqual(createGapLayout(118, weekday, 45, 33, 6, requiredActiveDay), mask, 'refresh keeps the same dates');
    }
  }
});

test('longer flexible histories distribute gap dates across all seven rows', () => {
  for (const [length, longest, current, gaps] of [[180, 30, 20, 20], [365, 45, 33, 60]]) {
    const mask = verify(length, 0, longest, current, gaps);
    const rows = Array(7).fill(0);
    mask.forEach((active, day) => { if (!active) rows[day % 7] += 1; });
    assert.ok(rows.every(count => count > 0), `all rows are available: ${rows}`);
    assert.ok(Math.max(...rows) <= Math.ceil(gaps / 7) + 1, `gaps should not cluster in one row: ${rows}`);
  }
});

test('weekday variety never overrides dates forced by exact streaks', () => {
  const mask = verify(21, 0, 6, 0, 3);
  assert.deepEqual(mask.flatMap((active, day) => active ? [] : [day]), [6, 13, 20]);
});

test('handles maximum history without a history-times-streak table', () => {
  verify(100_000, 0, 45, 33, 23_000);
  verify(100_000, 6, 50_000, 49_998, 2);
  assert.equal(createGapLayout(100_000, 3, 1, 0, 50_000), null);
  assert.equal(createGapLayout(100_000, 3, 2, 0, 28_570), null);
});

test('accepts independently constructed longer legal histories', () => {
  let seed = 837_173;
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed % limit;
  };
  for (let sample = 0; sample < 500; sample += 1) {
    const length = 20 + random(2_000);
    const weekday = random(7);
    const mask: number[] = Array(length).fill(1);
    for (let weekStart = -weekday; weekStart < length; weekStart += 7) {
      for (let index = 0, count = random(3); index < count; index += 1) {
        const day = weekStart + random(7);
        if (day > 0 && day < length) mask[day] = 0;
      }
    }
    const actual = describe(mask, weekday);
    verify(length, weekday, actual.longest, actual.current, actual.gaps);
    const activeDays = mask.flatMap((value, day) => value ? [day] : []);
    verify(length, weekday, actual.longest, actual.current, actual.gaps, activeDays[random(activeDays.length)]);
  }
});

test('rejects invalid arguments and impossible endpoints', () => {
  for (const args of [
    [0, 0, 1, 0, 0], [100_001, 0, 1, 0, 0], [7, 7, 3, 2, 1], [7, -1, 3, 2, 1],
    [7, 0, 0, 0, 1], [7, 0, 3, 4, 1], [7, 0, 3, 2, -1], [7, 0, 3, 2, 7],
    [7, 0, 7, 6, 1], [7, 0, 3, 2, 0], [7, 0, 3.5, 2, 1], [7, 0, 3, Number.NaN, 1],
  ]) assert.equal(createGapLayout(...args as [number, number, number, number, number]), null);
  assert.deepEqual(createGapLayout(7, 4, 7, 7, 0), Array(7).fill(1));
  for (const requiredActiveDay of [-1, 7, 0.5, Number.NaN, Infinity]) {
    assert.equal(createGapLayout(7, 4, 7, 7, 0, requiredActiveDay), null);
  }
});
