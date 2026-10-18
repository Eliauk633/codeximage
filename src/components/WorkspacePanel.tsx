import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, FileCode2, FileText, Files, Folder, FolderOpen, GitCompareArrows, Globe, RotateCw, Save, Terminal, X } from 'lucide-react'
import './panels.css'

type Panel = 'files' | 'diff' | 'terminal' | 'browser'

const PANEL_META = {
  files: { title: '文件', Icon: Files },
  diff: { title: '更改', Icon: GitCompareArrows },
  terminal: { title: '终端', Icon: Terminal },
  browser: { title: '浏览器', Icon: Globe },
}

const DEMO_FILES: Record<string, string> = {
  'src/App.tsx': `export default function App() {
  return (
    <main className="workspace">
      <p className="eyebrow">YOUR WORKSPACE</p>
      <h1>Make room for what’s next.</h1>
      <p>A calm place to build your next idea.</p>
    </main>
  )
}
`,
  'src/styles.css': `:root {
  font-family: -apple-system, sans-serif;
  color: #242424;
  background: #f7f5ef;
}

.workspace {
  max-width: 720px;
  margin: 0 auto;
  padding: 64px 32px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
}
`,
  'README.md': `# Studio workspace

一个用于探索想法的项目。

## 项目内容

- 简洁的欢迎页面
- 可编辑的文件
- 作品预览

这里的修改只保留在本次面板会话中。
`,
  'package.json': `{
  "name": "studio-workspace",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "vite"
  }
}
`,
}

function FilePanel() {
  const [saved, setSaved] = useState(DEMO_FILES)
  const [drafts, setDrafts] = useState(DEMO_FILES)
  const [selected, setSelected] = useState('src/App.tsx')
  const [expanded, setExpanded] = useState(true)
  const [notice, setNotice] = useState('修改仅保留在本次会话')
  const gutterRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const content = drafts[selected]
  const dirty = content !== saved[selected]

  function saveFile() {
    if (!dirty) return
    setSaved(previous => ({ ...previous, [selected]: content }))
    setNotice(`${selected.split('/').pop()} 已保存到本次会话`)
  }

  function selectFile(path: string) {
    setSelected(path)
    setNotice('修改仅保留在本次会话')
    if (editorRef.current) editorRef.current.scrollTop = 0
    if (gutterRef.current) gutterRef.current.scrollTop = 0
  }

  function editorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      saveFile()
    }
  }

  function fileButton(path: string, nested = false) {
    const Icon = path.endsWith('.md') ? FileText : FileCode2
    return (
      <button key={path} className={`wp-file-row ${nested ? 'wp-file-nested' : ''} ${selected === path ? 'is-selected' : ''}`} onClick={() => selectFile(path)} aria-pressed={selected === path} title={path}>
        <Icon size={14} /><span>{path.split('/').pop()}</span>
        {drafts[path] !== saved[path] && <span className="wp-dirty-dot" aria-label="有未保存更改" />}
      </button>
    )
  }

  return (
    <>
      <nav className="wp-file-tree" aria-label="文件">
        <div className="wp-tree-label"><FolderOpen size={14} /><span>studio-workspace</span><span className="wp-faint">4 个文件</span></div>
        <button className="wp-file-row wp-folder-row" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Folder size={14} /><span>src</span>
        </button>
        {expanded && Object.keys(DEMO_FILES).filter(path => path.startsWith('src/')).map(path => fileButton(path, true))}
        {Object.keys(DEMO_FILES).filter(path => !path.startsWith('src/')).map(path => fileButton(path))}
      </nav>
      <div className="wp-editor-toolbar">
        <span className="wp-editor-path"><FileCode2 size={14} />{selected}{dirty && <span className="wp-dirty-dot" aria-label="未保存" />}</span>
        <button className="wp-text-button" disabled={!dirty} onClick={saveFile} title="保存到本次会话（⌘S / Ctrl+S）"><Save size={13} />保存</button>
      </div>
      <div className="wp-editor">
        <div ref={gutterRef} className="wp-line-gutter" aria-hidden="true">{content.split('\n').map((_, index) => <div key={index}>{index + 1}</div>)}</div>
        <textarea ref={editorRef} className="wp-code-editor" aria-label={`编辑 ${selected}`} spellCheck={false} value={content} onChange={event => { setDrafts(previous => ({ ...previous, [selected]: event.target.value })); setNotice('有未保存的更改') }} onKeyDown={editorKeyDown} onScroll={event => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop }} wrap="off" />
      </div>
      <div className="wp-status" role="status"><span>{notice}</span><span>UTF-8</span></div>
    </>
  )
}

