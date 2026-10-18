import { CompanionAvatar, CompanionProfile } from './components/CompanionProfile';
import { openCompanion } from './companion';
import { ContextUsage } from './components/ContextUsage';
import { ConversationRail } from './components/ConversationRail';
import { ChatMessage } from './components/ChatMessage';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type SetStateAction, type PointerEvent as ReactPointerEvent } from 'react';
import { Archive, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Bell, BookOpen, Bug, Check, ChevronDown, ChevronRight, CircleHelp, CircleDashed, CirclePause, CirclePlay, Code2, Copy, FileCode2, FileText, Folder, FolderClosed, FolderOpen, GitBranch, Globe2, Hammer, Image as ImageIcon, Laptop, Layers, ListFilter, Mic, MessageSquare, MoreHorizontal, PanelLeft, Paperclip, Pencil, Pin, Plus, RefreshCw, Route, Search, Settings, Shapes, Sparkles, SquarePen, Telescope, Terminal, Trash2, X } from 'lucide-react';
import { addThread, appendUserMessage, clampSidebarWidth, deleteThread, restoreState, updateThread, type AppState, type Project, type Thread, type WorkMode, type ChatGptMode } from './model';
import { addProjectSection, archiveProjectChats, editProject, moveProjectToSection, removeProject, removeProjectSection, renameProjectSection, restoreRemovedProject, setProjectPinned } from './project-actions';
import { threadKindForMode, threadsForMode, recentThreads, switchChatGptSubmode } from './work-mode';
import { beginChatReply, finishChatReply, chatContext } from './chat-state';
import type { AuthUser, AuthResult } from './auth';
import { parseWorkspace, type WorkspaceSnapshot } from './workspace-state';
import { validateUsageDemo, type UsageDemoConfig } from './usage-demo';
import type { ProfileDemoConfig } from './profile-demo';
import { LoginPage } from './components/LoginPage';
import { Dialog, Dropdown, IconButton, type MenuOption } from './components/ui';
import { WorkspacePanel } from './components/WorkspacePanel';
import { SpacesPage } from './components/SpacesPage';
import { AutomationsPage } from './components/AutomationsPage';
import { PluginsPage } from './components/PluginsPage';
import { defaultRailPins, navigationDestinations, type NavigationDestination } from './navigation-state';
import type { SpacesCategory } from './components/SpacesPage';
import './components/navigation-surfaces.css';
import { ProfilePage, type ProfileData } from './components/ProfilePage';
import { SettingsPage } from './components/SettingsPage';
import { AccountMenu } from './components/AccountMenu';
import { MiniPreview } from './components/MiniPreview';
import { SummaryPopover } from './components/SummaryPopover';
import { ComposerModelPicker } from './components/ComposerModelPicker';
import { ProjectPicker } from './components/ProjectPicker';
import { ProjectActionsMenu } from './components/ProjectActionsMenu';
import { EditProjectDialog } from './components/EditProjectDialog';
import { ProjectAppearanceIcon } from './components/ProjectAppearanceIcon';
import { PermissionPicker, type PermissionMode } from './components/PermissionPicker';
import './home-layout.css';
import driveSuggestion from './assets/profile-plugins/google-drive.svg';
import gmailSuggestion from './assets/profile-plugins/gmail.svg';
import codexMark from './assets/codex-mark.svg';
import homeIcon from './assets/reference-icons/home-filled.svg';
import homeOutlineIcon from './assets/reference-icons/home-outline.svg';
import spacesIcon from './assets/reference-icons/spaces.svg';
import clockIcon from './assets/reference-icons/clock.svg';
import pluginIcon from './assets/reference-icons/plugin.svg';
import moreIcon from './assets/reference-icons/more.svg';
import reviewIcon from './assets/reference-icons/pull-request.svg';
import sitesIcon from './assets/reference-icons/sites.svg';
import downloadIcon from './assets/reference-icons/download.svg';
import headerMoreIcon from './assets/reference-icons/header-more.svg';
import headerNewTabIcon from './assets/reference-icons/header-new-tab.svg';
import companionFrog from './assets/reference-icons/companion-frog-reference.svg';

const copyText = (text: string) => window.desktop ? window.desktop.copyText(text) : navigator.clipboard.writeText(text);

type Surface = 'chat' | 'spaces' | 'automations' | 'plugins';
type HistoryLocation = { surface: Surface; threadId: string | null; workMode: WorkMode; chatGptMode: ChatGptMode };
const destinationLabels: Record<NavigationDestination, string> = { spaces: '空间', automations: '定时任务', plugins: '插件', sites: '站点', images: '图像', archive: '归档' };

type SessionView = { user: AuthUser; snapshot: WorkspaceSnapshot };

