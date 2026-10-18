const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, safeStorage, nativeImage } = require('electron');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { createAIClient } = require('./ai-client.cjs');
const { readLocalConfig } = require('../scripts/local-config.cjs');

const DEV_URL = 'http://127.0.0.1:5187';
const MAX_COPY_TEXT_LENGTH = 1_000_000;
const distDirectory = path.join(__dirname, '..', 'dist');
const indexFile = path.join(distDirectory, 'index.html');
const useDevServer = !app.isPackaged && process.env.CODEX_STUDIO_DEV_URL === DEV_URL;
const isMac = process.platform === 'darwin';
let appIcon;
let mainWindow;
let authStore;
let authQueue = Promise.resolve();
let aiGeneration = 0;
let aiSessionOwner = null;
let aiWindowClosing = false;
const aiConfig = readLocalConfig(['CODEX_STUDIO_AI_URL', 'CODEX_STUDIO_AI_TOKEN']);
const aiClient = createAIClient({
  baseUrl: aiConfig.CODEX_STUDIO_AI_URL || 'http://127.0.0.1:8787',
  token: aiConfig.CODEX_STUDIO_AI_TOKEN,
  isCurrent: binding => Boolean(mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()
    && !aiWindowClosing && binding.webContentsId === mainWindow.webContents.id
    && binding.generation === aiGeneration && binding.ownerId === aiSessionOwner),
  onEvent: event => mainWindow.webContents.send('ai:event', event),
});

function invalidateAI() {
  aiGeneration += 1;
  aiSessionOwner = null;
  aiClient.cancelAll();
}

function syncAIUser(result) {
  const owner = result?.ok && result.user ? result.user.id : null;
  if (owner !== aiSessionOwner) {
    if (!owner && aiSessionOwner) aiClient.cancelAll('UNAUTHENTICATED');
    invalidateAI(); aiSessionOwner = owner;
  }
}

const aiSessionCheck = setInterval(() => {
  if (!aiClient.hasActiveRequests() || !authStore) return;
  const generation = aiGeneration;
  const task = authQueue.then(async () => {
    if (generation !== aiGeneration || !aiClient.hasActiveRequests()) return;
    try {
      const current = await authStore.getSession();
      if (generation === aiGeneration) syncAIUser(current);
    } catch {
      if (generation === aiGeneration) syncAIUser(null);
    }
  });
  authQueue = task.catch(() => undefined);
}, 15_000);
aiSessionCheck.unref();

app.setName('Codex');
const userData = path.resolve(process.env.CODEX_STUDIO_USER_DATA || path.join(app.getPath('appData'), 'codex-studio-prototype'));
if (/(?:^|[/\\])(?:Applications|ChatGPT(?:\.app)?|Codex(?:\.app)?|com\.openai\.[^/\\]*)(?:[/\\]|$)/i.test(userData)) {
  throw new Error('CODEX_STUDIO_USER_DATA must use an independent prototype directory.');
}
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.setPath('sessionData', userData);
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
});

function isRendererUrl(value) {
  try {
    const url = new URL(value);
    if (useDevServer) return url.origin === DEV_URL;
    url.hash = '';
    url.search = '';
    return url.href === pathToFileURL(indexFile).href;
  } catch {
    return false;
  }
}

function trustedWindow(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const contents = mainWindow.webContents;
  return event.sender === contents && event.senderFrame === contents.mainFrame && isRendererUrl(event.senderFrame.url)
    ? mainWindow
    : null;
}

for (const operation of ['register', 'login', 'session', 'logout', 'workspace-load', 'workspace-save']) {
  ipcMain.handle(`auth:${operation}`, (event, input) => {
    // Keep account changes and workspace writes in order; stale views cannot write into another account.
    const task = authQueue.then(async () => {
      if (!trustedWindow(event)) return { ok: false, error: '请求来源无效。', code: 'UNTRUSTED' };
      if (!authStore) return { ok: false, error: '账号存储不可用，请重新启动客户端。', code: 'UNAVAILABLE' };
      try {
        if (operation === 'session') {
          const result = await authStore.getSession(); syncAIUser(result); return result;
        }
        if (operation === 'logout' || operation === 'login') {
          invalidateAI();
          const result = await authStore[operation](input);
          if (operation === 'login' && result.ok) syncAIUser(result);
          return result;
        }
        if (operation === 'register') return await authStore.register(input);
        const current = await authStore.getSession();
        syncAIUser(current);
        if (!current.ok) return current;
        if (!current.user || current.user.id !== input?.ownerId) return { ok: false, error: '登录已失效，请重新登录。', code: 'UNAUTHENTICATED' };
        return operation === 'workspace-load' ? await authStore.loadWorkspace() : await authStore.saveWorkspace(input?.data);
      } catch {
        return { ok: false, error: '账号操作未完成，请重试。', code: 'STORAGE_ERROR' };
      }
    });
    authQueue = task.catch(() => undefined);
    return task;
  });
}

