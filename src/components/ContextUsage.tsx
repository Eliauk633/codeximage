import { useMemo } from 'react';
import type { Message } from '../model';
import { contextUsage } from '../chat-state';
import { Dropdown } from './ui';

export function ContextUsage({ messages }: { messages: Message[] }) {
  const usage = useMemo(() => contextUsage(messages), [messages]);
  const percent = Math.round(usage.percent * 10) / 10;
  return <Dropdown label="上下文用量" className="context-usage" menuClassName="context-usage-menu" side="top" align="right"
    trigger={<svg className="context-usage-ring" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="context-usage-track" cx="8" cy="8" r="5.5" fill="none" strokeWidth="2" />
      <circle className="context-usage-value" cx="8" cy="8" r="5.5" fill="none" strokeWidth="2" pathLength="100"
        strokeDasharray={`${usage.percent} 100`} transform="rotate(-90 8 8)" />
    </svg>}
    options={[
      { label: usage.exceeded ? '最近一轮内容超出上下文上限' : `上下文已用 ${percent}%`,
        description: usage.exceeded ? '请缩短最近一轮内容后发送。' : `已保留 ${(usage.used ?? 0).toLocaleString('zh-CN')} / 32,000 字符`, onSelect: () => {} },
      { label: '保留最近完整对话', description: '最多 40 条消息，超出时省略较早回合。此处按字符计算，不代表模型 Token 用量。', onSelect: () => {} },
    ]} />;
}
