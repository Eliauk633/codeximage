import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUsageReset, formatResetCountdown, getAvailableResetCount, getAvailableResetIndices, getResetCardExpiry, isResetExpired, restoreUsageDemo, usagePlans, validateUsageDemo } from '../src/usage-demo.ts';

const now = new Date('2026-10-17T12:00:00+08:00').getTime();
const hour = 3_600_000;

test('billing defaults are independent and anchor the reset deadline once', () => {
  const first = restoreUsageDemo(undefined, now);
  const second = restoreUsageDemo(undefined, now);
  assert.equal(first.plan, 'ChatGPT Pro 200');
  assert.equal(first.billingCycle, '月付');
  assert.equal(first.weeklyRemaining, 50);
  assert.equal(first.weeklyResetAt, now + 140 * hour);
  assert.equal(first.balance, 10_000);
  assert.equal(first.resetCount, 2);
  assert.equal(first.resetExpiresAt, null);
  assert.equal(first.allowReset, false);
  assert.equal(validateUsageDemo(first), null);
  first.resetHistory.push(now);
  assert.deepEqual(second.resetHistory, []);
});

test('all supported plans and decimal balances restore only known account fields', () => {
  for (const plan of usagePlans) {
    const saved = { ...restoreUsageDemo(undefined, now), plan, billingCycle: '年付' as const,
      weeklyRemaining: 12.34, balance: 61_438.12, resetHistory: [now - hour], session: 'discard', bearer: 'discard' };
    const restored = restoreUsageDemo(saved, now + 10 * hour);
    const { session, bearer, ...known } = saved;
    assert.deepEqual(restored, known);
    assert.notStrictEqual(restored.resetHistory, saved.resetHistory);
  }
});

test('invalid billing fields are rejected without accepting coercion or unsafe counts', () => {
  const valid = restoreUsageDemo(undefined, now);
  const invalid = [null, [], 42, 'invalid', {},
    { ...valid, plan: 'unknown' }, { ...valid, billingCycle: '一次性' },
    ...[-1, 100.01, NaN, Infinity, 1.234, '50'].map(weeklyRemaining => ({ ...valid, weeklyRemaining })),
    ...[-1, Infinity, 1.234, 1_000_000_000_001, '1'].map(balance => ({ ...valid, balance })),
    ...[-1, 0.5, Infinity, 1_000_001, '2'].map(resetCount => ({ ...valid, resetCount })),
    ...[NaN, Infinity, 8.64e15, '2026-10-17', null].map(weeklyResetAt => ({ ...valid, weeklyResetAt })),
    ...[NaN, Infinity, -8.64e15, '2026-10-17'].map(resetExpiresAt => ({ ...valid, resetExpiresAt })),
    { ...valid, allowReset: 'true' }, { ...valid, resetHistory: 'invalid' },
    { ...valid, resetHistory: [now, null] }];
  for (const value of invalid) {
    assert.equal(typeof validateUsageDemo(value), 'string', JSON.stringify(value));
    assert.deepEqual(restoreUsageDemo(value, now), valid);
  }
  assert.equal(validateUsageDemo({ ...valid, weeklyRemaining: 0, balance: 0, resetCount: 0 }), null);
  assert.equal(validateUsageDemo({ ...valid, weeklyRemaining: 100, balance: 0.29, resetCount: 1_000_000 }), null);
});

test('two-decimal balances remain valid across the supported amount range', () => {
  const valid = restoreUsageDemo(undefined, now);
  for (const balance of [0.29, 61_438.12, 10_000_000_000.29, 999_999_999_999.99, 1_000_000_000_000]) {
    assert.equal(validateUsageDemo({ ...valid, balance }), null, String(balance));
    assert.equal(restoreUsageDemo({ ...valid, balance }, now).balance, balance);
  }
  assert.notEqual(validateUsageDemo({ ...valid, balance: 10_000_000_000.291 }), null);
});

test('past reset deadlines and card expiry survive reopening rather than moving forward', () => {
  const saved = { ...restoreUsageDemo(undefined, now), weeklyResetAt: now - hour, resetExpiresAt: now - hour };
  assert.deepEqual(restoreUsageDemo(saved, now + 24 * hour), saved);
  assert.equal(formatResetCountdown(saved.weeklyResetAt, now), '已到重置时间');
  assert.equal(isResetExpired(saved, now), true);
});

