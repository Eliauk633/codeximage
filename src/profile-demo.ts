import { createGapLayout } from './profile-gap-layout.ts';

export type ProfileDemoConfig = {
  totalTokens: number;
  peakTokens: number;
  durationMinutes: number;
  longestStreak: number;
  currentStreak: number;
  gapDays: number;
  minDailyTokens: number;
  maxDailyTokens: number;
  startDate: string;
};

export type ProfileUsageDay = { date: number; tokens: number };
type UsageStats = Pick<ProfileDemoConfig, 'totalTokens' | 'peakTokens' | 'longestStreak' | 'currentStreak'>;
type UsageResult = { ok: true; days: ProfileUsageDay[]; stats: UsageStats } | { ok: false; error: string };

const dayLength = 86_400_000;
const maxTokens = 100_000_000_000_000;
const maxDays = 100_000;
const numericFields = [
  ['totalTokens', '累计用量', maxTokens], ['peakTokens', '单日峰值', maxTokens],
  ['durationMinutes', '最长任务时长', 60_000_000], ['longestStreak', '最长连续天数', maxDays],
  ['currentStreak', '当前连续天数', maxDays], ['minDailyTokens', '每日活跃用量下限', maxTokens],
  ['maxDailyTokens', '每日活跃用量上限', maxTokens],
  ['gapDays', '间隔天数', maxDays],
] as const;

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.getTime() : null;
}

function localDay(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function configurationError(value: unknown, restoring = false): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '请填写完整的用量配置。';
  const fields = value as Record<string, unknown>;
  for (const [key, label, maximum] of numericFields) {
    if (restoring && key === 'gapDays') continue;
    const count = fields[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > maximum) {
      return `${label}必须是 0–${maximum.toLocaleString('zh-CN')} 之间的整数。`;
    }
  }
  return parseDate(fields.startDate) === null ? '开始日期须为 1900 年起有效的 YYYY-MM-DD 日期。' : null;
}

export function getDefaultProfileDemo(now = new Date()): ProfileDemoConfig {
  return {
    totalTokens: 23_790_000_000, peakTokens: 1_330_000_000, durationMinutes: 1940,
    longestStreak: 45, currentStreak: 33, minDailyTokens: 100_000_000, maxDailyTokens: 500_000_000,
    gapDays: 2,
    startDate: new Date(localDay(now) - 111 * dayLength).toISOString().slice(0, 10),
  };
}

function migratedGapDays(saved: ProfileDemoConfig, now: Date): number {
  const length = (localDay(now) - parseDate(saved.startDate)!) / dayLength + 1;
  const fallback = Number.isFinite(length) ? Math.min(2, Math.max(0, length - 1)) : 2;
  if (length < 1 || length > maxDays || saved.peakTokens === 0 || saved.totalTokens < saved.peakTokens
    || saved.longestStreak < 1 || saved.longestStreak > length || saved.currentStreak > saved.longestStreak) return fallback;
  const prefix = length - saved.currentStreak - 1;
  if (saved.currentStreak !== length && (prefix < 1 || (saved.currentStreak < saved.longestStreak && prefix < saved.longestStreak))) return fallback;
  const maximumActive = saved.currentStreak === length ? length
    : saved.currentStreak + prefix - Math.floor(prefix / (saved.longestStreak + 1));
  const minimumActive = saved.currentStreak === length ? length
    : saved.currentStreak + (saved.currentStreak === saved.longestStreak ? 1 : saved.longestStreak);
  const tokenMaximum = Number(1n + (BigInt(saved.totalTokens) - BigInt(saved.peakTokens)) / BigInt(Math.max(1, saved.minDailyTokens)));
  const active = Math.min(maximumActive, tokenMaximum);
  return active >= minimumActive && BigInt(saved.totalTokens) <= BigInt(active) * BigInt(saved.peakTokens)
    ? length - active : fallback;
}

