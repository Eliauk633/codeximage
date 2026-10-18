export const usagePlans = ['ChatGPT Free', 'ChatGPT Go', 'ChatGPT Plus', 'ChatGPT Pro 100', 'ChatGPT Pro 200', 'ChatGPT Business'] as const;
export type UsagePlan = typeof usagePlans[number];

export type UsageDemoConfig = {
  plan: UsagePlan;
  billingCycle: '月付' | '年付';
  weeklyRemaining: number;
  weeklyResetAt: number;
  balance: number;
  resetCount: number;
  resetExpiresAt: number | null;
  resetExpiryOverrides?: Record<string, number | null>;
  allowReset: boolean;
  resetHistory: number[];
};

const minute = 60_000;
const hour = 60 * minute;
const earliestDate = Date.UTC(1900, 0, 1);
const latestDate = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= earliestDate && value <= latestDate;
}

function validDecimal(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
    && Number(value.toFixed(2)) === value;
}

export function validateUsageDemo(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '请填写完整的使用情况和计费设置。';
  const fields = value as Record<string, unknown>;
  if (!usagePlans.includes(fields.plan as UsagePlan)) return '请选择有效的套餐。';
  if (fields.billingCycle !== '月付' && fields.billingCycle !== '年付') return '请选择月付或年付。';
  if (!validDecimal(fields.weeklyRemaining, 100)) return '每周剩余额度须在 0–100% 之间，最多保留两位小数。';
  if (!validTimestamp(fields.weeklyResetAt)) return '下次重置时间须为 1900–9999 年之间的有效时间。';
  if (!validDecimal(fields.balance, 1_000_000_000_000)) return '余额须在 0–1,000,000,000,000 之间，最多保留两位小数。';
  if (typeof fields.resetCount !== 'number' || !Number.isSafeInteger(fields.resetCount)
    || fields.resetCount < 0 || fields.resetCount > 1_000_000) return '重置卡数量须为 0–1,000,000 之间的整数。';
  const resetCount = fields.resetCount;
  if (fields.resetExpiresAt !== null && !validTimestamp(fields.resetExpiresAt)) return '重置卡到期时间须为 1900–9999 年之间的有效时间，或留空。';
  if (fields.resetExpiryOverrides !== undefined) {
    const overrides = fields.resetExpiryOverrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(overrides))) return '每张重置卡的到期时间格式无效。';
    if (Object.entries(overrides).some(([index, expiry]) => !/^(0|[1-9]\d*)$/.test(index)
      || !Number.isSafeInteger(Number(index)) || Number(index) >= resetCount
      || (expiry !== null && !validTimestamp(expiry)))) return '每张重置卡须有有效编号和到期时间。';
  }
  if (typeof fields.allowReset !== 'boolean') return '使用量重置开关无效。';
  if (!Array.isArray(fields.resetHistory) || !Array.from(fields.resetHistory).every(validTimestamp)) return '重置记录包含无效时间。';
  return null;
}

export function restoreUsageDemo(value: unknown, now = Date.now()): UsageDemoConfig {
  if (validateUsageDemo(value)) return {
    plan: 'ChatGPT Pro 200', billingCycle: '月付', weeklyRemaining: 50,
    weeklyResetAt: now + 140 * hour, balance: 10_000, resetCount: 2,
    resetExpiresAt: null, allowReset: false, resetHistory: [],
  };
  const saved = value as UsageDemoConfig;
  return {
    plan: saved.plan, billingCycle: saved.billingCycle, weeklyRemaining: saved.weeklyRemaining,
    weeklyResetAt: saved.weeklyResetAt, balance: saved.balance, resetCount: saved.resetCount,
    resetExpiresAt: saved.resetExpiresAt, allowReset: saved.allowReset, resetHistory: [...saved.resetHistory],
    ...(saved.resetExpiryOverrides === undefined ? {} : { resetExpiryOverrides: { ...saved.resetExpiryOverrides } }),
  };
}

