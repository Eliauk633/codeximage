import test from 'node:test';
import assert from 'node:assert/strict';
import { automationScheduleLabel, localDateInput, nextAutomationRun, parseAutomationDate, restoreAutomationsState, validateAutomationTask, type AutomationTask } from '../src/automations-state.ts';

const now = new Date(2026, 9, 17, 12, 0).getTime();
const task = (patch: Partial<AutomationTask> = {}): AutomationTask => ({ id: 'task-1', name: '项目周报', instructions: '整理本周项目进度', paused: false, createdAt: now, updatedAt: now,
  schedule: { frequency: 'daily', time: '09:00', weekdays: [1], date: '' }, ...patch });

test('restoration returns independent empty data and copies only known valid fields', () => {
  const saved = { ...task(), secret: 'discard', schedule: { ...task().schedule, unsafe: true } };
  const result = restoreAutomationsState({ tasks: [saved, null, { ...task(), id: 'bad', paused: 'false' }, task()], session: true }, now);
  assert.deepEqual(result, { tasks: [task()] });
  result.tasks[0].schedule.weekdays.push(2);
  assert.deepEqual(saved.schedule.weekdays, [1]);
  assert.deepEqual(restoreAutomationsState(null, now), { tasks: [] });
  assert.deepEqual(restoreAutomationsState({ tasks: 'invalid' }, now), { tasks: [] });
});

test('validation rejects malformed schedules, bounds and coerced values', () => {
  for (const patch of [{ name: ' ' }, { name: 'x'.repeat(121) }, { instructions: '' }, { updatedAt: Infinity }, { createdAt: -1 }]) assert.ok(validateAutomationTask({ ...task(), ...patch }));
  for (const schedule of [{ ...task().schedule, time: '24:00' }, { ...task().schedule, time: '9:00' }, { ...task().schedule, frequency: 'hourly' }, { ...task().schedule, weekdays: [1, 1] }, { ...task().schedule, weekdays: [7] }, { ...task().schedule, frequency: 'weekly', weekdays: [] }, { ...task().schedule, date: '2026-02-30' }]) assert.ok(validateAutomationTask({ ...task(), schedule }));
  assert.equal(validateAutomationTask(task()), null);
});

test('daily next-run time is strictly after now and follows calendar month and year boundaries', () => {
  assert.equal(nextAutomationRun(task(), now), new Date(2026, 9, 18, 9).getTime());
  assert.equal(nextAutomationRun(task(), new Date(2026, 9, 17, 8).getTime()), new Date(2026, 9, 17, 9).getTime());
  assert.equal(nextAutomationRun(task(), new Date(2026, 11, 31, 9).getTime()), new Date(2027, 0, 1, 9).getTime());
});

test('weekly dates wrap to the next week and respect all selected weekdays', () => {
  const weekly = task({ schedule: { frequency: 'weekly', time: '09:00', weekdays: [1, 5], date: '' } });
  assert.equal(nextAutomationRun(weekly, now), new Date(2026, 9, 19, 9).getTime());
  assert.equal(nextAutomationRun(weekly, new Date(2026, 9, 19, 9).getTime()), new Date(2026, 9, 23, 9).getTime());
  assert.equal(automationScheduleLabel(weekly.schedule), '每周一、五 · 09:00');
});

test('one-time schedules retain expired dates without claiming execution and reject past dates on save', () => {
  const once = task({ schedule: { frequency: 'once', date: '2026-10-17', time: '11:00', weekdays: [] } });
  assert.equal(validateAutomationTask(once), null);
  assert.match(validateAutomationTask(once, now)!, /未来/);
  assert.deepEqual(restoreAutomationsState({ tasks: [once] }, now), { tasks: [once] });
  assert.equal(nextAutomationRun(once, now), null);
  assert.equal(nextAutomationRun({ ...once, schedule: { ...once.schedule, time: '13:00' } }, now), new Date(2026, 9, 17, 13).getTime());
  assert.equal(nextAutomationRun(task({ paused: true }), now), null);
});

test('local date parser rejects overflow and supports leap days without UTC date shifts', () => {
  assert.equal(parseAutomationDate('2026-02-29', '12:00'), null);
  assert.equal(parseAutomationDate('2028-02-29', '12:00'), new Date(2028, 1, 29, 12).getTime());
  assert.equal(localDateInput(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(parseAutomationDate('2026-01-01', '00:30'), new Date(2026, 0, 1, 0, 30).getTime());
});

test('local schedules retain wall-clock time across daylight saving boundaries', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const before = new Date(2026, 2, 7, 12).getTime();
    assert.equal(nextAutomationRun(task(), before), new Date(2026, 2, 8, 9).getTime());
    assert.equal(parseAutomationDate('2026-03-08', '02:30'), null);
    const weekly = task({ schedule: { frequency: 'weekly', time: '09:00', weekdays: [0], date: '' } });
    assert.equal(nextAutomationRun(weekly, new Date(2026, 9, 31, 12).getTime()), new Date(2026, 10, 1, 9).getTime());
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
