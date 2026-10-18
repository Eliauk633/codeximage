import { useState, type FormEvent } from 'react';
import type { AuthResult } from '../auth';
import { createProfileUsage, type ProfileDemoConfig } from '../profile-demo';
import { Dialog } from './ui';

type Props = { value: ProfileDemoConfig; onClose: () => void; onSave: (value: ProfileDemoConfig) => Promise<AuthResult> };
const billionUnit = 100_000_000;
const numberText = (value: number) => String(Math.round(value / billionUnit * 100) / 100);

export function ProfileStatsEditor({ value, onClose, onSave }: Props) {
  const [fields, setFields] = useState({ total: numberText(value.totalTokens), peak: numberText(value.peakTokens),
    hours: String(Math.floor(value.durationMinutes / 60)), minutes: String(value.durationMinutes % 60),
    longest: String(value.longestStreak), current: String(value.currentStreak),
    minimum: numberText(value.minDailyTokens), maximum: numberText(value.maxDailyTokens), start: value.startDate,
    gapDays: String(value.gapDays) });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof fields, next: string) => { setFields(current => ({ ...current, [key]: next })); setError(''); };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const amounts = [fields.total, fields.peak, fields.minimum, fields.maximum];
    if (!amounts.every(item => /^\d+(\.\d{1,2})?$/.test(item))) { setError('用量请填写非负数字，最多保留两位小数。'); return; }
    if (![fields.hours, fields.minutes, fields.longest, fields.current, fields.gapDays].every(item => /^\d+$/.test(item)) || Number(fields.minutes) > 59) {
      setError('时长、连续天数与空档天数请填写非负整数，分钟须为 0–59。'); return;
    }
    if (Number(fields.gapDays) > 100_000) { setError('空档天数须为 0–100,000 天。'); return; }
    const next: ProfileDemoConfig = {
      totalTokens: Math.round(Number(fields.total) * billionUnit), peakTokens: Math.round(Number(fields.peak) * billionUnit),
      minDailyTokens: Math.round(Number(fields.minimum) * billionUnit), maxDailyTokens: Math.round(Number(fields.maximum) * billionUnit),
      durationMinutes: Number(fields.hours) * 60 + Number(fields.minutes), longestStreak: Number(fields.longest),
      currentStreak: Number(fields.current), startDate: fields.start, gapDays: Number(fields.gapDays),
    };
    const check = createProfileUsage(next);
    if (!check.ok) { setError(check.error); return; }
    setSaving(true);
    try {
      const result = await onSave(next);
      if (result.ok) onClose(); else setError(result.error);
    } catch { setError('保存未完成，请重试。'); }
    finally { setSaving(false); }
  }
  const amountField = (key: 'total' | 'peak' | 'minimum' | 'maximum', label: string) => <label>{label}<div className="profile-number-field"><input type="number" inputMode="decimal" min="0" max="1000000" step="0.01" required value={fields[key]} onChange={event => set(key, event.target.value)} /><span>亿</span></div></label>;
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return <Dialog title="编辑统计与用量" onClose={() => { if (!saving) onClose(); }} className="profile-stats-dialog">
    <form onSubmit={save}>
      <div className="profile-stats-fields">
        <p className="profile-stats-intro">修改统计目标，保存后自动调整用量图，并保存到当前账号。</p>
        <fieldset disabled={saving}><legend>统计卡</legend><div className="profile-stats-form-grid">
          {amountField('total', '累计 Token 数')}{amountField('peak', 'Token 使用峰值')}
          <label className="profile-stats-form-wide">最长任务用时<div className="profile-duration-fields">
            <div className="profile-number-field"><input aria-label="最长任务小时数" type="number" min="0" max="1000000" step="1" required value={fields.hours} onChange={event => set('hours', event.target.value)} /><span>小时</span></div>
            <div className="profile-number-field"><input aria-label="最长任务分钟数" type="number" min="0" max="59" step="1" required value={fields.minutes} onChange={event => set('minutes', event.target.value)} /><span>分钟</span></div>
          </div></label>
          <label>最长连续天数<div className="profile-number-field"><input type="number" min="1" max="100000" step="1" required value={fields.longest} onChange={event => set('longest', event.target.value)} /><span>天</span></div></label>
          <label>当前连续天数<div className="profile-number-field"><input type="number" min="0" max="100000" step="1" required value={fields.current} onChange={event => set('current', event.target.value)} /><span>天</span></div></label>
        </div></fieldset>
        <fieldset disabled={saving}><legend>用量图</legend><div className="profile-stats-form-grid">
          {amountField('minimum', '每日使用量下限')}{amountField('maximum', '每日使用量上限')}
          <label>开始使用日期<input type="date" min="1900-01-01" max={todayText} required value={fields.start} onChange={event => set('start', event.target.value)} /></label>
          <label>空档天数<div className="profile-number-field"><input type="number" min="0" max="100000" step="1" required value={fields.gapDays} onChange={event => set('gapDays', event.target.value)} /><span>天</span></div></label>
        </div><p className="profile-stats-help">每日范围用于普通活跃日，允许连续低用量或高用量。另安排一个峰值日，可超过每日上限；使用满一个月时随机安排在首月之后，不满一个月时在已有活跃日中随机安排。</p><p className="profile-stats-help">空档天数是开始使用日至今天的零用量天数，开始日期前不计入；每个自然周（周一至周日）最多 2 天。</p><p className="profile-stats-help">开始日期当天有记录，未来日期不显示。图表展示最近一年，统计卡汇总完整使用期间。颜色按 0、大于 0 至 2 亿、大于 2 至 4 亿、大于 4 至 6 亿、超过 6 亿分为五档。</p></fieldset>
        <p className="profile-stats-help">总量、峰值、连续天数和空档天数必须同时成立；冲突时会说明原因。最长任务用时独立设置。</p>
      </div>
      <div className="profile-stats-editor-footer"><p role="alert" className="profile-stats-error">{error}</p><div><kbd>⌘⌥E</kbd><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '正在保存…' : '保存并关闭'}</button></div></div>
    </form>
  </Dialog>;
}
