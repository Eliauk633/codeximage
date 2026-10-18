import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { activityDetails, activityTotals, dailyActivityLevel, formatTokenAmount, type ActivityCalendar, type ActivityMode } from '../profile-activity';

export function ProfileActivity({ calendar }: { calendar: ActivityCalendar }) {
  const [mode, setMode] = useState<ActivityMode>('每天');
  const [active, setActive] = useState(calendar.lastDay);
  const [selected, setSelected] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const grid = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const totals = activityTotals(calendar.weeks, mode === '累计总量', calendar.priorTokens);
  const max = Math.max(...totals, 1);
  const details = selected === null ? null : activityDetails(calendar, mode, Math.floor(selected / 7), selected % 7);
  const dismiss = () => { setSelected(null); setPinned(false); };

  useLayoutEffect(() => {
    if (selected === null || !tooltip.current) return;
    const target = grid.current?.querySelector<HTMLButtonElement>(`[data-index="${selected}"]`);
    if (!target) return;
    const cell = target.getBoundingClientRect();
    const bubble = tooltip.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(innerWidth - bubble.width - 8, cell.left + 8)),
      top: Math.max(8, cell.bottom + bubble.height + 14 <= innerHeight ? cell.bottom + 6 : cell.top - bubble.height - 6) });
  }, [selected, pinned, mode]);

  useEffect(() => {
    if (selected === null) return;
    const outside = (event: Event) => { if (!grid.current?.contains(event.target as Node)) dismiss(); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); dismiss();
    };
    const moved = () => dismiss();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    };
  }, [selected]);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const day = index % 7;
    const next = ({ ArrowLeft: index - 7, ArrowRight: index + 7, ArrowUp: index - (day > 0 ? 1 : 0),
      ArrowDown: index + (day < 6 ? 1 : 0), Home: calendar.firstDay, End: calendar.lastDay } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const bounded = Math.max(calendar.firstDay, Math.min(calendar.lastDay, next));
    setActive(bounded); setPinned(false); setSelected(bounded);
    grid.current?.querySelector<HTMLButtonElement>(`[data-index="${bounded}"]`)?.focus({ preventScroll: true });
  }

  return <section className="profile-activity">
    <header><h2>Token 活动</h2><div className="profile-activity-modes" role="group" aria-label="Token 活动范围">
      {(['每天', '每周', '累计总量'] as const).map(item => <button key={item} aria-pressed={mode === item} onClick={() => { setMode(item); dismiss(); }}>{item}</button>)}
    </div></header>
    <div ref={grid} className="profile-heatmap" style={{ gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(1px, 1fr))` }} data-view={mode === '每天' ? 'daily' : 'weekly'} role="group" aria-label={`${mode} Token 活动。使用方向键查看其他日期，回车固定用量。`}>
      {calendar.weeks.flatMap((week, w) => week.map((count, day) => {
        const index = w * 7 + day;
        const entry = activityDetails(calendar, mode, w, day);
        const lastValidDay = Math.min(6, calendar.lastDay - w * 7);
        const filled = Math.ceil(totals[w] / max * week.filter(value => value !== null).length);
        const amount = mode === '每天' ? count : day > lastValidDay - filled ? totals[w] : 0;
        const level = !entry || !amount ? 0 : mode === '每天' ? dailyActivityLevel(amount) : Math.max(1, Math.min(4, Math.ceil(totals[w] / max * 4)));
        return <button key={index} type="button" data-index={index} data-level={level} disabled={!entry}
          tabIndex={index === active ? 0 : -1} aria-pressed={pinned && selected === index}
          aria-describedby={selected === index ? tooltipId : undefined}
          aria-label={entry ? `${entry.label}，${entry.exactTokens} 个 Token` : '日期范围外'}
          onPointerEnter={() => { if (!pinned) setSelected(index); }} onPointerLeave={() => { if (!pinned) setSelected(null); }}
          onFocus={() => { setActive(index); if (!pinned) setSelected(index); }}
          onClick={() => { setActive(index); if (pinned && selected === index) dismiss(); else { setSelected(index); setPinned(true); } }}
          onKeyDown={event => move(event, index)} />;
      }))}
    </div>
    <div className="profile-months" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${calendar.weeks.length}, minmax(1px, 1fr))` }}>{calendar.months.map(({ label, column }) => <span key={column} style={{ gridColumn: column + 1, justifySelf: column >= calendar.weeks.length - 3 ? 'end' : 'start' }}>{label}</span>)}</div>
    {details && createPortal(<div ref={tooltip} id={tooltipId} role="tooltip" className="profile-activity-tooltip" style={{ position: 'fixed', ...position }}>
      <span>{details.label}</span><span>{formatTokenAmount(details.tokens)} 个 Token</span>
      {pinned && <small>精确用量：{details.exactTokens}</small>}
    </div>, document.body)}
  </section>;
}
