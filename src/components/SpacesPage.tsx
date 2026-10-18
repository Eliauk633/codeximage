import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowUpDown, Bell, Check, ChevronDown, Code, FileText, FilePlus2, Folder, Globe2, Image, LayoutGrid, LibraryBig, List, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { AuthResult } from '../auth';
import { deleteSpaceItem, purgeSpaceTrash, restoreSpaceItem, safeSpaceUrl, spaceActivityLabel, spacesLimits, updateSpaceItem, validateSpacesState, type SpaceItem, type SpaceItemKind, type SpacesState } from '../spaces-state';
import { Dialog, Dropdown, IconButton } from './ui';
import driveIcon from '../assets/profile-plugins/google-drive.svg';
import './spaces-page.css';

type Category = 'all' | 'page' | 'site' | 'image' | 'drive' | 'trash' | `space:${string}`;
export type SpacesCategory = Category;
type Modal = { kind: 'rename' | 'move' | 'permanent'; item: SpaceItem } | { kind: 'empty-trash' | 'space' | 'notice' | 'discard' } | null;
type Props = { value: SpacesState; onSave: (next: SpacesState) => Promise<AuthResult>; onOpenPlugins?: () => void; onDirtyChange?: (dirty: boolean) => void; onCategoryChange?: (category: SpacesCategory) => void; sidebarVisible?: boolean; initialCategory?: Category; navigationKey?: number };
const labels: Record<string, string> = { all: '全部', page: '页面', site: '站点', image: '图像', drive: 'Google Drive', trash: '回收站' };
const kindLabels: Record<SpaceItemKind, string> = { page: '页面', site: '站点', image: '图像', file: '文件' };
const categories = [{ id: 'all', icon: LibraryBig }, { id: 'page', icon: FileText }, { id: 'site', icon: LayoutGrid }, { id: 'image', icon: Image }] as const;

function ItemIcon({ item, large = false }: { item: SpaceItem; large?: boolean }) {
  const Icon = item.kind === 'site' ? Globe2 : item.kind === 'image' ? Image : item.kind === 'file' && item.title.endsWith('.yaml') ? Code : FileText;
  return <span className={`spaces-item-icon ${large ? 'large' : ''} kind-${item.kind}`}><Icon size={large ? 23 : 16} strokeWidth={1.6} /></span>;
}

function PageContent({ content }: { content: string }) {
  return <div className="spaces-document-content">{content.split('\n').map((line, index) => {
    if (line.startsWith('# ')) return <h1 key={index}>{line.slice(2)}</h1>;
    if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>;
    if (/^- \[[ x]\] /.test(line)) return <p className="spaces-task-line" key={index}><span className={line[3] === 'x' ? 'checked' : ''}>{line[3] === 'x' && <Check size={12} />}</span>{line.slice(6)}</p>;
    if (line.startsWith('- ')) return <p className="spaces-bullet-line" key={index}>{line.slice(2)}</p>;
    return line ? <p key={index}>{line}</p> : <div className="spaces-text-break" key={index} />;
  })}</div>;
}

