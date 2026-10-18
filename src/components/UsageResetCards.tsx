import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthResult } from '../auth';
import { applyUsageReset, getAvailableResetCount, getAvailableResetIndices, getResetCardExpiry, type UsageDemoConfig } from '../usage-demo';
import { Dialog } from './ui';

type Props = { value: UsageDemoConfig; now: number; saving: boolean; onSave: (next: UsageDemoConfig) => Promise<AuthResult> };
const pageSize = 20;
function expiryText(timestamp: number | null) {
  if (timestamp === null) return '无到期限制';
  const date = new Date(timestamp);
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value ?? '';
  return `将于 ${date.getMonth() + 1}月${date.getDate()}日 ${zone} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 到期`;
}

export function UsageResetCards({ value, now, saving, onSave }: Props) {
  const [tab, setTab] = useState<'available' | 'history'>('available');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const available = getAvailableResetCount(value, now);
  const total = tab === 'available' ? available : value.resetHistory.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
  const cards = useMemo(() => tab === 'available' ? getAvailableResetIndices(value, now, currentPage * pageSize, pageSize) : [],
    [value, now, currentPage, tab]);
  useEffect(() => { setPage(currentPage); }, [currentPage]);
  function close() {
    if (pending.current) return;
    setSelected(null); setError('');
    requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : panel.current)?.focus({ preventScroll: true }));
  }
  async function consume() {
    if (selected === null || pending.current || saving) return;
    const next = applyUsageReset(value, Date.now(), selected);
    if (!next) { setError('这次重置已到期或不可用，请关闭后选择其他额度。'); return; }
    pending.current = true; setSubmitting(true); setError('');
    try {
      const result = await onSave(next);
      if (result.ok) { pending.current = false; close(); } else setError(result.error);
    } catch { setError('重置未完成，请重试。'); }
    finally { pending.current = false; setSubmitting(false); }
  }
  return <div className="usage-reset-card" ref={panel} tabIndex={-1}>
    <div className="settings-tab-list usage-reset-card-tabs" role="tablist" aria-label="重置记录">
      <button role="tab" aria-selected={tab === 'available'} onClick={() => { setTab('available'); setPage(0); }}>可用 <span>{available.toLocaleString('en-US')}</span></button>
      <button role="tab" aria-selected={tab === 'history'} onClick={() => { setTab('history'); setPage(0); }}>历史记录</button>
    </div>
    {tab === 'available' ? cards.length ? cards.map(index => <div className="usage-reset-row" key={index}>
      <div><span>完全重置</span><p>{expiryText(getResetCardExpiry(value, index))}</p></div>
      <button className="settings-outline-button is-filled" disabled={saving} aria-label={`使用第 ${index + 1} 张重置额度`} onClick={event => { opener.current = event.currentTarget; setSelected(index); setError(''); }}>使用重置额度</button>
    </div>) : <div className="usage-reset-empty">暂无可用重置额度{value.resetCount > 0 && <p>{value.resetCount} 次额度已到期</p>}</div>
      : value.resetHistory.length ? [...value.resetHistory].reverse().slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((time, index) => <div className="usage-reset-row" key={`${time}-${index}`}><div><span>完全重置</span><p>{new Date(time).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p></div><span className="usage-reset-used">已使用</span></div>) : <div className="usage-reset-empty">暂无重置记录</div>}
    {total > pageSize && <div className="usage-reset-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {Math.ceil(total / pageSize)}</span><button disabled={(currentPage + 1) * pageSize >= total} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
    {selected !== null && <Dialog title="使用重置额度？" className="small-dialog" onClose={close}>
      <div className="dialog-content"><p>本次重置将恢复每周限额，下次重置时间从现在起重新计算 7 天，并消耗一次重置额度。</p><p className="usage-reset-confirm-expiry">{expiryText(getResetCardExpiry(value, selected))}</p><p className="usage-save-error" role="alert">{error}</p></div>
      <div className="dialog-footer"><button className="secondary-button" disabled={submitting} onClick={close}>取消</button><button className="primary-button" disabled={submitting} onClick={() => void consume()}>{submitting ? '正在重置…' : '确认重置'}</button></div>
    </Dialog>}
  </div>;
}
