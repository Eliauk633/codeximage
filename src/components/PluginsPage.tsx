import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleHelp, Compass, Download, FolderCheck, Link2, Plus, Search, ShieldCheck, X } from 'lucide-react';
import type { AuthResult } from '../auth';
import { installPlugin, removePlugin, setPluginEnabled, type PluginId, type PluginsState } from '../plugins-state';
import { Dialog } from './ui';
import drive from '../assets/profile-plugins/google-drive.svg';
import notion from '../assets/profile-plugins/notion.svg';
import notionDark from '../assets/profile-plugins/notion-dark.svg';
import github from '../assets/profile-plugins/github.svg';
import githubDark from '../assets/profile-plugins/github-dark.svg';
import gmail from '../assets/profile-plugins/gmail.svg';
import calendar from '../assets/profile-plugins/google-calendar.svg';
import './plugins-page.css';

const catalog = [
  { id: 'google-drive', name: 'Google Drive', icon: drive, darkIcon: drive, category: '文档与知识', developer: 'Google',
    description: '连接你的云端文件，在工作中查找、阅读和整理资料。',
    about: '让项目资料随时可用。按名称或内容找到文件，阅读文档，并将多份资料中的重要信息整理在一起。',
    capabilities: [ ['搜索文件', '按关键词、文件名称和类型查找云端资料。'], ['阅读与整理', '读取文档内容、汇总重点，并保留来源。'], ['协作内容', '查看文件的共享信息和评论，整理项目的讨论内容。'] ],
    permissions: ['搜索并读取你授权的 Google Drive 文件', '读取文件元数据与共享状态', '写入或分享文件时需要单独授权'],
    prompts: ['查找本周更新的项目文档', '总结产品需求文档中的关键决策', '对比两份方案并列出主要差异'] },
  { id: 'notion', name: 'Notion', icon: notion, darkIcon: notionDark, category: '文档与知识', developer: 'Notion',
    description: '搜索知识库，将笔记、项目资料和待办事项汇集到工作中。',
    about: '从团队知识库中找到答案。查看页面内容和数据库记录，整理会议笔记，把讨论转成清晰的行动事项。',
    capabilities: [ ['知识库搜索', '在授权的页面和数据库中查找相关资料。'], ['读取页面', '查看页面中的文本、清单和结构化内容。'], ['整理知识', '结合多个页面梳理要点、待办事项和相关来源。'] ],
    permissions: ['读取你明确授权的 Notion 页面', '读取数据库结构和记录', '更新页面前需要单独授权'],
    prompts: ['找到最近一次项目评审记录', '整理会议中的行动事项', '查找与发布流程有关的页面'] },
  { id: 'github', name: 'GitHub', icon: github, darkIcon: githubDark, category: '开发工具', developer: 'GitHub',
    description: '查找仓库、问题和拉取请求，理解代码变更与协作进展。',
    about: '在开发过程中获取仓库上下文。阅读问题和拉取请求，了解代码变更，并整理审查要点与后续工作。',
    capabilities: [ ['搜索仓库', '查找你拥有访问权限的仓库和代码内容。'], ['问题与拉取请求', '读取讨论、状态和关联的提交信息。'], ['变更审查', '总结代码差异，并整理需要关注的审查事项。'] ],
    permissions: ['读取授权仓库的代码和元数据', '读取问题、提交与拉取请求', '提交、合并或发布内容需要单独授权'],
    prompts: ['总结最近的拉取请求改动', '列出尚未处理的界面问题', '查看某个修复涉及哪些文件'] },
  { id: 'gmail', name: 'Gmail', icon: gmail, darkIcon: gmail, category: '沟通与协作', developer: 'Google',
    description: '查找邮件，整理收件箱中的重点，并帮助准备回复。',
    about: '从邮件中快速了解重要进展。根据主题、联系人和时间查找消息，整理相关往来，并准备回复内容。',
    capabilities: [ ['搜索邮件', '按主题、发件人和日期定位相关邮件。'], ['整理往来', '查看邮件会话并总结决定、问题和待办事项。'], ['准备回复', '根据邮件上下文准备回复内容。'] ],
    permissions: ['搜索并读取你授权的邮件内容', '读取邮件标签和会话信息', '发送、删除或移动邮件需要单独授权'],
    prompts: ['查找与项目评审有关的邮件', '汇总本周需要回复的事项', '为收到的反馈准备回复内容'] },
  { id: 'google-calendar', name: 'Google Calendar', icon: calendar, darkIcon: calendar, category: '效率与安排', developer: 'Google',
    description: '了解日程安排，寻找合适的时间，为会议做好准备。',
    about: '将日历安排带入你的工作。查看未来日程、检查空闲时间，并结合会议详情整理准备事项。',
    capabilities: [ ['查看日程', '按日期查看授权日历中的事件和会议。'], ['查找空闲时间', '比较日程安排，找到适合新会议的时段。'], ['会议准备', '整理会议时间、地点与说明。'] ],
    permissions: ['读取你授权的日历与事件', '读取日程中的时间、地点和说明', '创建、修改事件或发送邀请需要单独授权'],
    prompts: ['查看今天接下来的会议', '寻找明天下午的空闲时段', '整理本周会议的准备事项'] },
] satisfies { id: PluginId; name: string; icon: string; darkIcon: string; category: string; developer: string; description: string; about: string; capabilities: string[][]; permissions: string[]; prompts: string[] }[];

