import type { ProfileUsageDay } from './profile-demo.ts';

export type ActivityMode = '每天' | '每周' | '累计总量';
export type ActivityCalendar = {
  start: number; end: number; firstDay: number; lastDay: number; peakTokens: number; priorTokens: number;
  weeks: (number | null)[][];
  months: { label: string; column: number }[];
};
const dayLength = 86_400_000;
const exactAmount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 });
const compactAmount = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 });
const hundredMillions = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function createActivityCalendar(days: readonly ProfileUsageDay[], now = new Date()): ActivityCalendar {
  const values = new Map(days.map(day => [day.date, day.tokens]));
  // Use the computer's local day, then UTC day arithmetic to avoid DST shifts.
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const first = end - 364 * dayLength;
  let peakTokens = 0;
  let priorTokens = 0;
  for (const day of days) {
    if (day.date <= end) peakTokens = Math.max(peakTokens, day.tokens);
    if (day.date < first) priorTokens += day.tokens;
  }
  const start = first - new Date(first).getUTCDay() * dayLength;
  const firstDay = (first - start) / dayLength;
  const lastDay = (end - start) / dayLength;
  const months: ActivityCalendar['months'] = [];
  const weeks = Array.from({ length: Math.ceil((lastDay + 1) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const index = week * 7 + day;
      if (index < firstDay || index > lastDay) return null;
      const date = new Date(start + index * dayLength);
      if (date.getUTCDate() === 1) months.push({ label: `${date.getUTCMonth() + 1}月`, column: week });
      return values.get(date.getTime()) ?? 0;
    }));
  return { start, end, firstDay, lastDay, weeks, months, peakTokens, priorTokens };
}

export function activityTotals(weeks: readonly (readonly (number | null)[])[], cumulative = false, priorTokens = 0): number[] {
  let running = cumulative ? priorTokens : 0;
  return weeks.map(week => {
    const total = week.reduce<number>((sum, day) => sum + (day ?? 0), 0);
    running += total;
    return cumulative ? running : total;
  });
}

export function dailyActivityLevel(tokens: number): number {
  if (tokens <= 0) return 0;
  if (tokens <= 200_000_000) return 1;
  if (tokens <= 400_000_000) return 2;
  if (tokens <= 600_000_000) return 3;
  return 4;
}

function dateLabel(date: number): string {
  const value = new Date(date);
  return `${value.getUTCFullYear()}年${value.getUTCMonth() + 1}月${value.getUTCDate()}日`;
}

export function formatTokenAmount(count: number): string {
  if (count >= 100_000_000) return `${hundredMillions.format(count / 100_000_000)}亿`;
  return count < 10_000 ? exactAmount.format(count) : compactAmount.format(count);
}

export function activityDetails(
  calendar: ActivityCalendar, mode: ActivityMode, week: number, day: number,
): { label: string; tokens: number; exactTokens: string } | null {
  const { weeks, firstDay, lastDay, start } = calendar;
  if (!Number.isInteger(week) || !Number.isInteger(day) || week < 0 || week >= weeks.length
    || day < 0 || day > 6 || weeks[week]?.[day] == null) return null;
  const offset = week * 7 + day;
  if (offset < firstDay || offset > lastDay) return null;
  if (mode === '每天') {
    const tokens = weeks[week][day]!;
    return { label: dateLabel(start + offset * dayLength), tokens, exactTokens: exactAmount.format(tokens) };
  }
  if (mode !== '每周' && mode !== '累计总量') return null;
  const weekStart = Math.max(week * 7, firstDay);
  const weekEnd = Math.min(week * 7 + 6, lastDay);
  let tokens = mode === '累计总量' ? calendar.priorTokens : 0;
  for (let index = mode === '累计总量' ? firstDay : weekStart; index <= weekEnd; index += 1) {
    tokens += weeks[Math.floor(index / 7)]?.[index % 7] ?? 0;
  }
  const lastLabel = dateLabel(start + weekEnd * dayLength);
  const label = mode === '累计总量' ? `截至 ${lastLabel}`
    : weekStart === weekEnd ? lastLabel : `${dateLabel(start + weekStart * dayLength)} – ${lastLabel}`;
  return { label, tokens, exactTokens: exactAmount.format(tokens) };
}
