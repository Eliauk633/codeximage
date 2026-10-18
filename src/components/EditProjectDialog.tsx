import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderOpen, Plus, RotateCcw, X } from 'lucide-react';
import { normalizeProjectEmoji, type Project } from '../model';
import { Dialog } from './ui';
import { ProjectAppearanceIcon, projectAppearanceColors, projectAppearanceIcons, type ProjectAppearance } from './ProjectAppearanceIcon';
import './project-actions.css';

export type ProjectEditPatch = ProjectAppearance & { name: string; sources: string[] };
type EditableProject = Project & ProjectAppearance & { sources?: string[] };
type Props = {
  project: EditableProject;
  onSave: (patch: ProjectEditPatch) => Promise<{ ok: true } | { ok: false; error: string }>;
  onClose: () => void;
  onRemove: () => void;
};

export function EditProjectDialog({ project, onSave, onClose, onRemove }: Props) {
  const [name, setName] = useState(project.name);
  const [sources, setSources] = useState(() => [...(project.sources?.length ? project.sources : [project.path])]);
  const [appearance, setAppearance] = useState<ProjectAppearance>({ icon: project.icon ?? null, color: project.color ?? null, emoji: project.emoji ?? null });
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearancePosition, setAppearancePosition] = useState({ left: 0, top: 0 });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const appearancePanel = useRef<HTMLDivElement>(null);
  const appearanceTrigger = useRef<HTMLButtonElement>(null);
  const busy = saving || picking;

  useEffect(() => {
    if (!appearanceOpen) return;
    const inside = (target: EventTarget | null) => target instanceof Node && (appearanceRef.current?.contains(target) || appearancePanel.current?.contains(target));
    const outside = (event: PointerEvent) => { if (!inside(event.target)) setAppearanceOpen(false); };
    const moved = (event: Event) => { if (!(event.target instanceof Node && appearancePanel.current?.contains(event.target))) setAppearanceOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', moved, true); window.removeEventListener('resize', moved); };
  }, [appearanceOpen]);
  useLayoutEffect(() => {
    if (!appearanceOpen || !appearanceTrigger.current || !appearancePanel.current) return;
    const trigger = appearanceTrigger.current.getBoundingClientRect();
    const panel = appearancePanel.current.getBoundingClientRect();
    const top = trigger.bottom + 5 + panel.height <= innerHeight - 8 ? trigger.bottom + 5 : trigger.top - panel.height - 5;
    setAppearancePosition({ left: Math.max(8, Math.min(innerWidth - panel.width - 8, trigger.left)), top: Math.max(8, Math.min(innerHeight - panel.height - 8, top)) });
  }, [appearanceOpen]);

  function close() {
    if (pending.current) return;
    if (appearanceOpen) { setAppearanceOpen(false); appearanceTrigger.current?.focus(); return; }
    onClose();
  }
  async function addSource() {
    if (pending.current) return;
    if (!window.desktop) { setError('请在 Mac 客户端中使用文件夹选择器。'); return; }
    pending.current = true; setPicking(true); setError('');
    try {
      const folder = await window.desktop.pickProject();
      if (folder) setSources(current => current.includes(folder.path) ? current : [...current, folder.path]);
    } catch { setError('无法打开文件夹选择器，请重试。'); }
    finally { pending.current = false; setPicking(false); }
  }
  async function submit() {
    if (pending.current) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120 || /[\u0000-\u001f\u007f]/.test(trimmed)) { setError('项目名称须为 1–120 个字符，且不能包含换行或控制字符。'); return; }
    if (!sources.length || sources.some(path => !path.trim())) { setError('请至少保留一个源文件夹。'); return; }
    const emojiInput = appearance.emoji?.trim() ?? '';
    const emoji = normalizeProjectEmoji(emojiInput);
    if (emojiInput && !emoji) { setError('请输入一个完整的表情符号，或清空 Emoji 后选择图标。'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const result = await onSave({ name: trimmed, sources: [...sources], icon: appearance.icon ?? null, color: appearance.color ?? null, emoji: emoji ?? null });
      if (result.ok) onClose(); else setError(result.error);
    } catch { setError('保存未完成，请重试。你的修改仍保留在窗口中。'); }
    finally { pending.current = false; setSaving(false); }
  }

  return <Dialog title="编辑项目" className="project-edit-dialog" onClose={close}>
    <div className="project-edit-content">
      <label className="project-edit-label" htmlFor="edit-project-name">名称</label>
      <div className="project-edit-name-row">
        <div ref={appearanceRef} className="project-edit-appearance">
          <button ref={appearanceTrigger} type="button" className="project-edit-appearance-trigger" aria-label="项目外观" aria-expanded={appearanceOpen} disabled={busy} onClick={() => setAppearanceOpen(!appearanceOpen)}><ProjectAppearanceIcon project={appearance} size={21} /></button>
          {appearanceOpen && createPortal(<div ref={appearancePanel} className="project-appearance-panel" style={appearancePosition} role="region" aria-label="项目外观设置">
            <span className="project-appearance-label">图标</span>
            <div className="project-appearance-icon-grid">{Object.entries(projectAppearanceIcons).map(([id, entry]) => <button type="button" key={id} disabled={busy} aria-label={entry.label} title={entry.label} aria-pressed={!appearance.emoji && (appearance.icon ?? 'folder') === id} onClick={() => setAppearance(current => ({ ...current, icon: id as keyof typeof projectAppearanceIcons, emoji: null }))}><entry.icon size={20} strokeWidth={1.5} /></button>)}</div>
            <span className="project-appearance-label">颜色</span>
            <div className="project-appearance-colors">{Object.entries(projectAppearanceColors).map(([id, entry]) => <button type="button" key={id} disabled={busy} title={entry.label} aria-label={entry.label} aria-pressed={(appearance.color ?? 'gray') === id} style={{ background: entry.value }} onClick={() => setAppearance(current => ({ ...current, color: id as keyof typeof projectAppearanceColors }))}>{(appearance.color ?? 'gray') === id && <Check size={13} strokeWidth={2} />}</button>)}</div>
            <label className="project-appearance-emoji-field">Emoji<input aria-label="项目 Emoji" value={appearance.emoji ?? ''} placeholder="输入表情符号" maxLength={64} disabled={busy} onChange={event => setAppearance(current => ({ ...current, emoji: event.target.value || null }))} /></label>
            <button type="button" className="project-appearance-reset" disabled={busy} onClick={() => { setAppearance({ icon: null, color: null, emoji: null }); setAppearanceOpen(false); appearanceTrigger.current?.focus(); }}><RotateCcw size={14} />恢复默认</button>
          </div>, appearanceRef.current?.closest('dialog') ?? document.body)}
        </div>
        <input id="edit-project-name" aria-label="项目名称" value={name} maxLength={120} disabled={busy} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void submit(); } }} />
      </div>
      <div className="project-edit-sources-heading"><h3>源文件夹</h3><button type="button" disabled={busy} onClick={() => void addSource()}><Plus size={14} />{picking ? '正在选择…' : '添加文件夹'}</button></div>
      <div className="project-edit-sources">{sources.map((path, index) => <div className="project-edit-source" key={path}>
        <FolderOpen size={18} strokeWidth={1.5} /><div className="project-edit-source-text"><div><span>{path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path}</span>{index === 0 && <small>主要</small>}</div><p title={path}>{path}</p></div>
        <div className="project-edit-source-actions">{index > 0 && <button type="button" disabled={busy} onClick={() => setSources(current => [current[index], ...current.filter((_, at) => at !== index)])}>设为主要</button>}<button type="button" aria-label={`移除源文件夹 ${path}`} title={sources.length === 1 ? '至少保留一个源文件夹' : '移除文件夹'} disabled={busy || sources.length === 1} onClick={() => setSources(current => current.filter((_, at) => at !== index))}><X size={14} /></button></div>
      </div>)}</div>
      {error && <p className="project-edit-error" role="alert">{error}</p>}
    </div>
    <div className="dialog-footer project-edit-footer"><button type="button" className="project-edit-remove" disabled={busy} onClick={onRemove}>移除项目</button><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary-button" disabled={busy} onClick={() => void submit()}>{saving ? '正在保存…' : '保存'}</button></div>
  </Dialog>;
}
