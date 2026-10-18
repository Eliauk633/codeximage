import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { Dialog } from './ui';
import handIcon from '../assets/reference-icons/permission-hand.svg';
import autoIcon from '../assets/reference-icons/permission-auto.svg';
import fullIcon from '../assets/reference-icons/permission-full.svg';
import './permission-picker.css';

import type { PermissionMode } from '../settings-preferences';
export type { PermissionMode } from '../settings-preferences';

type PermissionPickerProps = {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
};

const permissionOptions = [
  { value: '请求批准', title: '请求批准', description: '编辑外部文件和使用互联网时始终询问', icon: handIcon },
  { value: '帮我批准', title: '帮我批准', description: '仅对检测到的风险操作请求批准', icon: autoIcon },
  { value: '完全访问', title: '完全访问权限', description: '可不受限制地访问互联网和您电脑上的任何文件', icon: fullIcon },
] as const;

export function PermissionPicker({ mode, onModeChange }: PermissionPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [showInformation, setShowInformation] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(0);
  const selected = permissionOptions.find(option => option.value === mode) ?? permissionOptions[0];

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  function openMenu(index = permissionOptions.findIndex(option => option.value === mode)) {
    initialFocus.current = Math.max(0, index);
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - menu.width - 8, trigger.left)),
      top: Math.max(8, trigger.top - menu.height - 6),
    });
  }, [open]);

  useLayoutEffect(() => {
    if (open && position) menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[initialFocus.current]?.focus({ preventScroll: true });
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const contains = (target: EventTarget | null) => target instanceof Node && (triggerRef.current?.contains(target) || menuRef.current?.contains(target));
    const outside = (event: PointerEvent) => { if (!contains(event.target)) close(false); };
    const focusChanged = (event: FocusEvent) => { if (!contains(event.target)) close(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    const moved = () => close();
    const windowBlurred = () => close(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    window.addEventListener('blur', windowBlurred);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
      window.removeEventListener('blur', windowBlurred);
    };
  }, [open, close]);

  function closeInformation() {
    setShowInformation(false);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }

  return <div className="permission-picker">
    <button type="button" ref={triggerRef} className={`permission-picker-trigger${mode === '完全访问' ? ' is-full-access' : ''}${open ? ' is-open' : ''}`}
      title="批准方式" aria-label={`批准方式：${selected.value}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : openMenu()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); openMenu(event.key === 'ArrowUp' ? permissionOptions.length - 1 : 0);
        }
      }}><span aria-hidden="true" className="permission-picker-icon" style={{ maskImage: `url("${selected.icon}")` }} /><span>{selected.value}</span></button>

    {open && createPortal(<div id={id} ref={menuRef} role="menu" aria-labelledby={`${id}-heading`} className="permission-picker-menu"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next: number;
        if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowUp') next = index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault(); event.stopPropagation(); buttons[next]?.focus({ preventScroll: true });
      }}>
      <div className="permission-picker-heading"><span id={`${id}-heading`}>应如何批准 ChatGPT 操作？</span>
        <button type="button" onClick={() => { close(false); setShowInformation(true); }}>了解更多</button>
      </div>
      {permissionOptions.map(option => <button type="button" key={option.value} role="menuitemradio" aria-checked={mode === option.value}
        tabIndex={-1} className={`permission-picker-option${option.value === '完全访问' ? ' is-full-access' : ''}`}
        onClick={() => { onModeChange(option.value); close(); }}>
        <span aria-hidden="true" className="permission-picker-icon permission-picker-option-icon" style={{ maskImage: `url("${option.icon}")` }} />
        <span className="permission-picker-option-copy"><span className="permission-picker-option-title">{option.title}</span><span className="permission-picker-option-description">{option.description}</span></span>
        <span className="permission-picker-option-check">{mode === option.value && <Check size={12} />}</span>
      </button>)}
    </div>, triggerRef.current?.closest('dialog') ?? document.body)}

    {showInformation && createPortal(<Dialog title="关于批准方式" className="permission-information-dialog" onClose={closeInformation}>
      <div className="permission-information-content">
        <p>批准方式设置已保存在客户端。系统访问服务尚未连接。</p>
        <dl>{permissionOptions.map(option => <div key={option.value}><dt>{option.title}</dt><dd>{option.description}。</dd></div>)}</dl>
        <p className="permission-information-note">切换选项只会改变当前显示的模式。</p>
      </div>
      <div className="permission-information-footer"><button type="button" onClick={closeInformation}>知道了</button></div>
    </Dialog>, document.body)}
  </div>;
}
