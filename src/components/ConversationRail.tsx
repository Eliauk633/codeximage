import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Message } from '../model';
import './conversation-rail.css';

export function ConversationRail({ messages, scrollerRef, threadId }: {
  messages: Message[]; scrollerRef: RefObject<HTMLDivElement | null>; threadId: string;
}) {
  const turns = useMemo(() => messages.flatMap((message, index) => message.role === 'user'
    ? [{ id: message.id, question: message.content, answer: messages[index + 1]?.role === 'assistant' ? messages[index + 1].content : '' }] : []), [messages]);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; moved: boolean } | null>(null);
  const [visible, setVisible] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ index: number; x: number; y: number } | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const enabled = turns.length >= 4;

  useEffect(() => { setHover(null); setPreview(null); drag.current = null; }, [threadId]);
  useEffect(() => {
    const scroller = scrollerRef.current, list = listRef.current;
    if (!enabled || !scroller || !list) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = scroller.getBoundingClientRect();
      const elements = Array.from(scroller.querySelectorAll<HTMLElement>('.message.user[data-message-id]'));
      const next = elements.flatMap((el, index) => {
        const top = el.getBoundingClientRect().top;
        const end = elements[index + 1]?.getBoundingClientRect().top ?? root.bottom + 1;
        return top < root.bottom && end > root.top ? [index] : [];
      });
      setVisible(old => old.join(',') === next.join(',') ? old : next);
      updateEdges(list);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(list);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    scroller.addEventListener('scroll', schedule, { passive: true });
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scroller.removeEventListener('scroll', schedule); };
  }, [enabled, turns, scrollerRef, threadId]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || hover !== null || drag.current || !visible.length) return;
    const middle = (visible[0] + visible[visible.length - 1]) / 2;
    list.scrollTop = Math.max(0, middle * 10 - list.clientHeight / 2);
  }, [visible]);
  useEffect(() => {
    if (hover === null || drag.current) { setPreview(null); return; }
    const timer = window.setTimeout(() => {
      const item = listRef.current?.children[hover];
      if (!item) return;
      const rect = item.getBoundingClientRect();
      setPreview({ index: hover, x: rect.right, y: Math.max(12, Math.min(window.innerHeight - 150, rect.top - 24)) });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [hover]);

  function updateEdges(list: HTMLDivElement) {
    const top = list.scrollTop > 1, bottom = list.scrollHeight - list.scrollTop - list.clientHeight > 1;
    setEdges(old => old.top === top && old.bottom === bottom ? old : { top, bottom });
  }

  function navigate(index: number, smooth: boolean) {
    const scroller = scrollerRef.current;
    const turn = turns[index];
    if (!scroller || !turn) return;
    const target = Array.from(scroller.querySelectorAll<HTMLElement>('.message.user[data-message-id]')).find(el => el.dataset.messageId === turn.id);
    if (!target) return;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 18;
    scroller.scrollTo({ top: Math.max(0, top), behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }
  function indexAt(clientY: number) {
    const list = listRef.current!;
    const rect = list.getBoundingClientRect();
    const y = Math.max(rect.top, Math.min(rect.bottom - 1, clientY));
    return Math.max(0, Math.min(turns.length - 1, Math.floor((y - rect.top + list.scrollTop) / 10)));
  }
  if (!enabled) return null;
  return <nav className="conversation-rail" aria-label="用户消息导航">
    <div className="conversation-rail-list" ref={listRef} data-fade-top={edges.top || undefined} data-fade-bottom={edges.bottom || undefined}
      onScroll={event => { updateEdges(event.currentTarget); setPreview(null); setHover(null); }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        drag.current = { startY: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId); setPreview(null);
      }}
      onPointerMove={event => {
        const index = indexAt(event.clientY); setHover(index);
        if (drag.current && Math.abs(event.clientY - drag.current.startY) > 3) drag.current.moved = true;
        if (drag.current?.moved) navigate(index, false);
      }}
      onPointerUp={event => {
        if (!drag.current) return;
        navigate(indexAt(event.clientY), !drag.current.moved); drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; setHover(null); }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerLeave={() => { if (!drag.current) { setHover(null); setPreview(null); } }}>
      {turns.map((turn, index) => {
        const distance = hover === null ? 4 : Math.abs(index - hover);
        const progress = [1, .7, .4, .2][distance] ?? 0;
        return <button key={turn.id} type="button" className="conversation-rail-stop" aria-label={`跳到第 ${index + 1} 轮：${turn.question.slice(0, 100)}`}
          aria-current={visible.includes(index) ? true : undefined} data-hovered={hover === index || undefined}
          style={{ '--rail-progress': progress } as CSSProperties}
          onClick={event => { if (event.detail === 0) navigate(index, true); }}
          onFocus={() => setHover(index)} onBlur={() => { setHover(null); setPreview(null); }}
          onKeyDown={event => {
            const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? turns.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            (listRef.current?.children[Math.max(0, Math.min(turns.length - 1, next))] as HTMLElement)?.focus();
          }}><span /></button>;
      })}
    </div>
    {preview && turns[preview.index] && createPortal(<div className="conversation-rail-preview" style={{ left: preview.x, top: preview.y }} role="tooltip">
      <strong>{turns[preview.index].question}</strong>{turns[preview.index].answer && <p>{turns[preview.index].answer}</p>}
    </div>, document.body)}
  </nav>;
}
