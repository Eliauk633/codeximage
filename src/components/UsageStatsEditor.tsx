import { useState, type FormEvent } from 'react';
import type { AuthResult } from '../auth';
import { getResetCardExpiry, usagePlans, validateUsageDemo, type UsageDemoConfig, type UsagePlan } from '../usage-demo';
import { Dialog } from './ui';

type Props = { value: UsageDemoConfig; onClose: () => void; onSave: (next: UsageDemoConfig) => Promise<AuthResult> };
function localTime(timestamp: number | null) {
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function timestampFromInput(text: string, original: number | null) {
  return !text ? null : text === localTime(original) ? original : new Date(text).getTime();
}

export function UsageStatsEditor({ value, onClose, onSave }: Props) {
  const [fields, setFields] = useState({ plan: value.plan, cycle: value.billingCycle,
    remaining: String(value.weeklyRemaining), resetAt: localTime(value.weeklyResetAt), balance: String(value.balance),
    count: String(value.resetCount), expiresAt: localTime(value.resetExpiresAt) });
  const [cardExpiries, setCardExpiries] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(value.resetExpiryOverrides ?? {}).map(([index, expiry]) => [index, localTime(expiry)])));
  const [cardPage, setCardPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cardCount = /^\d+$/.test(fields.count) && Number(fields.count) <= 1_000_000 ? Number(fields.count) : 0;
  const pageCount = Math.max(1, Math.ceil(cardCount / 20));
  const currentPage = Math.min(cardPage, pageCount - 1);
  const firstCard = currentPage * 20;
  const set = (key: keyof typeof fields, next: string) => {
    setFields(current => ({ ...current, [key]: next })); setError('');
    if (key === 'count' && /^\d+$/.test(next)) {
      setCardPage(current => Math.min(current, Math.max(0, Math.ceil(Number(next) / 20) - 1)));
    }
  };
  function setCardExpiry(index: number, text: string | undefined) {
    setCardExpiries(current => {
      const next = { ...current };
      if (text === undefined) delete next[index]; else next[index] = text;
      return next;
    });
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (![fields.remaining, fields.balance].every(text => /^\d+(\.\d{1,2})?$/.test(text)) || !/^\d+$/.test(fields.count)) {
      setError('额度请填写非负数字，最多两位小数；重置卡数量须为整数。'); return;
    }
    const expiry = timestampFromInput(fields.expiresAt, value.resetExpiresAt);
    const overrides: Record<string, number | null> = {};
    for (const [index, text] of Object.entries(cardExpiries)) {
      if (Number(index) >= Number(fields.count)) continue;
      const cardExpiry = timestampFromInput(text, getResetCardExpiry(value, Number(index)));
      if (cardExpiry !== expiry) overrides[index] = cardExpiry;
    }
    const { resetExpiryOverrides: _, ...unchanged } = value;
    const next: UsageDemoConfig = { ...unchanged, plan: fields.plan, billingCycle: fields.cycle,
      weeklyRemaining: Number(fields.remaining), balance: Number(fields.balance), resetCount: Number(fields.count),
      weeklyResetAt: fields.resetAt === localTime(value.weeklyResetAt) ? value.weeklyResetAt : new Date(fields.resetAt).getTime(),
      resetExpiresAt: expiry, ...(Object.keys(overrides).length ? { resetExpiryOverrides: overrides } : {}) };
    const validation = validateUsageDemo(next);
    if (validation) { setError(validation); return; }
    setSaving(true);
    try { const result = await onSave(next); if (result.ok) onClose(); else setError(result.error); }
    catch { setError('保存未完成，请重试。'); }
    finally { setSaving(false); }
  }
  return <Dialog title="编辑使用情况和计费" onClose={() => { if (!saving) onClose(); }} className="usage-editor-dialog">
    <form onSubmit={save}><div className="usage-editor-fields"><p>保存后更新当前账号的套餐、额度和重置卡。</p>
      <fieldset disabled={saving}><legend>套餐</legend><div className="usage-editor-grid">
        <label>当前套餐<select value={fields.plan} onChange={event => set('plan', event.target.value as UsagePlan)}>{usagePlans.map(plan => <option key={plan}>{plan}</option>)}</select></label>
        <label>付费周期<select value={fields.cycle} onChange={event => set('cycle', event.target.value)}><option>月付</option><option>年付</option></select></label>
      </div></fieldset>
      <fieldset disabled={saving}><legend>每周额度与余额</legend><div className="usage-editor-grid">
        <label>每周剩余额度（%）<input type="number" min="0" max="100" step="0.01" required value={fields.remaining} onChange={event => set('remaining', event.target.value)} /></label>
        <label>下次重置时间<input type="datetime-local" min="1900-01-01T00:00" max="9999-12-31T23:59" required value={fields.resetAt} onChange={event => set('resetAt', event.target.value)} /></label>
        <label>剩余额度<input type="number" min="0" max="1000000000000" step="0.01" required value={fields.balance} onChange={event => set('balance', event.target.value)} /></label>
      </div></fieldset>
      <fieldset disabled={saving}><legend>重置卡</legend><div className="usage-editor-grid">
        <label>重置卡数量<input type="number" min="0" max="1000000" step="1" required value={fields.count} onChange={event => set('count', event.target.value)} /></label>
        <label>默认到期时间<input type="datetime-local" min="1900-01-01T00:00" max="9999-12-31T23:59" value={fields.expiresAt} onChange={event => set('expiresAt', event.target.value)} /></label>
      </div><p>到期时间留空表示无到期限制。可为每张卡单独设置时间，已到期的卡不可使用。所有时间均为本机时区。</p>
      <details className="usage-card-expiry-editor"><summary>每张重置卡的到期时间<span>{cardCount.toLocaleString('zh-CN')} 张</span></summary>
        {cardCount === 0 ? <p>暂无重置卡，请先填写数量。</p> : <>
          <div className="usage-card-expiry-list">{Array.from({ length: Math.min(20, cardCount - firstCard) }, (_, offset) => {
            const index = firstCard + offset;
            const customized = Object.hasOwn(cardExpiries, String(index));
            return <div className="usage-card-expiry-row" key={index}>
              <label>第 {index + 1} 张 · 完全重置<input aria-label={`第 ${index + 1} 张重置卡到期时间`} type="datetime-local" min="1900-01-01T00:00" max="9999-12-31T23:59"
                value={customized ? cardExpiries[index] : fields.expiresAt} onChange={event => setCardExpiry(index, event.target.value)} /></label>
              <button type="button" className="settings-outline-button" disabled={!customized} onClick={() => setCardExpiry(index, undefined)}>使用默认</button>
            </div>;
          })}</div>
          {pageCount > 1 && <div className="usage-card-expiry-pagination"><button type="button" className="settings-outline-button" disabled={currentPage === 0} onClick={() => setCardPage(currentPage - 1)}>上一页</button>
            <span>{currentPage + 1} / {pageCount}</span><button type="button" className="settings-outline-button" disabled={currentPage + 1 >= pageCount} onClick={() => setCardPage(currentPage + 1)}>下一页</button></div>}
        </>}
      </details></fieldset>
    </div><div className="usage-editor-footer"><p role="alert">{error}</p><div><kbd>⌘⌥E</kbd><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '正在保存…' : '保存并关闭'}</button></div></div></form>
  </Dialog>;
}
