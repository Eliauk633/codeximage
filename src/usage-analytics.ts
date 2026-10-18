export type AnalyticsPeriod = 7 | 30;
export type AnalyticsSeries = { name: string; color: string; values: number[] };
export const usageGrouping = ['按功能', '按模型', '按界面', '按轮次发起方式'] as const;
export type UsageGrouping = typeof usageGrouping[number];
export const chartColors = ['#2e6bce', '#ff8533', '#58c875', '#ed74bc', '#9873ef', '#34bcb6'];

export function analyticsDates(now: number, days: AnalyticsPeriod, offset = 0): Date[] {
  const today = new Date(now);
  return Array.from({ length: days }, (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.max(0, offset) * days - days + 1 + index));
}
export function formatAnalyticsDate(date: Date, year = true): string {
  return `${year ? `${date.getFullYear()}/` : ''}${date.getMonth() + 1}/${date.getDate()}`;
}
export function totalSeries(series: AnalyticsSeries[]): number {
  return series.reduce((sum, item) => sum + item.values.reduce((total, value) => total + value, 0), 0);
}

// Local chart fixtures remain stable for the same calendar day in every period.
const activity = {
  plugins: {
    names: ['Computer Use', 'Unified Computer Use', 'Codex App Tools', '其他'],
    values: [[20, 0, 0, 10, 250, 670, 0], [50, 8, 8, 18, 180, 172, 0], [4, 2, 2, 5, 10, 4, 0], [4, 3, 3, 5, 5, 2, 0]],
  },
  skills: {
    names: ['Using Superpowers', 'Ponytail', 'Image To Code', '其他'],
    values: [[1, 1, 0, 1, 5, 3, 0], [1, 0, 0, 0, 3, 4, 0], [0, 0, 0, 0, 3, 2, 0], [1, 1, 0, 2, 20, 5, 0]],
  },
  messages: {
    names: ['gpt-6.1-sol', 'gpt-5.6-terra', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.6-sol'],
    values: [[8, 10, 21, 118, 93, 91, 0], [55, 86, 53, 54, 3, 2, 0], [5, 26, 9, 22, 15, 6, 0], [6, 12, 10, 18, 14, 12, 0], [1, 2, 1, 4, 4, 3, 0], [4, 8, 4, 4, 4, 4, 0]],
  },
};
export function buildAnalyticsSeries(type: keyof typeof activity, dates: Date[], byPlatform = false): AnalyticsSeries[] {
  const source = activity[type];
  const series = source.names.map((name, index) => ({ name, color: chartColors[index], values: dates.map(date => source.values[index][date.getDay()]) }));
  if (type !== 'messages' || !byPlatform) return series;
  return ['桌面客户端', 'Mini', '网页'].map((name, index) => ({ name, color: chartColors[index], values: dates.map((_, day) => series[index].values[day] + series[index + 3].values[day]) }));
}

const historyGroups: Record<UsageGrouping, { names: string[]; weights: number[] }> = {
  按功能: { names: ['任务', '子智能体', '电脑历史记录', '记忆更新', '主动建议', '任务标题'], weights: [54700, 42000, 1700, 1600, 5, 5] },
  按模型: { names: ['GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-5.6 Terra', 'GPT-6 Luna', 'GPT-5.6 Luna', 'GPT-5.6 Sol'], weights: [54700, 42000, 1700, 1600, 5, 5] },
  按界面: { names: ['Codex', 'Work', 'Mini'], weights: [75, 22, 3] },
  按轮次发起方式: { names: ['用户发起', '定时任务', '主动建议'], weights: [88, 11, 1] },
};
export function buildUsageHistory(dates: Date[], group: UsageGrouping): AnalyticsSeries[] {
  const { names, weights } = historyGroups[group];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const values = dates.map(date => {
    const total = [184000, 167000, 113000, 268000, 374000, 362000, 0][date.getDay()];
    const pieces = weights.map(weight => Math.floor(total * weight / weightTotal));
    pieces[0] += total - pieces.reduce((sum, value) => sum + value, 0);
    return pieces;
  });
  return names.map((name, index) => ({ name, color: chartColors[index], values: values.map(day => day[index]) }));
}
