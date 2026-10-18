import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, Folder, Keyboard, RotateCcw, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react';
import { clampSidebarWidth, deleteThread, updateThread, type AppState } from '../model';
import { Dialog, Dropdown, IconButton } from './ui';
import { Group, PreferenceRow, SelectControl, Toggle, type SettingsSectionProps } from './SettingsControls';
import './display-settings.css';

const fonts = ['系统', 'SF Pro', 'Arial', 'Georgia', 'Menlo'];
const appearanceDefaults: Record<string, string | boolean | number> = {
  'display.theme': 'Codex', 'display.accent': '#3388ff', 'display.background': '#ffffff', 'display.foreground': '#1a1c1f',
  'display.font': '系统', 'display.contentFont': '与界面字体相同', 'display.codeFont': 'Menlo',
  'display.contentSize': 16, 'display.codeSize': 13, 'display.reducedMotion': '跟随系统', 'display.separateModes': false,
  'display.translucent': true, 'display.contrast': 50, 'display.fullWidth': false, 'display.punctuation': true,
  'display.diff': '颜色', 'display.pointer': true, 'display.dock': 'Codex', 'display.fontSmoothing': true,
};

const shortcutRows = [
  { id: 'new', group: '应用', label: '新聊天', keys: '⌘ N' },
  { id: 'search', group: '应用', label: '搜索聊天', keys: '⌘ K' },
  { id: 'settings', group: '应用', label: '打开设置', keys: '⌘ ,' },
  { id: 'sidebar', group: '应用', label: '展开或收起侧栏', keys: '⌘ B' },
  { id: 'mini', group: '应用', label: '显示 Mini', keys: '⌥ Space' },
  { id: 'browser', group: '应用', label: '打开浏览器标签页', keys: '未分配' },
  { id: 'back', group: '聊天', label: '返回上一聊天', keys: '⌘ [' },
  { id: 'forward', group: '聊天', label: '前往下一聊天', keys: '⌘ ]' },
  { id: 'archive', group: '聊天', label: '归档聊天', keys: '未分配' },
  { id: 'submit', group: '编辑器', label: '发送消息', keys: 'Enter' },
  { id: 'newline', group: '编辑器', label: '换行', keys: '⇧ Enter' },
  { id: 'model', group: '编辑器', label: '选择强度', keys: '未分配' },
  { id: 'dictation', group: '听写', label: '按住开始听写', keys: '未分配' },
  { id: 'dictationTap', group: '听写', label: '轻按开始听写', keys: '未分配' },
];

export function DisplaySettings(props: SettingsSectionProps) {
  if (props.section === 'appearance') return <AppearanceSettings {...props} />;
  if (props.section === 'shortcuts') return <ShortcutSettings {...props} />;
  if (props.section === 'archived') return <ArchivedSettings {...props} />;
  return null;
}

function SizeInput({ id, label, value, min, max, onCommit }: { id: string; label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit(text: string) {
    const parsed = Number(text);
    const next = text.trim() && Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : value;
    setDraft(String(next)); onCommit(next);
  }
  return <label className="display-number"><input id={id} aria-label={label} type="number" min={min} max={max} step={1} value={draft} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); } }} /><span>px</span></label>;
}

