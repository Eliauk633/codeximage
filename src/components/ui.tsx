import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, type LucideIcon } from 'lucide-react';

export function IconButton({ label, children, onClick, active = false, disabled = false, className = '' }: {
  label: string; children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string;
}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
    className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick}>{children}</button>;
}

export type MenuOption = { label: string; description?: string; icon?: LucideIcon; shortcut?: string; checked?: boolean; danger?: boolean; divider?: boolean; onSelect: () => void };

export function Dropdown({ label, trigger, options, align = 'left', className = '', menuClassName = '', side = 'bottom' }: {
  label: string; trigger: ReactNode; options: MenuOption[]; align?: 'left' | 'right'; className?: string; menuClassName?: string; side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current!.getBoundingClientRect();
    const menu = menuRef.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - menu.width - 8, align === 'right' ? trigger.right - menu.width : trigger.left));
    const preferredTop = side === 'top' ? trigger.top - menu.height - 5 : trigger.bottom + 5;
    const top = Math.max(8, Math.min(innerHeight - menu.height - 8, preferredTop));
    setPosition({ left, top });
  }, [open, align, side]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); event.stopPropagation(); }
    };
    const moved = () => setOpen(false);
    const focusChanged = (event: FocusEvent) => { if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved);
    };
  }, [open]);
  return <div className={`dropdown ${className}`} ref={ref}>
    <button type="button" ref={triggerRef} className={`dropdown-trigger ${open ? 'active' : ''}`} title={label}
      aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()); }
      }}>{trigger}</button>
    {open && createPortal(<div ref={menuRef} className={`menu ${menuClassName}`} style={{ position: 'fixed', ...position }} role="menu" aria-label={label} onKeyDown={event => {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>{options.map((option, index) => <div key={`${option.label}-${index}`}>
      {option.divider && <div className="menu-divider" />}
      <button type="button" role="menuitem" className={`menu-item ${option.danger ? 'danger' : ''}`} onClick={() => {
        setOpen(false); triggerRef.current?.focus(); option.onSelect();
      }}>{option.icon && <option.icon size={15} />}<span>{option.label}{option.description && <small>{option.description}</small>}</span>
        {option.checked ? <Check size={14} /> : option.shortcut && <kbd>{option.shortcut}</kbd>}
      </button>
    </div>)}</div>, ref.current?.closest('dialog') ?? document.body)}
  </div>;
}

export function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type=hidden]), textarea')?.focus();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const b = event.currentTarget.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) onClose(); } }}>
    <div className="dialog-header"><h2 id={id}>{title}</h2><IconButton label="关闭" onClick={onClose}><X size={17} /></IconButton></div>
    {children}
  </dialog>;
}
