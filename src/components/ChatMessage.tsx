import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleDashed, Copy, RefreshCw, Volume2, Square } from 'lucide-react';
import type { Message } from '../model';
import { Dialog } from './ui';
import { ReplyContent } from './ReplyContent';

export function ChatMessage({ message, content, canRetry, onRetry, onCopy }: {
  message: Message; content: string; canRetry: boolean; onRetry: () => void; onCopy: (text: string) => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now);
  const [details, setDetails] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [actionError, setActionError] = useState('');
  const pending = message.status === 'pending';
  const hasContent = content.trim().length > 0;
  useEffect(() => {
    if (!pending) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending, message.id]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => () => { if (speaking) window.speechSynthesis?.cancel(); }, [speaking]);
  const seconds = Math.max(0, Math.floor((pending ? now - message.createdAt : message.durationMs ?? 0) / 1000));
  const elapsed = seconds >= 60 ? `${Math.floor(seconds / 60)}分 ${seconds % 60}秒` : `${seconds}秒`;
  const date = new Date(Math.min(message.createdAt, 8640000000000000));
  const heading = pending ? `已处理 ${elapsed}` : message.durationMs !== undefined ? `用时 ${elapsed}` : '回复';
  async function copy(text = content) { try { await onCopy(text); setCopied(true); setActionError(''); } catch { setActionError('无法访问剪贴板'); } }
  function speak() {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'zh-CN';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setActionError('朗读不可用，请检查系统语音设置。'); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setSpeaking(true);
  }
  if (message.role === 'user') return <div className="message user" data-message-id={message.id}><div className="message-content">{content}</div><button className="message-copy" title="复制消息" aria-label="复制消息" onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>{actionError && <small role="alert">{actionError}</small>}</div>;
  return <article className={`message assistant ${pending ? 'is-generating' : ''}`}>
    <button className="reply-heading" aria-expanded={details} onClick={() => setDetails(!details)}><span>{heading}</span><ChevronRight size={12} className={details ? 'expanded' : ''} /></button>
    {details && <div className="reply-details">{message.displayModel && <span>界面模型：{message.displayModel}</span>}<span>{pending ? '正在接收回复' : message.status === 'stopped' ? '生成已停止' : message.status === 'error' ? '请求未完成' : '回复已完成'}</span></div>}
    {hasContent && <div className="message-content"><ReplyContent content={content} onCopy={onCopy} /></div>}
    {pending && <div className="reply-progress" role="status"><CircleDashed size={15} /><span>{hasContent ? '正在生成回复' : '正在等待回复'}</span></div>}
    {message.status === 'error' && <div className="reply-error reply-state" role="alert">{message.error || '回复未完成，请重试。'}</div>}
    {message.status === 'stopped' && <div className="reply-state">已停止生成</div>}
    {!pending && <div className="reply-actions">
      {content && <><button aria-label="复制回复" title={copied ? '已复制' : '复制'} onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}</button><button aria-label={speaking ? '停止朗读' : '朗读回复'} title={speaking ? '停止朗读' : '朗读'} disabled={!('speechSynthesis' in window)} onClick={speak}>{speaking ? <Square size={14} /> : <Volume2 size={14} />}</button><button aria-label="展开回复" title="展开回复" onClick={() => setExpanded(true)}><ArrowUpRight size={15} /></button><time dateTime={date.toISOString()}>{date.toLocaleTimeString('zh-CN', { hour: 'numeric', minute: '2-digit', hour12: false })}</time></>}
      {canRetry && <button className="reply-retry" onClick={onRetry}><RefreshCw size={13} />重新生成</button>}
    </div>}
    {actionError && <small role="alert">{actionError}</small>}
    {expanded && <Dialog title="回复" className="expanded-reply-dialog" onClose={() => setExpanded(false)}><div className="expanded-reply-text"><ReplyContent content={content} onCopy={onCopy} /></div></Dialog>}
  </article>;
}
