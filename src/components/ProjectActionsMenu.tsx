import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Check, ChevronRight, List, MoreHorizontal, Pin, Plus, Settings, X } from 'lucide-react';
import './project-actions.css';

type Props = {
  project: { id: string; name: string; pinned?: boolean; sectionId?: string | null };
  sections: { id: string; name: string }[];
  canArchive: boolean;
  onTogglePin: () => void;
  onEdit: () => void;
  onMove: (sectionId: string | null) => void;
  onCreateSection: () => void;
  onArchive: () => void;
  onRemove: () => void;
};

export function ProjectActionsMenu({ project, sections, canArchive, onTogglePin, onEdit, onMove, onCreateSection, onArchive, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [subPosition, setSubPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const subId = useId();
  const label = `${project.name}的项目操作`;

  function cancelHoverClose() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function close(restoreFocus = false) {
    cancelHoverClose(); setOpen(false); setSubmenu(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }
  function select(action: () => void) { close(true); action(); }
  function closeSubmenu() { cancelHoverClose(); setSubmenu(false); }
  function scheduleHoverClose() {
    cancelHoverClose();
    hoverTimer.current = setTimeout(() => { setSubmenu(false); hoverTimer.current = null; }, 180);
  }
  function focusItem(container: HTMLDivElement | null, last = false) {
    const buttons = container?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)');
    if (buttons?.length) buttons[last ? buttons.length - 1 : 0].focus();
  }
  function openSections(focus = false) {
    cancelHoverClose(); setSubmenu(true);
    if (focus) requestAnimationFrame(() => focusItem(subRef.current));
  }
  function navigateMenu(event: KeyboardEvent<HTMLDivElement>, nested = false) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      const next = index < 0 ? event.key === 'ArrowDown' ? 0 : buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      if (!nested) closeSubmenu();
      buttons[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); event.stopPropagation(); focusItem(event.currentTarget, event.key === 'End');
    } else if (event.key === 'ArrowRight' && !nested && document.activeElement === sectionRef.current) {
      event.preventDefault(); event.stopPropagation(); openSections(true);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault(); event.stopPropagation();
      if (nested) { closeSubmenu(); sectionRef.current?.focus(); } else close(true);
    } else if (event.key === 'Tab') close();
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(window.innerWidth - menu.width - 8, trigger.left - 2)),
      top: Math.max(8, Math.min(window.innerHeight - menu.height - 8, trigger.bottom)) });
  }, [open]);
  useLayoutEffect(() => {
    if (!submenu || !menuRef.current || !subRef.current || !sectionRef.current) return;
    const menu = menuRef.current.getBoundingClientRect();
    const child = subRef.current.getBoundingClientRect();
    const row = sectionRef.current.getBoundingClientRect();
    const right = menu.right - 2;
    const left = right + child.width <= window.innerWidth - 8 ? right : menu.left - child.width + 2;
    setSubPosition({ left: Math.max(8, Math.min(window.innerWidth - child.width - 8, left)),
      top: Math.max(8, Math.min(window.innerHeight - child.height - 8, row.top - 6)) });
  }, [submenu, position, sections.length]);
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => target instanceof Node
      && (triggerRef.current?.contains(target) || menuRef.current?.contains(target) || subRef.current?.contains(target));
    const pointer = (event: PointerEvent) => { if (!inside(event.target)) close(); };
    const focus = (event: FocusEvent) => { if (!inside(event.target)) close(); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && (menuRef.current?.contains(event.target) || subRef.current?.contains(event.target))) return;
      close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    };
    const resize = () => close();
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('focusin', focus);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', pointer); document.removeEventListener('focusin', focus);
      document.removeEventListener('scroll', scroll, true); document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', resize); cancelHoverClose();
    };
  }, [open]);
  useEffect(() => () => cancelHoverClose(), []);

  return <div className="project-actions">
    <button type="button" ref={triggerRef} className={`project-actions-trigger ${open ? 'active' : ''}`} aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { if (open) close(); else { setSubmenu(false); setOpen(true); } }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.repeat) return;
          if (open && (event.key === 'Enter' || event.key === ' ')) { close(true); return; }
          setOpen(true); const last = event.key === 'ArrowUp';
          requestAnimationFrame(() => focusItem(menuRef.current, last));
        }
      }}><MoreHorizontal size={15} strokeWidth={1.5} /></button>
    {open && createPortal(<>
      <div id={menuId} ref={menuRef} className="project-actions-menu" style={position} role="menu" aria-label={label}
        onKeyDown={event => navigateMenu(event)} onPointerEnter={cancelHoverClose} onPointerLeave={scheduleHoverClose}>
        <button type="button" role="menuitem" onPointerEnter={closeSubmenu} onClick={() => select(onTogglePin)}><Pin size={16} strokeWidth={1.5} /><span>{project.pinned ? '取消置顶' : '置顶'}</span></button>
        <button type="button" role="menuitem" onPointerEnter={closeSubmenu} onClick={() => select(onEdit)}><Settings size={16} strokeWidth={1.5} /><span>编辑</span></button>
        <div className="project-actions-divider" role="separator" />
        <button type="button" role="menuitem" ref={sectionRef} className={submenu ? 'submenu-open' : ''} aria-haspopup="menu" aria-expanded={submenu} aria-controls={submenu ? subId : undefined}
          onPointerEnter={() => openSections()} onClick={() => openSections(true)}><List size={16} strokeWidth={1.5} /><span>分区</span><ChevronRight size={14} className="project-actions-trailing" /></button>
        <div className="project-actions-divider" role="separator" />
        <button type="button" role="menuitem" disabled={!canArchive} onPointerEnter={closeSubmenu} onClick={() => select(onArchive)}><Archive size={16} strokeWidth={1.5} /><span>归档聊天</span></button>
        <div className="project-actions-divider" role="separator" />
        <button type="button" role="menuitem" onPointerEnter={closeSubmenu} onClick={() => select(onRemove)}><X size={16} strokeWidth={1.5} /><span>移除项目</span></button>
      </div>
      {submenu && <div id={subId} ref={subRef} className="project-actions-menu project-actions-submenu" style={subPosition} role="menu" aria-label="移动项目到分区"
        onKeyDown={event => navigateMenu(event, true)} onPointerEnter={cancelHoverClose} onPointerLeave={scheduleHoverClose}>
        {sections.map(section => <button type="button" role="menuitemradio" key={section.id} aria-checked={project.sectionId === section.id} title={section.name} onClick={() => select(() => onMove(project.sectionId === section.id ? null : section.id))}><span>{section.name}</span>{project.sectionId === section.id && <Check size={14} className="project-actions-trailing" />}</button>)}
        {sections.length > 0 && <div className="project-actions-divider" role="separator" />}
        <button type="button" role="menuitem" onClick={() => select(onCreateSection)}><Plus size={16} strokeWidth={1.5} /><span>新建分区…</span></button>
      </div>}
    </>, triggerRef.current?.closest('dialog') ?? document.body)}
  </div>;
}
