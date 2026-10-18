import { useState } from 'react';
import { ArrowUpRight, Mic, Plus } from 'lucide-react';
import { Dialog, IconButton } from './ui';

export function MiniPreview({ text, onTextChange, onClose, onExpand }: { text: string; onTextChange: (text: string) => void; onClose: () => void; onExpand: (text: string) => void }) {
  const [notice, setNotice] = useState('⌥Space 可在此客户端内打开 Mini');
  return <Dialog title="Mini" className="mini-preview" onClose={onClose}>
    <div className="mini-preview-body"><textarea autoFocus aria-label="Mini 输入框" placeholder="随时问点什么" value={text} onChange={event => onTextChange(event.target.value)} />
      <div className="mini-preview-tools"><IconButton label="Mini 添加附件" onClick={() => setNotice('附件请在主窗口添加。')}><Plus size={18} /></IconButton><span>Codex</span><IconButton label="Mini 听写" onClick={() => setNotice('听写尚未连接麦克风。')}><Mic size={16} /></IconButton><button className="mini-expand" onClick={() => onExpand(text)} title="在主窗口继续"><ArrowUpRight size={17} /><span>在主窗口继续</span></button></div>
      <p role="status">{notice}</p>
    </div>
  </Dialog>;
}
