import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Check, ChevronRight, Clock3, FileText, History, Pause, Pencil, Play, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import type { AuthResult } from '../auth';
import { automationScheduleLabel, localDateInput, nextAutomationRun, validateAutomationTask, type AutomationTask, type AutomationsState } from '../automations-state';
import { Dialog, IconButton } from './ui';
import './automations-page.css';

type Filter = 'all' | 'active' | 'paused' | 'expired';
const filterNames: Record<Filter, string> = { all: '全部任务', active: '已开启', paused: '已暂停', expired: '已过期' };
const weekdays = [{ day: 1, label: '一' }, { day: 2, label: '二' }, { day: 3, label: '三' }, { day: 4, label: '四' }, { day: 5, label: '五' }, { day: 6, label: '六' }, { day: 0, label: '日' }];
const templates = [
  { name: '每日简报', description: '汇总值得关注的新闻与行业动态', instructions: '整理今天的重要新闻与行业动态，按主题归类，附上来源链接，并列出需要我关注的事项。', time: '09:00', weekly: false, icon: FileText },
  { name: '每周项目回顾', description: '回顾本周进展，梳理下周的重点', instructions: '总结本周项目进展，列出已完成事项、待解决问题和风险，并整理下周的工作重点。', time: '17:00', weekly: true, icon: CalendarClock },
  { name: '检查代码变更', description: '关注近期改动和需要跟进的问题', instructions: '检查项目近期代码变更，重点关注潜在问题和未完成事项，整理一份简洁的跟进清单。', time: '10:00', weekly: true, icon: Sparkles },
];
const tomorrowDate = () => { const date = new Date(); date.setDate(date.getDate() + 1); return localDateInput(date); };
const dateTime = (at: number) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
function statusOf(task: AutomationTask, now: number): Exclude<Filter, 'all'> {
  if (task.paused) return 'paused';
  return task.schedule.frequency === 'once' && nextAutomationRun(task, now) === null ? 'expired' : 'active';
}
function nextLabel(task: AutomationTask, now: number) {
  const next = nextAutomationRun(task, now);
  return task.paused ? '已暂停' : next === null ? '计划时间已过' : dateTime(next);
}
function newTask(template?: typeof templates[number]): AutomationTask {
  const now = Date.now();
  return { id: crypto.randomUUID(), name: template?.name ?? '', instructions: template?.instructions ?? '', paused: false, createdAt: now, updatedAt: now,
    schedule: { frequency: template?.weekly ? 'weekly' : 'daily', time: template?.time ?? '09:00', weekdays: template?.weekly ? (template.name === '每周项目回顾' ? [5] : [1, 2, 3, 4, 5]) : [1], date: '' } };
}

