import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleHelp, Download, Folder, HeartHandshake, Mic, Plus, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Dialog } from './ui';
import { Group, PreferenceRow, SelectControl, Toggle, type SettingsSectionProps } from './SettingsControls';
import { AiServiceSettings } from './AiServiceSettings';
import type { SettingsPreferences } from '../settings-preferences';
import type { AuthUser } from '../auth';
import frogAvatar from '../assets/reference-icons/companion-frog-reference.svg';
import './personal-settings.css';

const importCategories = ['聊天', '指令', '设置', '技能', '插件', 'MCP 服务器', '智能体', 'Hooks', '命令', '记忆'];
const efforts = ['无', '最低', '轻度', '中', '高', '超高', 'Max', 'Ultra'];
const exampleChats = [{ id: 0, label: '界面布局', days: 14, archived: false, size: 8 }, { id: 1, label: '项目规划', days: 45, archived: true, size: 12 }, { id: 2, label: '组件整理', days: 120, archived: true, size: 16 }];
const isExampleEmail = (value: string) => /^[^\s@]+@(?:[a-z\d-]+\.)*example(?:\.com)?$/i.test(value.trim());

/** Identity comes from local auth; device and cloud flows remain examples. */
export function PersonalSettings({ section, user, preferences, updatePreference, demo, navigate, onLogout, values, setValue }: SettingsSectionProps & { user: AuthUser }) {
  const [dialog, setDialog] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState('');
  const read = (key: string, fallback: string | boolean | number = '') => values[`personal.${key}`] ?? fallback;
  const write = (key: string, value: string | boolean | number) => setValue(`personal.${key}`, value);
  const d = (key: string, fallback = '') => String(draft[key] ?? fallback);
  const cleanupChats = exampleChats.filter(chat => chat.days > Number(d('age', '30')) && (d('scope', '已归档的聊天') === '所有聊天' || chat.archived));
  const change = (key: string, value: string | boolean) => setDraft(previous => ({ ...previous, [key]: value }));
  const open = (name: string, initial: Record<string, string | boolean> = {}) => { setDraft(initial); setDialog(name); setStatus(''); };
  const close = () => setDialog(null);
  const done = (message: string) => { close(); setStatus(message); };
  const button = (text: ReactNode, onClick: () => void, danger = false) => <button type="button" className={`settings-outline-button ${danger ? 'personal-danger' : ''}`} onClick={onClick}>{text}</button>;
  const action = (label: string, description: ReactNode, text: ReactNode, onClick: () => void, danger = false) => <PreferenceRow label={label} description={description}>{button(text, onClick, danger)}</PreferenceRow>;
  const localToggle = (key: string, label: string, description?: string, fallback = false) => <PreferenceRow label={label} description={description} htmlFor={`personal-${key}`}><Toggle id={`personal-${key}`} checked={read(key, fallback) === true} onChange={() => write(key, !read(key, fallback))} /></PreferenceRow>;
  const prefToggle = (key: keyof SettingsPreferences, label: string, description?: string) => <PreferenceRow label={label} description={description} htmlFor={`personal-${key}`}><Toggle id={`personal-${key}`} checked={preferences[key] === true} onChange={() => updatePreference(key, !preferences[key])} /></PreferenceRow>;
  const localSelect = (key: string, label: string, options: readonly string[], description?: string, fallback = options[0]) => <PreferenceRow label={label} description={description} htmlFor={`personal-${key}`}><SelectControl id={`personal-${key}`} value={String(read(key, fallback))} options={options} onChange={value => write(key, value)} /></PreferenceRow>;
  const field = (key: string, label: string, placeholder = '', multiline = false, maxLength = 160) => <div className="personal-field"><label htmlFor={`personal-edit-${key}`}>{label}</label>{multiline ? <textarea id={`personal-edit-${key}`} value={d(key)} placeholder={placeholder} rows={5} maxLength={maxLength} onChange={event => change(key, event.target.value)} /> : <input id={`personal-edit-${key}`} value={d(key)} placeholder={placeholder} maxLength={maxLength} autoComplete="off" onChange={event => change(key, event.target.value)} />}</div>;
  const check = (key: string, label: string) => <label className="personal-checkbox"><input type="checkbox" checked={draft[key] === true} onChange={event => change(key, event.target.checked)} /><span>{label}</span></label>;
  const preview = (title: string, description: string) => demo(title, description);
  const editInstructions = () => open('instructions', { instructions: preferences.customInstructions, nickname: preferences.nickname, occupation: preferences.occupation, about: preferences.aboutYou, enabled: preferences.personalization });
  const name = user.name;
  const email = user.email;
  let content: ReactNode = null;

  if (section === 'notifications') content = <>
    <Group>
      <PreferenceRow label="轮次完成通知" description="设置 ChatGPT 完成后何时提醒你" htmlFor="personal-turnNotification"><SelectControl id="personal-turnNotification" value={preferences.turnNotification} options={['从不', '仅非焦点时', '始终']} onChange={value => updatePreference('turnNotification', value as SettingsPreferences['turnNotification'])} /></PreferenceRow>
      {prefToggle('notificationApprovals', '启用权限通知', '需要通知权限时显示提醒')}
      {prefToggle('questionNotifications', '启用问题通知', '需要输入才能继续时显示提醒')}
      {prefToggle('notificationTasks', '启用小智通知', '小智向你发送消息时显示提醒')}
      {action('通知音', '用于任务完成、权限请求和问题的提示音', <>{preferences.completionSound}<ChevronRight size={13} /></>, () => open('sound', { sound: preferences.completionSound }))}
    </Group>
    <Group title="ChatGPT">{action('任务', '查看和管理任务提醒', '管理任务', () => open('notificationTasks'))}<PreferenceRow label="通知渠道" description="账户通知服务尚未连接。"><span className="settings-value">尚未连接</span></PreferenceRow></Group>
  </>;

  if (section === 'import') content = <>
    <p className="settings-page-description">将其他 AI 应用的设置、项目和聊天导入 ChatGPT。</p>
    <Group title="从其他 AI 应用导入">
      <div className="personal-empty-card"><Download size={28} /><h3>{read('imported', false) ? '没有发现新项目' : '未找到可导入的设置'}</h3><p>尚未连接其他应用。可以浏览内置内容。</p>{button(read('imported', false) ? '再次检查' : '导入', () => open('importChoose', { source: '内置内容' }))}</div>
    </Group>
    <Group title="自动同步">{read('imported', false) ? localToggle('importSync', '保持导入同步', '同步已连接来源中的新内容和更新内容') : <PreferenceRow label="保持导入同步" description="首次导入后可以设置自动同步"><span className="settings-value">导入后可用</span></PreferenceRow>}<PreferenceRow label="同步内容" description={`${importCategories.filter((_, i) => read(`sync${i}`, true)).length} 个类别已选择`}><button type="button" className="settings-outline-button" disabled={!read('imported', false)} onClick={() => open('sync', Object.fromEntries(importCategories.map((_, i) => [`sync${i}`, Boolean(read(`sync${i}`, true))])))}>自定义</button></PreferenceRow></Group>
    <Group title="导入历史记录">{read('imported', false) ? action('内置内容', `已添加 ${read('importCount', 0)} 项记录`, '查看详情', () => open('importHistory')) : <p className="personal-card-note">暂无导入记录</p>}</Group>
  </>;

  if (section === 'account') content = <>
    <Group>
      <PreferenceRow label="昵称" description="注册时设置，当前只读"><span className="settings-value">{name}</span></PreferenceRow>
      <PreferenceRow label="登录邮箱" description="用于登录，邮箱尚未验证"><span className="settings-value">{email}</span></PreferenceRow>
      <PreferenceRow label="状态"><span className="personal-badge">已登录</span></PreferenceRow>
      <p className="personal-card-note">邮箱验证服务尚未连接。</p>
    </Group>
    <Group>{action('GPT 构建者个人资料', '尚未连接云端服务', '查看', () => open('builder'))}</Group>
    <div className="personal-bottom-action">{button('退出登录', onLogout)}</div>
  </>;

  if (section === 'parental') content = <>
    <div className="personal-intro"><Users size={32} /><p>家长和青少年可以关联账户，让家长能够调整部分功能、设置使用限制，并添加适合家庭的保护措施。</p><button type="button" className="settings-inline-link" onClick={() => preview('家长控制', '账户关联服务尚未连接。可以保存邀请草稿。')}>了解更多</button></div>
    <Group title="家庭成员">{read('familyPending', false) ? <><PreferenceRow label={String(read('familyEmail', 'family@example.com'))} description={`${String(read('familyRole', '我的孩子'))} · 邀请草稿`}><Users size={18} /></PreferenceRow><div className="personal-card-actions">{button('重新发送邀请', () => open('familyResend'))}{button('取消邀请', () => open('familyCancel'), true)}</div></> : <div className="personal-empty-card compact"><p>尚未关联家庭成员</p>{button(<><Plus size={14} />添加家庭成员</>, () => open('familyInvite', { email: 'family@example.com', role: '我的孩子' }))}</div>}</Group>
    <Group>{action('安全通知', '你可以选择接收安全通知的方式。', '管理通知', () => open('familyNotifications'))}</Group>
  </>;

  if (section === 'trusted') content = <>
    <div className="personal-intro"><HeartHandshake size={36} /><p>添加受信任联系人，可以让你更容易获得熟悉你的人的支持。</p><p className="personal-secondary">联系人须年满 18 岁，且需接受邀请。通知服务尚未连接。</p><button type="button" className="settings-inline-link" onClick={() => open('trustedInfo')}>了解更多</button></div>
    <Group>{read('trustedPending', false) ? <><PreferenceRow label={String(read('trustedName', '联系人'))} description={`${String(read('trustedEmail', 'contact@example.com'))} · 邀请草稿`}><HeartHandshake size={18} /></PreferenceRow><div className="personal-card-actions">{button('重新发送邀请', () => open('trustedResend'))}{button('取消邀请', () => open('trustedRemove'), true)}</div></> : <div className="personal-empty-card compact">{button(<><Plus size={14} />添加联系人</>, () => open('trustedInfo'))}</div>}</Group>
  </>;

  if (section === 'voice') content = <>
    <Group title="通用">{localSelect('microphone', '麦克风', ['系统默认'], '用于语音聊天和听写。麦克风服务尚未连接。')}<PreferenceRow label="语言" htmlFor="personal-voice-language"><SelectControl id="personal-voice-language" value={preferences.voiceLanguage} options={['自动检测', '简体中文', 'English']} onChange={value => updatePreference('voiceLanguage', value as SettingsPreferences['voiceLanguage'])} /></PreferenceRow></Group>
    <Group title="语音聊天">{action('声音', '选择 Codex 用于新语音聊天的声音', <>{preferences.voice}<ChevronRight size={13} /></>, () => open('voice', { voice: preferences.voice }))}{localToggle('screenContext', '屏幕上下文', '当你提到屏幕内容时，允许 Codex 查看前台应用。屏幕访问尚未连接。')}{action('语音聊天快捷键', '从桌面的任意位置开始语音聊天', String(read('voiceShortcut', '关闭')), () => open('shortcut', { shortcut: String(read('voiceShortcut', '关闭')), target: 'voiceShortcut' }))}</Group>
    <Group title="听写">{localToggle('dictationSounds', '听写提示音', '开始和停止听写时播放提示音', true)}{action('听写快捷键', '按住进行听写，或双击免提听写', String(read('dictationShortcut', '关闭')), () => open('shortcut', { shortcut: String(read('dictationShortcut', '关闭')), target: 'dictationShortcut' }))}{action('单击快捷键', '按一次开始，再按一次结束', String(read('singleTapShortcut', '关闭')), () => open('shortcut', { shortcut: String(read('singleTapShortcut', '关闭')), target: 'singleTapShortcut' }))}{action('语音词典', '听写应识别的词语或短语', '管理', () => open('dictionary', { dictionary: String(read('dictionary', 'Codex\n项目')) }))}</Group>
    <Group title="最近的录音"><div className="personal-empty-card compact"><Mic size={24} /><p>暂无录音</p><p>此设备尚无录音。</p>{button('显示所有录音', () => open('recordings'))}</div></Group>
  </>;

  if (section === 'storage') content = <>
    <div className="personal-section-heading"><div><h3>此设备</h3><p className="personal-secondary">管理此电脑上存储的聊天和工作树</p></div>{button(<><RefreshCw size={13} />刷新</>, () => setStatus('存储记录已刷新。文件扫描服务尚未连接。'))}</div>
    <Group><div className="personal-storage-total"><span>Codex 主目录</span><strong>128 MB</strong><p>Codex 已用空间</p><div className="personal-storage-bar" aria-hidden="true"><i /><i /><i /><i /></div></div>{[['聊天', '36 MB'], ['子代理', '12 MB'], ['已归档的聊天', '24 MB'], ['工作树', '40 MB'], ['其他', '16 MB']].map(([label, size]) => <PreferenceRow key={label} label={label}><span className="settings-value">{size}</span></PreferenceRow>)}</Group>
    <Group>{action('清理旧聊天', '永久删除前，先检查聊天及其子代理', '检查', () => open('cleanup', { age: '30', scope: '已归档的聊天' }))}{action('管理工作树', '检查工作副本并选择保留多少旧工作树', '管理', () => open('worktrees'))}{action('已归档的聊天', '恢复或删除单个已归档聊天', '管理', () => navigate('archived'))}</Group>
  </>;

  if (section === 'configuration') content = <>
    <AiServiceSettings />
    <p className="settings-page-description">选择 ChatGPT 为你处理任务的方式。</p>
    <div className="personal-section-heading"><SelectControl id="personal-config-scope" label="配置范围" value={String(read('configScope', 'Codex'))} options={['Codex', 'Work']} onChange={value => write('configScope', value)} /><span className="personal-secondary">配置</span>{button(<>打开 config.toml<ArrowUpRight size={13} /></>, () => open('configFile'))}</div>
    <Group>{read('configScope', 'Codex') === 'Work' && <>{localSelect('workModel', '模型', ['使用默认值', 'GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6 Sol', 'GPT-6 Luna'])}{localSelect('workEffort', '默认推理强度', ['使用默认值', ...efforts])}{localSelect('workSpeed', '速度', ['标准', '快速'])}</>}{localSelect('approval', '审批策略', ['按需', '不可信', '从不请求批准'], '选择 ChatGPT 何时请求批准')}{localSelect('sandbox', '沙箱设置', ['工作区写入', '只读', '完全访问'], '选择 ChatGPT 运行命令时可执行的操作范围')}{read('sandbox', '工作区写入') === '工作区写入' && localToggle('network', '允许网络访问', '在沙箱设置为工作区写入时允许网络访问')}{localSelect('webSearch', '网页搜索', ['缓存', '禁用', '实时'], '选择 ChatGPT 如何访问网页')}{localSelect('verbosity', '输出详细程度', ['模型默认', '低', '中', '高'], '选择 ChatGPT 回复中包含的详细程度')}{localSelect('reasoningSummary', '推理摘要', ['自动', '简洁', '详细', '无'], '选择 ChatGPT 如何总结推理')}</Group>
    <Group title="模型功能">{action('可用推理强度', '选择在模型控件中显示哪些推理强度级别。可用性因模型而异。', `已选择 ${efforts.filter((_, i) => read(`effort${i}`, true)).length} 个`, () => open('efforts', Object.fromEntries(efforts.map((_, i) => [`effort${i}`, Boolean(read(`effort${i}`, true))]))))}</Group>
    <Group title="工作区依赖">{localToggle('dependencies', 'Codex 依赖', '允许 ChatGPT 安装并使用随附的 Node.js 和 Python 工具。安装服务尚未连接。', true)}{action('诊断 Codex 工作区问题', '检查当前工具包并记录诊断日志', '诊断', () => open('diagnostics'))}{action('重置并安装工作区', '下载新的依赖包并重新加载工具', '重新安装', () => open('reinstall'))}</Group>
    <Group title="实验性功能（Beta）">{localToggle('requestInput', '请求用户输入', '允许 Codex 在计划模式之外提问。更改仅应用于新聊天。')}<p className="personal-card-note">此处仅保存功能偏好。</p></Group>
  </>;

  if (section === 'personalization') content = <>
    <Group title="自定义指令">{action('ChatGPT', '为所有聊天提供额外指令与上下文', '编辑', editInstructions)}{action('Codex', '在桌面和网页之间同步的 Codex 指令', '编辑', () => open('codexInstructions', { instructions: String(read('codexInstructions', '')) }))}{action('AGENTS.md', '编辑所选电脑上的指令文件；仓库指令也可能适用', '编辑', () => open('agentsInstructions', { instructions: String(read('agentsInstructions', '')) }))}</Group>
    <Group title="ChatGPT 记忆">{localToggle('memory', '启用记忆', '让 ChatGPT 根据你的聊天、文件和已连接应用提供个性化体验', true)}{action('记忆摘要', '查看 ChatGPT 了解的关于你的信息', '管理', () => open('memorySummary'))}{action('已保存的记忆', '查看和管理 ChatGPT 记住的详细信息', '管理', () => open('savedMemory'))}</Group>
    <Group title="Codex 记忆">{localToggle('codexMemory', '启用 Codex 记忆', '根据此电脑上的聊天创建记忆，用于未来的聊天', true)}{localToggle('toolMemory', '来自工具辅助聊天的记忆', '根据使用 MCP 工具或网页搜索的聊天生成记忆')}{action('删除 Codex 记忆', '删除此电脑上的全部 Codex 记忆', '删除', () => open('deleteMemory'), true)}</Group>
    <Group>{localSelect('baseStyle', '基础风格和语气', ['默认'], '选择回复的基础风格。')}{localSelect('layout', '布局与视觉', ['默认', '简洁'])}</Group>
    <Group title="其他 ChatGPT 设置">{localToggle('fastAnswers', '快速回答', '有时使用通用知识提供快速、深入的回答', true)}{localToggle('suggestedPrompts', '建议提示词', '根据连接的插件生成建议', true)}{localToggle('recordHistory', '参考录音历史', '回复时参考先前录音的转录与笔记')}</Group>
    <Group title="高级">{localToggle('advancedWeb', '网页搜索', '允许 ChatGPT 自动搜索网页', true)}{localToggle('advancedCode', '代码', '允许 ChatGPT 使用代码解释器执行代码', true)}{localToggle('advancedVoice', 'ChatGPT 语音', '启用 ChatGPT 中的语音', true)}{localToggle('advancedLibrary', '资料库搜索', '允许 ChatGPT 自动搜索资料库文件', true)}{localToggle('advancedImage', '图像生成', '在 ChatGPT 中启用图像生成', true)}</Group>
  </>;

  if (section === 'mini') content = <>
    <p className="settings-page-description">虚拟宠物让你可以快速访问 ChatGPT。</p>
    <div className="personal-pet-preview">{preferences.pets ? <img src={frogAvatar} alt="青蛙伙伴" style={{ width: Math.round(Number(read('petSize', 120)) / 2), height: Math.round(Number(read('petSize', 120)) / 2) }} /> : <span className="personal-mini-glyph" aria-label="无虚拟宠物，使用 Mini"><Sparkles size={24} /></span>}{button(preferences.mini ? '隐藏 Mini' : '显示 Mini', () => updatePreference('mini', !preferences.mini))}<span className="personal-note">静态外观预览</span></div>
    <Group>{localSelect('petVisibility', '可见性', ['始终可见', '按需显示'], '选择让 Mini 常驻桌面还是按需显示')}{action('显示和聚焦虚拟宠物', '为 Mini 设置快捷键', String(read('petShortcut', '关闭')), () => open('shortcut', { shortcut: String(read('petShortcut', '关闭')), target: 'petShortcut' }))}<PreferenceRow label="虚拟宠物大小" description="调整虚拟宠物大小" htmlFor="personal-pet-size"><div className="personal-range"><input id="personal-pet-size" type="range" min={80} max={224} value={Number(read('petSize', 120))} onChange={event => write('petSize', Number(event.target.value))} />{button('重置', () => write('petSize', 120))}</div></PreferenceRow></Group>
    <section className="personal-section"><div className="personal-section-heading"><h3>我的虚拟宠物</h3>{button(<><Plus size={14} />创建虚拟宠物</>, () => open('createPet', { prompt: '' }))}</div><div className="personal-pet-grid"><button type="button" className={!preferences.pets ? 'selected' : ''} aria-pressed={!preferences.pets} onClick={() => updatePreference('pets', false)}><span className="personal-mini-glyph"><Sparkles size={22} /></span><strong>无</strong><span>轻巧的 Codex 伙伴</span>{!preferences.pets && <Check size={15} />}</button><button type="button" className={preferences.pets ? 'selected' : ''} aria-pressed={preferences.pets} onClick={() => updatePreference('pets', true)}><img src={frogAvatar} alt="" /><strong>青蛙伙伴</strong><span>青蛙</span>{preferences.pets && <Check size={15} />}</button></div></section>
    <Group title="自定义虚拟宠物">{action('创建你的专属虚拟宠物', '描述你希望拥有的伙伴', '创建', () => open('createPet', { prompt: '' }))}{action('虚拟宠物文件夹', '管理自定义虚拟宠物资源', '打开文件夹', () => open('petFolder'))}</Group>
  </>;

  if (section === 'data') content = <>
    <Group>{prefToggle('usageSharing', '为所有人改进模型', '控制是否将聊天用于模型训练。数据上传尚未启用。')}{action('共享链接', undefined, '管理', () => open('sharedLinks'))}{action('与应用共享的信息', undefined, '管理', () => open('sharedInformation'))}</Group>
    <Group>{action('已归档的聊天', undefined, '管理', () => navigate('archived'))}{action('归档所有聊天', undefined, '全部归档', () => open('archiveAll'))}{action('删除所有聊天', undefined, '全部删除', () => open('deleteAll'), true)}{action('导出数据', undefined, '导出', () => open('export'))}</Group>
    <Group>{action('位置', '在提供信息时允许 ChatGPT 使用设备的精确位置', read('location', false) ? '关闭' : '开启', () => open('location'))}{localToggle('workNetwork', 'Work 网络访问', '允许 Work 连接网络。网络服务尚未连接。')}{action('重置 ChatGPT Work', undefined, '重置', () => open('resetWork'), true)}{action('营销隐私', undefined, '管理', () => open('marketing'))}</Group>
  </>;

  const definitions: Record<string, { title: string; body: ReactNode; confirm?: string; action?: () => void; disabled?: boolean; danger?: boolean }> = {
    sound: { title: '选择通知音', body: <div className="personal-choice-list">{['默认', '无', '经典', 'Basso', 'Glass', 'Ping', 'Pop', 'Purr', 'Tink'].map(sound => <button type="button" key={sound} aria-pressed={d('sound') === sound} className={d('sound') === sound ? 'selected' : ''} onClick={() => change('sound', sound)}><span>{sound}</span>{d('sound') === sound && <Check size={16} />}</button>)}<button type="button" onClick={() => change('soundNotice', '自定义音频需小于 30 秒、10 MB，支持 MP3、WAV、FLAC、Ogg。音频导入尚未启用。')}>选择自定义声音…</button><p className="personal-note" role="status">{d('soundNotice')}</p></div>, confirm: '完成', action: () => { updatePreference('completionSound', d('sound') as SettingsPreferences['completionSound']); done('通知音偏好已保存；此操作不播放音频。'); } },
    notificationTasks: { title: '管理任务通知', body: <><p>任务通知会在关联账户提供任务后显示。</p><div className="personal-empty-card compact"><CircleHelp size={24} /><p>当前没有账户任务</p></div></> },
    importChoose: { title: '从其他 AI 应用导入', body: <><p>选择来源以预览可导入的项目。</p><label className="personal-choice-card"><input type="radio" checked readOnly /><div><strong>内置内容</strong><p>1 个项目 · 2 个聊天 · 1 组指令</p></div></label><p className="personal-note">内置内容尚未关联外部应用。</p></>, confirm: '继续', action: () => open('importReview', { chats: true, instructions: true, project: true }) },
    importReview: { title: '选择要导入的内容', body: <><p>内置内容</p>{check('project', '起始项目')}{check('chats', '聊天（2）')}{check('instructions', '自定义指令')}<p className="personal-note">仅添加此页中的内容记录。</p></>, confirm: '添加记录', disabled: !draft.project && !draft.chats && !draft.instructions, action: () => { write('imported', true); write('importProject', draft.project === true); write('importChats', draft.chats === true); write('importInstructions', draft.instructions === true); write('importCount', Number(!!draft.project) + Number(!!draft.chats) * 2 + Number(!!draft.instructions)); done('内容记录已添加，可在导入历史记录中查看。'); } },
    importHistory: { title: '导入详情', body: <div className="personal-detail-list">{[...(read('importProject', false) ? ['起始项目'] : []), ...(read('importChats', false) ? ['界面布局', '项目规划'] : []), ...(read('importInstructions', false) ? ['自定义指令'] : [])].map(label => <div key={label}><Check size={15} /><span>{label}</span><span className="personal-secondary">已添加记录</span></div>)}</div> },
    sync: { title: '要同步的内容', body: <><p>应用于所有已连接的来源和项目。</p><div className="personal-check-grid">{importCategories.map((label, i) => <div key={label}>{check(`sync${i}`, label)}</div>)}</div><p className="personal-note">更改只影响将来的同步。现有内容会保留。</p></>, confirm: '保存', disabled: !importCategories.some((_, i) => draft[`sync${i}`]), action: () => { importCategories.forEach((_, i) => write(`sync${i}`, draft[`sync${i}`] === true)); done('同步类别已保存到本次设置会话。'); } },
    builder: { title: 'GPT 构建者个人资料', body: <><p>管理构建者身份与资料。</p><PreferenceRow label="姓名"><span>{name}</span></PreferenceRow><p className="personal-note">GPT 服务尚未连接。</p></> },
    familyInvite: { title: '邀请家庭成员', body: <>{field('email', '邮箱地址', 'family@example.com')}<div className="personal-field"><label htmlFor="personal-family-role">此人是：</label><SelectControl id="personal-family-role" value={d('role', '我的孩子')} options={['我的孩子', '我的家长或监护人']} onChange={value => change('role', value)} /></div><p>接受邀请后，可以调整部分设置与使用限制，随时可以解除关联。</p><p className="personal-note">邀请服务尚未连接，仅支持 example.com 域名保存草稿。</p></>, confirm: '保存草稿', disabled: !isExampleEmail(d('email')), action: () => { write('familyPending', true); write('familyEmail', d('email')); write('familyRole', d('role')); done('邀请草稿已保存，尚未发送。'); } },
    familyResend: { title: '重新发送邀请', body: <p>邀请服务尚未连接，当前草稿仍未发送。</p>, confirm: '保存草稿', action: () => done('邀请服务尚未连接，消息未发送。') },
    familyCancel: { title: '取消邀请？', body: <p>移除此处的邀请草稿。</p>, confirm: '取消邀请', danger: true, action: () => { write('familyPending', false); done('邀请草稿已移除。'); } },
    familyNotifications: { title: '安全通知', body: <><PreferenceRow label="注册邮箱（未验证）"><span className="settings-value">{email}</span></PreferenceRow><p className="personal-note">尚未连接云端或邮件服务，没有发送或启用任何真实通知。</p></> },
    trustedInfo: { title: '添加受信任联系人', body: <><h3>会发生什么</h3><p>邀请对方成为受信任联系人后，对方可以选择是否接受。通知服务尚未连接。</p><h3>可以邀请谁</h3><p>选择一位年满 18 岁、你信任的朋友、家人或其他成年人。你可以随时更换或移除联系人。</p><p className="personal-note">安全监测与通知服务尚未连接。</p></>, confirm: '添加联系人', action: () => open('trustedInvite', { name: '联系人', email: 'contact@example.com', consent: false }) },
    trustedInvite: { title: '邀请受信任联系人', body: <>{field('name', '姓名', '联系人的姓名', false, 80)}{field('email', '邮箱地址', 'contact@example.com')}{check('consent', '保存为邀请草稿，暂不发送。')}<p className="personal-note">邀请服务尚未连接，仅支持 example.com 域名保存草稿。</p></>, confirm: '保存邀请草稿', disabled: !d('name').trim() || !isExampleEmail(d('email')) || !draft.consent, action: () => { write('trustedPending', true); write('trustedName', d('name')); write('trustedEmail', d('email')); done('联系人草稿已保存，尚未发送邀请。'); } },
    trustedResend: { title: '重新发送邀请', body: <p>向 {String(read('trustedName', '联系人'))} 的邀请服务尚未连接。</p>, confirm: '保存草稿', action: () => done('邀请服务尚未连接，消息未发送。') },
    trustedRemove: { title: '确定移除联系人吗？', body: <p>你即将移除 {String(read('trustedName', '联系人'))} 的邀请草稿。</p>, confirm: '移除联系人', danger: true, action: () => { write('trustedPending', false); done('联系人草稿已移除。'); } },
    voice: { title: '声音', body: <><div className="personal-voice-options">{(['Cove', 'Ember', 'Juniper'] as const).map(voice => <button type="button" key={voice} aria-pressed={d('voice') === voice} className={d('voice') === voice ? 'selected' : ''} onClick={() => change('voice', voice)}><span className="personal-voice-orb"><Mic size={19} /></span><strong>{voice}</strong>{d('voice') === voice && <Check size={16} />}</button>)}</div><p className="personal-note">语音播放服务尚未连接。</p></>, confirm: '完成', action: () => { updatePreference('voice', d('voice') as SettingsPreferences['voice']); done('声音偏好已保存。'); } },
    shortcut: { title: '设置快捷键', body: <><div className="personal-field"><label htmlFor="personal-shortcut-edit">快捷键</label><SelectControl id="personal-shortcut-edit" value={d('shortcut', '关闭')} options={['关闭', '⌥ Space', '⌘ ⇧ Space', '⌃ ⌥ V']} onChange={value => change('shortcut', value)} /></div><p className="personal-note">仅保存显示偏好，不注册系统全局快捷键。</p></>, confirm: '保存', action: () => { write(d('target'), d('shortcut')); done('快捷键偏好已保存到本次设置会话。'); } },
    dictionary: { title: '语音词典', body: <>{field('dictionary', '词语或短语', '每行一项', true, 2000)}<p className="personal-note">系统听写词典尚未连接。</p></>, confirm: '保存', action: () => { write('dictionary', d('dictionary')); done('词典已保存到本次会话。'); } },
    recordings: { title: '最近的录音', body: <div className="personal-empty-card compact"><Mic size={28} /><h3>暂无录音</h3><p>录音服务尚未连接。</p></div> },
    cleanup: { title: '检查旧聊天', body: <><div className="personal-filter-row"><label htmlFor="personal-cleanup-age">上次更新</label><SelectControl id="personal-cleanup-age" value={d('age', '30')} options={['7', '30', '90']} onChange={value => change('age', value)} /><span>天以前</span><SelectControl id="personal-cleanup-scope" label="包含的聊天" value={d('scope', '已归档的聊天')} options={['已归档的聊天', '所有聊天']} onChange={value => change('scope', value)} /></div><p>大小包含子代理。删除聊天及其子代理是永久操作。</p>{cleanupChats.length ? cleanupChats.map(chat => <div className="personal-cleanup-row" key={chat.id}>{check(`chat${chat.id}`, chat.label)}<span>{chat.size} MB · {chat.days} 天前</span></div>) : <p className="personal-card-note">没有聊天符合这些条件</p>}<p className="personal-note">此处显示内置记录，聊天清理服务尚未连接。</p></>, confirm: '删除所选', danger: true, disabled: !cleanupChats.some(chat => draft[`chat${chat.id}`]), action: () => setDialog('cleanupConfirm') },
    cleanupConfirm: { title: '删除所选聊天？', body: <p>已选择 {cleanupChats.filter(chat => draft[`chat${chat.id}`]).length} 个聊天及其子代理。清理服务尚未连接。</p>, confirm: '完成', danger: true, action: () => done('清理服务尚未连接，文件和聊天均未删除。') },
    worktrees: { title: '管理工作树', body: <><p>工作树是项目的独立工作副本。</p><div className="personal-empty-card compact"><Folder size={24} /><p>没有接入工作树数据</p></div></> },
    configFile: { title: 'config.toml 预览', body: <><pre className="personal-code">{`# 只读配置\napproval_policy = "on-request"\nsandbox_mode = "workspace-write"\nweb_search = "cached"`}</pre><p className="personal-note">此预览不读取或修改真实 config.toml。</p></> },
    efforts: { title: '可用推理强度', body: <><p>选择在模型控件中显示的强度。可用性因模型而异。</p><div className="personal-check-grid">{efforts.map((label, i) => <div key={label}>{check(`effort${i}`, label)}</div>)}</div><p className="personal-note">推理强度设置尚未连接模型菜单。</p></>, confirm: '保存', disabled: !efforts.some((_, i) => draft[`effort${i}`]), action: () => { efforts.forEach((_, i) => write(`effort${i}`, draft[`effort${i}`] === true)); done('推理强度显示偏好已保存到本次设置会话。'); } },
    diagnostics: { title: 'Codex 工作区诊断', body: <><div className="personal-result-icon"><ShieldCheck size={32} /></div><p>诊断流程预览</p><div className="personal-detail-list"><div>Node.js 工具<span>未检查</span></div><div>Python 工具<span>未检查</span></div><div>依赖包<span>未检查</span></div></div><p className="personal-note">系统诊断服务尚未连接。</p></> },
    reinstall: { title: '重置并安装工作区？', body: <p>安装服务尚未连接，暂时无法重新安装工具依赖包。</p>, confirm: '完成', action: () => done('安装服务尚未连接，系统文件未更改。') },
    instructions: { title: 'ChatGPT 自定义指令', body: <>{check('enabled', '启用自定义指令')}{field('instructions', 'ChatGPT 指令', '例如：回答保持简洁', true, 12000)}{field('nickname', '昵称', '你希望 ChatGPT 如何称呼你？', false, 80)}{field('occupation', '职业', '你从事什么工作？', false, 160)}{field('about', '关于你的更多信息', '需要记住的兴趣、价值观或偏好', true, 4000)}</>, confirm: '保存', action: () => { updatePreference('personalization', draft.enabled === true); updatePreference('customInstructions', d('instructions')); updatePreference('nickname', d('nickname')); updatePreference('occupation', d('occupation')); updatePreference('aboutYou', d('about')); done('自定义指令已保存。'); } },
    codexInstructions: { title: 'Codex 自定义指令', body: <>{field('instructions', '指令', '添加你的自定义指令…', true, 12000)}<p className="personal-note">仅保留在当前设置会话，不同步账户。</p></>, confirm: '保存', action: () => { write('codexInstructions', d('instructions')); done('Codex 指令已保存到本次会话。'); } },
    agentsInstructions: { title: '编辑 AGENTS.md', body: <>{field('instructions', 'AGENTS.md 内容', '添加你的自定义指令…', true, 12000)}<p className="personal-note">内容仅保留在本次会话，尚未写入文件。</p></>, confirm: '保存', action: () => { write('agentsInstructions', d('instructions')); done('指令已保留在本次会话，尚未写入文件。'); } },
    memorySummary: { title: '记忆摘要', body: <><p>关于你</p><div className="personal-empty-card compact"><Sparkles size={24} /><p>暂无记忆摘要</p></div><p className="personal-note">未读取或生成真实账户记忆。</p></> },
    savedMemory: { title: '已保存的记忆', body: <div className="personal-empty-card compact"><p>没有已保存的记忆</p><p>记忆服务尚未连接。</p></div> },
    deleteMemory: { title: '删除全部 Codex 记忆？', body: <p>记忆服务尚未连接，没有可删除的记忆。</p>, confirm: '完成', danger: true, action: () => done('记忆服务尚未连接，没有删除记忆。') },
    createPet: { title: '创建虚拟宠物', body: <>{field('prompt', '描述你的伙伴', '例如：一只戴着小帽子的青蛙', true, 1000)}<p className="personal-note">图像生成服务尚未连接，可以先保存创意。</p></>, confirm: '保存创意', disabled: !d('prompt').trim(), action: () => { write('petIdea', d('prompt')); done('宠物创意已保存在本次设置会话，尚未生成资源。'); } },
    petFolder: { title: '自定义虚拟宠物', body: <><p>管理自定义宠物资源。</p><div className="personal-empty-card compact"><Folder size={28} /><p>尚未创建自定义宠物文件夹</p></div></> },
    sharedLinks: { title: '共享链接', body: <div className="personal-empty-card compact"><p>没有共享链接</p><p>尚未创建公开链接。</p></div> },
    sharedInformation: { title: '与应用共享的信息', body: <div className="personal-empty-card compact"><p>没有共享的信息</p><p>尚未连接外部应用。</p></div> },
    archiveAll: { title: '归档所有聊天？', body: <><p>你可以在数据管理中管理已归档的聊天。</p><p className="personal-note">批量归档尚未启用，可通过聊天菜单逐个归档。</p></>, confirm: '知道了', action: () => done('可通过聊天菜单逐个归档。') },
    deleteAll: { title: '删除所有聊天？', body: <><p>删除聊天后无法恢复。</p><p className="personal-note">批量删除尚未启用。</p></>, confirm: '知道了', danger: true, action: () => done('批量删除尚未启用，聊天未删除。') },
    export: { title: '请求导出数据？', body: <><p>导出内容包括账户详情和聊天。</p><p className="personal-note">数据导出服务尚未连接。</p></>, confirm: '知道了', action: () => done('数据导出服务尚未连接。') },
    location: { title: '位置', body: <><p>允许 ChatGPT 使用设备位置，提供更相关的本地建议、新闻和天气。</p><p className="personal-note">位置服务尚未连接，仅保存偏好。</p></>, confirm: read('location', false) ? '关闭' : '开启', action: () => { write('location', !read('location', false)); done('位置偏好已更新，没有访问设备位置。'); } },
    resetWork: { title: '重置 ChatGPT Work？', body: <><p>重置会清除当前工作环境中的文件和本地数据，资料库文件会保留。</p><p className="personal-note">工作环境服务尚未连接，暂无可重置的环境。</p></>, confirm: '知道了', danger: true, action: () => done('工作环境服务尚未连接。') },
    marketing: { title: '营销隐私', body: <Group>{localToggle('marketingMeasurement', '营销效果衡量', '这些 Cookie 用于衡量营销活动的效果')}{localToggle('personalizedMarketing', '个性化营销', '在第三方平台上个性化与衡量 OpenAI 的营销活动')}<p className="personal-card-note">营销数据服务尚未连接。</p></Group> },
  };
  const modal = dialog ? definitions[dialog] : undefined;
  return <div className="personal-settings">
    {content}
    <p className="personal-feedback" role="status">{status}</p>
    {modal && <Dialog key={dialog} title={modal.title} onClose={close} className="personal-dialog"><div className="dialog-content personal-dialog-content">{modal.body}</div><div className="dialog-footer"><button type="button" className="settings-outline-button" onClick={close}>{modal.confirm ? '取消' : '关闭'}</button>{modal.confirm && <button type="button" className={`primary-button ${modal.danger ? 'personal-danger-button' : ''}`} disabled={modal.disabled} onClick={modal.action}>{modal.confirm}</button>}</div></Dialog>}
  </div>;
}