export default function App() {
  const [view, setView] = useState<SessionView | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const operation = useRef(0);
  const restoreSession = useCallback(async (signedIn?: AuthUser, warning?: string) => {
    const revision = ++operation.current;
    setChecking(true); setError('');
    try {
      const auth = window.desktop?.auth;
      if (!auth) { setView(null); return; }
      const result = signedIn ? { ok: true as const, user: signedIn, warning } : await auth.getSession();
      if (revision !== operation.current) return;
      if (!result.ok) { setError(result.error); return; }
      setNotice(result.warning || '');
      if (!result.user) { setView(null); return; }
      const saved = await auth.loadWorkspace(result.user.id);
      if (revision !== operation.current) return;
      if (!saved.ok) { setError(saved.error); return; }
      let snapshot: WorkspaceSnapshot;
      try { snapshot = parseWorkspace(saved.data); }
      catch { setError('此账号的工作区暂时无法读取，原数据已保留。请重试或退出登录。'); return; }
      setView({ user: result.user, snapshot });
    } catch {
      if (revision === operation.current) setError('账号服务暂时不可用，请重试。');
    } finally { if (revision === operation.current) setChecking(false); }
  }, []);
  useEffect(() => { void restoreSession(); return () => { operation.current++; }; }, [restoreSession]);
  useEffect(() => {
    if (view && !checking && !error) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'; document.documentElement.style.removeProperty('--ui-font-size'); };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [view, checking, error]);
  async function logout() {
    try {
      const result = await window.desktop!.auth.logout();
      if (!result.ok) { setNotice(result.error); if (error) setError(result.error); return false; }
      operation.current++; setView(null); setError(''); setChecking(false); setNotice('已退出登录。');
      return true;
    } catch { setNotice('退出登录未完成，请重试。'); if (error) setError('退出登录未完成，请重试。'); return false; }
  }
  if (checking || error) return <main className="auth-page"><div className="auth-titlebar drag-region" /><section className="auth-content">
    <header className="auth-heading"><img className="auth-mark" src={codexMark} alt="" /><h1>Codex</h1></header>
    <p className="auth-notice" role={error ? 'alert' : 'status'}>{checking ? '正在打开账号…' : error}</p>
    {!checking && <div className="auth-form-actions"><button className="auth-primary" onClick={() => void restoreSession()}>重试</button><button className="auth-secondary" onClick={() => void logout()}>退出登录</button></div>}
  </section></main>;
  if (!view) return <LoginPage onLogin={(user, warning) => void restoreSession(user, warning)} initialNotice={notice} />;
  return <Workspace key={view.user.id} user={view.user} initialSnapshot={view.snapshot} onLogout={logout} notice={notice} />;
}

export function Workspace({ user, initialSnapshot, onLogout, notice }: { user: AuthUser; initialSnapshot: WorkspaceSnapshot; onLogout: () => Promise<boolean>; notice: string }) {
  const [state, setReactState] = useState<AppState>(initialSnapshot.state);
  const stateRef = useRef(state);
  const [preferences, setPreferences] = useState(initialSnapshot.preferences);
  const [profileDemo, setProfileDemo] = useState(initialSnapshot.profileDemo);
  const [usageDemo, setUsageDemo] = useState(initialSnapshot.usageDemo);
  const [spaces, setSpaces] = useState(initialSnapshot.spaces);
  const [automations, setAutomations] = useState(initialSnapshot.automations);
  const [plugins, setPlugins] = useState(initialSnapshot.plugins);
  const [railPins, setRailPins] = useState(initialSnapshot.railPins);
  const [surface, setSurface] = useState<Surface>('chat');
  const [spacesCategory, setSpacesCategory] = useState<SpacesCategory>('page');
  const [visited, setVisited] = useState<Surface[]>([]);
  const [spacesDestination, setSpacesDestination] = useState<{ category: SpacesCategory; revision: number }>({ category: 'page', revision: 0 });
  const [spacesDirty, setSpacesDirty] = useState(false);
  const [automationsDirty, setAutomationsDirty] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [customizeRail, setCustomizeRail] = useState<NavigationDestination[] | null>(null);
  const [customizeSaving, setCustomizeSaving] = useState(false);
  const [customizeError, setCustomizeError] = useState('');
  const snapshotRef = useRef(initialSnapshot);
  snapshotRef.current = { schema: 1, state: stateRef.current, preferences, profileDemo, usageDemo, spaces, automations, plugins, railPins };
  const setState = useCallback((change: SetStateAction<AppState>) => {
    const next = typeof change === 'function' ? change(stateRef.current) : change;
    stateRef.current = next; snapshotRef.current = { ...snapshotRef.current, state: next }; setReactState(next);
  }, []);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [saveError, setSaveError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [logoutWarning, setLogoutWarning] = useState('');
  const leavingRef = useRef(false);
  const [draft, setDraft] = useState('');
  const requests = useRef(new Map<string, { threadId: string; text: string; finishing?: boolean }>());
  const [streamText, setStreamText] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [chatError, setChatError] = useState('');
  const mounted = useRef(true);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{ projectId?: string; sectionId?: string; name: string } | null>(null);
  const [sectionError, setSectionError] = useState('');
  const [projectConfirm, setProjectConfirm] = useState<{ id: string; action: 'archive' | 'remove' } | null>(null);
  const [projectError, setProjectError] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);
  const projectSavingRef = useRef(false);
  const [removedProject, setRemovedProject] = useState<{ project: Project; index: number; threadIds: string[] } | null>(null);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [recentFilter, setRecentFilter] = useState<'all' | 'chat' | 'work'>('all');
  const [includeProjectChats, setIncludeProjectChats] = useState(false);
  const [groupProjects, setGroupProjects] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({ name: user.name, username: user.email.split('@')[0], bio: '', visibility: 'private', showActivity: true, showStats: true, showPlugins: true, avatar: '', avatarShape: 'circle' });
  const [settingsDestination, setSettingsDestination] = useState({ tab: 'general', revision: 0 });
  const [rename, setRename] = useState<Thread | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const [model, setModel] = useState('GPT-6.1 Sol');
  const [effort, setEffort] = useState('高');
  const mode = preferences.permissionMode;
  const setMode = (permissionMode: PermissionMode) => setPreferences(previous => ({ ...previous, permissionMode }));
  const [voiceDemo, setVoiceDemo] = useState<'dictation' | 'voice' | null>(null);
  const [miniOpen, setMiniOpen] = useState(false);
  const [miniDraft, setMiniDraft] = useState('');
  const [petPaused, setPetPaused] = useState(false);
  const [companionDetails, setCompanionDetails] = useState(true);
  const [infoDialog, setInfoDialog] = useState<'invite' | 'help' | 'about' | null>(null);
  const [planMode, setPlanMode] = useState(false);
  const [history, setHistory] = useState<{ entries: HistoryLocation[]; index: number }>({ entries: [{ surface: 'chat', threadId: state.activeThreadId, workMode: state.workMode, chatGptMode: state.chatGptMode }], index: 0 });
  const [markTurns, setMarkTurns] = useState(0);
  const [toast, setToast] = useState('');
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nextComposerDraft = useRef('');
  const draftCache = useRef(new Map<string, { text: string; attachments: string[] }>());
  const draftKey = state.activeThreadId ?? 'new';
  const previousDraftKey = useRef(draftKey);
  const currentDraft = useRef({ text: draft, attachments });
  currentDraft.current = { text: draft, attachments };
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const active = state.threads.find(t => t.id === state.activeThreadId);
  const isCompanion = active?.kind === 'companion';
  const isChatGpt = state.workMode === 'chatgpt';
  const isPlainChat = isCompanion || (isChatGpt && state.chatGptMode === 'chat');
  const productName = isChatGpt ? 'ChatGPT' : 'Codex';
  const project = state.projects.find(p => p.id === (active ? active.projectId : selectedProject));
  const dark = state.theme === 'dark' || (state.theme === 'system' && systemDark);
  const notify = useCallback((message: string) => setToast(message), []);
  const navigateSurface = useCallback((next: Surface) => {
    setSettingsOpen(false); setProfileOpen(false);
    setVisited(current => current.includes(next) ? current : [...current, next]);
    setSurface(next);
  }, []);
  function openDestination(destination: NavigationDestination) {
    if (destination === 'archive') { openSettings('archived'); return; }
    if (destination === 'sites' || destination === 'images') {
      setSpacesDestination(current => ({ category: destination === 'sites' ? 'site' : 'image', revision: current.revision + 1 }));
      navigateSurface('spaces');
    } else navigateSurface(destination);
  }
  const openSettings = useCallback((tab = 'general') => { setProfileOpen(false); setSettingsDestination(previous => ({ tab, revision: previous.revision + 1 })); setSettingsOpen(true); }, []);
  const closeSettings = useCallback(() => { setProfileOpen(false); setSettingsOpen(false); requestAnimationFrame(() => composerRef.current?.focus()); }, []);

  const closeProfile = useCallback(() => setProfileOpen(false), []);

  const writeWorkspace = useCallback((patch: Partial<WorkspaceSnapshot> | ((current: WorkspaceSnapshot) => Partial<WorkspaceSnapshot>) = {}, onSuccess?: (saved: WorkspaceSnapshot) => void): Promise<AuthResult> => {
    const operation = writeQueue.current.then(async () => {
      try {
        const resolved = typeof patch === 'function' ? patch(snapshotRef.current) : patch;
        const saved = { ...snapshotRef.current, ...resolved };
        const result = await window.desktop!.auth.saveWorkspace(user.id, JSON.stringify(saved));
        if (result.ok) { snapshotRef.current = { ...snapshotRef.current, ...resolved }; onSuccess?.(saved); setSaveError(''); }
        else if (!Object.keys(patch).length) setSaveError(result.error);
        return result;
      } catch { const error = '工作区未保存，请重试。'; if (!Object.keys(patch).length) setSaveError(error); return { ok: false as const, error }; }
    });
    writeQueue.current = operation;
    return operation;
  }, [user.id]);
  const commitChatState = useCallback((change: (current: AppState) => AppState): Promise<AuthResult> => {
    const operation = writeQueue.current.then(async () => {
      try {
        // Apply after earlier project writes; streaming fragments never enter this queue.
        setState(change);
        const result = await window.desktop!.auth.saveWorkspace(user.id, JSON.stringify(snapshotRef.current));
        if (!result.ok) setSaveError(result.error); else setSaveError('');
        return result;
      } catch { const error = '聊天记录未保存，请重试。'; setSaveError(error); return { ok: false as const, error }; }
    });
    writeQueue.current = operation;
    return operation;
  }, [setState, user.id]);
  const finishReply = useCallback(async (requestId: string, status: 'complete' | 'stopped' | 'error', error?: string) => {
    const request = requests.current.get(requestId);
    if (!request || request.finishing) return;
    request.finishing = true;
    await commitChatState(current => finishChatReply(current, request.threadId, requestId, request.text, status, error));
    requests.current.delete(requestId);
    if (mounted.current) setStreamText(current => { const next = { ...current }; delete next[requestId]; return next; });
  }, [commitChatState]);
  const stopReply = useCallback(async (threadId: string) => {
    const entry = [...requests.current.entries()].find(([, value]) => value.threadId === threadId);
    if (!entry) return;
    const [requestId] = entry;
    // Cancel transport before waiting for disk writes; a failed cancellation is not success.
    try {
      const result = await window.desktop?.ai?.cancel({ ownerId: user.id, requestId });
      if (!result?.ok) { setChatError(result && !result.ok ? result.error : '未能停止生成，请重试。'); return; }
      await finishReply(requestId, 'stopped');
    } catch { setChatError('未能停止生成，请重试。'); }
  }, [finishReply, user.id]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.desktop?.ai?.onEvent(event => {
      if (event.ownerId !== user.id) return;
      const request = requests.current.get(event.requestId);
      if (!request || request.finishing || request.threadId !== event.threadId) return;
      if (event.type === 'delta') {
        request.text += event.text ?? '';
        setStreamText(current => ({ ...current, [event.requestId]: request.text }));
      } else void finishReply(event.requestId, event.type === 'done' ? 'complete' : event.type === 'cancelled' ? 'stopped' : 'error', event.error);
    });
    return () => {
      mounted.current = false; unsubscribe?.();
      for (const requestId of requests.current.keys()) void window.desktop?.ai?.cancel({ ownerId: user.id, requestId }).catch(() => undefined);
      requests.current.clear();
    };
  }, [finishReply, user.id]);
  useEffect(() => {
    for (const request of requests.current.values()) {
      if (!state.threads.some(thread => thread.id === request.threadId && !thread.archived)) void stopReply(request.threadId);
    }
  }, [state.threads, stopReply]);
  const persist = useCallback(() => writeWorkspace(), [writeWorkspace, state, preferences, profileDemo, usageDemo, spaces, automations, plugins, railPins]);
  useEffect(() => { void persist(); }, [persist]);
  async function saveProfileDemo(next: ProfileDemoConfig) { return writeWorkspace({ profileDemo: next }, () => setProfileDemo(next)); }
  async function saveUsageDemo(next: UsageDemoConfig) {
    const error = validateUsageDemo(next);
    if (error) return { ok: false as const, error };
    return writeWorkspace({ usageDemo: next }, () => setUsageDemo(next));
  }
  async function saveProjectChange(change: (current: AppState) => AppState): Promise<AuthResult> {
    if (projectSavingRef.current) return { ok: false, error: '正在保存，请稍候。' };
    projectSavingRef.current = true; setProjectSaving(true); setProjectError('');
    try {
      const result = await writeWorkspace(current => ({ state: change(current.state) }), saved => setState(saved.state));
      if (!result.ok) setProjectError(result.error);
      return result;
    } finally {
      projectSavingRef.current = false; setProjectSaving(false);
      // Resize cannot overwrite a pending project snapshot; apply the current window size after it settles.
      setState(current => {
        const sidebarWidth = clampSidebarWidth(current.sidebarWidth, innerWidth);
        const panelWidth = Math.max(280, Math.min(current.panelWidth, innerWidth * .48));
        return sidebarWidth === current.sidebarWidth && panelWidth === current.panelWidth ? current : { ...current, sidebarWidth, panelWidth };
      });
    }
  }
  function openSectionDialog(projectId?: string, sectionId?: string) {
    setSectionError(''); setSectionDialog({ projectId, sectionId, name: state.projectSections.find(section => section.id === sectionId)?.name ?? '' });
  }
  async function saveSection(event: FormEvent) {
    event.preventDefault();
    if (!sectionDialog || projectSavingRef.current) return;
    const name = sectionDialog.name.trim();
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) { setSectionError('分区名称须为 1–120 个字符，且不能包含换行。'); return; }
    if (state.projectSections.some(section => section.name === name && section.id !== sectionDialog.sectionId)) { setSectionError('已存在同名分区，请使用其他名称。'); return; }
    const result = await saveProjectChange(current => {
      if (sectionDialog.sectionId) return renameProjectSection(current, sectionDialog.sectionId, name);
      const next = addProjectSection(current, name);
      return sectionDialog.projectId ? moveProjectToSection(next, sectionDialog.projectId, next.projectSections.at(-1)!.id) : next;
    });
    if (result.ok) setSectionDialog(null); else setSectionError(result.error);
  }
  async function confirmProjectAction() {
    if (!projectConfirm || projectSavingRef.current) return;
    const current = snapshotRef.current.state;
    const target = current.projects.find(item => item.id === projectConfirm.id);
    if (!target) { setProjectConfirm(null); return; }
    const removing = projectConfirm.action === 'remove';
    const result = await saveProjectChange(s => removing ? removeProject(s, target.id) : archiveProjectChats(s, target.id));
    if (!result.ok) return;
    if (removing) {
      setRemovedProject({ project: target, index: current.projects.indexOf(target), threadIds: current.threads.filter(t => t.projectId === target.id).map(t => t.id) });
      if (selectedProject === target.id) setSelectedProject(null);
      setEditProjectId(null);
    } else notify('项目聊天已归档，可在设置中恢复');
    setProjectConfirm(null);
  }
  async function undoProjectRemoval() {
    if (!removedProject || projectSavingRef.current) return;
    const current = snapshotRef.current.state;
    const next = restoreRemovedProject(current, removedProject.project, removedProject.index, removedProject.threadIds);
    if (next === current) { setProjectError('这个项目已重新添加，请先检查现有项目。'); return; }
    const result = await saveProjectChange(latest => restoreRemovedProject(latest, removedProject.project, removedProject.index, removedProject.threadIds));
    if (result.ok) setRemovedProject(null);
  }
  async function requestLogout(discardDrafts = false) {
    if (!discardDrafts && (spacesDirty || automationsDirty)) { setConfirmLogout(true); return; }
    setConfirmLogout(false);
    if (leavingRef.current) return;
    leavingRef.current = true; setLeaving(true);
    await Promise.all([...requests.current.values()].map(request => stopReply(request.threadId)));
    const saved = await persist();
    if (!saved.ok && saved.code !== 'UNAUTHENTICATED') {
      setSaveError(saved.error); setLogoutWarning(saved.error);
      leavingRef.current = false; setLeaving(false); return;
    }
    if (!await onLogout()) { leavingRef.current = false; setLeaving(false); }
  }
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.style.setProperty('--ui-font-size', `${state.fontSize}px`); }, [dark, state.fontSize]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages.length]);
  useEffect(() => {
    const scroller = messagesRef.current;
    if (scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 180) scroller.scrollTo({ top: scroller.scrollHeight });
  }, [streamText]);
  useLayoutEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }, [draft, active?.id, isPlainChat, isCompanion, !!active?.messages.length]);
  useLayoutEffect(() => {
    if (previousDraftKey.current === draftKey) return;
    draftCache.current.set(previousDraftKey.current, currentDraft.current);
    const restored = draftCache.current.get(draftKey);
    setDraft(nextComposerDraft.current || restored?.text || '');
    setAttachments(nextComposerDraft.current ? [] : restored?.attachments ?? []);
    nextComposerDraft.current = ''; previousDraftKey.current = draftKey;
  }, [draftKey]);
  useEffect(() => {
    const location = { surface, threadId: surface === 'chat' ? state.activeThreadId : null, workMode: state.workMode, chatGptMode: state.chatGptMode };
    setHistory(h => h.entries[h.index].surface === location.surface && h.entries[h.index].threadId === location.threadId && h.entries[h.index].workMode === location.workMode && h.entries[h.index].chatGptMode === location.chatGptMode ? h : {
      entries: [...h.entries.slice(0, h.index + 1), location], index: h.index + 1,
    });
  }, [surface, state.activeThreadId, state.workMode, state.chatGptMode]);

  const newChat = useCallback(() => {
    draftCache.current.delete('new');
    if (previousDraftKey.current === 'new') { setDraft(''); setAttachments([]); }
    navigateSurface('chat'); setState(s => ({ ...s, activeThreadId: null })); setSelectedProject(null); setSettingsOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [navigateSurface]);
  function createChat(projectId: string | null = null) {
    navigateSurface('chat');
    setState(s => addThread(s, '新对话', projectId, threadKindForMode(s)));
    setSelectedProject(projectId); setRecentCollapsed(false); setRecentFilter('all');
    requestAnimationFrame(() => composerRef.current?.focus());
  }
  function switchWorkMode(workMode: WorkMode) {
    if (state.workMode === workMode) return;
    setState(s => ({ ...s, workMode, chatGptMode: workMode === 'chatgpt' && active ? (active.kind === 'chat' ? 'chat' : 'work') : s.chatGptMode }));
    setRecentFilter('all');
  }
  function switchChatGptMode(chatGptMode: ChatGptMode) {
    setState(s => switchChatGptSubmode(s, chatGptMode));
  }
  const action = useCallback((name: string) => {
    if (projectSavingRef.current) return;
    if (document.querySelector('dialog[open]')) return;
    if (name === 'new-thread') newChat();
    if (name === 'search') { setSearch(''); setSearchOpen(true); setSettingsOpen(false); }
    if (name === 'settings') openSettings();
    if (name === 'toggle-sidebar') setState(s => ({ ...s, sidebarVisible: !s.sidebarVisible }));
  }, [newChat, openSettings]);
  useEffect(() => window.desktop?.onAction(action), [action]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'Space' && !document.querySelector('dialog[open]')) {
        event.preventDefault(); setMiniOpen(true);
      }
      if (!window.desktop && (event.metaKey || event.ctrlKey)) {
        const key = event.key.toLowerCase();
        const command = ({ n: 'new-thread', k: 'search', ',': 'settings', b: 'toggle-sidebar' } as Record<string, string>)[key];
        if (command) { event.preventDefault(); action(command); }
      }
    };
    addEventListener('keydown', keys); return () => removeEventListener('keydown', keys);
  }, [action]);
  useEffect(() => {
    const resize = () => { if (!projectSavingRef.current) setState(s => ({ ...s, sidebarWidth: clampSidebarWidth(s.sidebarWidth, innerWidth), panelWidth: Math.max(280, Math.min(s.panelWidth, innerWidth * .48)) })); };
    addEventListener('resize', resize); return () => removeEventListener('resize', resize);
  }, []);

  function selectThread(thread: Thread) {
    navigateSurface('chat'); setState(s => ({ ...s, activeThreadId: thread.id, chatGptMode: s.workMode === 'chatgpt' ? (thread.kind === 'chat' ? 'chat' : 'work') : s.chatGptMode })); setSearchOpen(false); setSettingsOpen(false);
  }
  function threadOptions(thread: Thread): MenuOption[] {
    return [
      { label: '重命名', icon: Pencil, onSelect: () => { setRename(thread); setRenameValue(thread.title); } },
      { label: thread.pinned ? '取消置顶' : '置顶', icon: Pin, onSelect: () => setState(s => updateThread(s, thread.id, { pinned: !thread.pinned })) },
      { label: '复制为 Markdown', icon: Copy, onSelect: () => { copyText(`# ${thread.title}\n\n${thread.messages.map(m => m.content).join('\n\n')}`).then(() => notify('已复制对话内容')).catch(() => notify('无法访问剪贴板')); } },
      { label: thread.archived ? '取消归档' : '归档', icon: Archive, divider: true, onSelect: () => { setState(s => updateThread(s, thread.id, { archived: !thread.archived })); notify(thread.archived ? '对话已恢复' : '对话已归档，可在设置中恢复'); } },
      { label: '删除', icon: Trash2, danger: true, onSelect: () => setDeleteTarget(thread) },
    ];
  }
  function startResize(event: ReactPointerEvent, target: 'sidebar' | 'panel') {
    event.preventDefault();
    const initialX = event.clientX;
    const initialWidth = target === 'sidebar' ? state.sidebarWidth : state.panelWidth;
    const move = (e: PointerEvent) => setState(s => target === 'sidebar'
      ? { ...s, sidebarWidth: clampSidebarWidth(initialWidth + e.clientX - initialX, innerWidth) }
      : { ...s, panelWidth: Math.max(280, Math.min(720, innerWidth * .48, initialWidth - e.clientX + initialX)) });
    const stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); document.body.classList.remove('resizing'); };
    document.body.classList.add('resizing'); addEventListener('pointermove', move); addEventListener('pointerup', stop); addEventListener('pointercancel', stop);
  }
  async function addProject() {
    setSettingsOpen(false);
    if (!window.desktop) { notify('请在桌面客户端中选择项目文件夹'); return; }
    try {
      const chosen = await window.desktop.pickProject();
      if (!chosen) return;
      if (removedProject?.project.path === chosen.path) setRemovedProject(null);
      setState(s => s.projects.some(p => p.path === chosen.path) ? s : ({ ...s, projects: [...s.projects, { ...chosen, id: crypto.randomUUID() }] }));
      notify(`已添加 ${chosen.name}`);
    } catch { notify('暂时无法选择项目文件夹'); }
  }
  async function sendReply(retryId?: string) {
    if (sendingRef.current || leavingRef.current || active?.messages.some(m => m.status === 'pending')) return;
    const text = draft.trim();
    if (!retryId && !text && !attachments.length) return;
    setChatError('');
    if (!retryId && attachments.length) { setChatError('当前支持文字对话，请移除附件后发送。可以把需要分析的文字粘贴到输入框。'); return; }
    if (!retryId && text.length > 16000) { setChatError('这条消息过长，请缩短到 16000 字以内再发送。'); return; }
    const ai = window.desktop?.ai;
    if (!ai) { setChatError('请在桌面客户端中使用模型服务。'); return; }
    const requestId = crypto.randomUUID();
    let threadId = active?.id ?? null;
    const originalThreadId = threadId;
    const displayModel = model;
    const kind = threadKindForMode(state);
    let messages: ReturnType<typeof chatContext> = [];
    sendingRef.current = true; setSending(true);
    try {
      const config = await ai.status();
      if (!mounted.current || leavingRef.current) return;
      if (!config.ok || !config.configured) { setChatError(config.ok ? '模型服务未配置，请在设置 → 配置中查看服务状态。' : config.error); return; }
      const saved = await commitChatState(current => {
        if (leavingRef.current || !mounted.current) throw new Error('会话已关闭');
        let next = current;
        if (!threadId) {
          next = addThread(current, text.slice(0, 30), selectedProject, kind);
          threadId = next.activeThreadId!;
          if (current.activeThreadId !== originalThreadId) next = { ...next, activeThreadId: current.activeThreadId };
        }
        if (!retryId) next = appendUserMessage(next, threadId, text);
        next = beginChatReply(next, threadId, requestId, displayModel, retryId);
        messages = chatContext(next.threads.find(t => t.id === threadId)!.messages);
        requests.current.set(requestId, { threadId, text: '' });
        return next;
      });
      if (!saved.ok) {
        await finishReply(requestId, 'error', '聊天记录未保存，本次未发送到模型服务。');
        setChatError(saved.error); return;
      }
      if (!retryId) {
        const cachedDraft = draftCache.current.get(originalThreadId ?? 'new');
        if (cachedDraft?.text === draft && !cachedDraft.attachments.length) draftCache.current.delete(originalThreadId ?? 'new');
        if (stateRef.current.activeThreadId === threadId && currentDraft.current.text === draft) setDraft('');
      }
      if (!mounted.current || leavingRef.current || requests.current.get(requestId)?.finishing || !requests.current.has(requestId)) return;
      const result = await ai.start({ ownerId: user.id, requestId, threadId: threadId!, displayModel, messages });
      if (!result.ok) await finishReply(requestId, 'error', result.error);
    } catch { await finishReply(requestId, 'error', '模型服务暂时不可用，请重试。'); setChatError('模型服务暂时不可用，请重试。'); }
    finally { sendingRef.current = false; if (mounted.current) { setSending(false); requestAnimationFrame(() => composerRef.current?.focus()); } }
  }
  function submit(event?: FormEvent) { event?.preventDefault(); void sendReply(); }
  const togglePanel = (panel: AppState['panel']) => { navigateSurface('chat'); setState(s => ({ ...s, panel: surface === 'chat' && s.panel === panel ? 'none' : panel })); };
  function historyTarget(direction: number) {
    for (let i = history.index + direction; i >= 0 && i < history.entries.length; i += direction) {
      const location = history.entries[i];
      if (location.surface !== 'chat' || location.threadId === null || state.threads.some(t => t.id === location.threadId && !t.archived)) return i;
    }
    return null;
  }
  function navigateHistory(direction: number) {
    const index = historyTarget(direction);
    if (index === null) return;
    setSettingsOpen(false); setProfileOpen(false);
    const location = history.entries[index];
    const target = location.surface === 'chat' ? state.threads.find(thread => thread.id === location.threadId) : undefined;
    const chatGptMode = target?.messages.length ? (target.kind === 'chat' ? 'chat' : 'work') : location.chatGptMode;
    setHistory(h => ({ ...h, index, entries: h.entries.map((entry, i) => i === index ? { ...entry, chatGptMode } : entry) })); setSurface(location.surface);
    setState(s => {
      const next = { ...s, workMode: location.workMode, chatGptMode, ...(location.surface === 'chat' ? { activeThreadId: location.threadId } : {}) };
      return location.surface === 'chat' && location.workMode === 'chatgpt' ? switchChatGptSubmode(next, chatGptMode) : next;
    });
  }


  const ThreadRow = ({ thread }: { thread: Thread }) => <div className={`thread-row ${state.activeThreadId === thread.id ? 'selected' : ''}`}>
    <button className="thread-select" onClick={() => selectThread(thread)} title={thread.title}><span className="thread-dot" /><span>{thread.title}</span>{thread.messages.some(m => m.status === 'pending') && <CircleDashed className="thread-generating" size={13} aria-label="正在生成" />}</button>
    <Dropdown label={`${thread.title}的操作`} trigger={<MoreHorizontal size={15} />} options={threadOptions(thread)} align="right" className="row-menu" />
  </div>;

  const sidebarStyle = { width: state.sidebarWidth } as CSSProperties;
  const visibleThreads = threadsForMode(state.threads, state.workMode);
  const recent = recentThreads(visibleThreads, isChatGpt ? recentFilter : 'all', includeProjectChats || !groupProjects);
  const searched = visibleThreads.filter(t => `${t.title} ${t.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const suggestions = [
    { image: driveSuggestion, title: '整理知识库资料，规划 Drive 文件同步路径' },
    { image: gmailSuggestion, title: '梳理项目邮件，制定多项目用量方案' },
    { image: undefined, title: isPlainChat ? '筛选真正影响 AI 应用工程实现的重要变化' : '汇总项目进展、阻塞和下一步最小验证顺序' },
  ];
  const selectProject = (id: string | null) => {
    setSelectedProject(id);
    if (active) setState(s => updateThread(s, active.id, { projectId: id }));
  };
  const projectPickerProps = { projects: state.projects, selectedId: project?.id ?? null, onSelect: selectProject, onCreate: addProject };
  const editingProject = state.projects.find(p => p.id === editProjectId);
  const confirmingProject = state.projects.find(p => p.id === projectConfirm?.id);
  const toggleSection = (id: string) => setCollapsedSections(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  function renderProject(p: Project) {
    return <div className="project-group" key={p.id}>
      <div className="project-row"><button onClick={() => setCollapsedProjects(s => s.includes(p.id) ? s.filter(id => id !== p.id) : [...s, p.id])} title={p.path} aria-expanded={!collapsedProjects.includes(p.id)}><ProjectAppearanceIcon project={p} size={15} /><span>{p.name}</span></button>
        <div className="project-row-tools"><ProjectActionsMenu project={p} sections={state.projectSections} canArchive={state.threads.some(t => t.projectId === p.id && !t.archived)}
          onTogglePin={() => void saveProjectChange(s => setProjectPinned(s, p.id, !p.pinned))}
          onEdit={() => { setProjectError(''); setEditProjectId(p.id); }}
          onMove={id => void saveProjectChange(s => moveProjectToSection(s, p.id, id))}
          onCreateSection={() => openSectionDialog(p.id)}
          onArchive={() => { setProjectError(''); setProjectConfirm({ id: p.id, action: 'archive' }); }}
          onRemove={() => { setProjectError(''); setProjectConfirm({ id: p.id, action: 'remove' }); }} />
          <IconButton label={`在 ${p.name} 新建对话`} onClick={() => createChat(p.id)}><SquarePen size={14} /></IconButton>
        </div>
      </div>
      {!collapsedProjects.includes(p.id) && <div className="project-threads">{visibleThreads.filter(t => t.projectId === p.id && !t.pinned).map(t => <ThreadRow key={t.id} thread={t} />)}
        {!visibleThreads.some(t => t.projectId === p.id && !t.pinned) && <button className="empty-project" onClick={() => createChat(p.id)}>开始新对话</button>}
      </div>}
    </div>;
  }
  const panelOptions: MenuOption[] = [
    { label: '文件', icon: FileCode2, onSelect: () => togglePanel('files') },
    { label: '更改', icon: GitBranch, onSelect: () => togglePanel('diff') },
    { label: '终端', icon: Terminal, onSelect: () => togglePanel('terminal') },
    { label: '浏览器', icon: Globe2, onSelect: () => togglePanel('browser') },
  ];
  return <div inert={leaving || projectSaving} className={`app-shell ${state.sidebarVisible ? '' : 'sidebar-hidden'} ${settingsOpen || surface !== 'chat' ? 'settings-visible' : ''}`} style={{ '--sidebar-width': `${state.sidebarVisible ? state.sidebarWidth : 0}px` } as CSSProperties}>
    <div className="window-drag-strip drag-region">
      <div className="window-navigation"><IconButton label="后退" disabled={!settingsOpen && historyTarget(-1) === null} onClick={() => profileOpen && settingsOpen ? closeProfile() : settingsOpen ? closeSettings() : navigateHistory(-1)}><ArrowLeft size={15} /></IconButton><IconButton label="前进" disabled={settingsOpen || historyTarget(1) === null} onClick={() => navigateHistory(1)}><ArrowRight size={15} /></IconButton>{!settingsOpen && <IconButton label={state.sidebarVisible ? '收起侧栏 ⌘B' : '显示侧栏 ⌘B'} onClick={() => action('toggle-sidebar')}><PanelLeft size={15} /></IconButton>}</div>
      {!settingsOpen && surface === 'chat' && !isCompanion && !!active?.messages.length && <div className="window-title"><ProjectPicker {...projectPickerProps} trigger={<Folder size={15} />} /><span>{active?.title ?? productName}</span></div>}
      {!settingsOpen && surface === 'chat' && <div className="window-right">{isCompanion && <IconButton label="伙伴资料" active={companionDetails} onClick={() => setCompanionDetails(v => !v)}><ListFilter size={16} /></IconButton>}{!isCompanion && !!active?.messages.length && <><Dropdown label="聊天操作" trigger={<span className="header-reference-icon" style={{ maskImage: `url("${headerMoreIcon}")` }} />} options={active ? threadOptions(active) : [{ label: '新聊天', icon: SquarePen, onSelect: newChat }, { label: '设置', icon: Settings, onSelect: () => action('settings') }]} align="right" /><SummaryPopover thread={active} projectName={project?.name} /><span className="toolbar-divider" /></>}<Dropdown label="新建标签页" trigger={<span className="header-reference-icon" style={{ maskImage: `url("${headerNewTabIcon}")` }} />} options={panelOptions} align="right" /></div>}
    </div>
    <nav className="navigation-rail" aria-label="应用导航">
      <IconButton label={`${productName} 主页`} active={!settingsOpen && surface === 'chat'} onClick={() => navigateSurface('chat')} className="rail-home"><img className="brand-mark rail-reference-icon" src={!settingsOpen && surface === 'chat' ? homeIcon : homeOutlineIcon} alt="" /></IconButton>
      {railPins.map(destination => <IconButton key={destination} label={destinationLabels[destination]} active={!settingsOpen && destination === (surface === 'spaces' && spacesCategory === 'site' && railPins.includes('sites') ? 'sites' : surface === 'spaces' && spacesCategory === 'image' && railPins.includes('images') ? 'images' : surface)} onClick={() => openDestination(destination)}>{destination === 'archive' ? <Archive size={20} /> : destination === 'images' ? <ImageIcon size={20} /> : <img className="brand-mark rail-reference-icon" src={destination === 'spaces' ? spacesIcon : destination === 'automations' ? clockIcon : destination === 'plugins' ? pluginIcon : sitesIcon} alt="" />}</IconButton>)}
      <Dropdown label="更多导航" className="rail-more" trigger={<img className="brand-mark rail-reference-icon" src={moreIcon} alt="" />} options={[
        ...navigationDestinations.filter(destination => !railPins.includes(destination)).map(destination => ({ label: destinationLabels[destination], icon: destination === 'archive' ? Archive : destination === 'sites' ? Globe2 : destination === 'images' ? ImageIcon : destination === 'spaces' ? Layers : destination === 'automations' ? CirclePause : Telescope, onSelect: () => openDestination(destination) })),
        { label: '自定义', icon: Pencil, divider: true, onSelect: () => { setCustomizeRail([...railPins]); setCustomizeError(''); } },
      ]} />
      <span className="rail-separator" />
      {!isChatGpt && <IconButton label="代码审查" active={!settingsOpen && surface === 'chat' && state.panel === 'diff'} onClick={() => togglePanel('diff')}><img className="brand-mark rail-reference-icon" src={reviewIcon} alt="" /></IconButton>}
      <IconButton label="文件工作区" active={!settingsOpen && surface === 'chat' && state.panel === 'files'} onClick={() => togglePanel('files')}><img className="brand-mark rail-reference-icon" src={sitesIcon} alt="" /></IconButton>
      <div className="rail-footer"><IconButton label="下载与更新" className="rail-download" onClick={() => notify('暂无可用更新')}><img src={downloadIcon} alt="" /></IconButton><AccountMenu username={user.name} plan={usageDemo.plan} remaining={usageDemo.weeklyRemaining}
        onAccount={() => openSettings('account')} onUsage={() => openSettings('usage')}
        onMini={() => setMiniOpen(true)} onInvite={() => setInfoDialog('invite')} onSettings={() => openSettings()}
        onHelp={topic => topic === '键盘快捷键' ? openSettings('shortcuts') : setInfoDialog(topic === '帮助中心' ? 'help' : 'about')}
        onLogout={() => void requestLogout()} /></div>
    </nav>
    {state.sidebarVisible && <aside className="sidebar" style={sidebarStyle} inert={settingsOpen || surface !== 'chat'}>
      <div className="sidebar-mode"><Dropdown label="工作模式" menuClassName="work-mode-menu" trigger={<><strong>{productName}</strong><ChevronDown size={12} /></>} options={[
        { label: 'ChatGPT', description: '创建、学习和探索', checked: isChatGpt, onSelect: () => switchWorkMode('chatgpt') },
        { label: 'Codex', description: '构建、调试和发布', checked: !isChatGpt, onSelect: () => switchWorkMode('codex') },
      ]} /><div className="sidebar-tools"><IconButton label="通知" onClick={() => notify('暂无新通知')}><Bell size={16} /></IconButton><IconButton label="搜索对话 ⌘K" onClick={() => action('search')}><Search size={16} /></IconButton></div></div>
      <nav className="primary-nav" aria-label="主导航">
        <button className="nav-row" onClick={newChat}><SquarePen size={16} /><span>新聊天</span><kbd>⌘N</kbd></button>
        <div className={`companion-row${petPaused ? ' is-paused' : ''}${isCompanion && !settingsOpen && surface === 'chat' ? ' selected' : ''}`}><button className="companion-open" onClick={() => { navigateSurface('chat'); setState(s => openCompanion(s, preferences.companionName)); setCompanionDetails(true); }} title={`${preferences.companionName} · 虚拟伙伴`}><CompanionAvatar className="companion-avatar" avatar={preferences.companionAvatar} /><span>{preferences.companionName}</span></button><IconButton label={petPaused ? `继续${preferences.companionName}` : `暂停${preferences.companionName}`} onClick={() => { setPetPaused(paused => !paused); notify(petPaused ? `${preferences.companionName}已继续` : `${preferences.companionName}已暂停`); }}>{petPaused ? <CirclePlay size={13} /> : <CirclePause size={13} />}</IconButton></div>
      </nav>
      <div className="sidebar-scroll">
        {(visibleThreads.some(t => t.pinned) || state.projects.some(p => p.pinned)) && <section className="sidebar-section"><div className="section-label project-section-heading">置顶</div>{state.projects.filter(p => p.pinned).map(renderProject)}{visibleThreads.filter(t => t.pinned).map(t => <ThreadRow key={t.id} thread={t} />)}</section>}
        {groupProjects && <>
          <section className="sidebar-section"><div className="section-label project-section-heading"><button className="project-section-collapse" aria-expanded={!collapsedSections.includes('projects')} onClick={() => toggleSection('projects')}>项目<ChevronDown size={12} className={collapsedSections.includes('projects') ? 'collapsed' : ''} /></button><IconButton label="添加项目" onClick={addProject}><Plus size={14} /></IconButton></div>
            {!collapsedSections.includes('projects') && state.projects.filter(p => !p.pinned && !p.sectionId).map(renderProject)}
          </section>
          {state.projectSections.map(section => <section className="sidebar-section" key={section.id}><div className="section-label project-section-heading"><button className="project-section-collapse" aria-expanded={!collapsedSections.includes(section.id)} onClick={() => toggleSection(section.id)} title={section.name}><span>{section.name}</span><ChevronDown size={12} className={collapsedSections.includes(section.id) ? 'collapsed' : ''} /></button>
            <Dropdown label={`${section.name}的分区操作`} align="right" trigger={<MoreHorizontal size={15} />} options={[
              { label: '重命名分区', icon: Pencil, onSelect: () => openSectionDialog(undefined, section.id) },
              { label: '移除分区', icon: X, onSelect: () => void saveProjectChange(s => removeProjectSection(s, section.id)) },
            ]} /></div>{!collapsedSections.includes(section.id) && state.projects.filter(p => !p.pinned && p.sectionId === section.id).map(renderProject)}
          </section>)}
        </>}
        <section className="sidebar-section recent-section"><div className="section-label recent-heading"><button className="recent-collapse" aria-expanded={!recentCollapsed} aria-controls="recent-chats" onClick={() => setRecentCollapsed(value => !value)}>最近<ChevronDown size={12} className={recentCollapsed ? 'collapsed' : ''} /></button><div className="recent-tools">
          <Dropdown label="整理最近对话" align="right" trigger={<MoreHorizontal size={15} />} options={[
            { label: '分项目显示', checked: groupProjects, onSelect: () => setGroupProjects(true) },
            { label: '合并显示', checked: !groupProjects, onSelect: () => setGroupProjects(false) },
            { label: '最近显示项目聊天', checked: includeProjectChats, divider: true, onSelect: () => setIncludeProjectChats(value => !value) },
          ]} />
          {isChatGpt && <Dropdown label="筛选最近对话" align="right" className={recentFilter === 'all' ? '' : 'has-filter'} trigger={<ListFilter size={15} />} options={[
            { label: '全部', checked: recentFilter === 'all', onSelect: () => setRecentFilter('all') },
            { label: '聊天', checked: recentFilter === 'chat', onSelect: () => setRecentFilter('chat') },
            { label: '工作', checked: recentFilter === 'work', onSelect: () => setRecentFilter('work') },
          ]} />}
          <IconButton label="新建最近对话" onClick={() => createChat()}><SquarePen size={15} /></IconButton>
        </div></div>
          <div id="recent-chats" hidden={recentCollapsed}>{recent.map(t => <ThreadRow key={t.id} thread={t} />)}
          {!recent.length && <div className="sidebar-empty">{isChatGpt && recentFilter !== 'all' ? '没有符合筛选条件的对话' : '新的对话会显示在这里'}</div>}</div>
        </section>
      </div>
      <div role="separator" tabIndex={0} aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuenow={state.sidebarWidth} aria-valuemin={240} aria-valuemax={520} className="resize-handle sidebar-resizer" onPointerDown={e => startResize(e, 'sidebar')}
        onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setState(s => ({ ...s, sidebarWidth: clampSidebarWidth(s.sidebarWidth + (e.key === 'ArrowRight' ? 10 : -10), innerWidth) })); } }} />
    </aside>}

    <main className={`main-surface ${isCompanion ? 'companion-surface' : ''} ${active?.messages.length ? '' : 'home-surface'} ${isChatGpt && !isCompanion ? 'chatgpt-surface' : ''}`} inert={settingsOpen || surface !== 'chat'}>
      {!isCompanion && isChatGpt && !active?.messages.length && <header className="chatgpt-mode-header"><div className="chatgpt-mode-tabs" role="tablist" aria-label="ChatGPT 模式" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'work' : state.chatGptMode === 'chat' ? 'work' : 'chat';
        switchChatGptMode(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
      }}><button role="tab" data-mode="chat" tabIndex={state.chatGptMode === 'chat' ? 0 : -1} aria-selected={state.chatGptMode === 'chat'} onClick={() => switchChatGptMode('chat')}>聊天</button><button role="tab" data-mode="work" tabIndex={state.chatGptMode === 'work' ? 0 : -1} aria-selected={state.chatGptMode === 'work'} onClick={() => switchChatGptMode('work')}>工作</button></div></header>}
      <div className="workspace-body">
        <section className={`conversation ${isCompanion ? 'companion-conversation' : isChatGpt ? isPlainChat ? 'chat-conversation' : 'work-conversation' : 'codex-conversation'} ${active?.messages.length ? 'has-messages' : 'empty-conversation'}`}>
          {surface === 'chat' && !settingsOpen && !isCompanion && <ConversationRail messages={active?.messages ?? []} threadId={active?.id ?? ''} scrollerRef={messagesRef} />}
          <div className="message-scroll" ref={messagesRef}>
            {active?.messages.length ? <div className="messages">{active.messages.map((message, index) => {
              const content = streamText[message.id] ?? message.content;
              return <ChatMessage key={message.id} message={message} content={content}
                canRetry={!sending && index === active.messages.length - 1 && ['stopped', 'error'].includes(message.status ?? '')}
                onRetry={() => void sendReply(message.id)} onCopy={copyText} />;
            })}</div>
              : isCompanion ? <div className="companion-empty"><CompanionAvatar avatar={preferences.companionAvatar} /><h1>{preferences.companionName}</h1><p>有什么想和我聊的？</p></div> : <div className="welcome">{!isChatGpt && <button className="welcome-mark" aria-label="Codex" onClick={() => setMarkTurns(turns => turns + 1)}><img className="brand-mark" src={codexMark} alt="" style={{ transform: `rotate(${markTurns * 360}deg)` }} /></button>}<h1>{isChatGpt ? (isPlainChat ? '今天想聊点什么？' : '我们要做什么？') : '我们要构建什么？'}</h1>
              </div>}
          </div>
          {!isCompanion && !active?.messages.length && isChatGpt && <div className="starter-actions">
            {suggestions.map(({ image, title }, index) => <button key={index} className="home-suggestion" onClick={() => { setDraft(title); composerRef.current?.focus(); }}>{image ? <img src={image} alt="" /> : <span aria-hidden="true">{isPlainChat ? '🤖' : '💻'}</span>}<span>{title}</span></button>)}
          </div>}
          <div className="composer-area">
            {chatError && <div className="chat-service-error" role="alert"><span>{chatError}</span><button type="button" onClick={() => openSettings('configuration')}>服务设置</button><button type="button" aria-label="关闭提示" onClick={() => setChatError('')}><X size={13} /></button></div>}
            {!isCompanion && !active?.messages.length && !isChatGpt && <div className="composer-project-bar"><ProjectPicker {...projectPickerProps} trigger={<>{project ? <ProjectAppearanceIcon project={project} /> : <FolderClosed size={16} />}<span>{project?.name ?? '选择项目'}</span></>} side="top" />
              <Dropdown label="运行位置" trigger={<><Laptop size={16} /><span>此计算机</span></>} side="top" options={[{ label: '此计算机', icon: Laptop, checked: true, onSelect: () => {} }]} />
            </div>}
            <form className="composer" onSubmit={submit} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setAttachments(a => [...new Set([...a, ...Array.from(e.dataTransfer.files).map(f => f.name)])]); }}>
              {!!attachments.length && <div className="attachments">{attachments.map(name => <span className="attachment" key={name}><Paperclip size={13} /><span>{name}</span><button type="button" aria-label={`移除 ${name}`} onClick={() => setAttachments(a => a.filter(n => n !== name))}><X size={12} /></button></span>)}</div>}
              <textarea ref={composerRef} aria-label="消息输入框" placeholder={isCompanion ? '发送消息' : isChatGpt ? (isPlainChat ? '询问 ChatGPT' : '使用 ChatGPT Work') : active?.messages.length ? '与 Codex 协作' : '随心输入'} value={draft} rows={isCompanion || (isPlainChat && !active?.messages.length) ? 1 : 2} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
              <div className="composer-toolbar"><div className="composer-controls">
                <IconButton label="添加文件" onClick={() => fileRef.current?.click()}><Plus size={19} /></IconButton>
                <input hidden type="file" multiple ref={fileRef} onChange={e => { setAttachments(a => [...new Set([...a, ...Array.from(e.target.files ?? []).map(f => f.name)])]); e.target.value = ''; }} />
                {!isPlainChat && <><PermissionPicker mode={mode} onModeChange={setMode} />
                <IconButton label={planMode ? '关闭计划模式' : '计划模式'} active={planMode} className="plan-mode-button" onClick={() => { setPlanMode(!planMode); notify(planMode ? '已退出计划模式' : '已开启计划模式'); }}><Route size={16} /><span /></IconButton></>}
              </div><div className="composer-send-controls">{!isPlainChat && <>{!!active?.messages.length && <ContextUsage messages={active.messages} />}<ComposerModelPicker model={model} effort={effort} onModelChange={setModel} onEffortChange={setEffort} /></>}{!isCompanion && isPlainChat && <Dropdown label="选择强度" trigger={<><span>{effort}</span><ChevronDown size={10} /></>} side="top" align="right" options={['轻度', '中', '高', '极高', 'Ultra'].map(value => ({ label: value, checked: effort === value, onSelect: () => setEffort(value) }))} />}<IconButton label="听写" onClick={() => setVoiceDemo('dictation')}><Mic size={16} /></IconButton>{active?.messages.some(m => m.status === 'pending') ? <button className="send-button stop-generation" type="button" title="停止生成" aria-label="停止生成" onClick={event => { event.preventDefault(); void stopReply(active.id); }}><span /></button> : draft.trim() || attachments.length ? <button className="send-button" disabled={sending} type="submit" title="发送 Enter" aria-label="发送消息"><ArrowUp size={18} strokeWidth={1.8} /></button> : isCompanion ? <button className="send-button" type="submit" disabled aria-label="发送消息"><ArrowUp size={18} /></button> : <button className="voice-button" type="button" aria-label="开启语音" onClick={() => setVoiceDemo('voice')}><AudioLines size={17} /></button>}</div></div>
            </form>
            {!active?.messages.length && isChatGpt && !isPlainChat && <div className="home-work-tools">
              <ProjectPicker {...projectPickerProps} side="bottom" trigger={<><FolderClosed size={14} /><span>{project?.name ?? '选择项目'}</span></>} />
              <button type="button" onClick={() => fileRef.current?.click()}><Paperclip size={14} />文件</button>
              <button type="button" onClick={() => navigateSurface('plugins')}><Shapes size={14} />插件</button>
              <Dropdown className="home-work-location" label="运行位置" side="bottom" align="right" trigger={<Laptop size={14} />} options={[{ label: '此计算机', icon: Laptop, checked: true, onSelect: () => {} }]} />
            </div>}
          </div>
        </section>
        {isCompanion && companionDetails && <CompanionProfile name={preferences.companionName} avatar={preferences.companionAvatar} messages={active?.messages ?? []} onClose={() => setCompanionDetails(false)} onSave={(name, avatar) => writeWorkspace(current => ({ preferences: { ...current.preferences, companionName: name, companionAvatar: avatar }, state: { ...current.state, threads: current.state.threads.map(t => t.kind === 'companion' ? { ...t, title: name } : t) } }), saved => { setPreferences(saved.preferences); setState(saved.state); })} />}
        {!isCompanion && state.panel !== 'none' && <aside className="right-panel" style={{ width: state.panelWidth }}>
          <div className="resize-handle panel-resizer" role="separator" tabIndex={0} aria-label="调整面板宽度" aria-orientation="vertical" aria-valuenow={state.panelWidth} aria-valuemin={280} aria-valuemax={720} onPointerDown={e => startResize(e, 'panel')}
            onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setState(s => ({ ...s, panelWidth: Math.max(280, Math.min(720, innerWidth * .48, s.panelWidth + (e.key === 'ArrowLeft' ? 10 : -10))) })); } }} />
          <WorkspacePanel panel={state.panel} onClose={() => setState(s => ({ ...s, panel: 'none' }))} />
        </aside>}
      </div>
    </main>

    {editingProject && <EditProjectDialog key={editingProject.id} project={editingProject} onSave={patch => saveProjectChange(s => editProject(s, editingProject.id, patch))} onClose={() => setEditProjectId(null)} onRemove={() => { setProjectError(''); setProjectConfirm({ id: editingProject.id, action: 'remove' }); }} />}
    {sectionDialog && <Dialog title={sectionDialog.sectionId ? '重命名分区' : '新建分区'} className="small-dialog" onClose={() => { if (!projectSavingRef.current) setSectionDialog(null); }}><form onSubmit={saveSection}><div className="dialog-content"><p>随心整理聊天和项目</p><label className="field-label" htmlFor="project-section-name">分区名称</label><input id="project-section-name" className="text-input" value={sectionDialog.name} maxLength={120} disabled={projectSaving} onChange={event => setSectionDialog({ ...sectionDialog, name: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} />{sectionError && <p className="project-edit-error" role="alert">{sectionError}</p>}</div><div className="dialog-footer"><button type="button" className="secondary-button" disabled={projectSaving} onClick={() => setSectionDialog(null)}>取消</button><button className="primary-button" disabled={projectSaving || !sectionDialog.name.trim()}>{projectSaving ? '正在保存…' : sectionDialog.sectionId ? '保存' : '创建分区'}</button></div></form></Dialog>}
    {confirmingProject && projectConfirm && <Dialog title={projectConfirm.action === 'remove' ? `移除 ${confirmingProject.name}？` : `归档 ${state.threads.filter(t => t.projectId === confirmingProject.id && !t.archived).length} 个聊天？`} className="small-dialog" onClose={() => { if (!projectSavingRef.current) setProjectConfirm(null); }}><div className="dialog-content"><p>{projectConfirm.action === 'remove' ? '这只会从应用中移除该项目。你电脑上的文件和现有聊天不会被删除。' : `“${confirmingProject.name}”中的聊天会被归档。你可以在设置的归档聊天中恢复。`}</p>{projectError && <p className="project-edit-error" role="alert">{projectError}</p>}</div><div className="dialog-footer"><button className="secondary-button" disabled={projectSaving} onClick={() => setProjectConfirm(null)}>取消</button><button className={projectConfirm.action === 'remove' ? 'danger-button' : 'primary-button'} disabled={projectSaving} onClick={() => void confirmProjectAction()}>{projectSaving ? '正在保存…' : projectConfirm.action === 'remove' ? '移除项目' : '全部归档'}</button></div></Dialog>}
    {searchOpen && <Dialog title="搜索对话" onClose={() => setSearchOpen(false)} className="search-dialog"><div className="search-field"><Search size={18} /><input autoFocus placeholder="搜索标题或消息…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="search-results">{searched.map(t => <button key={t.id} onClick={() => selectThread(t)}><MessageSquare size={17} /><span>{t.title}<small>{state.projects.find(p => p.id === t.projectId)?.name ?? '独立对话'}</small></span><ChevronRight size={14} /></button>)}{!searched.length && <div className="empty-state"><Search size={28} /><p>没有找到匹配的对话</p><small>试试其他关键词</small></div>}</div></Dialog>}
    {rename && <Dialog title="重命名对话" onClose={() => setRename(null)} className="small-dialog"><form onSubmit={e => { e.preventDefault(); if (!renameValue.trim()) return; setState(s => updateThread(s, rename.id, { title: renameValue })); setRename(null); }}><div className="dialog-content"><label className="field-label" htmlFor="rename">对话名称</label><input id="rename" className="text-input" autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onFocus={e => e.target.select()} maxLength={120} /></div><div className="dialog-footer"><button type="button" className="secondary-button" onClick={() => setRename(null)}>取消</button><button className="primary-button" disabled={!renameValue.trim()}>保存</button></div></form></Dialog>}
    {deleteTarget && <Dialog title="删除对话？" onClose={() => setDeleteTarget(null)} className="small-dialog"><div className="dialog-content"><p>“{deleteTarget.title}”及其消息将被删除。</p></div><div className="dialog-footer"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>取消</button><button className="danger-button" onClick={() => { setState(s => deleteThread(s, deleteTarget.id)); setDeleteTarget(null); }}>删除对话</button></div></Dialog>}
    {voiceDemo && <Dialog title={voiceDemo === 'dictation' ? '听写' : '语音'} className="small-dialog" onClose={() => setVoiceDemo(null)}><div className="voice-demo-content"><AudioLines size={34} /><p>语音服务尚未连接</p><small>连接语音服务后即可使用。</small></div><div className="dialog-footer"><button className="primary-button" onClick={() => setVoiceDemo(null)}>关闭</button></div></Dialog>}
    {visited.includes('spaces') && <div className="feature-surface" hidden={surface !== 'spaces' || settingsOpen}><SpacesPage value={spaces} onSave={next => writeWorkspace({ spaces: next }, () => setSpaces(next))} onOpenPlugins={() => navigateSurface('plugins')} sidebarVisible={state.sidebarVisible} initialCategory={spacesDestination.category} navigationKey={spacesDestination.revision} onCategoryChange={setSpacesCategory} onDirtyChange={setSpacesDirty} /></div>}
    {visited.includes('automations') && <div className="feature-surface" hidden={surface !== 'automations' || settingsOpen}><AutomationsPage value={automations} onSave={next => writeWorkspace({ automations: next }, () => setAutomations(next))} sidebarVisible={state.sidebarVisible} onDirtyChange={setAutomationsDirty} /></div>}
    {visited.includes('plugins') && <div className="feature-surface" hidden={surface !== 'plugins' || settingsOpen}><PluginsPage value={plugins} onSave={next => writeWorkspace({ plugins: next }, () => setPlugins(next))} sidebarVisible={state.sidebarVisible} /></div>}
    {customizeRail && <Dialog title="自定义导航" className="small-dialog" onClose={() => { if (!customizeSaving) setCustomizeRail(null); }}><div className="dialog-content navigation-customize"><p>选择固定到侧边栏的入口，其余入口会显示在“探索”菜单中。</p>{navigationDestinations.map(destination => <label key={destination}><input type="checkbox" disabled={customizeSaving} checked={customizeRail.includes(destination)} onChange={event => setCustomizeRail(current => event.target.checked ? [...current!, destination] : current!.filter(item => item !== destination))} /><span>{destinationLabels[destination]}</span></label>)}<button disabled={customizeSaving} className="navigation-reset" onClick={() => setCustomizeRail([...defaultRailPins])}>重置自定义设置</button>{customizeError && <p className="navigation-error" role="alert">{customizeError}</p>}</div><div className="dialog-footer"><button className="secondary-button" disabled={customizeSaving} onClick={() => setCustomizeRail(null)}>取消</button><button className="primary-button" disabled={customizeSaving} onClick={async () => { setCustomizeSaving(true); const next = customizeRail; const result = await writeWorkspace({ railPins: next }, () => setRailPins(next)); if (result.ok) setCustomizeRail(null); else setCustomizeError(result.error); setCustomizeSaving(false); }}>{customizeSaving ? '正在保存…' : '完成'}</button></div></Dialog>}
    {confirmLogout && <Dialog title="有尚未保存的内容" className="small-dialog" onClose={() => setConfirmLogout(false)}><div className="dialog-content"><p>空间或定时任务中还有未保存的修改。退出登录会丢弃这些修改。</p></div><div className="dialog-footer"><button className="secondary-button" onClick={() => { setConfirmLogout(false); navigateSurface(spacesDirty ? 'spaces' : 'automations'); }}>返回编辑</button><button className="danger-button" onClick={() => void requestLogout(true)}>放弃修改并退出</button></div></Dialog>}
    {settingsOpen && <div className="settings-overlay">
      <div className="settings-host" hidden={profileOpen}>
        <SettingsPage usage={usageDemo} onSaveUsage={saveUsageDemo} user={user} preferences={preferences} setPreferences={setPreferences} key={settingsDestination.revision} state={state} setState={setState} initialTab={settingsDestination.tab}
          suspended={profileOpen} onOpenProfile={() => setProfileOpen(true)} onClose={closeSettings}
          onLogout={() => void requestLogout()} />
      </div>
      {profileOpen && <ProfilePage profile={profile} onChange={setProfile} onBack={closeProfile} demo={profileDemo} onSaveDemo={saveProfileDemo}
        onInvite={() => setInfoDialog('invite')}
        onCreateWebsite={() => {
          if (state.activeThreadId !== null) nextComposerDraft.current = '帮我创建一个网站';
          newChat(); setProfileOpen(false); if (state.activeThreadId === null) setDraft('帮我创建一个网站');
        }} />}
    </div>}
    {miniOpen && <MiniPreview text={miniDraft} onTextChange={setMiniDraft} onClose={() => setMiniOpen(false)} onExpand={text => { setMiniOpen(false); setMiniDraft(''); setSettingsOpen(false); if (text.trim()) setDraft(previous => [previous, text].filter(Boolean).join('\n')); requestAnimationFrame(() => composerRef.current?.focus()); }} />}
    {infoDialog && <Dialog title={infoDialog === 'invite' ? '邀请好友' : infoDialog === 'help' ? '帮助中心' : '关于 Codex'} className="small-dialog" onClose={() => setInfoDialog(null)}>
      <div className="dialog-content account-info-content">
        {infoDialog === 'invite' ? <><p>与好友一起开始构建。</p><small>邀请服务尚未连接，暂时无法生成邀请码。</small></>
          : infoDialog === 'help' ? <><p>管理对话、调整设置和使用工作区面板。</p><button className="secondary-button" onClick={() => { setInfoDialog(null); openSettings('shortcuts'); }}>查看键盘快捷键</button><small>账号已启用；AI、云端服务及系统集成尚未连接。</small></>
          : <><p>Codex</p><small>适用于 macOS 的桌面客户端。</small></>}

      </div>
    </Dialog>}
    {logoutWarning && <Dialog title="更改尚未保存" className="small-dialog" onClose={() => setLogoutWarning('')}><div className="dialog-content"><p>{logoutWarning}</p><p>继续退出可能丢失本次未保存的更改。此前已保存的数据会保留。</p></div><div className="dialog-footer"><button className="secondary-button" onClick={() => setLogoutWarning('')}>继续编辑</button><button className="primary-button" onClick={() => { setLogoutWarning(''); void onLogout(); }}>仍然退出</button></div></Dialog>}
    {(saveError || notice) && <div className="workspace-auth-notice" role={saveError ? 'alert' : 'status'}><span>{saveError || notice}</span>{saveError && <button onClick={() => void persist().then(result => setSaveError(result.ok ? '' : result.error))}>重试保存</button>}</div>}
    {(removedProject || projectError && !editingProject && !projectConfirm && !sectionDialog) && <div className="project-result" role={projectError ? 'alert' : 'status'}><span>{projectError || `已移除“${removedProject!.project.name}”，聊天已保留。`}</span>{removedProject && <button disabled={projectSaving} onClick={() => void undoProjectRemoval()}>撤销移除</button>}<IconButton label="关闭项目操作结果" onClick={() => { setRemovedProject(null); setProjectError(''); }}><X size={14} /></IconButton></div>}
    {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
  </div>;
}