const DIFF_LINES = [
  { old: '1', next: '1', kind: 'context', code: 'export default function App() {' },
  { old: '2', next: '2', kind: 'context', code: '  return (' },
  { old: '3', next: '', kind: 'remove', code: '    <main>' },
  { old: '4', next: '', kind: 'remove', code: '      <h1>Hello world</h1>' },
  { old: '', next: '3', kind: 'add', code: '    <main className="workspace">' },
  { old: '', next: '4', kind: 'add', code: '      <p className="eyebrow">YOUR WORKSPACE</p>' },
  { old: '', next: '5', kind: 'add', code: '      <h1>Make room for what’s next.</h1>' },
  { old: '', next: '6', kind: 'add', code: '      <p>A calm place to build your next idea.</p>' },
  { old: '5', next: '7', kind: 'context', code: '    </main>' },
  { old: '6', next: '8', kind: 'context', code: '  )' },
  { old: '7', next: '9', kind: 'context', code: '}' },
]

function DiffPanel() {
  const [staged, setStaged] = useState(false)
  return (
    <>
      <div className="wp-change-summary"><span>1 个文件已更改</span><span className="wp-diff-count"><b>+4</b><i>−2</i></span></div>
      <div className="wp-diff-file-header">
        <span><FileCode2 size={14} />src/App.tsx <span className="wp-change-mark">M</span></span>
        <button className={`wp-text-button ${staged ? 'wp-staged' : ''}`} onClick={() => setStaged(!staged)}>{staged && <Check size={13} />}{staged ? '取消暂存' : '暂存文件'}</button>
      </div>
      <div className="wp-diff-scroll" aria-label="文件差异">
        <div className="wp-diff-meta">diff --git a/src/App.tsx b/src/App.tsx<br />--- a/src/App.tsx<br />+++ b/src/App.tsx</div>
        <div className="wp-diff-hunk">@@ -1,7 +1,9 @@</div>
        {DIFF_LINES.map((line, index) => <div key={index} className={`wp-diff-line wp-diff-${line.kind}`}><span className="wp-diff-number">{line.old}</span><span className="wp-diff-number">{line.next}</span><span className="wp-diff-sign">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span><code>{line.code}</code></div>)}
        <div className="wp-diff-note"><GitCompareArrows size={17} /><p>让每一处改动都清楚可见。<span>此处显示独立的变更内容，不关联文件面板中的编辑。</span></p></div>
      </div>
      <div className="wp-status" role="status"><span>{staged ? '已标记暂存 · Git 未连接' : 'Git 未连接'}</span><span>{staged ? '已标记' : '未标记'}</span></div>
    </>
  )
}

const COMMAND_OUTPUTS: Record<string, string> = {
  help: '可用命令\n  help          查看可用命令\n  pwd           显示工作区路径\n  ls            列出文件\n  git status    查看 Git 状态\n  npm run dev   显示预置启动输出\n  clear         清空屏幕\n\n↑ / ↓ 浏览输入历史。所有输出均为预置内容。',
  pwd: '/workspace/studio-workspace',
  ls: 'src/\nREADME.md\npackage.json',
  'ls -la': 'drwxr-xr-x  src/\n-rw-r--r--  README.md\n-rw-r--r--  package.json\n\n[工作区文件列表]',
  'git status': 'On branch main\nChanges not staged for commit:\n  modified: src/App.tsx\n\n[预置状态，不读取实际仓库]',
  'npm run dev': '> studio-workspace dev\n> vite\n\n  VITE  ready in 180 ms\n\n  Preview: preview://studio\n\n[服务未连接]',
}

type TerminalEntry = { id: number; command?: string; output: string }