export function AutomationsPage({ value, onSave, onDirtyChange, sidebarVisible = true }: { value: AutomationsState; onSave: (next: AutomationsState) => Promise<AuthResult>; onDirtyChange?: (dirty: boolean) => void; sidebarVisible?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('next');
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'details' | 'history'>('details');
  const [draft, setDraft] = useState<AutomationTask | null>(null);
  const [deleting, setDeleting] = useState<AutomationTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const detail = value.tasks.find(task => task.id === selected);
  const savedDraft = draft ? value.tasks.find(task => task.id === draft.id) : undefined;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (pageRef.current?.closest('[hidden]')) return;
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { setSelected(null); trigger.current?.focus(); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const tasks = value.tasks.filter(task => (filter === 'all' || statusOf(task, now) === filter) && `${task.name} ${task.instructions}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'updated' ? b.updatedAt - a.updatedAt : (nextAutomationRun(a, now) ?? Infinity) - (nextAutomationRun(b, now) ?? Infinity) || b.updatedAt - a.updatedAt);
  const count = (target: Filter) => value.tasks.filter(task => target === 'all' || statusOf(task, now) === target).length;
  const openEditor = (task?: AutomationTask, template?: typeof templates[number]) => {
    if (pending.current) return;
    setError(''); setNotice('');
    setDraft(task ? { ...task, schedule: { ...task.schedule, weekdays: [...task.schedule.weekdays] } } : newTask(template));
  };
  const closeEditor = () => { if (!pending.current) { setDraft(null); setError(''); trigger.current?.focus(); } };
  const persist = async (next: AutomationsState, message: string) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await onSave(next);
      if (!result.ok) { setError(result.error || '无法保存任务，请重试。'); return false; }
      setNotice(message); return true;
    } catch { setError('无法保存任务，请重试。'); return false; }
    finally { pending.current = false; setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || pending.current) return;
    const next = { ...draft, name: draft.name.trim(), instructions: draft.instructions.trim(), updatedAt: Date.now() };
    const invalid = validateAutomationTask(next, Date.now());
    if (invalid) { setError(invalid); return; }
    const exists = value.tasks.some(task => task.id === next.id);
    if (!exists && value.tasks.length >= 1000) { setError('任务数量已达到上限，请先删除不再需要的任务。'); return; }
    const saved = await persist({ tasks: exists ? value.tasks.map(task => task.id === next.id ? next : task) : [next, ...value.tasks] }, exists ? '任务已保存' : '任务已创建');
    if (saved) { setDraft(null); setSelected(next.id); setDetailTab('details'); }
  };
  const toggle = async (task: AutomationTask) => {
    if (pending.current) return;
    if (task.paused && task.schedule.frequency === 'once' && nextAutomationRun({ ...task, paused: false }, Date.now()) === null) { openEditor(task); setError('计划时间已过，请先选择未来的日期和时间。'); return; }
    await persist({ tasks: value.tasks.map(item => item.id === task.id ? { ...item, paused: !item.paused, updatedAt: Date.now() } : item) }, task.paused ? '任务已开启' : '任务已暂停');
  };
  const remove = async () => {
    if (!deleting) return;
    if (await persist({ tasks: value.tasks.filter(task => task.id !== deleting.id) }, '任务已删除')) { if (selected === deleting.id) setSelected(null); setDeleting(null); }
  };
  const choose = (task: AutomationTask, button?: HTMLButtonElement) => { if (button) trigger.current = button; setSelected(task.id); setDetailTab('details'); setError(''); };

  return <div ref={pageRef} className={`automations-page ${detail ? 'has-detail' : ''}`}>
    {sidebarVisible && <aside className="automations-sidebar" aria-label="定时任务导航">
      <div className="automations-sidebar-heading"><strong>定时任务</strong><IconButton label="搜索定时任务" onClick={() => search.current?.focus()}><Search size={16} /></IconButton></div>
      <button className="automations-nav-row" disabled={busy} onClick={event => { trigger.current = event.currentTarget; openEditor(); }}><Plus size={16} />新建任务</button>
      <div className="automations-sidebar-label">任务</div>
      {(Object.keys(filterNames) as Filter[]).map(item => <button key={item} className={`automations-nav-row ${filter === item ? 'selected' : ''}`} aria-pressed={filter === item} onClick={() => { setFilter(item); setSelected(null); }}>
        {item === 'all' ? <CalendarClock size={16} /> : item === 'active' ? <Clock3 size={16} /> : item === 'paused' ? <Pause size={16} /> : <History size={16} />}<span>{filterNames[item]}</span><span className="automations-count">{count(item)}</span>
      </button>)}
      {!!value.tasks.length && <><div className="automations-sidebar-label">最近更新</div>{[...value.tasks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map(task => <button key={task.id} className={`automations-nav-row ${selected === task.id ? 'selected' : ''}`} onClick={event => choose(task, event.currentTarget)}><Clock3 size={15} /><span>{task.name}</span></button>)}</>}
      <div className="automations-sidebar-footer"><Clock3 size={14} /><span>{timeZone}</span></div>
    </aside>}
    <main className="automations-main">
      <div className="automations-content">
        <header className="automations-heading"><div><h1>定时任务</h1><p>安排任务、设置提醒或监控更新</p></div><button className="automations-primary" disabled={busy} onClick={event => { trigger.current = event.currentTarget; openEditor(); }}><Plus size={15} />创建任务</button></header>
        <div className="automations-toolbar"><label className="automations-search"><Search size={15} /><input ref={search} aria-label="搜索已安排的任务" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label><div className="automations-filters"><select aria-label="筛选任务" value={filter} onChange={event => setFilter(event.target.value as Filter)}>{(Object.keys(filterNames) as Filter[]).map(item => <option value={item} key={item}>{filterNames[item]}</option>)}</select><select aria-label="排序方式" value={sort} onChange={event => setSort(event.target.value)}><option value="next">下次运行</option><option value="updated">最近更新</option><option value="name">名称</option></select></div></div>
        {error && !draft && !deleting && <p className="automations-error" role="alert">{error}</p>}
        {notice && <div className="automations-notice" role="status"><Check size={14} />{notice}</div>}
        <section className="automations-task-list" aria-label="已安排的任务">
          <div className="automations-table-header"><span>任务</span><span>已安排</span><span>下次运行</span><span /></div>
          {tasks.map(task => <div className={`automations-task-row ${selected === task.id ? 'selected' : ''}`} key={task.id}>
            <button className="automations-task-name" onClick={event => choose(task, event.currentTarget)}><span className="automations-task-icon"><Clock3 size={18} /></span><span><strong>{task.name}</strong><small>{filterNames[statusOf(task, now)]}</small></span></button>
            <span className="automations-task-cadence">{automationScheduleLabel(task.schedule)}</span><span className="automations-task-next">{nextLabel(task, now)}</span>
            <div className="automations-row-actions"><IconButton label={`${task.paused ? '继续' : '暂停'} ${task.name}`} disabled={busy} onClick={() => void toggle(task)}>{task.paused ? <Play size={15} /> : <Pause size={15} />}</IconButton><IconButton label={`编辑 ${task.name}`} disabled={busy} onClick={() => openEditor(task)}><Pencil size={15} /></IconButton></div>
          </div>)}
          {!tasks.length && <div className="automations-empty"><span className="automations-empty-clock"><Clock3 size={28} /></span><h2>{query || filter !== 'all' ? '没有符合筛选条件的任务' : '无任务'}</h2><p>{query || filter !== 'all' ? '试试其他搜索词或筛选条件' : '创建任务，按你的时间安排整理重要事项'}</p>{(query || filter !== 'all') && <button className="automations-soft" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选</button>}</div>}
        </section>
        <section className="automations-recommendations"><h2>推荐</h2><div className="automations-template-grid">{templates.map(template => <button className="automations-template" disabled={busy} key={template.name} onClick={event => { trigger.current = event.currentTarget; openEditor(undefined, template); }}><template.icon size={20} /><strong>{template.name}</strong><span>{template.description}</span><span className="automations-template-time">{template.weekly ? '每周' : '每天'} · {template.time}<ChevronRight size={14} /></span></button>)}</div></section>
      </div>
    </main>
    {detail && <aside className="automations-detail" aria-label={`${detail.name} 任务详情`}>
      <header><span>任务详情</span><IconButton label="关闭任务详情" onClick={() => { setSelected(null); trigger.current?.focus(); }}><X size={17} /></IconButton></header>
      <div className="automations-detail-body"><span className="automations-detail-badge"><Clock3 size={14} />{filterNames[statusOf(detail, now)]}</span><h2>{detail.name}</h2><p className="automations-detail-cadence">{automationScheduleLabel(detail.schedule)}</p>
        <div className="automations-detail-actions"><button className="automations-soft" disabled={busy} onClick={() => openEditor(detail)}><Pencil size={14} />编辑任务</button><button className="automations-soft" disabled={busy} onClick={() => void toggle(detail)}>{detail.paused ? <Play size={14} /> : <Pause size={14} />}{detail.paused ? '继续' : '暂停'}</button><IconButton label={`删除 ${detail.name}`} disabled={busy} onClick={() => { setError(''); setDeleting(detail); }}><Trash2 size={15} /></IconButton></div>
        <div className="automations-detail-tabs" role="tablist" aria-label="任务详情内容"><button role="tab" aria-selected={detailTab === 'details'} onClick={() => setDetailTab('details')}>详情</button><button role="tab" aria-selected={detailTab === 'history'} onClick={() => setDetailTab('history')}>历史运行记录</button></div>
        {detailTab === 'details' ? <div role="tabpanel"><h3>提示词</h3><p className="automations-instructions">{detail.instructions}</p><dl className="automations-detail-meta"><div><dt>下次运行</dt><dd>{nextLabel(detail, now)}</dd></div><div><dt>时区</dt><dd>{timeZone}</dd></div><div><dt>上次更新</dt><dd>{dateTime(detail.updatedAt)}</dd></div></dl><div className="automations-service"><span>任务执行服务尚未连接</span><p>当前可保存时间安排，连接执行服务后运行任务。</p><button className="automations-soft" disabled title="任务执行服务尚未连接"><Play size={14} />立即运行</button></div></div> : <div className="automations-history-empty" role="tabpanel"><History size={26} /><h3>尚未运行</h3><p>暂无历史运行记录</p></div>}
      </div>
    </aside>}
    {draft && <Dialog title={value.tasks.some(task => task.id === draft.id) ? '编辑任务' : '设置定时任务'} onClose={closeEditor} className="automations-editor">
      <form onSubmit={event => void submit(event)}><fieldset className="automations-editor-body automations-editor-fields" disabled={busy}><label>名称<input autoComplete="off" required maxLength={120} placeholder="任务名称" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>提示词<textarea required maxLength={20_000} rows={5} placeholder="说明要执行的任务…" value={draft.instructions} onChange={event => setDraft({ ...draft, instructions: event.target.value })} /></label>
        <fieldset><legend>时间安排</legend><div className="automations-schedule-fields"><label>重复频率<select value={draft.schedule.frequency} onChange={event => setDraft({ ...draft, schedule: { ...draft.schedule, frequency: event.target.value as AutomationTask['schedule']['frequency'], date: event.target.value === 'once' ? draft.schedule.date || tomorrowDate() : '', weekdays: draft.schedule.weekdays.length ? draft.schedule.weekdays : [1] } })}><option value="daily">每天</option><option value="weekly">每周</option><option value="once">一次</option></select></label><label>时间<input aria-label="任务时间" type="time" required value={draft.schedule.time} onChange={event => setDraft({ ...draft, schedule: { ...draft.schedule, time: event.target.value } })} /></label></div>
        {draft.schedule.frequency === 'weekly' && <div className="automations-weekdays"><span>星期几</span><div>{weekdays.map(({ day, label }) => <button type="button" key={day} aria-label={`星期${label}`} aria-pressed={draft.schedule.weekdays.includes(day)} onClick={() => setDraft({ ...draft, schedule: { ...draft.schedule, weekdays: draft.schedule.weekdays.includes(day) ? draft.schedule.weekdays.filter(item => item !== day) : [...draft.schedule.weekdays, day] } })}>{label}</button>)}</div></div>}
        {draft.schedule.frequency === 'once' && <label>日期<input type="date" required min={localDateInput(new Date())} value={draft.schedule.date} onChange={event => setDraft({ ...draft, schedule: { ...draft.schedule, date: event.target.value } })} /></label>}<p className="automations-time-zone">时区：{timeZone}</p></fieldset>
        <label className="automations-pause-label"><span><strong>暂停任务</strong><small>保留任务设置，暂不安排运行</small></span><input type="checkbox" checked={draft.paused} onChange={event => setDraft({ ...draft, paused: event.target.checked })} /></label>
        <p className="automations-editor-note">任务执行服务尚未连接</p>{error && <p className="automations-error" role="alert">{error}</p>}</fieldset><footer><button type="button" className="automations-soft" disabled={busy} onClick={closeEditor}>取消</button><button type="submit" className="automations-primary" disabled={busy}>{busy ? '保存中…' : value.tasks.some(task => task.id === draft.id) ? '保存' : '创建'}</button></footer></form>
    </Dialog>}
    {deleting && <Dialog title="删除任务？" onClose={() => { if (!pending.current) { setDeleting(null); setError(''); } }} className="automations-delete"><p>“{deleting.name}”及其时间安排将被移除。</p>{error && <p className="automations-error" role="alert">{error}</p>}<footer><button className="automations-soft" disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>取消</button><button className="automations-danger" disabled={busy} onClick={() => void remove()}>{busy ? '删除中…' : '删除任务'}</button></footer></Dialog>}
  </div>;
}
