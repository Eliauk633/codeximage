import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, RotateCcw, Zap } from 'lucide-react';
import './composer-model-picker.css';

type ComposerModelPickerProps = {
  model: string;
  effort: string;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
};

const models = ['GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6 Sol', 'GPT-6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna'];
// Match the five-stop composer UI, rather than exposing the full API effort enum.
const efforts = ['轻度', '中', '高', '极高', 'Ultra'];
type MenuView = 'simple' | 'advanced';

function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next: number;
  if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
  else if (event.key === 'ArrowUp') next = index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else return;
  event.preventDefault();
  buttons[next]?.focus({ preventScroll: true });
}

export function ComposerModelPicker({ model, effort, onModelChange, onEffortChange }: ComposerModelPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('simple');
  const [fastMode, setFastMode] = useState(true);
  const [triggerWidth, setTriggerWidth] = useState<number>();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modelSwitchRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocus = useRef(true);
  const effortIndex = Math.max(0, efforts.indexOf(effort));
  const maximum = effort === 'Ultra';
  const showOpenLabel = open && view === 'simple' && model !== '默认';

  const close = useCallback((restoreFocus = true) => {
    setOpen(false); setPosition(null);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);
  function openMenu() {
    restoreMenuFocus.current = true;
    setTriggerWidth(triggerRef.current?.getBoundingClientRect().width);
    setView('simple'); setOpen(true);
  }
  function changeView(next: MenuView) {
    restoreMenuFocus.current = true;
    setView(next);
  }
  function selectModel(value: string) {
    onModelChange(value);
    changeView('simple');
  }
  function resetSelection() {
    onModelChange('默认');
    // shortcut: local recommended preset; replace with account defaults when a backend is connected.
    onEffortChange('高');
    changeView('simple');
    modelSwitchRef.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(innerWidth - menu.width - 8, trigger.left + trigger.width / 2 - menu.width / 2)),
      top: Math.max(8, trigger.top - menu.height - 8),
    });
  }, [open, view, model]);

  useLayoutEffect(() => {
    if (open && position && restoreMenuFocus.current) {
      const selected = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      (view === 'simple' ? modelSwitchRef.current : selected ?? menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus({ preventScroll: true });
      restoreMenuFocus.current = false;
    }
  }, [open, view, position]);

  useEffect(() => {
    if (!open) return;
    const contains = (target: EventTarget | null) => target instanceof Node && (triggerRef.current?.contains(target) || menuRef.current?.contains(target));
    const outside = (event: PointerEvent) => { if (!contains(event.target)) close(false); };
    const focusChanged = (event: FocusEvent) => { if (!contains(event.target)) close(false); };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); event.stopPropagation(); close(); }
    };
    const moved = (event: Event) => { if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    };
  }, [open, close]);

  return <div className="composer-model-picker">
    <button type="button" ref={triggerRef} className={`composer-model-picker-trigger${open ? ' is-open' : ''}${showOpenLabel ? ' is-effort-open' : ''}`}
      style={open ? { minWidth: triggerWidth } : undefined}
      title="模型与思考强度" aria-label={`选择模型与思考强度，${model}，${effort}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : openMenu()} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(); }
      }}>
      {showOpenLabel ? <span className="composer-picker-open-label">选择强度</span> : <>
        {fastMode && <Zap className="composer-model-picker-bolt" size={14} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />}
        <span>{model}</span><span className={`composer-model-picker-effort${maximum ? ' is-ultra' : ''}`}>{effort}</span>
      </>}<ChevronDown className="composer-model-picker-chevron" size={11} aria-hidden="true" />
    </button>
    {open && createPortal(<div id={id} ref={menuRef} className={`composer-picker-menu composer-picker-${view}`}
      role={view === 'advanced' ? 'menu' : 'dialog'} aria-label={view === 'advanced' ? '选择模型' : '模型与思考强度'}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={event => {
        if (view === 'advanced') moveMenuFocus(event);
        if (event.key === 'ArrowLeft' && view === 'advanced') { event.preventDefault(); changeView('simple'); }
      }}>
      {view === 'advanced' ? <>
        <div className="composer-picker-heading">选择模型</div>
        <button type="button" role="menuitemradio" aria-checked={model === '默认'} tabIndex={-1} className="composer-picker-item composer-picker-default" onClick={() => selectModel('默认')}>
          <span className="composer-picker-label"><span>默认</span><small>推荐模型集</small></span>{model === '默认' && <Check size={14} />}
        </button>
        {models.map(value => <button type="button" key={value} role="menuitemradio" tabIndex={-1} aria-checked={model === value}
          className="composer-picker-item" onClick={() => selectModel(value)}><span className="composer-picker-label">{value}</span>{model === value && <Check size={14} />}</button>)}
      </> : <div className={`composer-power-panel${maximum ? ' is-maximum' : ''}${fastMode ? ' is-fast' : ''}`}>
        <div className="composer-power-header">
        <button type="button" className="composer-power-action composer-fast-toggle" title="快速模式" aria-label="快速模式" aria-pressed={fastMode} onClick={() => setFastMode(value => !value)}><Zap size={14} fill="currentColor" strokeWidth={1.5} /></button>
        <button ref={modelSwitchRef} type="button" className="composer-picker-model-switch" aria-label="选择模型" onClick={() => changeView('advanced')} onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); changeView('advanced'); }
        }}><strong>{effort}</strong><span><small>{model === '默认' ? '推荐模型集' : model}</small><ChevronRight size={10} /></span></button>
        <button type="button" className="composer-power-action composer-power-reset" title="恢复推荐模型和强度" aria-label="恢复推荐模型和强度" onClick={resetSelection}><RotateCcw size={14} /></button>
        </div>
        <div className="composer-effort-control" style={{ '--effort-progress': `${effortIndex / (efforts.length - 1) * 100}%` } as CSSProperties}>
          <div className="composer-effort-track" aria-hidden="true"><div className="composer-effort-fill" />{maximum && <div className="composer-effort-aurora" />}
            <div className="composer-effort-ticks">{efforts.map((value, index) => <span key={value} data-filled={index <= effortIndex} />)}</div>
            {maximum && <div className="composer-effort-stars">{Array.from({ length: 14 }, (_, index) => <span key={index} style={{
              '--star-x': `${4 + index * 7}%`, top: `${5 + index * 7 % 15}px`,
              '--star-scale': .5 + index % 4 * .15, '--star-opacity': .4 + index % 4 * .2,
              '--star-delay': `${-index * .31}s`, '--star-duration': `${1.63 + index % 5 * .165}s`,
            } as CSSProperties}><i /></span>)}</div>}
          </div>
          <input type="range" aria-label="思考强度" aria-valuetext={effort} min="0" max={efforts.length - 1} value={effortIndex} onChange={event => onEffortChange(efforts[Number(event.target.value)])} />
        </div>
      </div>}
    </div>, triggerRef.current?.closest('dialog') ?? document.body)}
  </div>;
}