for (const operation of ['status', 'start', 'cancel']) {
  ipcMain.handle(`ai:${operation}`, (event, input) => {
    const receivedGeneration = aiGeneration;
    const task = authQueue.then(async () => {
      if (!trustedWindow(event)) return { ok: false, error: '请求来源无效。', code: 'UNTRUSTED' };
      if (!authStore || aiWindowClosing || quitting || receivedGeneration !== aiGeneration) return { ok: false, error: '登录或窗口已变化，请重试。', code: 'UNAUTHENTICATED' };
      try {
        const current = await authStore.getSession();
        if (receivedGeneration !== aiGeneration || !trustedWindow(event)) return { ok: false, error: '登录或窗口已变化，请重试。', code: 'UNAUTHENTICATED' };
        syncAIUser(current);
        if (!current.ok || !current.user || (operation !== 'status' && input?.ownerId !== current.user.id)) return { ok: false, error: '登录已失效，请重新登录。', code: 'UNAUTHENTICATED' };
        if (operation === 'status') return aiClient.status();
        const binding = { ownerId: current.user.id, generation: aiGeneration, webContentsId: event.sender.id };
        // start accepts immediately; network streaming never holds the authentication/write queue.
        return aiClient[operation](input, binding);
      } catch { return { ok: false, error: 'AI 服务请求未完成，请重试。', code: 'UNAVAILABLE' }; }
    });
    authQueue = task.catch(() => undefined);
    return task;
  });
}

function sendAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(action);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('desktop:action', action);
}

function installMenu() {
  const settings = { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => sendAction('settings') };
  const template = [
    ...(isMac ? [{ label: 'Codex', submenu: [
      { role: 'about', label: '关于 Codex' },
      { type: 'separator' }, settings, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit', label: '退出 Codex' },
    ] }] : []),
    { label: '文件', submenu: [
      { label: '新建对话', accelerator: 'CmdOrCtrl+N', click: () => sendAction('new-thread') },
      { label: '搜索对话', accelerator: 'CmdOrCtrl+K', click: () => sendAction('search') },
      ...(!isMac ? [settings] : []),
      { type: 'separator' }, { role: isMac ? 'close' : 'quit' },
    ] },
    { label: '编辑', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: '显示', submenu: [
      { label: '切换侧栏', accelerator: 'CmdOrCtrl+B', click: () => sendAction('toggle-sidebar') },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' }] : [])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(initialAction) {
  const window = new BrowserWindow({
    title: 'Codex',
    icon: appIcon,
    width: 1440, height: 920, minWidth: 900, minHeight: 640,
    show: false,
    backgroundColor: isMac ? '#00000000' : '#f7f7f7',
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 }, vibrancy: 'sidebar', visualEffectState: 'followWindow' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, webviewTag: false, navigateOnDragDrop: false,
    },
  });
  mainWindow = window;
  aiWindowClosing = false;
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) invalidateAI();
  });
  window.webContents.on('render-process-gone', () => invalidateAI());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  let closing = false;
  window.on('close', event => {
    if (closing || quitting) return;
    event.preventDefault();
    aiWindowClosing = true;
    invalidateAI();
    // Complete writes already received from this window before removing its trusted frame.
    void authQueue.finally(() => setImmediate(() => {
      if (window.isDestroyed()) return;
      closing = true; window.close();
    }));
  });
  if (initialAction) window.webContents.once('did-finish-load', () => window.webContents.send('desktop:action', initialAction));
  window.on('closed', () => { if (mainWindow === window) { invalidateAI(); mainWindow = null; } });
  const loading = useDevServer ? window.loadURL(DEV_URL) : window.loadFile(indexFile);
  loading.catch(() => {
    dialog.showErrorBox('Codex 无法启动', useDevServer
      ? '无法连接本项目的开发服务，请使用 npm run dev 启动。'
      : '找不到可用的页面构建，请先运行 npm run build。');
    app.quit();
  });
  return window;
}

ipcMain.handle('desktop:pick-project', async event => {
  const window = trustedWindow(event);
  if (!window) return null;
  const result = await dialog.showOpenDialog(window, {
    title: '选择项目文件夹', buttonLabel: '选择项目', properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selectedPath = result.filePaths[0];
  return { name: path.basename(selectedPath) || selectedPath, path: selectedPath };
});

ipcMain.handle('desktop:copy-text', async (event, text) => {
  if (!trustedWindow(event)) throw new Error('Clipboard request denied.');
  if (typeof text !== 'string' || text.length > MAX_COPY_TEXT_LENGTH) {
    throw new TypeError('Copy text must be a string of at most 1000000 characters.');
  }
  await clipboard.writeText(text);
});

for (const action of ['minimize', 'maximize', 'close']) {
  ipcMain.on(`desktop:${action}`, event => {
    const window = trustedWindow(event);
    if (!window) return;
    if (action === 'maximize' && window.isMaximized()) window.unmaximize();
    else window[action]();
  });
}

app.whenReady().then(() => {
  if (!primaryInstance) return;
  // Load the community icon; no original application artwork is distributed.
  appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'app-icon.png'));
  if (isMac && !appIcon.isEmpty()) app.dock.setIcon(appIcon);
  try {
    const { createAuthStore } = require('./auth-store.cjs');
    authStore = createAuthStore({
      directory: path.join(userData, 'accounts'),
      encryptString: value => safeStorage.encryptString(value),
      decryptString: value => safeStorage.decryptString(value),
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    });
  } catch { /* The login screen reports storage unavailability without exposing local paths or secrets. */ }
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', event => event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed = ['data:', 'blob:'].includes(url.protocol);
      if (useDevServer && ['http:', 'ws:'].includes(url.protocol)) {
        allowed = url.hostname === '127.0.0.1' && url.port === '5187';
      } else if (url.protocol === 'file:') {
        const relative = path.relative(distDirectory, fileURLToPath(url));
        allowed = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      }
    } catch { /* Invalid request URLs are denied. */ }
    callback({ cancel: !allowed });
  });
  installMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });

let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  aiWindowClosing = true;
  invalidateAI();
  void authQueue.finally(() => setImmediate(() => { quitting = true; app.quit(); }));
});
app.on('will-quit', () => {
  clearInterval(aiSessionCheck);
  try { authStore?.close(); } catch { /* SQLite is already closing. */ }
});