function AppearanceSettings({ state, setState, values, setValue }: SettingsSectionProps) {
  const [importing, setImporting] = useState(false);
  const [themeText, setThemeText] = useState('');
  const [status, setStatus] = useState('');
  const value = (key: string) => values[`display.${key}`] ?? appearanceDefaults[`display.${key}`];
  const update = (key: string, next: string | boolean | number) => setValue(`display.${key}`, next);
  const advanced = values['display.advanced'] === true;
  const select = (key: string, label: string, options: readonly string[], description?: string) => <PreferenceRow label={label} htmlFor={`display-${key}`} description={description}><SelectControl id={`display-${key}`} value={String(value(key))} options={options} onChange={next => update(key, next)} /></PreferenceRow>;
  const toggle = (key: string, label: string, description?: string) => <PreferenceRow label={label} htmlFor={`display-${key}`} description={description}><Toggle id={`display-${key}`} checked={value(key) === true} onChange={() => update(key, value(key) !== true)} /></PreferenceRow>;
  const number = (key: string, label: string, defaultValue: number) => <PreferenceRow label={label} htmlFor={`display-${key}`}><SizeInput id={`display-${key}`} label={label} min={8} max={32} value={Number(value(key) ?? defaultValue)} onCommit={next => update(key, next)} /></PreferenceRow>;
  function reset() {
    setState(previous => ({ ...previous, theme: 'system', fontSize: 14, sidebarWidth: clampSidebarWidth(288, innerWidth) }));
    Object.entries(appearanceDefaults).forEach(([key, next]) => setValue(key, next));
    for (const mode of ['light', 'dark']) for (const field of ['theme', 'accent', 'background', 'foreground']) setValue(`display.${mode}.${field}`, mode === 'dark' && field === 'background' ? '#202124' : mode === 'dark' && field === 'foreground' ? '#e5e5e5' : appearanceDefaults[`display.${field}`]);
    setStatus('已恢复默认外观设置');
  }
  async function copyTheme() {
    const text = JSON.stringify({ theme: value('theme'), accent: value('accent'), background: value('background'), foreground: value('foreground'), font: value('font') }, null, 2);
    try { if (window.desktop) await window.desktop.copyText(text); else await navigator.clipboard.writeText(text); setStatus('主题已复制'); } catch { setStatus('无法访问剪贴板'); }
  }
  function importTheme() {
    try {
      const data: unknown = JSON.parse(themeText);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      const theme = data as Record<string, unknown>;
      if (!['Codex', 'ChatGPT'].includes(String(theme.theme)) || !fonts.includes(String(theme.font)) || !['accent', 'background', 'foreground'].every(key => typeof theme[key] === 'string' && /^#[0-9a-f]{6}$/i.test(theme[key]))) throw new Error();
      for (const key of ['theme', 'accent', 'background', 'foreground', 'font']) update(key, String(theme[key]));
      setImporting(false); setStatus('已导入主题');
    } catch { setStatus('主题格式无效，请使用本页“复制主题”生成的 JSON'); }
  }
  return <div className="display-settings">
    <section className="settings-section display-visual-style"><h3 className="settings-group-heading">视觉风格</h3>
      <div className="settings-preference-group"><div className="display-mode-section"><span>模式</span><div className="display-mode-options" role="radiogroup" aria-label="外观模式">
        {([{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }] as const).map(({ value: mode, label }) => <label key={mode} className={`display-mode-option${state.theme === mode ? ' is-selected' : ''}`} title={label}><input type="radio" name="display-appearance-mode" aria-label={label} checked={state.theme === mode} onChange={() => setState(previous => ({ ...previous, theme: mode }))} /><span aria-hidden="true" className={`display-mode-window is-${mode}`}><i /><span><b /><b /><b /></span></span></label>)}
      </div></div></div>
      <div className="settings-preference-group display-theme-group"><div className="display-theme-heading"><span>主题</span><div><IconButton label="导入主题" onClick={() => { setThemeText(''); setStatus(''); setImporting(true); }}><Upload size={15} /></IconButton><IconButton label="复制主题" onClick={copyTheme}><Copy size={15} /></IconButton><SelectControl id="display-theme" label="主题" value={String(value('theme'))} options={['Codex', 'ChatGPT']} onChange={next => update('theme', next)} /></div></div>
        {([['accent', '强调色'], ['background', '背景'], ['foreground', '前景']] as const).map(([key, label]) => <PreferenceRow key={key} label={label} htmlFor={`display-${key}`} className="display-compact-row"><span className="display-color-input"><input id={`display-${key}`} type="color" aria-label={label} value={String(value(key))} onChange={event => update(key, event.target.value)} /><span>{String(value(key)).toUpperCase()}</span></span></PreferenceRow>)}
        {select('font', '字体', fonts)}
      </div>
    </section>
    <section className="settings-section"><div className="display-advanced-heading"><button type="button" aria-expanded={advanced} aria-controls="appearance-advanced" onClick={() => setValue('display.advanced', !advanced)}>高级{advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><button className="settings-inline-link" onClick={reset}>重置为默认设置</button></div>
      {advanced && <div id="appearance-advanced" className="display-advanced-content">
        <Group><PreferenceRow label="界面字号" description="调整本客户端的基础字号" htmlFor="display-ui-size"><SizeInput id="display-ui-size" label="界面字号" min={12} max={20} value={state.fontSize} onCommit={next => setState(previous => ({ ...previous, fontSize: next }))} /></PreferenceRow>{number('contentSize', '内容字号', 16)}{number('codeSize', '代码字号', 13)}</Group>
        <Group>{select('reducedMotion', '减少动画效果', ['跟随系统', '开启', '关闭'])}{toggle('separateModes', '分别设置浅色和深色模式', '为每种模式选择主题、颜色和字体')}</Group>
        {value('separateModes') === true && (['light', 'dark'] as const).map(mode => <Group key={mode} title={mode === 'light' ? '浅色主题' : '深色主题'}><PreferenceRow label="主题" htmlFor={`display-${mode}-theme`}><SelectControl id={`display-${mode}-theme`} value={String(values[`display.${mode}.theme`] ?? 'Codex')} options={['Codex', 'ChatGPT']} onChange={next => setValue(`display.${mode}.theme`, next)} /></PreferenceRow><div className="display-color-row">{([['accent', '强调色'], ['background', '背景'], ['foreground', '前景']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="color" aria-label={`${mode === 'light' ? '浅色' : '深色'}${label}`} value={String(values[`display.${mode}.${key}`] ?? (mode === 'dark' && key === 'background' ? '#202124' : mode === 'dark' && key === 'foreground' ? '#e5e5e5' : value(key)))} onChange={event => setValue(`display.${mode}.${key}`, event.target.value)} /></label>)}</div></Group>)}
        <Group>{select('contentFont', '内容字体', ['与界面字体相同', ...fonts])}{select('codeFont', '代码字体', ['Menlo', 'Monaco', 'SF Mono', '系统'])}{toggle('translucent', '半透明侧边栏')}<PreferenceRow label="对比度" htmlFor="display-contrast"><input id="display-contrast" className="display-range" type="range" min={0} max={100} value={Number(value('contrast'))} onChange={event => update('contrast', Number(event.target.value))} /></PreferenceRow></Group>
        <Group>{toggle('fullWidth', '页面全宽')}{toggle('punctuation', '智能标点', '输入时自动设置引号、破折号、省略号和箭头的格式')}{select('diff', '差异标记', ['颜色', '+/−'])}{toggle('pointer', '使用指针光标')}{select('dock', 'Dock 图标', ['Codex', 'ChatGPT', '空间'])}{toggle('fontSmoothing', '字体平滑')}</Group>
        <Group title="布局"><PreferenceRow label="侧栏宽度" htmlFor="display-sidebar-width"><input id="display-sidebar-width" className="display-range" type="range" min={240} max={clampSidebarWidth(520, innerWidth)} step={4} value={state.sidebarWidth} onChange={event => setState(previous => ({ ...previous, sidebarWidth: clampSidebarWidth(Number(event.target.value), innerWidth) }))} /><span className="settings-value">{state.sidebarWidth}px</span></PreferenceRow></Group>
      </div>}
    </section>
    <p className="display-local-note">模式、界面字号和侧栏宽度应用于本客户端；其他选项仅保留在当前会话，不改变系统设置。</p><p className="display-status" role="status">{status}</p>
    {importing && <Dialog title="导入主题" className="small-dialog" onClose={() => setImporting(false)}><form onSubmit={event => { event.preventDefault(); importTheme(); }}><div className="dialog-content"><p className="display-local-note">粘贴由本页复制的主题。</p><textarea className="display-theme-json" aria-label="主题 JSON" value={themeText} onChange={event => setThemeText(event.target.value)} maxLength={4000} rows={8} autoFocus /><p role="alert" className="display-status">{status}</p></div><div className="dialog-footer"><button type="button" className="secondary-button" onClick={() => setImporting(false)}>取消</button><button type="submit" className="primary-button" disabled={!themeText.trim()}>导入主题</button></div></form></Dialog>}
  </div>;
}

function ShortcutSettings({ values, setValue }: SettingsSectionProps) {
  const [query, setQuery] = useState('');
  const [byKeys, setByKeys] = useState(false);
  const [editing, setEditing] = useState<typeof shortcutRows[number] | null>(null);
  const [keys, setKeys] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [status, setStatus] = useState('');
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const binding = (row: typeof shortcutRows[number]) => String(values[`shortcut.${row.id}`] ?? row.keys);
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/\s|\+/g, '');
  const filtered = shortcutRows.filter(row => normalize(byKeys ? binding(row) : `${row.label} ${row.group} ${binding(row)}`).includes(normalize(query)));
  const customized = shortcutRows.some(row => binding(row) !== row.keys)
    || values['shortcut.numbers'] != null && values['shortcut.numbers'] !== '⌘ 1–9 切换聊天'
    || values['shortcut.browserLink'] != null && values['shortcut.browserLink'] !== '⌘ + 点击';
  const closeEditor = () => { setEditing(null); requestAnimationFrame(() => editTrigger.current?.focus()); };
  function saveKeys() {
    const next = keys.trim() || '未分配';
    if (next !== '未分配' && shortcutRows.some(row => row.id !== editing?.id && normalize(binding(row)) === normalize(next))) { setStatus('此组合已分配给其他操作，请换一个组合'); return; }
    if (editing) setValue(`shortcut.${editing.id}`, next);
    setStatus('快捷键显示已保存；实际按键绑定未改变'); closeEditor();
  }
  return <div className="display-settings">
    <div className="display-shortcut-toolbar"><div className="display-search"><Search size={15} /><input aria-label={byKeys ? '按按键搜索快捷键' : '搜索快捷键'} placeholder={byKeys ? '输入组合，例如 ⌘ N' : '搜索快捷键'} value={query} onChange={event => setQuery(event.target.value)} /><IconButton label="按按键搜索" active={byKeys} onClick={() => { setByKeys(previous => !previous); setQuery(''); }}><Keyboard size={16} /></IconButton></div><button className="settings-outline-button" disabled={!customized} onClick={() => setConfirmReset(true)}>全部重置为默认值</button></div>
    <Group><PreferenceRow label="数字快捷键" description="选择 ⌘ 1–9 的切换对象" htmlFor="display-number-shortcuts"><SelectControl id="display-number-shortcuts" value={String(values['shortcut.numbers'] ?? '⌘ 1–9 切换聊天')} options={['⌘ 1–9 切换聊天', '⌘ 1–9 切换标签页']} onChange={value => setValue('shortcut.numbers', value)} /></PreferenceRow></Group>
    {['应用', '聊天', '编辑器', '听写'].map(group => { const rows = filtered.filter(row => row.group === group); return rows.length ? <Group key={group} title={group}>{rows.map(row => <PreferenceRow key={row.id} label={row.label}><button className={`display-keybinding${binding(row) !== row.keys ? ' is-custom' : ''}`} aria-label={`修改${row.label}快捷键`} onClick={event => { editTrigger.current = event.currentTarget; setEditing(row); setKeys(binding(row) === '未分配' ? '' : binding(row)); setStatus(''); }}><kbd>{binding(row)}</kbd></button>{binding(row) !== row.keys && <IconButton label={`重置${row.label}`} onClick={() => setValue(`shortcut.${row.id}`, row.keys)}><RotateCcw size={13} /></IconButton>}</PreferenceRow>)}{group === '应用' && <PreferenceRow label="在默认浏览器中打开网页链接" htmlFor="display-browser-shortcut"><SelectControl id="display-browser-shortcut" value={String(values['shortcut.browserLink'] ?? '⌘ + 点击')} options={['未分配', '⌘ + 点击', '⌥ + 点击', '⇧ ⌘ + 点击']} onChange={value => setValue('shortcut.browserLink', value)} /></PreferenceRow>}</Group> : null; })}
    {!filtered.length && <div className="display-empty"><Search size={23} /><p>没有匹配的快捷键</p></div>}
    <p className="display-local-note">快捷键可编辑并在本次设置会话中预览，不注册全局快捷键，也不会改变客户端当前的实际按键行为。</p><p role="status" className="display-status">{status}</p>
    {editing && <Dialog title={`修改快捷键：${editing.label}`} className="small-dialog" onClose={closeEditor}><form onSubmit={event => { event.preventDefault(); saveKeys(); }}><div className="dialog-content"><label className="field-label" htmlFor="display-shortcut-keys">快捷键组合</label><input id="display-shortcut-keys" className="text-input" autoFocus value={keys} onChange={event => setKeys(event.target.value)} maxLength={40} placeholder="输入组合，例如 ⌘ ⇧ N" /><p className="display-local-note">编辑显示文字，留空表示未分配。此处不捕获系统按键。</p><p className="display-status" role="alert">{status}</p></div><div className="dialog-footer"><button type="button" className="secondary-button" onClick={closeEditor}>取消</button><button type="submit" className="primary-button">保存</button></div></form></Dialog>}
    {confirmReset && <Dialog title="重置所有键盘快捷键？" className="small-dialog" onClose={() => setConfirmReset(false)}><div className="dialog-content">这会清除本次会话中的自定义显示，恢复默认显示。</div><div className="dialog-footer"><button className="secondary-button" onClick={() => setConfirmReset(false)}>取消</button><button className="primary-button" onClick={() => { shortcutRows.forEach(row => setValue(`shortcut.${row.id}`, row.keys)); setValue('shortcut.numbers', '⌘ 1–9 切换聊天'); setValue('shortcut.browserLink', '⌘ + 点击'); setConfirmReset(false); setStatus('已恢复快捷键默认显示'); }}>全部重置</button></div></Dialog>}
  </div>;
}

function ArchivedSettings({ state, setState }: SettingsSectionProps) {
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [kind, setKind] = useState('全部聊天');
  const [sort, setSort] = useState('更新日期');
  const [grouped, setGrouped] = useState(true);
  const [deletion, setDeletion] = useState<{ ids: string[]; label: string } | null>(null);
  const [status, setStatus] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const archived = state.threads.filter(thread => thread.archived);
  const matches = archived.filter(thread => kind !== '云端' && (project === 'all' || project === 'none' && !thread.projectId || thread.projectId === project) && thread.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === '按字母排序' ? a.title.localeCompare(b.title, 'zh-CN') : sort === '创建日期' ? (b.messages[0]?.createdAt ?? b.updatedAt) - (a.messages[0]?.createdAt ?? a.updatedAt) : b.updatedAt - a.updatedAt);
  const groups = grouped ? [...new Set(matches.map(thread => thread.projectId))].map(id => ({ id: id ?? 'none', title: state.projects.find(item => item.id === id)?.name ?? '无项目', threads: matches.filter(thread => thread.projectId === id) })) : [{ id: 'all', title: '', threads: matches }];
  const refocus = () => requestAnimationFrame(() => (searchRef.current ?? rootRef.current)?.focus());
  function restore(id: string) { setState(previous => updateThread(previous, id, { archived: false })); setStatus('聊天已恢复到侧栏'); refocus(); }
  function confirmDelete() {
    if (!deletion) return;
    setState(previous => deletion.ids.reduce((next: AppState, id) => next.threads.some(thread => thread.id === id && thread.archived) ? deleteThread(next, id) : next, previous));
    setDeletion(null); setStatus('已删除所选归档聊天'); refocus();
  }
  return <div className="display-settings display-archived" tabIndex={-1} ref={rootRef}>
    {archived.length > 0 && <><div className="display-archive-toolbar"><div className="display-search"><Search size={15} /><input ref={searchRef} aria-label="搜索已归档聊天" placeholder="搜索已归档聊天" value={query} onChange={event => setQuery(event.target.value)} />{query && <IconButton label="清除搜索" onClick={() => setQuery('')}><X size={14} /></IconButton>}</div><Dropdown label="筛选归档聊天" trigger={<SlidersHorizontal size={16} />} align="right" options={[...['全部聊天', '本地', '云端'].map(label => ({ label, checked: kind === label, onSelect: () => setKind(label) })), ...['更新日期', '创建日期', '按字母排序'].map((label, index) => ({ label, divider: index === 0, checked: sort === label, onSelect: () => setSort(label) }))]} /><button className="settings-outline-button display-delete-all" onClick={() => setDeletion({ ids: archived.map(thread => thread.id), label: '全部归档聊天' })}>全部删除</button></div><div className="display-archive-filters"><label>项目<select aria-label="按项目筛选已归档聊天" value={project} onChange={event => setProject(event.target.value)}><option value="all">所有项目</option><option value="none">无项目</option>{state.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>分组<select aria-label="归档聊天分组" value={grouped ? '项目' : '无'} onChange={event => setGrouped(event.target.value === '项目')}><option>项目</option><option>无</option></select></label><span>{matches.length} 个聊天</span></div></>}
    {groups.map(group => group.threads.length > 0 && <section key={group.id} className="display-archive-group">{grouped && <header><Folder size={15} /><h3>{group.title}</h3><span>{group.threads.length} 个聊天</span><IconButton label={`删除${group.title}中的归档聊天`} onClick={() => setDeletion({ ids: group.threads.map(thread => thread.id), label: `${group.title}中的归档聊天` })}><Trash2 size={14} /></IconButton></header>}<div className="settings-preference-group">{group.threads.map(thread => <div className="display-archive-row" key={thread.id}><div><strong>{thread.title}</strong><small>{thread.updatedAt > 1000 ? new Date(thread.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未记录时间'} · 本地</small></div><IconButton label={`恢复 ${thread.title}`} onClick={() => restore(thread.id)}><ArchiveRestore size={16} /></IconButton><IconButton label={`删除 ${thread.title}`} onClick={() => setDeletion({ ids: [thread.id], label: `“${thread.title}”` })}><Trash2 size={15} /></IconButton></div>)}</div></section>)}
    {!matches.length && <div className="display-empty"><Archive size={26} /><p>{archived.length ? '没有匹配的已归档聊天' : '没有已归档的聊天'}</p>{archived.length > 0 && <button className="settings-inline-link" onClick={() => { setQuery(''); setKind('全部聊天'); setProject('all'); }}>清除筛选</button>}</div>}
    <p role="status" className="display-status">{status}</p>
    {deletion && <Dialog title="删除归档聊天？" className="small-dialog" onClose={() => setDeletion(null)}><div className="dialog-content"><p>将删除{deletion.label}（{deletion.ids.length} 个）及其消息。此操作无法撤销。</p></div><div className="dialog-footer"><button className="secondary-button" onClick={() => setDeletion(null)}>取消</button><button className="danger-button" onClick={confirmDelete}>删除</button></div></Dialog>}
  </div>;
}