function TerminalPanel({ active }: { active: boolean }) {
  const [entries, setEntries] = useState<TerminalEntry[]>([{ id: 0, output: '系统终端尚未连接。\n输入 help 查看可用命令。' }])
  const [command, setCommand] = useState('')
  const [recall, setRecall] = useState<string[]>([])
  const [recallIndex, setRecallIndex] = useState(-1)
  const nextId = useRef(1)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight }, [entries, active])

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = command.trim().replace(/\s+/g, ' ')
    if (!value) return
    setRecall(previous => [...previous, value].slice(-50))
    setRecallIndex(-1)
    setCommand('')
    if (value === 'clear') { setEntries([]); return }
    const output = COMMAND_OUTPUTS[value] ?? `未执行「${value}」。\n此面板仅支持预置命令，输入 help 查看列表。`
    const entry = { id: nextId.current++, command: value, output }
    setEntries(previous => [...previous.slice(-99), entry])
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); setEntries([]); return }
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || recall.length === 0) return
    event.preventDefault()
    const next = event.key === 'ArrowUp' ? (recallIndex === -1 ? recall.length - 1 : Math.max(0, recallIndex - 1)) : (recallIndex === -1 || recallIndex >= recall.length - 1 ? -1 : recallIndex + 1)
    setRecallIndex(next)
    setCommand(next === -1 ? '' : recall[next])
  }

  return (
    <>
      <div className="wp-terminal-tab"><Terminal size={13} /><span>studio-workspace</span><span className="wp-faint">预置命令</span><button className="wp-icon-button" title="清空终端" aria-label="清空终端" onClick={() => { setEntries([]); inputRef.current?.focus() }}><RotateCw size={13} /></button></div>
      <div className="wp-terminal-output" ref={outputRef} role="log" aria-label="终端输出" aria-live="polite">
        {entries.map(entry => <div className="wp-terminal-entry" key={entry.id}>{entry.command && <div className="wp-terminal-command"><span>studio-workspace</span><b>❯</b>{entry.command}</div>}<pre>{entry.output}</pre></div>)}
        {entries.length === 0 && <div className="wp-terminal-cleared">屏幕已清空。输入 help 查看命令。</div>}
      </div>
      <form className="wp-terminal-input-row" onSubmit={submit}><span aria-hidden="true">❯</span><input ref={inputRef} aria-label="终端命令" autoComplete="off" spellCheck={false} placeholder="输入命令…" value={command} onChange={event => { setCommand(event.target.value); setRecallIndex(-1) }} onKeyDown={keyDown} /><button className="wp-text-button" type="submit" disabled={!command.trim()}>运行</button></form>
      <div className="wp-status"><span>系统终端未连接</span><span>↑ ↓ 历史</span></div>
    </>
  )
}

const PREVIEW_HOME = 'preview://studio'
const PREVIEW_PAGES = [PREVIEW_HOME, `${PREVIEW_HOME}/projects`, `${PREVIEW_HOME}/about`]