test('reset countdown handles days, hours, minutes and the exact deadline', () => {
  assert.equal(formatResetCountdown(now + 140 * hour, now), '5 天 20 小时后重置');
  assert.equal(formatResetCountdown(now + 24 * hour, now), '1 天后重置');
  assert.equal(formatResetCountdown(now + 2 * hour, now), '2 小时后重置');
  assert.equal(formatResetCountdown(now + 61_000, now), '2 分钟后重置');
  assert.equal(formatResetCountdown(now + 1, now), '1 分钟后重置');
  assert.equal(formatResetCountdown(now, now), '已到重置时间');
});

test('using a reset updates count, percentage and history atomically without mutating the source', () => {
  const saved = { ...restoreUsageDemo(undefined, now), weeklyRemaining: 3.14, resetExpiresAt: now + hour,
    resetHistory: [now - hour] };
  const snapshot = structuredClone(saved);
  const next = applyUsageReset(saved, now);
  assert.ok(next);
  assert.deepEqual(next, { ...snapshot, weeklyRemaining: 100, weeklyResetAt: now + 168 * hour, resetCount: 1, resetHistory: [now - hour, now] });
  assert.deepEqual(saved, snapshot);
  assert.equal(next.weeklyResetAt, now + 168 * hour);
  assert.equal(formatResetCountdown(next.weeklyResetAt, now + 1000), '7 天后重置');
  assert.equal(formatResetCountdown(next.weeklyResetAt, now + hour), '6 天 23 小时后重置');
  const again = applyUsageReset(next, now + 60000);
  assert.equal(again?.weeklyResetAt, now + 60000 + 168 * hour);
});

test('reset cards become unusable at their exact expiry and empty inventories stay empty', () => {
  const saved = { ...restoreUsageDemo(undefined, now), resetExpiresAt: now };
  assert.equal(isResetExpired(saved, now - 1), false);
  assert.equal(isResetExpired(saved, now), true);
  assert.equal(applyUsageReset(saved, now), null);
  assert.ok(applyUsageReset(saved, now - 1));
  assert.equal(applyUsageReset({ ...saved, resetExpiresAt: null, resetCount: 0 }, now), null);
  assert.equal(isResetExpired({ ...saved, resetExpiresAt: null }, now), false);
  assert.equal(applyUsageReset({ ...saved, resetExpiresAt: null, resetCount: -1 }, now), null);
});

test('per-card expiry overrides preserve legacy defaults and copy without sharing account data', () => {
  const legacy = { ...restoreUsageDemo(undefined, now), resetExpiresAt: now + hour };
  assert.deepEqual(restoreUsageDemo(legacy, now), legacy);
  assert.equal(getResetCardExpiry(legacy, 0), now + hour);
  const saved = { ...legacy, resetCount: 4, resetExpiryOverrides: { '0': now, '2': null, '3': now + 2 * hour } };
  const restored = restoreUsageDemo(saved, now);
  assert.deepEqual(restored, saved);
  assert.notStrictEqual(restored.resetExpiryOverrides, saved.resetExpiryOverrides);
  assert.equal(getResetCardExpiry(restored, 0), now);
  assert.equal(getResetCardExpiry(restored, 1), now + hour);
  assert.equal(getResetCardExpiry(restored, 2), null);
  assert.equal(getAvailableResetCount(restored, now), 3);
  assert.equal(getAvailableResetCount(restored, now + hour), 2);
  assert.equal(getAvailableResetCount(restored, now + 2 * hour), 1);
  assert.equal(isResetExpired(restored, now + 2 * hour), false);
});

test('override validation rejects invalid indices, values and object containers', () => {
  const valid = restoreUsageDemo(undefined, now);
  for (const resetExpiryOverrides of [null, [], 'invalid', new Date(),
    { '-1': now }, { '01': now }, { '1.0': now }, { '2': now }, { '1e0': now },
    { '0': undefined }, { '0': NaN }, { '0': '2026-10-17' }, { '0': 8.64e15 },
    Object.create({ '0': now })]) {
    assert.notEqual(validateUsageDemo({ ...valid, resetExpiryOverrides }), null);
  }
  assert.equal(validateUsageDemo({ ...valid, resetExpiryOverrides: { '0': null, '1': now } }), null);
});