export function restoreProfileDemo(value: unknown, now = new Date()): ProfileDemoConfig {
  if (configurationError(value, true)) return getDefaultProfileDemo(now);
  const saved = value as ProfileDemoConfig;
  const validGap = Number.isSafeInteger(saved.gapDays) && saved.gapDays >= 0 && saved.gapDays <= maxDays;
  return {
    totalTokens: saved.totalTokens, peakTokens: saved.peakTokens, durationMinutes: saved.durationMinutes,
    longestStreak: saved.longestStreak, currentStreak: saved.currentStreak,
    gapDays: validGap ? saved.gapDays : migratedGapDays(saved, now),
    minDailyTokens: saved.minDailyTokens, maxDailyTokens: saved.maxDailyTokens, startDate: saved.startDate,
  };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function createProfileUsage(config: ProfileDemoConfig, now = new Date()): UsageResult {
  const invalid = configurationError(config);
  if (invalid) return { ok: false, error: invalid };
  const start = parseDate(config.startDate)!;
  const end = localDay(now);
  if (!Number.isFinite(end)) return { ok: false, error: '当前日期无效，无法生成用量。' };
  if (start > end) return { ok: false, error: '开始日期不能晚于今天。' };
  const length = (end - start) / dayLength + 1;
  if (length > maxDays) return { ok: false, error: '开始日期到今天不能超过 100,000 天，请选择更晚的开始日期。' };

  const { totalTokens: total, peakTokens: peak, longestStreak: longest, currentStreak: current, gapDays,
    minDailyTokens: minimum, maxDailyTokens: maximum } = config;
  if (total === 0) return { ok: false, error: '开始使用日期当天必须有用量，因此累计用量不能为 0。' };
  if (peak === 0) return { ok: false, error: '开始使用日期当天必须有用量，因此单日峰值必须大于 0。' };
  if (total < peak) return { ok: false, error: '累计用量不能小于单日峰值。' };
  if (minimum > maximum) return { ok: false, error: '每日活跃用量下限不能大于上限。' };
  if (peak < minimum) return { ok: false, error: '单日峰值不能小于每日活跃用量下限。' };
  if (longest === 0) return { ok: false, error: '开始日期已有使用记录，最长连续天数必须至少为 1 天。' };
  if (current > longest) return { ok: false, error: '当前连续天数不能超过最长连续天数。' };
  if (longest > length) return { ok: false, error: `从开始日期到今天只有 ${length} 天，无法达到 ${longest} 天的最长连续使用。` };
  if (gapDays >= length) return { ok: false, error: `从开始日期到今天只有 ${length} 天，开始日必须活跃，间隔天数最多为 ${length - 1} 天。` };
  const activeCount = length - gapDays;
  const startWeekday = (new Date(start).getUTCDay() + 6) % 7;
  let weeklyGapLimit = 0;
  for (let offset = 0; offset < length;) {
    const size = Math.min(length - offset, 7 - (startWeekday + offset) % 7);
    weeklyGapLimit += Math.min(2, size - (offset === 0 ? 1 : 0));
    offset += size;
  }
  if (gapDays > weeklyGapLimit) return { ok: false, error: `每自然周（周一至周日）最多 2 个间隔日，且开始日必须活跃；这段日期最多允许 ${weeklyGapLimit} 个间隔日。` };

  const lower = Math.max(1, minimum);
  const upper = Math.min(maximum, peak - 1);
  if (activeCount > 1 && lower > upper) {
    return { ok: false, error: '除独立峰值日外，普通活跃日必须在每日范围内且低于峰值，请调整每日下限或峰值。' };
  }
  const totalInteger = BigInt(total);
  const peakInteger = BigInt(peak);
  const lowerInteger = BigInt(lower);
  const highestTotal = peakInteger + BigInt(activeCount - 1) * BigInt(upper);
  const lowestTotal = peakInteger + BigInt(activeCount - 1) * lowerInteger;
  if (totalInteger > highestTotal) {
    return { ok: false, error: `累计用量过大：${gapDays} 个间隔日后固定有 ${activeCount} 个活跃日，累计最多 ${highestTotal.toLocaleString('zh-CN')} Token。` };
  }
  if (totalInteger < lowestTotal) {
    return { ok: false, error: `累计用量不足：${gapDays} 个间隔日后固定有 ${activeCount} 个活跃日，含一个峰值时累计最低为 ${lowestTotal.toLocaleString('zh-CN')} Token。` };
  }
  let layout = createGapLayout(length, startWeekday, longest, current, gapDays);
  if (!layout) {
    return { ok: false, error: `${gapDays} 个间隔日无法同时满足首日活跃、最长连续 ${longest} 天、当前连续 ${current} 天，以及每自然周最多 2 个间隔日。` };
  }
  if (layout.length !== length || layout.some(value => value !== 0 && value !== 1)) {
    return { ok: false, error: '间隔日布局无效，无法生成严格一致的用量。' };
  }

  // Task duration is an independent display value and must not reshuffle daily usage.
  const seed = hash([start, end, total, peak, longest, current, gapDays, minimum, maximum].join('|'));
  const choose = (maximumValue: number, purpose: string, date: number) =>
    Math.min(maximumValue, Math.floor(hash(`${seed}|${purpose}|${date}`) / 4_294_967_296 * (maximumValue + 1)));
  const startDay = new Date(start);
  const monthEnd = new Date(Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth() + 2, 0)).getUTCDate();
  const firstMonth = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth() + 1, Math.min(startDay.getUTCDate(), monthEnd));
  const earliestPeak = end < firstMonth ? 0 : (firstMonth - start) / dayLength;
  if (!layout.some((value, index) => value === 1 && index >= earliestPeak)) {
    // At most four trailing days can all be gaps under the weekly limit.
    // Preserve a candidate day before rejecting a different feasible layout.
    const candidates = Array.from({ length: length - earliestPeak }, (_, index) => earliestPeak + index);
    const offset = choose(candidates.length - 1, 'peak-layout', end);
    for (let index = 0; index < candidates.length; index += 1) {
      const next = createGapLayout(length, startWeekday, longest, current, gapDays, candidates[(index + offset) % candidates.length]);
      if (next) { layout = next; break; }
    }
  }
  const days: ProfileUsageDay[] = Array.from({ length }, (_, index) => ({ date: start + index * dayLength, tokens: 0 }));
  const active: number[] = [];
  let countedGaps = 0;
  let weekGaps = 0;
  let run = 0;
  let longestRun = 0;
  for (let index = 0; index < layout.length; index += 1) {
    if ((startWeekday + index) % 7 === 0) weekGaps = 0;
    if (layout[index] === 1) {
      active.push(index);
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      countedGaps += 1;
      weekGaps += 1;
      run = 0;
      if (weekGaps > 2) return { ok: false, error: '间隔日布局未满足每自然周最多 2 个间隔日。' };
    }
  }
  if (layout[0] !== 1 || countedGaps !== gapDays || run !== current || longestRun !== longest) {
    return { ok: false, error: '间隔日布局未满足首日活跃、间隔天数或连续天数，无法生成严格一致的用量。' };
  }
  for (const index of active) days[index].tokens = lower;
  const peakCandidates = active.filter(index => index >= earliestPeak);
  if (!peakCandidates.length) {
    return { ok: false, error: '开始使用满一个月后的日期没有可安排峰值的活跃日，请调整日期、空档或连续天数。' };
  }
  const peakIndex = peakCandidates[choose(peakCandidates.length - 1, 'peak', end)];
  days[peakIndex].tokens = peak;
  let remainder = total - peak - (active.length - 1) * lower;
  if (remainder > 0) {
    const others = active.filter(index => index !== peakIndex);
    const capacity = upper - lower;
    const weights = new Float64Array(length);
    for (let first = 0; first < length;) {
      const size = 2 + choose(4, 'wave-length', days[first].date);
      const center = choose(2000, 'wave-height', days[first].date) / 1000 - 0.5;
      for (let index = first; index < Math.min(first + size, length); index += 1) {
        weights[index] = center + choose(400, 'daily-jitter', days[index].date) / 1000 - 0.2;
      }
      first += size;
    }
    const extraAt = (index: number, shift: number) => Math.floor(capacity / (1 + Math.exp(-3 * (weights[index] + shift))));
    // Smooth waves keep low days varied instead of clipping them to the minimum.
    // These bounds span zero through full capacity even at the largest token limit.
    let low = -16;
    let high = 16;
    for (let step = 0; step < 56; step += 1) {
      const shift = (low + high) / 2;
      let sum = 0;
      for (const index of others) {
        sum += extraAt(index, shift);
        if (sum > remainder) break;
      }
      if (sum <= remainder) low = shift; else high = shift;
    }
    for (const index of others) {
      const extra = extraAt(index, low);
      days[index].tokens += extra;
      remainder -= extra;
    }
    // Distribute integer rounding residue only where ordinary capacity remains.
    for (const index of others) {
      const extra = Math.min(remainder, upper - days[index].tokens);
      days[index].tokens += extra;
      remainder -= extra;
      if (remainder === 0) break;
    }
  }

  const stats: UsageStats = { totalTokens: 0, peakTokens: 0, longestStreak: 0, currentStreak: 0 };
  for (const [index, day] of days.entries()) {
    if (!Number.isSafeInteger(day.tokens) || day.tokens < 0
      || (day.tokens > 0 && (day.tokens < lower || (index === peakIndex ? day.tokens !== peak : day.tokens > upper)))) {
      return { ok: false, error: '用量未能满足每日范围，请检查累计用量和每日范围。' };
    }
    stats.totalTokens += day.tokens;
    stats.peakTokens = Math.max(stats.peakTokens, day.tokens);
    stats.currentStreak = day.tokens > 0 ? stats.currentStreak + 1 : 0;
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  }
  if (days[0].tokens === 0 || stats.totalTokens !== total || stats.peakTokens !== peak
    || stats.longestStreak !== longest || stats.currentStreak !== current) {
    return { ok: false, error: '这些参数未能生成严格一致的用量，请检查日期、累计用量和连续天数。' };
  }
  return { ok: true, days, stats };
}
