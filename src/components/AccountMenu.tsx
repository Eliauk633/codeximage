import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import usageIcon from '../assets/reference-icons/account-usage.svg';
import miniIcon from '../assets/reference-icons/account-mini.svg';
import inviteIcon from '../assets/reference-icons/account-invite.svg';
import settingsIcon from '../assets/reference-icons/account-settings.svg';
import helpIcon from '../assets/reference-icons/account-help.svg';
import logoutIcon from '../assets/reference-icons/account-logout.svg';
import './account-menu.css';

type AccountMenuProps = {
  username: string;
  plan: string;
  remaining: number;
  onAccount: () => void;
  onUsage: () => void;
  onMini: () => void;
  onInvite: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onHelp: (topic: string) => void;
};

type Position = { left: number; top: number };
const helpTopics = ['帮助中心', '键盘快捷键', '关于 Codex'];

export function AccountMenu({ username, plan, remaining, onAccount, onUsage, onMini, onInvite, onSettings, onLogout, onHelp }: AccountMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [helpPosition, setHelpPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const focusHelp = useRef(false);
  const firstFocus = useRef(0);
  const initials = Array.from(username.trim()).slice(0, 2).join('').toUpperCase() || 'U';

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setHelpOpen(false);
    setPosition(null);
    setHelpPosition(null);
    focusHelp.current = false;
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  function closeHelp() {
    setHelpOpen(false);
    setHelpPosition(null);
    focusHelp.current = false;
  }

  function openHelp(moveFocus: boolean) {
    focusHelp.current = moveFocus;
    if (helpOpen && moveFocus) helpMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    setHelpOpen(true);
  }

  function select(action: () => void) {
    close();
    action();
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(trigger.right + 14, window.innerWidth - menu.width - 8)),
      top: Math.max(8, window.innerHeight - menu.height - 6),
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !position) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[firstFocus.current < 0 ? items.length - 1 : firstFocus.current]?.focus({ preventScroll: true });
  }, [open, position]);

  useLayoutEffect(() => {
    if (!helpOpen || !helpTriggerRef.current || !helpMenuRef.current) return;
    const trigger = helpTriggerRef.current.getBoundingClientRect();
    const menu = menuRef.current!.getBoundingClientRect();
    const submenu = helpMenuRef.current.getBoundingClientRect();
    const right = menu.right + 4;
    setHelpPosition({
      left: Math.max(8, Math.min(right + submenu.width <= window.innerWidth - 8 ? right : menu.left - submenu.width - 4, window.innerWidth - submenu.width - 8)),
      top: Math.max(8, Math.min(trigger.top - 4, window.innerHeight - submenu.height - 8)),
    });
  }, [helpOpen]);

  useLayoutEffect(() => {
    if (helpOpen && helpPosition && focusHelp.current) {
      helpMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
      focusHelp.current = false;
    }
  }, [helpOpen, helpPosition]);

  useEffect(() => {
    if (!open) return;
    const contains = (target: EventTarget | null) => target instanceof Node && (
      triggerRef.current?.contains(target) || menuRef.current?.contains(target) || helpMenuRef.current?.contains(target)
    );
    const outside = (event: PointerEvent) => { if (!contains(event.target)) close(false); };
    const focusChanged = (event: FocusEvent) => { if (!contains(event.target)) close(false); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    const moved = () => close();
    const blurred = () => close(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    window.addEventListener('blur', blurred);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
      window.removeEventListener('blur', blurred);
    };
  }, [open, close]);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') { close(); return; }
    else return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus({ preventScroll: true });
  }

  const portalTarget = triggerRef.current?.closest('dialog') ?? document.body;
  const rows = [
    { label: '使用情况', trailing: `剩余 ${remaining}%`, title: '每周剩余额度', icon: usageIcon, action: onUsage },
    { label: '显示 Mini', trailing: '⌥Space', icon: miniIcon, action: onMini },
    { label: '邀请好友', icon: inviteIcon, action: onInvite },
    { label: '设置', trailing: '⌘,', icon: settingsIcon, action: onSettings },
  ];

  return <div className="rail-account-menu">
    <button ref={triggerRef} type="button" className={`account-popover-trigger${open ? ' is-open' : ''}`}
      title="账号菜单" aria-label="账号菜单" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(); else { firstFocus.current = 0; setOpen(true); } }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); firstFocus.current = event.key === 'ArrowUp' ? -1 : 0; setOpen(true);
        }
      }}><span className="account-popover-avatar" aria-hidden="true">{initials}</span></button>

    {open && createPortal(<div id={id} ref={menuRef} role="menu" aria-label="账号菜单" className="account-popover-menu"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }} onKeyDown={navigate}>
      <button type="button" role="menuitem" tabIndex={-1} className="account-popover-identity" title={plan}
        onFocus={closeHelp} onPointerEnter={closeHelp} onClick={() => select(onAccount)}>
        <span className="account-popover-avatar" aria-hidden="true">{initials}</span>
        <span className="account-popover-identity-copy"><span className="account-popover-name">{username}</span><span className="account-popover-plan">{plan.replace('ChatGPT ', '')}</span></span>
      </button>
      <div role="separator" className="account-popover-separator" />
      {rows.map(({ label, trailing, title, icon, action }) => <button key={label} type="button" role="menuitem" tabIndex={-1}
        className="account-popover-row" title={title} onFocus={closeHelp} onPointerEnter={closeHelp} onClick={() => select(action)}>
        <span className="account-popover-icon" aria-hidden="true" style={{ maskImage: `url("${icon}")` }} /><span>{label}</span>{trailing && <span className="account-popover-trailing">{trailing}</span>}
      </button>)}
      <div role="separator" className="account-popover-separator" />
      <button ref={helpTriggerRef} type="button" role="menuitem" tabIndex={-1} className={`account-popover-row${helpOpen ? ' is-submenu-open' : ''}`}
        aria-haspopup="menu" aria-expanded={helpOpen} aria-controls={helpOpen ? `${id}-help` : undefined}
        onPointerEnter={() => openHelp(false)} onClick={() => openHelp(true)}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); openHelp(true); }
          else if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); closeHelp(); }
        }}><span className="account-popover-icon" aria-hidden="true" style={{ maskImage: `url("${helpIcon}")` }} /><span>帮助</span><ChevronRight size={14} className="account-popover-trailing" aria-hidden="true" /></button>
      <button type="button" role="menuitem" tabIndex={-1} className="account-popover-row" onFocus={closeHelp} onPointerEnter={closeHelp} onClick={() => select(onLogout)}>
        <span className="account-popover-icon" aria-hidden="true" style={{ maskImage: `url("${logoutIcon}")` }} /><span>退出登录</span>
      </button>
    </div>, portalTarget)}

    {open && helpOpen && createPortal(<div id={`${id}-help`} ref={helpMenuRef} role="menu" aria-label="帮助" className="account-popover-menu account-popover-help"
      style={{ left: helpPosition?.left ?? 0, top: helpPosition?.top ?? 0, visibility: helpPosition ? 'visible' : 'hidden' }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault(); event.stopPropagation(); closeHelp(); helpTriggerRef.current?.focus({ preventScroll: true });
        } else navigate(event);
      }}>
      {helpTopics.map(topic => <button key={topic} type="button" role="menuitem" tabIndex={-1} className="account-popover-row" onClick={() => select(() => onHelp(topic))}>{topic}</button>)}
    </div>, portalTarget)}
  </div>;
}
