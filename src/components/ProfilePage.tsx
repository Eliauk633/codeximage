import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, LockKeyhole, Pencil, Send, Upload } from 'lucide-react';
import { Dialog } from './ui';
import { createActivityCalendar, formatTokenAmount } from '../profile-activity';
import { createProfileUsage, type ProfileDemoConfig } from '../profile-demo';
import type { AuthResult } from '../auth';
import { ProfileStatsEditor } from './ProfileStatsEditor';
import { ProfileActivity } from './ProfileActivity';
import { ProfilePlugins } from './ProfilePlugins';
import featuredEmpty from '../assets/reference-icons/profile-featured-empty.svg';
import './profile-page.css';

export type ProfileData = {
  name: string; username: string; bio: string; visibility: 'private' | 'public';
  showActivity: boolean; showStats: boolean; showPlugins: boolean;
  avatar: string; avatarShape: 'circle' | 'flower' | 'rounded' | 'oval' | 'scallop';
};
type Props = {
  profile: ProfileData; onChange: (next: ProfileData) => void; onBack: () => void;
  onInvite: () => void; onCreateWebsite: () => void;
  demo: ProfileDemoConfig; onSaveDemo: (value: ProfileDemoConfig) => Promise<AuthResult>;
};
const avatarShapes = [['circle', '圆形'], ['flower', '花朵'], ['rounded', '圆角方形'], ['oval', '椭圆'], ['scallop', '扇贝边']] as const;
const copy = (value: string) => window.desktop ? window.desktop.copyText(value) : navigator.clipboard.writeText(value);