function BrowserPanel() {
  const [history, setHistory] = useState([PREVIEW_HOME])
  const [position, setPosition] = useState(0)
  const [address, setAddress] = useState(PREVIEW_HOME)
  const [notice, setNotice] = useState('作品预览')
  const [refreshCount, setRefreshCount] = useState(0)
  const current = history[position]
  const knownPage = PREVIEW_PAGES.includes(current)

  function navigate(target: string) {
    const url = target.trim().replace(/\/$/, '')
    if (!url) { setNotice('请输入预览地址'); return }
    if (url !== current) { setHistory(previous => [...previous.slice(0, position + 1), url]); setPosition(position + 1) }
    setAddress(url)
    setNotice(PREVIEW_PAGES.includes(url) ? '已打开预览' : '此地址没有预置页面')
  }

  function move(delta: number) {
    const next = position + delta
    if (next < 0 || next >= history.length) return
    setPosition(next)
    setAddress(history[next])
    setNotice('已切换预览页面')
  }

  function refresh() {
    setRefreshCount(previous => previous + 1)
    setAddress(current)
    setNotice(`预览已刷新 · 第 ${refreshCount + 1} 次`)
  }

  return (
    <>
      <div className="wp-browser-toolbar">
        <button className="wp-icon-button" aria-label="后退" title="后退" disabled={position === 0} onClick={() => move(-1)}><ArrowLeft size={15} /></button>
        <button className="wp-icon-button" aria-label="前进" title="前进" disabled={position === history.length - 1} onClick={() => move(1)}><ArrowRight size={15} /></button>
        <button className="wp-icon-button" aria-label="刷新预览" title="刷新预览" onClick={refresh}><RotateCw size={14} /></button>
        <form className="wp-address-form" onSubmit={event => { event.preventDefault(); navigate(address) }}><Globe size={13} /><input aria-label="预览地址" value={address} onChange={event => setAddress(event.target.value)} spellCheck={false} autoComplete="off" /></form>
      </div>
      <div className="wp-browser-content">
        {knownPage ? <div className="wp-site-preview">
          <div className="wp-site-nav"><button className="wp-site-wordmark" onClick={() => navigate(PREVIEW_HOME)}>studio<span>®</span></button><div><button className={current.endsWith('/projects') ? 'active' : ''} onClick={() => navigate(`${PREVIEW_HOME}/projects`)}>作品</button><button className={current.endsWith('/about') ? 'active' : ''} onClick={() => navigate(`${PREVIEW_HOME}/about`)}>关于</button></div></div>
          {current === PREVIEW_HOME && <><div className="wp-site-hero"><span className="wp-site-eyebrow"><i /> IDEAS INTO SOMETHING REAL</span><h2>为下一个想法，<br /><em>留一点空间。</em></h2><p>从一个简单的念头开始。<br />把灵感变成可以触摸的作品。</p><button className="wp-site-cta" onClick={() => navigate(`${PREVIEW_HOME}/projects`)}>看看作品 <ArrowRight size={15} /></button></div><div className="wp-site-art" aria-label="抽象几何插画"><div className="wp-art-orbit" /><div className="wp-art-circle" /><div className="wp-art-arch" /><span>LESS, BUT BETTER.</span></div><div className="wp-site-footnote"><span>独立思考 · 用心创造</span><span>01 — 03</span></div></>}
          {current.endsWith('/projects') && <div className="wp-site-inner"><span className="wp-site-eyebrow">SELECTED WORK</span><h2>一些小小的<br /><em>新可能。</em></h2><button className="wp-project-card" onClick={() => navigate(`${PREVIEW_HOME}/about`)}><div className="wp-project-art"><span>↗</span></div><span><strong>一个安静的工作空间</strong><small>产品设计 / 2026</small></span><ArrowRight size={17} /></button><button className="wp-site-back" onClick={() => navigate(PREVIEW_HOME)}>返回首页 <ArrowLeft size={14} /></button></div>}
          {current.endsWith('/about') && <div className="wp-site-inner"><span className="wp-site-eyebrow">A LITTLE ABOUT STUDIO</span><h2>好的设计，<br /><em>从好奇开始。</em></h2><p className="wp-site-about">我们相信，简单的界面可以承载丰富的想法。这个作品记录了一次从留白、文字到细节的探索。</p><div className="wp-site-about-note">从想法到作品。<br />探索设计的每一个细节。</div><button className="wp-site-cta" onClick={() => navigate(`${PREVIEW_HOME}/projects`)}>浏览作品 <ArrowRight size={15} /></button></div>}
        </div> : <div className="wp-browser-unavailable"><Globe size={31} strokeWidth={1.4} /><h3>这里还没有预览</h3><p>此浏览器只显示预置作品。<br />可以返回首页继续浏览。</p><button className="wp-text-button" onClick={() => navigate(PREVIEW_HOME)}>打开首页 <ArrowRight size={14} /></button></div>}
      </div>
      <div className="wp-status" role="status"><span>{notice}</span><span>无网络请求</span></div>
    </>
  )
}

export function WorkspacePanel({ panel, onClose }: { panel: Panel; onClose: () => void }) {
  const { title, Icon } = PANEL_META[panel]
  return (
    <aside className="workspace-panel" aria-label={`${title}面板`}>
      <header className="wp-header"><Icon size={15} /><span className="wp-panel-title">{title}</span><button className="wp-icon-button wp-close" aria-label={`关闭${title}面板`} title="关闭面板" onClick={onClose}><X size={16} /></button></header>
      <section className="wp-panel-body" hidden={panel !== 'files'}><FilePanel /></section>
      <section className="wp-panel-body" hidden={panel !== 'diff'}><DiffPanel /></section>
      <section className="wp-panel-body" hidden={panel !== 'terminal'}><TerminalPanel active={panel === 'terminal'} /></section>
      <section className="wp-panel-body" hidden={panel !== 'browser'}><BrowserPanel /></section>
    </aside>
  )
}
