import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Archive, ArrowUpRight, Bell, Blocks, CircleUserRound, Download, Folder, Gauge, Ghost, Globe, History, Keyboard, KeyRound, Mic, MousePointer2, ScanLine, Search, Settings, Shield, Smile, Sun, X } from 'lucide-react';
import type { AppState } from '../model';
import type { UsageDemoConfig } from '../usage-demo';
import type { AuthResult, AuthUser } from '../auth';
import type { SettingsPreferences } from '../settings-preferences';
import { Dialog } from './ui';
import vscodeIcon from '../assets/reference-icons/vscode.svg';
import pluginIcon from '../assets/reference-icons/plugin.svg';
import { PreferenceRow, SelectControl, Toggle, Group, type SettingsSectionProps } from './SettingsControls';
import { UsageSettings } from './UsageSettings';
import { PersonalSettings } from './PersonalSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { DisplaySettings } from './DisplaySettings';
import './settings.css';

type SettingsPageProps = {
  user: AuthUser;
  usage: UsageDemoConfig;
  onSaveUsage: (next: UsageDemoConfig) => Promise<AuthResult>;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  preferences: SettingsPreferences;
  setPreferences: Dispatch<SetStateAction<SettingsPreferences>>;
  onClose: () => void;
  onLogout: () => void;
  initialTab?: string;
  onOpenProfile: () => void;
  suspended?: boolean;
};

const sections = [
  { id: 'general', label: '常规', icon: Settings, group: '个人', keywords: 'general 默认权限 完整访问权限 无项目任务文件夹 默认文件打开位置 语言 在菜单栏中显示 关闭窗口前确认 默认采用完整视图 底部面板 默认终端位置 运行时防止系统休眠 压缩本地保存的聊天历史记录 开源许可 桌面应用测试版功能 编辑器 显示预测 纯文本编辑器 显示上下文窗口使用情况 发送快捷键 跟进处理方式 回合完成通知 权限通知 问题通知 通知音 玩具 彩纸炮 音频可视化' },
  { id: 'notifications', label: '通知', icon: Bell, group: '个人', keywords: 'notifications 通知偏好 提醒 任务完成 需要批准 播放通知声音 完成提示音 测试通知' },
  { id: 'import', label: '导入', icon: Download, group: '个人', keywords: 'import 数据 迁移 自动同步 类别 导入历史' },
  { id: 'profile', label: '个人资料', icon: CircleUserRound, group: '个人', keywords: 'profile 名字 简介 分享 活动 Token 展示栏', external: true },
  { id: 'appearance', label: '外观', icon: Sun, group: '个人', keywords: 'appearance 主题 系统 浅色 深色 字体 字号 侧栏 宽度 布局' },
  { id: 'account', label: '账户', icon: CircleUserRound, group: '个人', keywords: 'account 账号 登录 退出 本地 邮箱 验证 用户名 构建者' },
  { id: 'archived', label: 'Archived chats', icon: Archive, group: '个人', keywords: 'archived 已归档 历史 对话 恢复 取消归档' },
  { id: 'parental', label: '家长控制', icon: CircleUserRound, group: '个人', keywords: 'parental 家庭 青少年' },
  { id: 'trusted', label: '受信任联系人', icon: CircleUserRound, group: '个人', keywords: 'trusted 联系人' },
  { id: 'voice', label: '语音', icon: Mic, group: '个人', keywords: 'voice 声音 主要语言 麦克风 屏幕上下文 快捷键 听写 词典 最近录音' },
  { id: 'storage', label: '存储', icon: Folder, group: '个人', keywords: 'storage 本地 占用 文件' },
  { id: 'configuration', label: '配置', icon: Shield, group: '个人', keywords: 'configuration Work Codex config.toml 审批 沙箱 网络 Web 网页搜索 推理摘要 详细度 依赖 诊断' },
  { id: 'personalization', label: '个性化', icon: Smile, group: '个人', keywords: 'personalization 昵称 职业 自定义 关于你 启用个性化' },
  { id: 'mini', label: 'Mini 与虚拟宠物', icon: Ghost, group: '个人', keywords: 'mini pets 悬浮 伙伴 虚拟宠物 尺寸 创意' },
  { id: 'shortcuts', label: '键盘快捷键', icon: Keyboard, group: '个人', keywords: 'keyboard shortcuts 新聊天 搜索 设置 侧栏' },
  { id: 'usage', label: '使用情况和计费', icon: Gauge, group: '个人', keywords: 'usage billing 额度 订阅 费用 概览 分析 重置 套餐 历史 排行' },
  { id: 'data', label: '数据管理', icon: Shield, group: '个人', keywords: 'data 隐私 导出 共享链接 与应用共享的信息 位置 Work 归档 删除' },
  { id: 'plugins', label: '插件', icon: Blocks, group: '集成', keywords: 'plugins 连接 应用 MCP 安装 搜索' },
  { id: 'passwords', label: '密码', icon: KeyRound, group: '集成', keywords: 'passwords 凭据 1Password 已保存密码 搜索' },
  { id: 'computer', label: '电脑操控', icon: MousePointer2, group: '集成', keywords: 'computer use 权限' },
  { id: 'history', label: '电脑历史记录', icon: History, group: '集成', keywords: 'computer history 活动' },
  { id: 'snapshots', label: '应用快照', icon: ScanLine, group: '集成', keywords: 'snapshots app 截图' },
  { id: 'browser', label: '浏览器', icon: Globe, group: '集成', keywords: 'browser chrome 浏览 下载 历史 网站 权限 摄像头 麦克风 自动填充 扩展 清除 联系信息' },
] as const;
type SectionId = typeof sections[number]['id'];
const normalizeSection = (value?: string): SectionId => sections.find(section => section.id === value)?.id ?? 'general';

