export type AutomationSchedule = {
  frequency: 'daily' | 'weekly' | 'once';
  time: string;
  weekdays: number[];
  date: string;
};
export type AutomationTask = {
  id: string;
  name: string;
  instructions: string;
  schedule: AutomationSchedule;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
};
export type AutomationsState = { tasks: AutomationTask[] };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 8.64e15;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const validTime = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function localDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseAutomationDate(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validTime(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1970 || year > 9999) return null;
  const [hour, minute] = time.split(':').map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  return localDateInput(parsed) === date && parsed.getHours() === hour && parsed.getMinutes() === minute ? parsed.getTime() : null;
}

export function validateAutomationTask(value: unknown, now?: number): string | null {
  if (!record(value)) return '任务格式无效';
  if (!text(value.id, 120)) return '任务标识无效';
  if (!text(value.name, 120)) return '请输入任务名称（最多 120 字）';
  if (!text(value.instructions, 20_000)) return '请输入任务指令（最多 20,000 字）';
  if (typeof value.paused !== 'boolean' || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return '任务状态无效';
  const schedule = value.schedule;
  if (!record(schedule) || typeof schedule.frequency !== 'string' || !['daily', 'weekly', 'once'].includes(schedule.frequency) || !validTime(schedule.time)) return '请选择有效的时间安排';
  if (!Array.isArray(schedule.weekdays) || schedule.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(schedule.weekdays).size !== schedule.weekdays.length) return '请选择有效的星期';
  if (schedule.frequency === 'weekly' && schedule.weekdays.length === 0) return '每周任务至少选择一天';
  if (typeof schedule.date !== 'string' || (schedule.date && parseAutomationDate(schedule.date, schedule.time) === null)) return '请选择有效的日期和时间';
  if (schedule.frequency === 'once') {
    const at = parseAutomationDate(schedule.date, schedule.time);
    if (at === null) return '请选择有效的日期和时间';
    if (now !== undefined && at <= now) return '请选择未来的日期和时间';
  }
  return null;
}

export function restoreAutomationsState(value: unknown, _now = Date.now()): AutomationsState {
  if (!record(value) || !Array.isArray(value.tasks)) return { tasks: [] };
  const seen = new Set<string>();
  const tasks: AutomationTask[] = [];
  for (const candidate of value.tasks.slice(0, 1000)) {
    if (validateAutomationTask(candidate) !== null) continue;
    const item = candidate as AutomationTask;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    tasks.push({ id: item.id, name: item.name.trim(), instructions: item.instructions.trim(), paused: item.paused,
      createdAt: item.createdAt, updatedAt: item.updatedAt,
      schedule: { frequency: item.schedule.frequency, time: item.schedule.time, date: item.schedule.date, weekdays: [...item.schedule.weekdays].sort((a, b) => a - b) } });
  }
  return { tasks };
}

export function nextAutomationRun(task: AutomationTask, now = Date.now()): number | null {
  if (task.paused || !timestamp(now)) return null;
  const { frequency, time, date, weekdays } = task.schedule;
  if (frequency === 'once') {
    const run = parseAutomationDate(date, time);
    return run !== null && run > now ? run : null;
  }
  const [hour, minute] = time.split(':').map(Number);
  // Calendar arithmetic preserves local wall time when a week crosses a DST change.
  for (let offset = 0; offset <= 7; offset++) {
    const run = new Date(now);
    run.setDate(run.getDate() + offset);
    run.setHours(hour, minute, 0, 0);
    if (run.getTime() > now && (frequency === 'daily' || weekdays.includes(run.getDay()))) return run.getTime();
  }
  return null;
}

export function automationScheduleLabel(schedule: AutomationSchedule): string {
  if (schedule.frequency === 'once') return `${schedule.date.replaceAll('-', '/')} · ${schedule.time}`;
  if (schedule.frequency === 'daily') return `每天 · ${schedule.time}`;
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  const days = [1, 2, 3, 4, 5, 6, 0].filter(day => schedule.weekdays.includes(day)).map(day => names[day]);
  return `每周${days.join('、')} · ${schedule.time}`;
}