export function formatResetCountdown(timestamp: number, now = Date.now()): string {
  if (!validTimestamp(timestamp) || !validTimestamp(now)) return '重置时间未设置';
  const remaining = timestamp - now;
  if (remaining <= 0) return '已到重置时间';
  const totalHours = Math.ceil(remaining / hour);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days) return `${days} 天${hours ? ` ${hours} 小时` : ''}后重置`;
  if (remaining >= hour && hours) return `${hours} 小时后重置`;
  return `${Math.ceil(remaining / minute)} 分钟后重置`;
}

export function getResetCardExpiry(config: UsageDemoConfig, index: number): number | null {
  return config.resetExpiryOverrides && Object.hasOwn(config.resetExpiryOverrides, String(index))
    ? config.resetExpiryOverrides[index] : config.resetExpiresAt;
}

function available(expiry: number | null, now: number) { return expiry === null || expiry > now; }

export function getAvailableResetCount(config: UsageDemoConfig, now = Date.now()): number {
  if (validateUsageDemo(config) || !validTimestamp(now)) return 0;
  const commonAvailable = Number(available(config.resetExpiresAt, now));
  let count = commonAvailable * config.resetCount;
  for (const expiry of Object.values(config.resetExpiryOverrides ?? {})) count += Number(available(expiry, now)) - commonAvailable;
  return count;
}

export function getAvailableResetIndices(config: UsageDemoConfig, now: number, offset: number, limit: number): number[] {
  if (validateUsageDemo(config) || !validTimestamp(now) || !Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(limit) || limit <= 0) return [];
  const overrides = Object.entries(config.resetExpiryOverrides ?? {});
  if (!available(config.resetExpiresAt, now)) {
    return overrides.filter(([, expiry]) => available(expiry, now)).map(([index]) => Number(index))
      .sort((left, right) => left - right).slice(offset, offset + limit);
  }
  const expired = overrides.filter(([, expiry]) => !available(expiry, now)).map(([index]) => Number(index))
    .sort((left, right) => left - right);
  const result: number[] = [];
  let start = 0;
  let skip = offset;
  // Default-valid cards form ranges between sparse expired overrides; skip ranges in one step.
  for (let index = 0; index <= expired.length && result.length < limit; index++) {
    const end = expired[index] ?? config.resetCount;
    const length = end - start;
    if (skip >= length) skip -= length;
    else {
      for (let card = start + skip; card < end && result.length < limit; card++) result.push(card);
      skip = 0;
    }
    start = end + 1;
  }
  return result;
}

export function isResetExpired(config: UsageDemoConfig, now = Date.now()): boolean {
  return config.resetCount > 0 && getAvailableResetCount(config, now) === 0;
}

export function applyUsageReset(config: UsageDemoConfig, now = Date.now(), cardIndex?: number): UsageDemoConfig | null {
  if (validateUsageDemo(config) || !validTimestamp(now) || !validTimestamp(now + 7 * 24 * hour) || config.resetCount === 0) return null;
  let selected = cardIndex;
  if (selected === undefined) {
    if (available(config.resetExpiresAt, now)) {
      selected = 0;
      while (selected < config.resetCount && !available(getResetCardExpiry(config, selected), now)) selected++;
    } else {
      selected = config.resetCount;
      for (const [index, expiry] of Object.entries(config.resetExpiryOverrides ?? {})) {
        if (available(expiry, now)) selected = Math.min(selected, Number(index));
      }
    }
  }
  if (!Number.isSafeInteger(selected) || selected < 0 || selected >= config.resetCount
    || !available(getResetCardExpiry(config, selected), now)) return null;
  const overrides: Record<string, number | null> = {};
  for (const [index, expiry] of Object.entries(config.resetExpiryOverrides ?? {})) {
    if (Number(index) !== selected && expiry !== config.resetExpiresAt) overrides[Number(index) > selected ? Number(index) - 1 : index] = expiry;
  }
  const { resetExpiryOverrides: _, ...unchanged } = config;
  return { ...unchanged, resetCount: config.resetCount - 1, weeklyRemaining: 100, weeklyResetAt: now + 7 * 24 * hour, resetHistory: [...config.resetHistory, now],
    ...(Object.keys(overrides).length ? { resetExpiryOverrides: overrides } : {}) };
}
