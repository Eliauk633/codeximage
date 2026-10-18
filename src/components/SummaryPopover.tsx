import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { Thread } from '../model';
import summaryIcon from '../assets/reference-icons/header-summary.svg';

export function SummaryPopover({ thread, projectName }: { thread?: Thread; projectName?: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(['进度', '输出', '来源']);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [right, setRight] = useState(8);
  const messages = thread?.messages ?? [];
  function close() { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); }
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current!.getBoundingClientRect();
    setRight(Math.max(8, innerWidth - trigger.right));
    closeRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const focusChanged = (event: FocusEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); event.stopPropagation(); close(); }
    };
    const resized = () => close();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', resized);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusChanged); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', resized); };
  }, [open]);
  return <>
    <button ref={triggerRef} className={`icon-button${open ? ' active' : ''}`} title="切换摘要" aria-label="切换摘要" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => open ? close() : setOpen(true)}>
      <span className="header-reference-icon" style={{ maskImage: `url("${summaryIcon}")` }} />
    </button>
    {open && createPortal(<div id={id} ref={panelRef} className="thread-summary-popover" role="region" aria-label="聊天摘要" style={{ right }}>
      <header><strong>摘要</strong><button ref={closeRef} className="icon-button" aria-label="关闭摘要" onClick={close}><X size={16} /></button></header>
      <div className="summary-thread-title">{thread?.title ?? '新聊天'}</div>
      <p className="summary-demo-note">概要 · 尚未连接 AI</p>
      {['进度', '输出', '来源'].map(section => <section key={section}>
        <button className="summary-section-toggle" aria-expanded={expanded.includes(section)} onClick={() => setExpanded(values => values.includes(section) ? values.filter(value => value !== section) : [...values, section])}>{expanded.includes(section) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>{section}</span></button>
        {expanded.includes(section) && <div className="summary-section-content">
          {section === '进度' ? <p>{messages.length ? `已在本机保存 ${messages.filter(message => message.role === 'user').length} 条用户消息。` : '开始聊天后，在这里查看进度。'}</p>
            : section === '输出' ? <p>暂时没有生成的文件或输出。</p>
            : <p>{projectName ? `当前项目：${projectName}` : '未关联项目或外部来源。'}</p>}
        </div>}
      </section>)}
    </div>, document.body)}
  </>;
}
