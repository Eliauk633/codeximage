/** Calendar layout only: Monday is weekday 0; 1 means an active day.
 * An optional required active date reserves a place for a peak after its earliest date.
 */
export function createGapLayout(
  length: number, startWeekday: number, longest: number, current: number, gapDays: number,
  requiredActiveDay?: number,
): number[] | null {
  if (![length, startWeekday, longest, current, gapDays].every(Number.isSafeInteger)
    || length < 1 || length > 100_000 || startWeekday < 0 || startWeekday > 6
    || longest < 1 || longest > length || current < 0 || current > longest
    || gapDays < 0 || gapDays >= length || longest > length - gapDays) return null;
  if (requiredActiveDay !== undefined && (!Number.isSafeInteger(requiredActiveDay)
    || requiredActiveDay < 0 || requiredActiveDay >= length)) return null;
  if (current === length) return gapDays === 0 && longest === length ? Array(length).fill(1) : null;
  if (gapDays === 0) return null;

  // The final zero is fixed by the current streak. The first day must stay active.
  const lastZero = length - current - 1;
  if (lastZero < 1 || requiredActiveDay === lastZero) return null;
  const weekOf = (day: number) => Math.floor((startWeekday + day) / 7);
  const weekCount = weekOf(lastZero) + 1;
  const available = new Int32Array(weekCount);
  for (let day = 1; day <= lastZero; day += 1) {
    if (day !== requiredActiveDay) available[weekOf(day)] += 1;
  }
  const capacityPrefix = new Int32Array(weekCount + 1);
  for (let week = 0; week < weekCount; week += 1) {
    capacityPrefix[week + 1] = capacityPrefix[week] + Math.min(2, available[week]);
  }
  const capacity = capacityPrefix[weekCount];
  if (gapDays > capacity) return null;
  const availableDays = (first: number, last: number) => last - first + 1
    - Number(requiredActiveDay !== undefined && requiredActiveDay >= first && requiredActiveDay <= last);

  // Protect one run of exactly `longest` days. Once a valid shortest zero-day path
  // exists, adding zeros outside this run cannot increase the maximum streak.
  // This capacity check guarantees that such a path can be filled to gapDays.
  const capacityWithRun = (first: number, last: number): number => {
    const left = Math.max(1, first);
    const right = Math.min(lastZero, last);
    if (left > right) return capacity;
    const firstWeek = weekOf(left);
    const lastWeek = weekOf(right);
    if (firstWeek === lastWeek) {
      return capacity - Math.min(2, available[firstWeek])
        + Math.min(2, available[firstWeek] - availableDays(left, right));
    }
    const firstRemoved = availableDays(left, (firstWeek + 1) * 7 - startWeekday - 1);
    const lastRemoved = availableDays(lastWeek * 7 - startWeekday, right);
    const fullWeeks = capacityPrefix[lastWeek] - capacityPrefix[firstWeek + 1];
    return capacity - fullWeeks
      - Math.min(2, available[firstWeek]) + Math.min(2, available[firstWeek] - firstRemoved)
      - Math.min(2, available[lastWeek]) + Math.min(2, available[lastWeek] - lastRemoved);
  };

  // Four states per zero date: reached-longest flag × one/two zeros in its week.
  // A cross-week transition forgets the old weekly count. Its predecessor is a
  // sliding-window minimum; same-week transitions inspect at most six dates.
  const unreachable = length + 1;
  const costs = new Int32Array((lastZero + 1) * 4).fill(unreachable);
  const previous = new Int32Array(costs.length).fill(-2);
  const queues: number[][] = [[], []];
  const heads = [0, 0];
  let nextToQueue = 1;
  const offer = (state: number, cost: number, predecessor: number) => {
    if (cost <= gapDays && cost < costs[state]) {
      costs[state] = cost;
      previous[state] = predecessor;
    }
  };
  const enqueue = (state: number, flag: number) => {
    if (costs[state] === unreachable) return;
    const queue = queues[flag];
    while (queue.length > heads[flag] && costs[queue[queue.length - 1]] >= costs[state]) queue.pop();
    queue.push(state);
  };

  for (let day = 1; day <= lastZero; day += 1) {
    if (day === requiredActiveDay) continue;
    const weekStart = weekOf(day) * 7 - startWeekday;
    while (nextToQueue < weekStart) {
      for (let flag = 0; flag <= 1; flag += 1) {
        enqueue(nextToQueue * 4 + flag * 2, flag);
        enqueue(nextToQueue * 4 + flag * 2 + 1, flag);
      }
      nextToQueue += 1;
    }
    const earliest = day - longest - 1;
    for (let flag = 0; flag <= 1; flag += 1) {
      const queue = queues[flag];
      while (heads[flag] < queue.length && Math.floor(queue[heads[flag]] / 4) < earliest) heads[flag] += 1;
      if (heads[flag] < queue.length) {
        const predecessor = queue[heads[flag]];
        offer(day * 4 + flag * 2, costs[predecessor] + 1, predecessor);
      }
      for (let before = Math.max(1, weekStart, earliest); before < day; before += 1) {
        const predecessor = before * 4 + flag * 2;
        offer(day * 4 + flag * 2 + 1, costs[predecessor] + 1, predecessor);
      }
    }

    if (day <= longest) {
      offer(day * 4 + (current === longest ? 2 : 0), 1, -1);
      if (day === longest && capacityWithRun(0, day - 1) >= gapDays) offer(day * 4 + 2, 1, -1);
    }
    // This exact-distance edge creates a longest run between its two zeros.
    if (current < longest && earliest >= 1 && capacityWithRun(earliest + 1, day - 1) >= gapDays) {
      const sameWeek = weekOf(earliest) === weekOf(day);
      for (let count = 0; count <= (sameWeek ? 0 : 1); count += 1) {
        const predecessor = earliest * 4 + count;
        offer(day * 4 + 2 + Number(sameWeek), costs[predecessor] + 1, predecessor);
      }
    }
  }

  let state = lastZero * 4 + 2;
  if (costs[state + 1] < costs[state]) state += 1;
  if (costs[state] === unreachable) return null;
  const minimumGaps = costs[state];
  const mask: number[] = Array(length).fill(1);
  const used = new Int32Array(weekCount);
  const weekdayGaps = new Int32Array(7);
  let protectedFirst = length - current;
  let protectedLast = length - 1;
  while (state >= 0) {
    const day = Math.floor(state / 4);
    const predecessor = previous[state];
    mask[day] = 0;
    used[weekOf(day)] += 1;
    weekdayGaps[(startWeekday + day) % 7] += 1;
    if (current < longest && (state % 4 >= 2) && (predecessor < 0 || predecessor % 4 < 2)) {
      protectedFirst = predecessor < 0 ? 0 : Math.floor(predecessor / 4) + 1;
      protectedLast = day - 1;
    }
    state = predecessor;
  }

  // Add the requested remaining zeros proportionally across available weeks.
  // Every available weekly slot can be filled independently while the chosen
  // longest run stays untouched, so this step cannot lose a feasible solution.
  const candidates: number[][] = Array.from({ length: weekCount }, () => []);
  for (let day = 1; day <= lastZero; day += 1) {
    if (mask[day] && day !== requiredActiveDay && (day < protectedFirst || day > protectedLast)) candidates[weekOf(day)].push(day);
  }
  const slots = candidates.map((days, week) => Math.min(2 - used[week], days.length));
  const totalSlots = slots.reduce((sum, count) => sum + count, 0);
  const extraGaps = gapDays - minimumGaps;
  let passedSlots = 0;
  let added = 0;
  for (let week = 0; week < weekCount; week += 1) {
    passedSlots += slots[week];
    const target = totalSlots === 0 ? 0 : Math.floor(passedSlots * extraGaps / totalSlots);
    const count = target - added;
    // Prefer less-used weekdays; rotate ties so flexible gaps do not form a row.
    for (let index = 0; index < count; index += 1) {
      const days = candidates[week];
      const offset = (week + added + index) % days.length;
      let pick = -1;
      for (let candidate = 0; candidate < days.length; candidate += 1) {
        const day = days[(candidate + offset) % days.length];
        if (mask[day] && (pick < 0 || weekdayGaps[(startWeekday + day) % 7] < weekdayGaps[(startWeekday + pick) % 7])) pick = day;
      }
      mask[pick] = 0;
      weekdayGaps[(startWeekday + pick) % 7] += 1;
    }
    added = target;
  }
  if (extraGaps > totalSlots || added !== extraGaps) throw new Error('Gap layout capacity invariant failed.');
  return mask;
}
