import { useEffect, useRef, useState } from 'react';
import { Group, PreferenceRow, Toggle, SelectControl, type SettingsSectionProps } from './SettingsControls';
import { Dialog } from './ui';
import './usage-settings.css';
import type { AuthResult } from '../auth';
import { formatResetCountdown, type UsageDemoConfig } from '../usage-demo';
import { UsageStatsEditor } from './UsageStatsEditor';
import { PlanPage } from './PlanPage';
import { UsageResetCards } from './UsageResetCards';
import { UsageAnalytics } from './UsageAnalytics';

type Props = SettingsSectionProps & { usage: UsageDemoConfig; onSave: (next: UsageDemoConfig) => Promise<AuthResult>; suspended?: boolean };
export function UsageSettings({ usage, onSave, suspended = false }: Props) {
  const [editor, setEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const writing = useRef(false);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (suspended) return;
    const edit = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || !event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey || event.code !== 'KeyE') return;
      if (document.querySelector('dialog[open], [role=menu]') || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true]'))) return;
      event.preventDefault(); event.stopPropagation(); opener.current = document.activeElement as HTMLElement; setEditor(true);
    };
    document.addEventListener('keydown', edit);
    return () => document.removeEventListener('keydown', edit);
  }, [suspended]);
  function closeEditor() { setEditor(false); requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : root.current)?.focus({ preventScroll: true })); }
  async function save(next: UsageDemoConfig): Promise<AuthResult> {
    if (writing.current) return { ok: false, error: '正在保存，请稍候。' };
    writing.current = true; setSaving(true); setError('');
    try { const result = await onSave(next); if (!result.ok) setError(result.error); return result; }
    catch { const message = '更改未保存，请重试。'; setError(message); return { ok: false, error: message }; }
    finally { writing.current = false; setSaving(false); }
  }
  const [tab, setTab] = useState('概览');
  const [modal, setModal] = useState<'plans' | 'credits' | null>(null);
  const [creditAmount, setCreditAmount] = useState('1,000');
  const { weeklyRemaining: remaining, balance, plan, billingCycle: currentCycle } = usage;
  const price = plan === 'ChatGPT Pro 200' ? 200 : plan === 'ChatGPT Pro 100' ? 100 : plan === 'ChatGPT Plus' ? 20 : plan === 'ChatGPT Go' ? 8 : 0;
  const planPrice = plan === 'ChatGPT Business' ? currentCycle : plan === 'ChatGPT Free' ? '免费' : currentCycle === '月付' ? `每月 $${price}` : '按年付费';
  return <div className="usage-settings" ref={root} tabIndex={-1}>
    <div className="usage-toolbar"><div className="settings-tab-list" role="tablist" aria-label="使用情况视图">{['概览', '分析'].map(label => <button key={label} role="tab" aria-selected={tab === label} onClick={() => setTab(label)}>{label}</button>)}</div></div>
    {tab === '概览' ? <>
      <section className="usage-section"><h3>当前套餐</h3><p>管理你的套餐与使用额度。</p>
        <div className="usage-card usage-plan"><div><span>{plan}</span><p>{planPrice}</p></div><button className="settings-outline-button is-filled" onClick={() => setModal('plans')}>查看套餐</button></div>
      </section>
      <section className="usage-section"><h3>套餐限额</h3><p>Codex、Work、工作空间智能体和 ChatGPT for Excel 共享使用额度。Chat 模式下的对话不计入此用量。</p>
        <div className="usage-card usage-quota"><span>每周限额</span><div className="usage-quota-labels"><span title={new Date(usage.weeklyResetAt).toLocaleString('zh-CN')}>{formatResetCountdown(usage.weeklyResetAt, now)}</span><span>剩余 {remaining}%</span></div><progress aria-label="每周剩余额度" max="100" value={remaining} /></div>
      </section>
      <section className="usage-section"><h3>额度</h3><p>购买额度，即可在达到使用限额后继续使用 Work 和 Codex</p>
        <div className="usage-card"><div><span>剩余额度：{balance.toLocaleString('en-US')}</span><p>当前余额</p></div><div className="usage-card-actions"><span className="usage-discount">最高可享 30% 折扣</span><button className="settings-outline-button is-filled" onClick={() => setModal('credits')}>购买更多额度</button></div></div>
      </section>
      <section className="usage-section usage-reset-allow"><Group><PreferenceRow label="允许 Codex 使用用量重置" description="允许 Codex 在你对话中明确请求时使用重置，但仅限当前额度剩余 10% 或更少的情况。重置绝不会自动使用。" htmlFor="usage-allow-reset"><Toggle id="usage-allow-reset" checked={usage.allowReset} onChange={() => { if (!saving) void save({ ...usage, allowReset: !usage.allowReset }); }} /></PreferenceRow></Group></section>
      <section className="usage-section"><h3>使用限额重置</h3><p>使用一次重置，即可恢复你的 5 小时限额、每周限额，或同时恢复两者</p><UsageResetCards value={usage} now={now} saving={saving} onSave={save} />
      </section>
    </> : <UsageAnalytics now={now} />}
    <p className="usage-save-error" role="alert">{error}</p>
    {editor && <UsageStatsEditor value={usage} onClose={closeEditor} onSave={save} />}
    {modal === 'plans' && <PlanPage currentPlan={plan} onClose={() => setModal(null)} onSelect={next => save({ ...usage, plan: next, billingCycle: '月付' })} />}
    {modal === 'credits' && <Dialog title="购买更多额度" onClose={() => setModal(null)} className="small-dialog"><div className="dialog-content"><label className="usage-dialog-label" htmlFor="usage-credit-amount">额度数量</label><SelectControl id="usage-credit-amount" label="额度数量" value={creditAmount} options={['1,000', '5,000', '10,000']} onChange={setCreditAmount} /><p className="usage-payment-status">支付服务尚未连接。</p></div><div className="dialog-footer"><button className="secondary-button" onClick={() => setModal(null)}>关闭</button><button className="primary-button" disabled>暂不可购买</button></div></Dialog>}
  </div>;
}