test('consuming a selected card shifts later expiries and rejects expired or invalid selections', () => {
  const saved = { ...restoreUsageDemo(undefined, now), resetCount: 4, resetExpiresAt: now + hour,
    resetExpiryOverrides: { '0': now, '1': now + 2 * hour, '3': null } };
  const snapshot = structuredClone(saved);
  for (const index of [-1, 0, 0.5, 4, NaN, Infinity]) assert.equal(applyUsageReset(saved, now, index), null);
  const next = applyUsageReset(saved, now, 1);
  assert.ok(next);
  assert.equal(next.resetCount, 3);
  assert.deepEqual(next.resetExpiryOverrides, { '0': now, '2': null });
  assert.equal(getResetCardExpiry(next, 1), now + hour);
  assert.equal(getAvailableResetCount(next, now), 2);
  assert.deepEqual(next.resetHistory, [now]);
  assert.equal(next.weeklyRemaining, 100);
  assert.deepEqual(saved, snapshot);
  assert.deepEqual(applyUsageReset(saved, now), next);
});

test('expired common deadlines still allow independently extended cards to be consumed', () => {
  const saved = { ...restoreUsageDemo(undefined, now), resetCount: 5, resetExpiresAt: now,
    resetExpiryOverrides: { '3': null, '4': now + hour } };
  assert.equal(getAvailableResetCount(saved, now), 2);
  const first = applyUsageReset(saved, now);
  assert.ok(first);
  assert.deepEqual(first.resetExpiryOverrides, { '3': now + hour });
  assert.equal(getAvailableResetCount(first, now), 1);
  const second = applyUsageReset(first, now);
  assert.ok(second);
  assert.equal(second.resetExpiryOverrides, undefined);
  assert.equal(getAvailableResetCount(second, now), 0);
  assert.equal(isResetExpired(second, now), true);
  assert.equal(applyUsageReset(second, now), null);
});

test('large reset inventories remain sparse for availability, restoration and consumption', () => {
  const saved = { ...restoreUsageDemo(undefined, now), resetCount: 1_000_000, resetExpiresAt: now,
    resetExpiryOverrides: { '999999': now + hour } };
  assert.equal(getAvailableResetCount(saved, now), 1);
  assert.deepEqual(restoreUsageDemo(saved, now), saved);
  const next = applyUsageReset(saved, now);
  assert.ok(next);
  assert.equal(next.resetCount, 999_999);
  assert.equal(next.resetExpiryOverrides, undefined);
  assert.ok(JSON.stringify(next).length < 500);
  assert.equal(getAvailableResetCount({ ...saved, resetExpiresAt: null }, now), 1_000_000);
});

test('each available selection preserves the remaining cards in their original order', () => {
  const expiries = [now, now + 2 * hour, null, now + hour, now - hour, now + 3 * hour];
  const saved = { ...restoreUsageDemo(undefined, now), resetCount: expiries.length, resetExpiresAt: now + hour,
    resetExpiryOverrides: Object.fromEntries(expiries.map((expiry, index) => [String(index), expiry])) };
  for (let index = 0; index < expiries.length; index++) {
    const next = applyUsageReset(saved, now, index);
    if (expiries[index] !== null && expiries[index]! <= now) { assert.equal(next, null); continue; }
    assert.ok(next);
    assert.deepEqual(Array.from({ length: next.resetCount }, (_, offset) => getResetCardExpiry(next, offset)),
      expiries.filter((_, offset) => offset !== index));
    assert.equal(getAvailableResetCount(next, now), 3);
    assert.equal(validateUsageDemo(next), null);
  }
});

test('million-card pages skip sparse expired indices without expanding the inventory', () => {
  const saved = { ...restoreUsageDemo(undefined, now), resetCount: 1_000_000,
    resetExpiryOverrides: { '0': now, '500000': now, '999999': now } };
  assert.deepEqual(getAvailableResetIndices(saved, now, 0, 20), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(getAvailableResetIndices(saved, now, 499_998, 3), [499_999, 500_001, 500_002]);
  assert.deepEqual(getAvailableResetIndices(saved, now, 999_977, 20), Array.from({ length: 20 }, (_, index) => index + 999_979));
  assert.deepEqual(getAvailableResetIndices(saved, now, 999_997, 20), []);
  const mostlyExpired = { ...saved, resetExpiresAt: now, resetExpiryOverrides: { '1': null, '999999': now + hour } };
  assert.deepEqual(getAvailableResetIndices(mostlyExpired, now, 0, 20), [1, 999_999]);
  assert.deepEqual(getAvailableResetIndices(mostlyExpired, now, 1, 20), [999_999]);
  assert.deepEqual(getAvailableResetIndices(mostlyExpired, now + hour, 0, 20), [1]);
  for (const [offset, limit] of [[-1, 20], [0, -1], [0.5, 20], [0, Infinity], [0, 0]]) {
    assert.deepEqual(getAvailableResetIndices(saved, now, offset, limit), []);
  }
});