type Plugin = typeof catalog[number];
type View = 'browse' | 'installed';
const categories = ['全部', '文档与知识', '开发工具', '沟通与协作', '效率与安排'];

function PluginIcon({ plugin, large = false }: { plugin: Plugin; large?: boolean }) {
  return <span className={`plugin-center-icon ${large ? 'large' : ''}`}><img className="plugin-icon-light" src={plugin.icon} alt="" /><img className="plugin-icon-dark" src={plugin.darkIcon} alt="" /></span>;
}

export function PluginsPage({ value, onSave, initialView = 'browse', sidebarVisible = true }: {
  value: PluginsState; onSave: (next: PluginsState) => Promise<AuthResult>; initialView?: View; sidebarVisible?: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [selected, setSelected] = useState<Plugin | null>(null);
  const [detailTab, setDetailTab] = useState('概述');
  const [dialog, setDialog] = useState<'connect' | 'remove' | 'usage' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const listOpener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setView(initialView); setSelected(null); setCategory('全部'); setQuery(''); }, [initialView]);
  function navigate(next: View, nextCategory = '全部') {
    setView(next); setCategory(nextCategory); setSelected(null); setQuery(''); setMessage(''); setError('');
  }
  function openPlugin(plugin: Plugin, opener?: HTMLButtonElement) {
    listOpener.current = opener ?? null;
    setSelected(plugin); setDetailTab('概述'); setMessage(''); setError('');
    requestAnimationFrame(() => { mainRef.current?.scrollTo({ top: 0 }); mainRef.current?.focus({ preventScroll: true }); });
  }
  function back() {
    setSelected(null); setMessage(''); setError('');
    requestAnimationFrame(() => { if (listOpener.current?.isConnected) listOpener.current.focus(); else mainRef.current?.focus(); });
  }
  function openDialog(next: 'connect' | 'remove' | 'usage') {
    dialogOpener.current = document.activeElement as HTMLElement | null;
    setError(''); setDialog(next);
  }
  function closeDialog() {
    if (pending.current) return;
    setDialog(null); setError('');
    requestAnimationFrame(() => { if (dialogOpener.current?.isConnected) dialogOpener.current.focus(); else mainRef.current?.focus(); });
  }
  async function persist(next: PluginsState, success: string) {
    if (pending.current) return false;
    if (next === value) return true;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await onSave(next);
      if (!result.ok) { setError(result.error || '保存失败，请重试。'); return false; }
      setMessage(success); return true;
    } catch { setError('保存失败，请重试。'); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  const installed = selected ? value.installed.find(item => item.id === selected.id) : undefined;
  const terms = query.trim().toLocaleLowerCase();
  const filtered = catalog.filter(plugin => (view !== 'installed' || value.installed.some(item => item.id === plugin.id))
    && (category === '全部' || plugin.category === category)
    && `${plugin.name} ${plugin.category} ${plugin.description}`.toLocaleLowerCase().includes(terms));

  return <div className="plugin-center">
    {sidebarVisible && <aside className="plugin-center-sidebar" aria-label="插件导航">
      <h1>插件</h1>
      <nav><button className={view === 'browse' && !selected ? 'active' : ''} onClick={() => navigate('browse')}><Compass size={16} /><span>浏览插件</span></button>
        <button className={view === 'installed' && !selected ? 'active' : ''} onClick={() => navigate('installed')}><FolderCheck size={16} /><span>已安装</span><small>{value.installed.length}</small></button></nav>
      <div className="plugin-center-sidebar-label">分类</div><nav>{categories.slice(1).map(item => <button key={item} className={category === item && !selected ? 'active' : ''} onClick={() => navigate('browse', item)}><span>{item}</span></button>)}</nav>
      <div className="plugin-center-sidebar-label">已安装</div><nav className="plugin-center-installed-nav">{value.installed.length ? value.installed.map(item => {
        const plugin = catalog.find(entry => entry.id === item.id)!;
        return <button className={selected?.id === item.id ? 'active' : ''} key={item.id} onClick={() => openPlugin(plugin)}><PluginIcon plugin={plugin} /><span>{plugin.name}</span>{!item.enabled && <small>已停用</small>}</button>;
      }) : <p>尚未安装插件</p>}</nav>
    </aside>}
    <main className="plugin-center-main" ref={mainRef} tabIndex={-1} aria-label={selected ? `${selected.name} 插件详情` : '插件目录'}>
      <div className="plugin-center-content">
        {selected ? <>
          <button type="button" className="plugin-center-back" onClick={back}><ArrowLeft size={16} />{view === 'installed' ? '已安装' : '插件'}</button>
          <div className="plugin-center-detail-heading"><PluginIcon plugin={selected} large /><div><h1>{selected.name}</h1><p>{selected.developer} <span>·</span> {selected.category}</p></div>
            <div className="plugin-center-detail-actions">{installed ? <><span className="plugin-center-installed-label"><Check size={14} />已安装</span><button className="plugin-center-button" disabled={busy} onClick={() => persist(setPluginEnabled(value, selected.id, !installed.enabled), `${selected.name} 已${installed.enabled ? '停用' : '启用'}。`)}>{installed.enabled ? '停用' : '启用'}</button></> : <button className="plugin-center-button primary" disabled={busy} onClick={() => persist(installPlugin(value, selected.id), `${selected.name} 已添加到已安装插件。`)}><Plus size={15} />{busy ? '添加中…' : '安装'}</button>}</div>
          </div>
          <p className="plugin-center-detail-description">{selected.description}</p>
          <div className="plugin-center-detail-tabs" role="tablist" aria-label="插件详情">{['概述', '能力', '权限与隐私'].map(tab => <button key={tab} role="tab" aria-selected={detailTab === tab} onClick={() => setDetailTab(tab)}>{tab}</button>)}</div>
          {error && <p className="plugin-center-error" role="alert">{error}</p>}{message && <p className="plugin-center-message" role="status">{message}</p>}
          <div className="plugin-center-detail-body" role="tabpanel" aria-label={detailTab}>
            {detailTab === '概述' && <><section><h2>关于此插件</h2><p>{selected.about}</p></section><section><h2>尝试这些内容</h2><div className="plugin-center-prompts">{selected.prompts.map(item => <button key={item} type="button" onClick={() => { setPrompt(item); openDialog('usage'); }}><span>{item}</span><ChevronRight size={15} /></button>)}</div></section></>}
            {detailTab === '能力' && <section><h2>能力</h2><div className="plugin-center-capabilities">{selected.capabilities.map(([name, description]) => <article key={name}><ShieldCheck size={19} /><div><h3>{name}</h3><p>{description}</p></div></article>)}</div></section>}
            {detailTab === '权限与隐私' && <section><h2>访问权限</h2><p>连接账户后，插件只能访问你授权的内容。执行写入操作前，需要确认对应的操作权限。</p><ul>{selected.permissions.map(permission => <li key={permission}>{permission}</li>)}</ul><p className="plugin-center-privacy-note">当前未连接外部账户，未读取或传输任何外部数据。</p></section>}
            <section className="plugin-center-connection"><div><h2>应用连接</h2><p><span className="plugin-center-connection-dot" />未连接{installed && !installed.enabled && ' · 插件已停用'}</p></div><button className="plugin-center-button" onClick={() => openDialog('connect')} disabled={busy}><Link2 size={14} />连接账户</button></section>
            <section className="plugin-center-information"><h2>信息</h2><dl><div><dt>类别</dt><dd>{selected.category}</dd></div><div><dt>开发者</dt><dd>{selected.developer}</dd></div><div><dt>状态</dt><dd>{installed ? installed.enabled ? '已启用' : '已停用' : '未安装'}</dd></div>{installed && <div><dt>添加时间</dt><dd>{new Date(installed.installedAt).toLocaleDateString('zh-CN')}</dd></div>}</dl>{installed && <button className="plugin-center-remove" disabled={busy} onClick={() => openDialog('remove')}>移除插件</button>}</section>
          </div>
        </> : <>
          <header className="plugin-center-heading"><div><h1>{view === 'installed' ? '已安装插件' : '插件'}</h1><p>{view === 'installed' ? '管理你添加的插件与应用连接。' : '连接插件，让 Codex 在你的工具之间协作。'}</p></div><label className="plugin-center-search"><Search size={16} /><input placeholder="搜索插件" aria-label="搜索插件" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label></header>
          <div className="plugin-center-categories" role="group" aria-label="插件分类">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          {error && <p className="plugin-center-error" role="alert">{error}</p>}{message && <p className="plugin-center-message" role="status">{message}</p>}
          <div className="plugin-center-list-heading"><h2>{terms ? '搜索结果' : category !== '全部' ? category : view === 'installed' ? '你的插件' : '推荐插件'}</h2><span>{filtered.length} 个插件</span></div>
          {filtered.length ? <div className="plugin-center-grid">{filtered.map(plugin => {
            const entry = value.installed.find(item => item.id === plugin.id);
            return <article className="plugin-center-card" key={plugin.id}>
              <button className="plugin-center-card-main" aria-label={`查看 ${plugin.name} 插件详情`} onClick={event => openPlugin(plugin, event.currentTarget)}><PluginIcon plugin={plugin} /><h3>{plugin.name}</h3><p>{plugin.description}</p></button>
              <div className="plugin-center-card-footer"><span>{entry ? entry.enabled ? '已启用 · 未连接' : '已停用' : plugin.category}</span>{entry ? <button className="plugin-center-button" onClick={event => openPlugin(plugin, event.currentTarget)}>管理</button> : <button className="plugin-center-button" disabled={busy} aria-label={`安装 ${plugin.name}`} onClick={() => persist(installPlugin(value, plugin.id), `${plugin.name} 已添加到已安装插件。`)}><Plus size={14} />安装</button>}</div>
            </article>;
          })}</div> : <div className="plugin-center-empty">{view === 'installed' && !terms ? <Download size={30} /> : <Search size={30} />}<h2>{view === 'installed' && !terms && category === '全部' ? '尚未安装插件' : '没有找到匹配的插件'}</h2><p>{terms ? '换个关键词，或选择其他分类。' : '浏览插件目录，找到适合你工作的工具。'}</p><button className="plugin-center-button" onClick={() => navigate('browse')}>浏览全部插件</button></div>}
        </>}
      </div>
    </main>
    {dialog && selected && <Dialog title={dialog === 'connect' ? `连接 ${selected.name}` : dialog === 'usage' ? `使用 ${selected.name}` : `移除 ${selected.name}？`} onClose={closeDialog} className="plugin-center-dialog">
      <div className="dialog-content">{dialog === 'connect' ? <><div className="plugin-center-connect-heading"><PluginIcon plugin={selected} /><div><strong>{selected.name}</strong><p>未连接</p></div></div><p>此应用的账户授权服务尚未接入。接入后，将通过官方授权页面连接账户。</p><p className="plugin-center-connect-note"><CircleHelp size={16} />{installed ? '安装和启用状态已保存在当前账号中，连接账户后才能访问外部内容。' : '你可以先添加此插件；连接账户后才能访问外部内容。'}</p></> : dialog === 'usage' ? <><p className="plugin-center-prompt-preview">{prompt}</p><p>连接 {selected.name} 后，可在聊天中提出这类请求。当前账户尚未连接，尚未发起请求。</p></> : <p>将从当前账号的已安装列表中移除此插件。你可以随时重新添加。</p>}{error && <p role="alert" className="plugin-center-error">{error}</p>}</div>
      <div className="dialog-footer"><button className="secondary-button" disabled={busy} onClick={closeDialog}>{dialog === 'remove' ? '取消' : '关闭'}</button>{dialog === 'usage' && <button className="primary-button" onClick={() => setDialog('connect')}>查看连接</button>}{dialog === 'remove' && <button className="danger-button" disabled={busy} onClick={async () => { if (await persist(removePlugin(value, selected.id), `${selected.name} 已移除。`)) closeDialog(); }}>{busy ? '移除中…' : '移除'}</button>}</div>
    </Dialog>}
  </div>;
}
