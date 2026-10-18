import { useEffect, useRef, useState } from 'react';
import { Dialog } from './ui';
import drive from '../assets/profile-plugins/google-drive.svg';
import notion from '../assets/profile-plugins/notion.svg';
import notionDark from '../assets/profile-plugins/notion-dark.svg';
import calendar from '../assets/profile-plugins/google-calendar.svg';
import github from '../assets/profile-plugins/github.svg';
import githubDark from '../assets/profile-plugins/github-dark.svg';
import gmail from '../assets/profile-plugins/gmail.svg';

const plugins = [
  { name: 'Google Drive', icon: drive, darkIcon: drive, category: '文档与资料',
    description: '查找云端文件，提炼文档内容，把分散的资料整理成可用的参考。',
    capabilities: ['按关键词查找文件', '提炼文档重点', '对比多份资料'],
    examples: [
      { title: '查找项目资料', prompt: '查找有关客户端设计的项目文档。', result: '文档内容\n• 客户端设计说明 · 最近更新于 10 月 15 日\n• 登录流程评审 · 最近更新于 10 月 16 日' },
      { title: '整理文档摘要', prompt: '总结《客户端设计说明》的重点。', result: '内容摘要\n1. 采用窄导航栏和独立内容区。\n2. 注册与登录在客户端内完成。\n3. 在小窗口下保留表单滚动能力。' },
    ] },
  { name: 'Notion', icon: notion, darkIcon: notionDark, category: '知识库与笔记',
    description: '查找工作区页面，将讨论和零散笔记整理成清晰的文档与任务。',
    capabilities: ['搜索知识库页面', '整理会议笔记', '提取行动事项'],
    examples: [
      { title: '搜索知识库', prompt: '查找关于发布检查的页面。', result: '资料目录\n• 发布检查清单 / 工程规范\n• 客户端验收记录 / 项目资料' },
      { title: '提取行动事项', prompt: '把会议笔记整理成待办清单。', result: '待办事项\n□ 完成个人资料页交互检查\n□ 核对注册页文案\n□ 汇总本轮验收记录' },
    ] },
  { name: 'Google Calendar', icon: calendar, darkIcon: calendar, category: '日历与安排',
    description: '查看日程、寻找空闲时段，并预览会议安排。',
    capabilities: ['查看每日安排', '查找空闲时段', '预览会议计划'],
    examples: [
      { title: '查看日程', prompt: '展示今天的会议安排。', result: '日程安排\n09:30–10:00 · 设计同步\n14:00–15:00 · 客户端功能评审\n16:30–17:00 · 每日总结' },
      { title: '寻找空闲时间', prompt: '找一个适合 30 分钟评审的时间段。', result: '候选时段\n10:00–10:30\n15:00–15:30\n仅展示候选时段，未创建日程或发送邀请。' },
    ] },
  { name: 'GitHub', icon: github, darkIcon: githubDark, category: '代码与协作',
    description: '查看仓库中的问题和拉取请求，了解变更内容并整理审查要点。',
    capabilities: ['搜索仓库与问题', '阅读拉取请求', '汇总代码变更'],
    examples: [
      { title: '查看拉取请求', prompt: '总结 studio/client 中的登录页改动。', result: '拉取请求 #24 · 完善登录流程\n• 新增邮箱注册表单\n• 补齐密码校验与错误状态\n• 增加退出后返回登录页的检查' },
      { title: '整理待办问题', prompt: '列出界面相关的待办问题。', result: '问题清单\n#31 · 检查深色主题下的图标\n#32 · 完善活动热力图键盘操作\n#33 · 调整小窗口中的表单间距' },
    ] },
  { name: 'Gmail', icon: gmail, darkIcon: gmail, category: '邮件',
    description: '按主题查找邮件、整理未读信息，并预览回复草稿。',
    capabilities: ['搜索邮件主题', '汇总未读信息', '预览回复草稿'],
    examples: [
      { title: '整理未读邮件', prompt: '总结与项目有关的未读邮件。', result: '邮件摘要\n• 设计评审：需要确认两处界面细节\n• 测试反馈：登录流程已完成检查\n• 项目安排：下次同步定于周五' },
      { title: '起草回复', prompt: '为设计评审邮件写一封简短回复。', result: '回复草稿\n你好，反馈已收到。我会核对提到的界面细节，并在完成后同步检查结果。谢谢！\n\n未创建邮件草稿或发送邮件。' },
    ] },
];
type Plugin = typeof plugins[number];

function PluginIcon({ plugin }: { plugin: Plugin }) {
  return <><img className="profile-plugin-light" src={plugin.icon} alt="" /><img className="profile-plugin-dark" src={plugin.darkIcon} alt="" /></>;
}

export function ProfilePlugins() {
  const [selected, setSelected] = useState<Plugin | null>(null);
  const [example, setExample] = useState(0);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (!selected) opener.current?.focus({ preventScroll: true }); }, [selected]);
  const scenario = selected?.examples[example];
  return <section className="profile-plugins"><h2>热门插件</h2>
    <div className="profile-plugin-list">{plugins.map(plugin => <button key={plugin.name} type="button" title={plugin.name}
      aria-label={`查看 ${plugin.name} 插件详情`} onClick={event => { opener.current = event.currentTarget; setSelected(plugin); setExample(0); }}>
      <PluginIcon plugin={plugin} /><span>{plugin.name}</span>
    </button>)}</div>
    {selected && scenario && <Dialog title={selected.name} onClose={() => setSelected(null)} className="profile-plugin-dialog">
      <div className="dialog-content">
        <div className="profile-plugin-heading"><div className="profile-plugin-detail-icon"><PluginIcon plugin={selected} /></div>
          <div><p>{selected.category}</p><span>未连接</span></div></div>
        <p className="profile-plugin-description">{selected.description}</p>
        <h3>可用场景</h3><ul className="profile-plugin-capabilities">{selected.capabilities.map(item => <li key={item}>{item}</li>)}</ul>
        <h3>使用场景</h3><div className="profile-plugin-scenarios" role="group" aria-label={`${selected.name} 使用场景`}>
          {selected.examples.map((item, index) => <button type="button" key={item.title} aria-pressed={example === index} onClick={() => setExample(index)}>{item.title}</button>)}
        </div>
        <div className="profile-plugin-example" role="status"><p>{scenario.prompt}</p><pre>{scenario.result}</pre></div>
        <p className="profile-share-note">尚未连接此服务。以上为内置内容，未读取你的文件、邮件或日历。</p>
      </div><div className="dialog-footer"><button className="primary-button" onClick={() => setSelected(null)}>关闭</button></div>
    </Dialog>}
  </section>;
}
