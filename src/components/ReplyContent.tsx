import { useState } from 'react';
import Markdown from 'react-markdown';
import './reply-content.css';

export async function copyReplyLink(address: string, onCopy: (text: string) => Promise<void>): Promise<string> {
  try {
    await onCopy(address);
    return '已复制链接地址';
  } catch {
    return '无法复制链接地址，请重试';
  }
}

export function ReplyContent({ content, onCopy }: {
  content: string;
  onCopy: (text: string) => Promise<void>;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copyAddress(address: string) {
    setCopyStatus('正在复制链接地址…');
    setCopyStatus(await copyReplyLink(address, onCopy));
  }
  return <div className="reply-content"><Markdown skipHtml components={{
    a: ({ href, children }) => href && /^(https?:\/\/|mailto:)/i.test(href)
      ? <button type="button" className="reply-link" aria-label={`复制链接地址：${href}`} title={`复制链接地址：${href}`} onClick={() => void copyAddress(href)}>{children}</button>
      : <span>{children}</span>,
    img: ({ alt }) => <span className="reply-image-placeholder">[图片：{alt || '无说明'}]</span>,
  }}>{content}</Markdown><span className="reply-link-status" role="status">{copyStatus}</span></div>;
}
