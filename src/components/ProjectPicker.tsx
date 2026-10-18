import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search, X } from 'lucide-react';
import { ProjectAppearanceIcon } from './ProjectAppearanceIcon';
import type { Project } from '../model';
import { projectDirectoryLabel, filterProjects } from '../project-picker';
import './project-picker.css';

export function ProjectPicker({ projects, selectedId, onSelect, onCreate, trigger, label = '选择项目', side = 'bottom' }: {
  projects: Project[]; selectedId: string | null; onSelect: (id: string | null) => void;
  onCreate: () => void; trigger: ReactNode; label?: string; side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ above: false, below: false });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const filtered = filterProjects(projects, query);
  const close = (restoreFocus = false) => { setOpen(false); if (restoreFocus) button.current?.focus(); };
  const updateScrollEdges = () => {
    const node = list.current;
    if (node) setScrollEdges({ above: node.scrollTop > 1, below: node.scrollTop + node.clientHeight < node.scrollHeight - 1 });
  };

  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = 0;
    updateScrollEdges();
  }, [open, query, projects]);

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const anchor = button.current.getBoundingClientRect();
    const panel = menu.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(innerWidth - panel.width - 8, anchor.left)),
      top: Math.max(8, Math.min(innerHeight - panel.height - 8, side === 'top' ? anchor.top - panel.height : anchor.bottom + 5)),
    });
  }, [open, side, filtered.length]);
  useEffect(() => { if (open && position) search.current?.focus(); }, [open, !!position]);
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => target instanceof Node && (root.current?.contains(target) || menu.current?.contains(target));
    const outside = (event: Event) => { if (!inside(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
    };
    const resized = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', outside, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resized);
    window.addEventListener('blur', resized);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', outside, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resized);
      window.removeEventListener('blur', resized);
    };
  }, [open]);
  const show = () => { setQuery(''); setPosition(null); setOpen(true); };
  const choose = (value: string | null) => { close(true); onSelect(value); };

  return <div ref={root} className="dropdown project-picker">
    <button type="button" ref={button} className={`dropdown-trigger ${open ? 'active' : ''}`} aria-label={label}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}>{trigger}</button>
    {open && createPortal(<div ref={menu} id={id} role="dialog" aria-label={label} className="project-picker-popover"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        const actions = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[data-project-action]'));
        const index = actions.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : actions.length - 1)
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
          actions[next]?.focus();
        } else if (event.key === 'Enter' && event.target === search.current && filtered.length) {
          event.preventDefault(); choose(filtered[0].id);
        }
      }}>
      <div className="project-picker-search"><Search size={12} /><input ref={search} type="search" aria-label="搜索项目" placeholder="搜索项目" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div ref={list} onScroll={updateScrollEdges} className={`project-picker-list${scrollEdges.above ? ' more-above' : ''}${scrollEdges.below ? ' more-below' : ''}`} role="menu" aria-label="项目">
        {filtered.map(project => <button type="button" role="menuitemradio" aria-checked={project.id === selectedId} data-project-action key={project.id}
          className="project-picker-row" title={project.path} onClick={() => choose(project.id)}>
          <ProjectAppearanceIcon project={project} /><span className="project-picker-name">{project.name}</span>
          {projectDirectoryLabel(project) && <span className="project-picker-directory">{projectDirectoryLabel(project)}</span>}
          {project.id === selectedId && <Check className="project-picker-check" size={16} />}
        </button>)}
        {!filtered.length && <div className="project-picker-empty" role="status">{query.trim() ? '未找到项目' : '暂无项目'}</div>}
      </div>
      <div className="project-picker-actions">
        <button type="button" data-project-action className="project-picker-row" onClick={() => { close(true); onCreate(); }}><Plus size={16} /><span>新建项目</span></button>
        <button type="button" data-project-action className="project-picker-row" onClick={() => choose(null)}><X size={16} /><span>不在项目中工作</span></button>
      </div>
    </div>, root.current?.closest('dialog') ?? document.body)}
  </div>;
}
