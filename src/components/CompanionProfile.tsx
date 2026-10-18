import { useRef, useState } from 'react';
import { Bell, Laptop, MessageCircle, Pencil, Phone, X } from 'lucide-react';
import { Dialog } from './ui';
import { validCompanionAvatar, validCompanionName } from '../companion';
import type { AuthResult } from '../auth';
import type { Message } from '../model';
import frog from '../assets/reference-icons/companion-frog-reference.svg';
import './companion.css';

export function CompanionAvatar({ avatar, className = '' }: { avatar: string; className?: string }) {
  return !avatar || avatar.startsWith('data:image/') ? <img className={`companion-picture ${className}`} src={avatar || frog} alt="" />
    : <span className={`companion-picture companion-emoji ${className}`} aria-hidden="true">{avatar}</span>;
}

export function CompanionProfile({ name, avatar, messages, onSave, onClose }: {
  name: string; avatar: string; messages: Message[];
  onSave: (name: string, avatar: string) => Promise<AuthResult>; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nextName, setNextName] = useState(name);
  const [nextAvatar, setNextAvatar] = useState(avatar);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const last = messages.at(-1);
  function edit() { setNextName(name); setNextAvatar(avatar); setError(''); setEditing(true); }
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。'); return; }
    setBusy(true); setError('');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d'); if (!context) throw new Error();
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 128, 128);
      const data = canvas.toDataURL('image/png'); if (!validCompanionAvatar(data)) throw new Error();
      setNextAvatar(data);
    } catch { setError('图片无法读取，请换一张图片。'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  return <aside className="companion-profile" aria-label={`${name}的资料`}>
    <button className="companion-profile-close" aria-label="收起伙伴资料" onClick={onClose}><X size={14} /></button>
    <button className="companion-profile-heading" onClick={edit} aria-label="编辑伙伴名称和头像">
      <CompanionAvatar avatar={avatar} /><span><strong>{name}</strong><small>{last ? `上次活跃：${new Date(last.createdAt).toLocaleDateString('zh-CN')}` : '开始你的第一条对话'}</small></span><Pencil size={13} />
    </button>
    <div className="companion-contact"><button onClick={() => setNotice('呼叫服务尚未连接。')}><Phone size={16} />呼叫</button><button onClick={() => setNotice('Slack 尚未连接。')}><span className="slack-symbol">✣</span>Slack</button></div>
    <div className="companion-notification"><Bell size={14} /><span>桌面通知</span><button onClick={() => setNotice('桌面通知尚未接入，当前仅显示应用内消息。')}>启用</button></div>
    {notice && <p className="companion-notice" role="status">{notice}</p>}
    <section><h3>电脑</h3><div className="companion-device"><Laptop size={16} /><span>此计算机<small>尚未连接电脑执行服务</small></span></div></section>
    <section><h3>最近活动</h3>{messages.filter(m => m.role === 'user').slice(-3).reverse().map(m => <div className="companion-activity" key={m.id}><MessageCircle size={14} /><span>{m.content}</span></div>)}{!messages.length && <p>暂无活动</p>}</section>
    <section><h3>输出内容</h3><p>暂无输出文件</p></section>
    {editing && <Dialog title="编辑伙伴" className="small-dialog" onClose={() => { if (!busy) setEditing(false); }}><form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      if (!validCompanionName(nextName)) { setError('名称需为 1–40 个字符，且不能包含换行。'); return; }
      if (!validCompanionAvatar(nextAvatar)) { setError('请选择一个表情或上传图片。'); return; }
      setBusy(true); setError('');
      try { const result = await onSave(nextName.trim(), nextAvatar); if (result.ok) setEditing(false); else setError(result.error); }
      catch { setError('未能保存，请重试。'); } finally { setBusy(false); }
    }}><div className="dialog-content companion-edit">
      <CompanionAvatar avatar={nextAvatar} />
      <label>名称<input className="text-input" aria-label="伙伴名称" maxLength={40} value={nextName} disabled={busy} onChange={e => setNextName(e.target.value)} /></label>
      <label>头像表情<input className="text-input" aria-label="头像表情" placeholder="输入一个表情，例如 🐱" disabled={busy} value={nextAvatar.startsWith('data:') ? '' : nextAvatar} onChange={e => setNextAvatar(e.target.value)} /></label>
      <div className="companion-avatar-options">{['', '🤖', '🐱', '🐶', '🦊', '🐼'].map(value => <button type="button" key={value} aria-label={value ? `使用 ${value} 头像` : '恢复青蛙头像'} aria-pressed={nextAvatar === value} disabled={busy} onClick={() => setNextAvatar(value)}><CompanionAvatar avatar={value} /></button>)}</div>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => imageInput.current?.click()}>上传头像</button><input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="companion-edit-error" role="alert">{error}</p>}
    </div><div className="dialog-footer"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(false)}>取消</button><button className="primary-button" disabled={busy}>{busy ? '正在保存…' : '保存'}</button></div></form></Dialog>}
  </aside>;
}