export function SettingsPage({ usage, onSaveUsage, user, state, setState, preferences, setPreferences, onClose, onLogout, initialTab, onOpenProfile, suspended = false }: SettingsPageProps) {
  const pageRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<SectionId>(() => normalizeSection(initialTab));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [values, setValues] = useState<Record<string, string | boolean | number>>({});
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingSections = sections.filter(section => `${section.label} ${section.keywords}`.toLocaleLowerCase().includes(normalizedQuery));
  const active = matchingSections.find(section => section.id === selected) ?? matchingSections[0];
  useEffect(() => {
    if (suspended) return;
    pageRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open], [role=menu]')) { event.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, suspended]);
  useEffect(() => { setSelected(normalizeSection(initialTab)); setQuery(''); setStatus(''); }, [initialTab]);
  useEffect(() => { setNotice(null); setStatus(''); }, [active?.id]);
  function updatePreference<K extends keyof SettingsPreferences>(key: K, value: SettingsPreferences[K]) { setPreferences(previous => ({ ...previous, [key]: value })); }
  function demo(title: string, text = '此功能尚未连接服务。') { setNotice({ title, text }); }
  function toggle(key: keyof SettingsPreferences, label: string, description?: ReactNode, soft = false) {
    const id = `settings-${key}`;
    return <PreferenceRow key={key} label={label} description={description} htmlFor={id}><Toggle id={id} checked={preferences[key] === true} soft={soft} onChange={() => updatePreference(key, !preferences[key])} /></PreferenceRow>;
  }
  function select(key: keyof SettingsPreferences, label: string, description: string, options: readonly string[], icon?: ReactNode) {
    const id = `settings-${key}`;
    return <PreferenceRow label={label} description={description} htmlFor={id}><SelectControl id={id} value={String(preferences[key])} options={options} onChange={value => updatePreference(key, value)} icon={icon} /></PreferenceRow>;
  }
  function actionRow(label: string, description: string, button: string, action = () => demo(label)) {
    return <PreferenceRow label={label} description={description}><button className="settings-outline-button" onClick={action}>{button}</button></PreferenceRow>;
  }
  async function pickTaskFolder() {
    if (!window.desktop) { demo('更改任务文件夹', '请在桌面客户端中选择文件夹。'); return; }
    try { const folder = await window.desktop.pickProject(); if (folder) updatePreference('taskFolder', folder.path); }
    catch { setStatus('暂时无法选择文件夹，请重试。'); }
  }

  const sectionProps: SettingsSectionProps = { section: active?.id ?? '', state, setState, preferences, updatePreference, demo, navigate: section => { setQuery(''); setSelected(normalizeSection(section)); }, onLogout, values, setValue: (key, value) => setValues(previous => ({ ...previous, [key]: value })) };

  return <section className="settings-page" aria-label="设置" tabIndex={-1} ref={pageRef}>
    <aside className="settings-page-sidebar">
      <h1>设置</h1>
      <div className="settings-page-search"><Search size={14} aria-hidden="true" /><input aria-label="搜索设置" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清除设置搜索" onClick={() => setQuery('')}><X size={13} /></button>}</div>
      <nav aria-label="设置分类" className="settings-page-navigation">
        {['个人', '集成'].map(group => { const entries = matchingSections.filter(section => section.group === group); return entries.length ? <div className="settings-navigation-group" key={group}><h2>{group}</h2>{entries.map(section => <button key={section.id} aria-current={active?.id === section.id ? 'page' : undefined} className={active?.id === section.id ? 'is-current' : ''} onClick={() => { if (section.id === 'profile') { onOpenProfile(); return; } setSelected(section.id); setStatus(''); }}><>{section.id === 'plugins' ? <img src={pluginIcon} className="settings-navigation-icon brand-mark" alt="" /> : <section.icon size={15} />}</><span>{section.label}</span>{'external' in section && <ArrowUpRight size={15} className="settings-external" />}</button>)}</div> : null; })}
        {!matchingSections.length && <p className="settings-navigation-empty">没有匹配的设置</p>}
      </nav>
    </aside>
    <div className="settings-page-scroll" key={active?.id ?? 'empty'}><div className="settings-page-content">
      {!active ? <div className="settings-page-empty"><Search size={25} /><h2>未找到设置</h2><p>试试“主题”“快捷键”或“归档”。</p><button className="settings-outline-button" onClick={() => setQuery('')}>清除搜索</button></div> : <>
        <header className="settings-page-heading"><h2>{active.label}</h2></header>
        {active.id === 'general' && <>
          <Group title="权限">
            {toggle('defaultPermission', '默认权限', '默认情况下，ChatGPT 可以读取和编辑其工作空间中的文件。需要时，它可以请求额外访问权限', true)}
            {toggle('fullAccess', '完整访问权限', <>当 ChatGPT 以完整访问权限运行时，它无需你的批准即可编辑你电脑上的任何文件，并运行可访问网络的命令。这会显著增加数据丢失、泄露或意外行为的风险。<button className="settings-inline-link" onClick={() => demo('关于完整访问权限', '此设置保存你的权限偏好。执行服务尚未连接。')}>了解更多</button>关于风险升高的信息。</>)}
          </Group>
          <Group title="常规">
            <PreferenceRow label="无项目任务文件夹" description="在项目外启动的任务默认存储数据的位置。"><span className="settings-folder-path" title={preferences.taskFolder}>{preferences.taskFolder}</span><button className="settings-outline-button is-filled" onClick={pickTaskFolder}>更改</button></PreferenceRow>
            {select('fileOpener', '默认文件打开位置', '默认打开文件和文件夹的位置', ['VS Code', 'Cursor', 'Finder', '终端'], preferences.fileOpener === 'VS Code' ? <img src={vscodeIcon} className="settings-editor-icon" alt="" /> : undefined)}
            {select('language', '语言', '应用界面语言', ['自动检测', '简体中文', 'English'])}
            {toggle('menuBar', '在菜单栏中显示', '关闭主窗口后，仍在 macOS 菜单栏中保留 ChatGPT')}
            {select('closeConfirmation', '关闭窗口前确认', '当关闭标签页的快捷键会导致窗口关闭时发出警告', ['仅在使用“关闭”快捷键时', '始终', '从不'])}
            {toggle('fullView', '默认采用完整视图', '开始新任务时，在同一标签页栏中显示聊天和内容')}
            {toggle('bottomPanel', '底部面板', '在应用标题栏中显示底部面板控件')}
            {select('terminalPosition', '默认终端位置', '选择终端面板的默认位置', ['底部', '右侧'])}
            {toggle('preventSleep', '运行时防止系统休眠', '在任务运行期间保持电脑唤醒')}
            {toggle('compressHistory', '压缩本地保存的聊天历史记录', '减小聊天历史记录占用的存储空间，重启后生效')}
            {actionRow('开源许可', '查看应用使用的开源软件声明', '查看', () => demo('开源许可', '此应用使用 Electron、React、Vite、TypeScript 与 Lucide。许可依据见项目依赖与说明文档；这不代表拥有原 Codex 产品的分发许可。'))}
            {toggle('betaFeatures', '桌面应用测试版功能', '提前体验新的桌面功能')}
          </Group>
          <Group title="编辑器">
            {toggle('editorPredictions', '显示预测', '在输入时显示建议内容')}
            {toggle('plainTextEditor', '纯文本编辑器', '使用纯文本编写消息')}
            {toggle('contextUsage', '显示上下文窗口使用情况', '在输入区显示上下文用量')}
            {select('sendShortcut', '发送快捷键', '选择发送消息的快捷键', ['Enter', '⌘+Enter（多行）', '始终⌘+Enter'])}
            {select('followUpBehavior', '跟进处理方式', '任务运行时如何处理后续消息', ['排队', '引导'])}
          </Group>
          <Group title="通知">
            {select('turnNotification', '回合完成通知', '任务完成时显示通知', ['从不', '仅非焦点时', '始终'])}
            {toggle('notificationApprovals', '权限通知', '需要批准时通知你')}
            {toggle('questionNotifications', '问题通知', '需要你提供信息时通知你')}
            {select('completionSound', '通知音', '选择通知时播放的声音', ['默认', '无', '经典', 'Basso', 'Glass', 'Ping', 'Pop', 'Purr', 'Tink'])}
          </Group>
          <Group title="玩具">
            {toggle('confetti', '彩纸炮', '显示庆祝效果')}
            {toggle('audioVisualizer', '音频可视化', '显示声音的动态效果')}
          </Group>
        </>}
        {['notifications', 'import', 'account', 'parental', 'trusted', 'voice', 'storage', 'configuration', 'personalization', 'mini', 'data'].includes(active.id) && <PersonalSettings {...sectionProps} user={user} />}
        {['plugins', 'passwords', 'computer', 'history', 'snapshots', 'browser'].includes(active.id) && <IntegrationSettings {...sectionProps} />}
        {['appearance', 'shortcuts', 'archived'].includes(active.id) && <DisplaySettings {...sectionProps} />}
        {active.id === 'profile' && <div className="settings-page-empty"><CircleUserRound size={28} /><p>查看个人资料、精选作品与 Token 活动</p><button className="settings-outline-button" onClick={onOpenProfile}>打开个人资料<ArrowUpRight size={14} /></button></div>}
        {active.id === 'usage' && <UsageSettings {...sectionProps} usage={usage} onSave={onSaveUsage} suspended={suspended} />}
        <p className="settings-page-status" role="status">{status}</p>
      </>}
    </div></div>
    {notice && <Dialog title={notice.title} onClose={() => setNotice(null)} className="small-dialog"><div className="dialog-content"><p>{notice.text}</p></div><div className="dialog-footer"><button className="primary-button" onClick={() => setNotice(null)}>知道了</button></div></Dialog>}
  </section>;
}