export function SpacesPage({ value, onSave, onOpenPlugins, onDirtyChange, onCategoryChange, sidebarVisible = true, initialCategory = 'page', navigationKey = 0 }: Props) {
  const [category, setCategory] = useState<Category>(initialCategory);
  const [scope, setScope] = useState<'all' | 'mine' | 'shared'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'activity' | 'title' | 'oldest'>('activity');
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [draft, setDraft] = useState<SpaceItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [modalText, setModalText] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const pending = useRef(false);
  const lastNavigationKey = useRef(navigationKey);
  const imageGeneration = useRef(0);
  const dirtyCallback = useRef(onDirtyChange);
  dirtyCallback.current = onDirtyChange;
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const afterDiscard = useRef<(() => void) | null>(null);
  const openedItem = value.items.find(item => item.id === opened && item.deletedAt === null);
  const activeItem = editing ? draft : openedItem;
  const dirty = editing && draft !== null && JSON.stringify(draft) !== JSON.stringify(openedItem);
  useEffect(() => { onDirtyChange?.(dirty || reading || saving); }, [dirty, reading, saving, onDirtyChange]);
  useEffect(() => { onCategoryChange?.(category); }, [category, onCategoryChange]);
  useEffect(() => () => { imageGeneration.current++; dirtyCallback.current?.(false); }, []);
  const trashCount = value.items.filter(item => item.deletedAt !== null).length;
  const spaceId = category.startsWith('space:') ? category.slice(6) : null;
  const title = spaceId ? value.spaces.find(space => space.id === spaceId)?.name ?? '空间' : labels[category];
  const recent = useMemo(() => value.items.filter(item => item.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt), [value]);
  const items = useMemo(() => value.items.filter(item => {
    if ((category === 'trash') !== (item.deletedAt !== null)) return false;
    if (spaceId && item.spaceId !== spaceId) return false;
    if (['page', 'site', 'image'].includes(category) && item.kind !== category) return false;
    if (category === 'drive') return false;
    if (scope === 'shared' && !item.shared || scope === 'mine' && item.shared) return false;
    return `${item.title}\n${item.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'oldest' ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt), [value, category, query, scope, sort, spaceId]);

  async function save(next: SpacesState): Promise<boolean> {
    if (pending.current) return false;
    const validation = validateSpacesState(next); if (validation) { setError(validation); return false; }
    pending.current = true; setSaving(true); setError('');
    try { const result = await onSave(next); if (!result.ok) { setError(result.error); return false; } return true; }
    catch { setError('保存未完成，请重试。你的修改仍保留在页面中。'); return false; }
    finally { pending.current = false; setSaving(false); }
  }
  function changeView(action: () => void) {
    if (pending.current) return;
    const proceed = () => { imageGeneration.current++; setReading(false); action(); setError(''); setCopyStatus(''); };
    if (dirty || reading) { afterDiscard.current = proceed; setModal({ kind: 'discard' }); return; }
    proceed();
  }
  function navigate(next: Category) { changeView(() => { setCategory(next); setOpened(null); setDraft(null); setEditing(false); setQuery(''); setScope('all'); }); }
  useEffect(() => {
    if (lastNavigationKey.current === navigationKey || saving) return;
    lastNavigationKey.current = navigationKey;
    navigate(initialCategory);
  }, [navigationKey, saving]);
  function openItem(item: SpaceItem) { changeView(() => { setOpened(item.id); setEditing(false); setDraft(null); }); }
  function create(kind: SpaceItemKind = category === 'site' || category === 'image' ? category : 'page') {
    changeView(() => {
      const now = Date.now();
      setDraft({ id: crypto.randomUUID(), kind, title: '', content: '', url: '', spaceId, shared: false, createdAt: now, updatedAt: now, deletedAt: null });
      setOpened(null); setEditing(true);
    });
  }
  function openModal(next: NonNullable<Modal>) { if (pending.current) return; setModal(next); setError(''); if ('item' in next) { setModalText(next.item.title); setMoveTarget(next.item.spaceId ?? ''); } else setModalText(''); }
  function closeModal() { if (!pending.current) { setModal(null); setError(''); } }
  async function saveDraft() {
    if (!draft || reading || pending.current) return;
    const item = { ...draft, title: draft.title.trim(), updatedAt: Date.now() };
    if (!item.title) { setError('请输入名称。'); return; }
    if (item.kind === 'site' && !item.url) { setError('请输入站点的 HTTPS 网址。'); return; }
    if (item.kind === 'image' && !item.url) { setError('请选择一张图像。'); return; }
    if (!safeSpaceUrl(item.url, item.kind)) { setError(item.kind === 'site' ? '请输入有效的 HTTPS 网址，且不要包含账号或密码。' : '请选择 PNG、JPEG、WebP 或 GIF 图像。'); return; }
    try { if (await save(updateSpaceItem(value, item))) { setOpened(item.id); setDraft(null); setEditing(false); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : '内容无法保存。'); }
  }
  async function saveModal() {
    if (!modal) return;
    try {
      let next: SpacesState;
      if (modal.kind === 'space') {
        const name = modalText.trim(); if (!name) { setError('请输入空间名称。'); return; }
        if (value.spaces.some(space => space.name === name)) { setError('已有同名空间，请换一个名称。'); return; }
        next = { ...value, spaces: [...value.spaces, { id: crypto.randomUUID(), name }] };
      } else if (modal.kind === 'rename' || modal.kind === 'move') {
        const item = value.items.find(item => item.id === modal.item.id); if (!item) { setError('内容已不存在，请关闭后重试。'); return; }
        next = updateSpaceItem(value, { ...item, ...(modal.kind === 'rename' ? { title: modalText.trim() } : { spaceId: moveTarget || null }), updatedAt: Date.now() });
      } else if (modal.kind === 'permanent' || modal.kind === 'empty-trash') next = purgeSpaceTrash(value, modal.kind === 'permanent' ? modal.item.id : undefined);
      else return;
      if (await save(next)) setModal(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '内容无法保存。'); }
  }
  async function remove(item: SpaceItem) {
    if (await save(deleteSpaceItem(value, item.id))) { if (opened === item.id) { setOpened(null); setEditing(false); setDraft(null); } }
  }
  async function copySiteUrl(url: string) {
    try { if (window.desktop) await window.desktop.copyText(url); else await navigator.clipboard.writeText(url); setCopyStatus('链接已复制'); }
    catch { setCopyStatus('无法访问剪贴板，请直接选择网址复制。'); }
  }
  async function readImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || !draft || pending.current) return;
    const generation = ++imageGeneration.current;
    setReading(false);
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > spacesLimits.imageBytes) { setError('请选择不超过 1 MB 的 PNG、JPEG、WebP 或 GIF 图像。'); return; }
    const forId = draft.id;
    setReading(true); setError('');
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.onabort = reject; reader.readAsDataURL(file); });
      if (generation !== imageGeneration.current) return;
      await new Promise<void>((resolve, reject) => { const image = new window.Image(); image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error('Invalid image')); image.onerror = () => reject(new Error('Invalid image')); image.src = data; });
      if (generation !== imageGeneration.current) return;
      setDraft(current => current?.id === forId ? { ...current, url: data, title: current.title || file.name } : current); setError('');
    } catch { if (generation === imageGeneration.current) setError('无法读取或解码这张图像，请选择有效的图像文件。'); }
    finally { if (generation === imageGeneration.current) setReading(false); }
  }
  function itemMenu(item: SpaceItem) { return <Dropdown label={`${item.title}的操作`} align="right" trigger={<MoreHorizontal size={17} />} options={item.deletedAt !== null ? [{ label: '恢复', icon: RotateCcw, onSelect: () => void save(restoreSpaceItem(value, item.id)) }, { label: '永久删除', icon: Trash2, danger: true, divider: true, onSelect: () => openModal({ kind: 'permanent', item }) }] : [
    { label: '打开', icon: FileText, onSelect: () => openItem(item) },
    { label: '重命名', icon: Pencil, onSelect: () => openModal({ kind: 'rename', item }) },
    { label: '移动到空间', icon: Folder, onSelect: () => openModal({ kind: 'move', item }) },
    { label: '移到回收站', icon: Trash2, danger: true, divider: true, onSelect: () => void remove(item) },
  ]} />; }

  return <div className={`spaces-shell ${sidebarVisible ? '' : 'without-sidebar'}`}>
    {sidebarVisible && <aside className="spaces-sidebar" aria-label="空间导航">
      <div className="spaces-sidebar-heading"><strong>空间</strong><div><IconButton label="空间通知" onClick={() => openModal({ kind: 'notice' })}><Bell size={15} strokeWidth={1.5} /></IconButton><IconButton label="搜索空间内容" onClick={() => { navigate('all'); requestAnimationFrame(() => searchRef.current?.focus()); }}><Search size={15} strokeWidth={1.5} /></IconButton></div></div>
      <button className="spaces-nav-row spaces-new-page" onClick={() => create('page')}><FilePlus2 size={16} strokeWidth={1.5} /><span>新建页面</span></button>
      <nav>{categories.map(({ id, icon: Icon }) => <button key={id} className={`spaces-nav-row ${category === id && !activeItem ? 'selected' : ''}`} aria-current={category === id && !activeItem ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={16} strokeWidth={1.5} /><span>{labels[id]}</span></button>)}<button className={`spaces-nav-row ${category === 'drive' && !activeItem ? 'selected' : ''}`} onClick={() => navigate('drive')}><img src={driveIcon} alt="" /><span>Google Drive</span></button></nav>
      <div className="spaces-sidebar-scroll"><div className="spaces-sidebar-label">最近更新</div>{recent.slice(0, expanded ? 30 : 5).map(item => <button className={`spaces-nav-row spaces-recent ${opened === item.id ? 'selected' : ''}`} key={item.id} title={item.title} onClick={() => openItem(item)}>{item.kind === 'file' && item.title.endsWith('.yaml') ? <Code size={14} strokeWidth={1.4} /> : <FileText size={14} strokeWidth={1.4} />}<span>{item.title}</span></button>)}{recent.length > 5 && <button className="spaces-expand" onClick={() => setExpanded(!expanded)}>{expanded ? '收起显示' : '展开显示'}</button>}
        <div className="spaces-sidebar-label spaces-groups-heading"><span>空间</span><IconButton label="新建空间" onClick={() => openModal({ kind: 'space' })}><Plus size={15} /></IconButton></div>{value.spaces.map(space => <button className={`spaces-nav-row ${spaceId === space.id && !activeItem ? 'selected' : ''}`} key={space.id} onClick={() => navigate(`space:${space.id}`)}><Folder size={16} strokeWidth={1.5} /><span>{space.name}</span></button>)}
      </div><button className={`spaces-nav-row spaces-trash-nav ${category === 'trash' ? 'selected' : ''}`} onClick={() => navigate('trash')}><Trash2 size={16} strokeWidth={1.5} /><span>回收站</span></button>
    </aside>}
    <main className="spaces-main">
      {activeItem ? <>
        <div className="spaces-document-toolbar"><button className="spaces-back" disabled={saving} onClick={() => changeView(() => { setOpened(null); setEditing(false); setDraft(null); })}><ArrowLeft size={16} />返回{title}</button><div>{editing ? <><button className="spaces-pill" disabled={saving} onClick={() => changeView(() => { setDraft(null); setEditing(false); })}>取消</button><button className="spaces-pill primary" disabled={saving || reading} onClick={() => void saveDraft()}>{saving ? '正在保存…' : reading ? '正在读取…' : '保存'}</button></> : <><button className="spaces-pill" onClick={() => { setDraft({ ...activeItem }); setEditing(true); setError(''); }}><Pencil size={14} />编辑</button>{itemMenu(activeItem)}</>}</div></div>
        <div className="spaces-document">{error && <p role="alert" className="spaces-error">{error}</p>}{editing && draft ? <>
          <span className="spaces-document-kind">{kindLabels[draft.kind]}</span><input className="spaces-title-input" disabled={saving} aria-label="内容名称" placeholder={`未命名${kindLabels[draft.kind]}`} value={draft.title} maxLength={spacesLimits.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
          {draft.kind === 'site' && <label className="spaces-field">站点网址<input type="url" disabled={saving} placeholder="https://" value={draft.url} maxLength={2048} onChange={event => setDraft({ ...draft, url: event.target.value })} /></label>}
          {draft.kind === 'image' && <><input type="file" hidden ref={fileRef} accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void readImage(event)} /><button className="spaces-image-picker" disabled={saving} onClick={() => fileRef.current?.click()}>{draft.url ? <img src={draft.url} alt={draft.title} /> : <><Image size={30} /><span>选择图像</span><small>PNG、JPEG、WebP、GIF，最大 1 MB</small></>}</button>{draft.url && <button className="spaces-pill" disabled={saving} onClick={() => fileRef.current?.click()}>更换图像</button>}{reading && <p className="spaces-muted" role="status">正在读取并检查图像…</p>}</>}
          <textarea readOnly={saving} aria-label={draft.kind === 'page' || draft.kind === 'file' ? '页面内容' : '描述'} className="spaces-content-input" placeholder={draft.kind === 'page' || draft.kind === 'file' ? '开始书写…\n\n支持标题、列表和待办事项。' : '添加描述…'} maxLength={spacesLimits.content} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} />
        </> : <><div className="spaces-document-title"><ItemIcon item={activeItem} large /><h1>{activeItem.title}</h1></div><p className="spaces-document-meta">{activeItem.spaceId ? value.spaces.find(space => space.id === activeItem.spaceId)?.name : '个人空间'} · 更新于 {new Date(activeItem.updatedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</p>{activeItem.kind === 'image' && <img className="spaces-full-image" src={activeItem.url} alt={activeItem.title} />}{activeItem.kind === 'site' && <div className="spaces-site-detail"><Globe2 size={32} /><span>{activeItem.url}</span><small>已保存的站点链接</small><button className="spaces-pill" onClick={() => void copySiteUrl(activeItem.url)}>复制链接</button>{copyStatus && <small role="status">{copyStatus}</small>}</div>}<PageContent content={activeItem.content} /></>}</div>
      </> : <div className="spaces-browser">
        <header className="spaces-browser-heading"><h1>{title}</h1><div className="spaces-heading-tools"><label className="spaces-search"><Search size={15} strokeWidth={1.4} /><input ref={searchRef} type="search" placeholder="搜索" aria-label="搜索空间" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={13} /></button>}</label>{category === 'trash' && trashCount > 0 && <button className="spaces-pill" disabled={saving} onClick={() => openModal({ kind: 'empty-trash' })}>清空回收站</button>}{category !== 'trash' && category !== 'drive' && <button className="spaces-pill primary" onClick={() => create()}>{category === 'site' ? '添加站点' : category === 'image' ? '添加图像' : '创建页面'}</button>}</div></header>
        {category !== 'drive' && <div className="spaces-browser-filters"><div role="tablist" aria-label="内容来源">{(['all', 'mine', 'shared'] as const).map((tab, index) => <button role="tab" aria-selected={scope === tab} className={scope === tab ? 'active' : ''} key={tab} onClick={() => setScope(tab)}>{['全部', '你的项目', '与你共享'][index]}</button>)}</div><div className="spaces-view-controls"><IconButton label="网格视图" active={value.view === 'grid'} disabled={saving} onClick={() => void save({ ...value, view: 'grid' })}><LayoutGrid size={15} strokeWidth={1.5} /></IconButton><IconButton label="列表视图" active={value.view === 'list'} disabled={saving} onClick={() => void save({ ...value, view: 'list' })}><List size={16} strokeWidth={1.5} /></IconButton></div></div>}
        {error && <p className="spaces-error" role="alert">{error}</p>}
        {category === 'drive' ? <div className="spaces-empty spaces-drive"><img src={driveIcon} alt="" /><h2>Google Drive</h2><p>连接后，在空间中查找和使用云端文件。</p><button className="spaces-pill primary" disabled={!onOpenPlugins} onClick={onOpenPlugins}>管理 Google Drive 连接</button></div> : items.length ? value.view === 'list' ? <div className="spaces-table" role="table" aria-label={`${title}列表`}>
          <div className="spaces-table-header" role="row"><div role="columnheader"><button onClick={() => setSort(sort === 'title' ? 'activity' : 'title')}>名称{sort === 'title' && <ChevronDown size={13} />}</button></div><span role="columnheader">来源</span><div role="columnheader"><Dropdown label="内容排序" align="right" trigger={<>上次活动时间{sort === 'oldest' && <ArrowUpDown size={12} />}</>} options={[{ label: '最近更新', checked: sort === 'activity', onSelect: () => setSort('activity') }, { label: '最早更新', checked: sort === 'oldest', onSelect: () => setSort('oldest') }, { label: '名称', checked: sort === 'title', onSelect: () => setSort('title') }]} /></div><span /></div>
          {items.map(item => <div role="row" className="spaces-table-row" key={item.id}><div role="cell"><button className="spaces-item-open" onClick={() => item.deletedAt === null ? openItem(item) : void save(restoreSpaceItem(value, item.id))}><ItemIcon item={item} /><span>{item.title}</span></button></div><span role="cell" className="spaces-source">{value.spaces.find(space => space.id === item.spaceId)?.name ?? '—'}</span><span role="cell" className="spaces-time" title={new Date(item.updatedAt).toLocaleString('zh-CN')}>{spaceActivityLabel(item.updatedAt)}</span><div className="spaces-row-menu">{itemMenu(item)}</div></div>)}
        </div> : <div className="spaces-grid">{items.map(item => <article className="spaces-grid-card" key={item.id}><button className="spaces-grid-open" onClick={() => item.deletedAt === null ? openItem(item) : void save(restoreSpaceItem(value, item.id))}>{item.kind === 'image' && item.url ? <img src={item.url} alt="" /> : <div className="spaces-grid-preview"><ItemIcon item={item} large />{item.content && <p>{item.content.slice(0, 160)}</p>}</div>}<h2>{item.title}</h2><p>{spaceActivityLabel(item.updatedAt)} · {kindLabels[item.kind]}</p></button><div className="spaces-grid-menu">{itemMenu(item)}</div></article>)}</div> : <div className="spaces-empty"><FileText size={30} strokeWidth={1.3} /><h2>{query ? '没有找到匹配的内容' : category === 'trash' ? '回收站为空' : scope === 'shared' ? '还没有与你共享的内容' : `还没有${title}`}</h2><p>{query ? '尝试其他名称或关键词。' : category === 'trash' ? '移到回收站的内容会显示在这里，可随时恢复。' : scope === 'shared' ? '与你共享的页面和文件会显示在这里。' : '将你的想法、资料和作品整理到空间中。'}</p>{!query && scope !== 'shared' && category !== 'trash' && <button className="spaces-pill" onClick={() => create()}>创建{category === 'site' ? '站点' : category === 'image' ? '图像' : '页面'}</button>}</div>}
      </div>}
    </main>
    {modal && <Dialog title={modal.kind === 'rename' ? '重命名' : modal.kind === 'move' ? '移动到空间' : modal.kind === 'space' ? '新建空间' : modal.kind === 'discard' ? '放弃未保存的修改？' : modal.kind === 'permanent' ? '永久删除内容？' : modal.kind === 'empty-trash' ? '清空回收站？' : '通知'} className="spaces-dialog small-dialog" onClose={closeModal}>
      <div className="dialog-content">{modal.kind === 'rename' || modal.kind === 'space' ? <label className="spaces-field">{modal.kind === 'space' ? '空间名称' : '名称'}<input autoFocus disabled={saving} value={modalText} maxLength={modal.kind === 'space' ? 80 : spacesLimits.title} onChange={event => setModalText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void saveModal(); }} /></label> : modal.kind === 'move' ? <><label className="spaces-field">选择空间<select disabled={saving} value={moveTarget} onChange={event => setMoveTarget(event.target.value)}><option value="">个人空间</option>{value.spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label><p className="spaces-muted">可在左侧“空间”旁的加号新建空间。</p></> : modal.kind === 'discard' ? <p>离开后，本次未保存的修改将丢失。</p> : modal.kind === 'permanent' ? <p>将永久删除“{modal.item.title}”，此操作无法恢复。</p> : modal.kind === 'empty-trash' ? <p>将永久删除回收站中的 {trashCount} 项内容，此操作无法恢复。</p> : <div className="spaces-notice"><Bell size={28} strokeWidth={1.2} /><p>暂无新通知</p></div>}{error && <p className="spaces-error" role="alert">{error}</p>}</div>
      <div className="dialog-footer"><button className="secondary-button" disabled={saving} onClick={closeModal}>{modal.kind === 'notice' ? '关闭' : modal.kind === 'discard' ? '继续编辑' : '取消'}</button>{modal.kind === 'discard' ? <button className="primary-button" onClick={() => { setModal(null); setError(''); afterDiscard.current?.(); afterDiscard.current = null; }}>放弃修改</button> : modal.kind !== 'notice' && <button className="primary-button" disabled={saving} onClick={() => void saveModal()}>{saving ? '正在保存…' : modal.kind === 'move' ? '移动' : modal.kind === 'permanent' ? '永久删除' : modal.kind === 'empty-trash' ? '清空回收站' : '保存'}</button>}</div>
    </Dialog>}
  </div>;
}