export function ProfilePage({ profile, onChange, onBack, onInvite, onCreateWebsite, demo, onSaveDemo }: Props) {
  const [today, setToday] = useState(() => new Date());
  const [statsEditing, setStatsEditing] = useState(false);
  const [statsStatus, setStatsStatus] = useState('');
  const statsOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const refresh = () => {
      const next = new Date();
      setToday(current => current.toDateString() === next.toDateString() ? current : next);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const usage = useMemo(() => createProfileUsage(demo, today), [demo, today]);
  const calendar = useMemo(() => createActivityCalendar(usage.ok ? usage.days : [], today), [usage, today]);
  const actual = usage.ok ? usage.stats : demo;
  const cardTokens = (count: number) => formatTokenAmount(count).replace(/\.00亿$/, '亿').replace(/(\.\d)0亿$/, '$1亿');
  const stats = [[cardTokens(actual.totalTokens), '累计 Token 数'], [cardTokens(actual.peakTokens), 'Token 使用峰值'],
    [`${Math.floor(demo.durationMinutes / 60)} 小时 ${demo.durationMinutes % 60} 分`, '最长任务用时'],
    [`${actual.longestStreak} 天`, '最长连续天数'], [`${actual.currentStreak} 天`, '当前连续天数']];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [dialog, setDialog] = useState<'share' | 'social' | null>(null);
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState('');
  const root = useRef<HTMLElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const avatarFile = useRef<HTMLInputElement>(null);
  const profileUrl = `https://example.com/profile/${encodeURIComponent(profile.username)}`;
  const visible = editing ? draft : profile;
  const closeEditor = () => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); };
  const closeStatsEditor = () => {
    setStatsEditing(false);
    requestAnimationFrame(() => (statsOpener.current?.isConnected ? statsOpener.current : root.current)?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || !event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey || event.code !== 'KeyE') return;
      if (document.querySelector('dialog[open], [role=menu]') || (event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable=true]')) return;
      event.preventDefault(); event.stopPropagation();
      statsOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setStatsEditing(true);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => { if (editing) nameField.current?.focus(); }, [editing]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || statsEditing || event.defaultPrevented || document.querySelector('dialog[open], [role=menu]')) return;
      event.preventDefault();
      if (editing) closeEditor(); else onBack();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [editing, statsEditing, onBack]);

  return <section className={`profile-page${editing ? ' is-editing' : ''}`} aria-label="个人资料" ref={root} tabIndex={-1}>
    <header className="profile-toolbar">
      <button ref={editButton} aria-pressed={editing} onClick={() => { if (editing) return; setDraft(profile); setStatus(''); setEditing(true); }}><Pencil size={17} />编辑</button>
      <button onClick={onInvite}><Send size={16} />邀请好友</button>
      <span className="profile-visibility" title={profile.visibility === 'private' ? '仅对你可见' : '任何有链接的人可见'}>{profile.visibility === 'private' ? <LockKeyhole size={14} /> : <Globe size={14} />}{profile.visibility === 'private' ? '私有' : '公开'}</span>
      <button onClick={() => { setStatus(''); setDialog('share'); }}><Upload size={17} />分享</button>
    </header>
    <div className="profile-body">
      <div className="profile-scroll"><div className="profile-content">
        <header className="profile-identity"><div className={`profile-avatar shape-${visible.avatarShape}`}>{visible.avatar ? <img src={visible.avatar} alt="头像" /> : <span>{visible.name.slice(0, 1).toUpperCase()}</span>}</div><h1>{visible.name || profile.name}</h1><p>@{profile.username}</p>{visible.bio && <p className="profile-bio">{visible.bio}</p>}</header>
        {visible.showStats && <div className="profile-stats" aria-label="个人统计" aria-keyshortcuts="Meta+Alt+E">{stats.map(([value, label]) => <div key={label}><span>{value}</span><span>{label}</span></div>)}</div>}
        {!usage.ok && <p role="alert" className="profile-simulation-error">{usage.error} 按 ⌘⌥E 调整统计设置。</p>}
        <section className="profile-featured"><h2>精选作品</h2><div className="profile-featured-empty"><img src={featuredEmpty} width="188" height="78" alt="" /><p>在你的个人资料中展示网站</p><button onClick={onCreateWebsite}>创建网站</button></div></section>
        {visible.showActivity && usage.ok && <ProfileActivity key={`${calendar.end}:${JSON.stringify(demo)}`} calendar={calendar} />}
        {visible.showPlugins && <ProfilePlugins />}
        {visible.showActivity && <section className="profile-insights"><h2>洞察</h2><div><span>快速模式</span><span>占运行次数的 57%</span></div></section>}
        {statsStatus && <p className="profile-demo-note" role="status">{statsStatus}</p>}
      </div></div>
      {editing && <aside className="profile-editor" aria-label="编辑个人资料"><form onSubmit={event => { event.preventDefault(); if (!draft.name.trim()) return; onChange({ ...draft, name: draft.name.trim(), visibility: profile.visibility }); closeEditor(); }}>
        <header><h2>编辑个人资料</h2><button type="button" className="profile-editor-cancel" onClick={closeEditor}>取消</button><button className="primary-button" disabled={!draft.name.trim()}>保存</button></header>
        <div className="profile-editor-fields"><div className="profile-avatar-edit"><div className={`profile-avatar shape-${draft.avatarShape}`}>{draft.avatar ? <img src={draft.avatar} alt="头像预览" /> : <span>{draft.name.slice(0, 1).toUpperCase()}</span>}</div><button type="button" className="secondary-button" onClick={() => avatarFile.current?.click()}>更换照片</button><input ref={avatarFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setStatus('请选择小于 5 MB 的 PNG、JPEG 或 WebP 图片。'); return; }
          const reader = new FileReader();
          reader.onload = () => { if (typeof reader.result === 'string') { const avatar = reader.result; setDraft(previous => ({ ...previous, avatar })); setStatus(''); } };
          reader.onerror = () => setStatus('图片读取失败，请重试。');
          reader.readAsDataURL(file);
        }} /></div><div className="profile-avatar-shapes" role="group" aria-label="照片形状">{avatarShapes.map(([shape, label]) => <button key={shape} type="button" title={label} aria-label={label} aria-pressed={draft.avatarShape === shape} onClick={() => setDraft({ ...draft, avatarShape: shape })}><span className={`shape-${shape}`} /></button>)}</div><label>姓名<input ref={nameField} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} maxLength={80} /></label><label>简介<textarea rows={4} value={draft.bio} onChange={event => setDraft({ ...draft, bio: event.target.value.replace(/[\r\n]+/g, ' ') })} maxLength={140} placeholder="简单介绍一下你自己" /><small>{draft.bio.length >= 112 ? `${draft.bio.length}/140` : ''}</small></label><h3>对他人可见的内容</h3>{([['showStats', '统计数据'], ['showActivity', 'Token 活动'], ['showPlugins', '热门插件']] as const).map(([key, label]) => <label key={key} className="profile-edit-checkbox"><input type="checkbox" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })} />{label}</label>)}<p>更改只保留在本次客户端运行中，照片不会上传。</p><p role="status">{status}</p></div>
      </form></aside>}
    </div>
    {statsEditing && <ProfileStatsEditor value={demo} onClose={closeStatsEditor} onSave={async next => {
      const result = await onSaveDemo(next);
      if (result.ok) setStatsStatus('统计与用量设置已保存到当前账号。');
      return result;
    }} />}
    {dialog === 'share' && <Dialog title="分享你的个人资料" onClose={() => setDialog(null)} className="profile-share-dialog"><div className="dialog-content"><div className="profile-share-identity"><span>{profile.name.slice(0, 1).toUpperCase()}</span><div><strong>{profile.name}</strong><p>@{profile.username}</p></div></div><h3>谁可以查看你的个人资料</h3><div className="profile-audience">{([['private', '仅自己可见'], ['public', '任何有链接的人']] as const).map(([visibility, label]) => <button key={visibility} aria-pressed={profile.visibility === visibility} onClick={() => { onChange({ ...profile, visibility }); setStatus('可见范围已更新。分享服务尚未连接。'); }}>{visibility === 'private' ? <LockKeyhole size={18} /> : <Globe size={18} />}<span>{label}</span>{profile.visibility === visibility && <Check size={16} />}</button>)}</div>{profile.visibility === 'public' && <><div className="profile-share-link"><input aria-label="个人资料链接" value={profileUrl} readOnly /><button aria-label="复制个人资料链接" onClick={() => copy(profileUrl).then(() => setStatus('已复制链接。分享服务尚未连接，此链接暂不可访问。')).catch(() => setStatus('无法访问剪贴板。'))}><Copy size={17} /></button></div><div className="profile-share-social">{['X', 'LinkedIn', 'Reddit'].map(name => <button key={name} onClick={() => { setDetail(name); setDialog('social'); }}>{name}<ExternalLink size={13} /></button>)}</div></>}<p className="profile-share-note">分享服务尚未连接，个人资料尚未发布。</p><p role="status" className="profile-share-status">{status}</p></div></Dialog>}
    {dialog === 'social' && <Dialog title={`分享到 ${detail}`} onClose={() => setDialog('share')} className="small-dialog"><div className="dialog-content"><p>{profile.name} 的个人资料</p><p className="profile-share-note">{profileUrl}</p><p>尚未连接分享服务。</p></div><div className="dialog-footer"><button className="secondary-button" onClick={() => setDialog('share')}>返回</button></div></Dialog>}

  </section>;
}
