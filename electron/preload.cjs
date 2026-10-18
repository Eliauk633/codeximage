const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['new-thread', 'search', 'settings', 'toggle-sidebar']);
const listeners = new Set();
let pendingAction;

ipcRenderer.on('desktop:action', (_event, action) => {
  if (!actions.has(action)) return;
  if (listeners.size === 0) pendingAction = action;
  else for (const callback of listeners) callback(action);
});

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  auth: {
    register: input => ipcRenderer.invoke('auth:register', input),
    login: input => ipcRenderer.invoke('auth:login', input),
    getSession: () => ipcRenderer.invoke('auth:session'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    loadWorkspace: ownerId => ipcRenderer.invoke('auth:workspace-load', { ownerId }),
    saveWorkspace: (ownerId, data) => ipcRenderer.invoke('auth:workspace-save', { ownerId, data }),
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    start: input => ipcRenderer.invoke('ai:start', input),
    cancel: input => ipcRenderer.invoke('ai:cancel', input),
    onEvent(callback) {
      if (typeof callback !== 'function') throw new TypeError('onEvent requires a function.');
      const listener = (_event, value) => {
        if (!value || typeof value.ownerId !== 'string' || typeof value.requestId !== 'string' || typeof value.threadId !== 'string'
          || !['delta', 'done', 'error', 'cancelled'].includes(value.type)) return;
        callback(value);
      };
      ipcRenderer.on('ai:event', listener);
      return () => ipcRenderer.removeListener('ai:event', listener);
    },
  },
  onAction(callback) {
    if (typeof callback !== 'function') throw new TypeError('onAction requires a function.');
    listeners.add(callback);
    if (pendingAction) {
      const action = pendingAction;
      pendingAction = undefined;
      callback(action);
    }
    return () => listeners.delete(callback);
  },
  pickProject: () => ipcRenderer.invoke('desktop:pick-project'),
  copyText: text => ipcRenderer.invoke('desktop:copy-text', text),
  minimize: () => ipcRenderer.send('desktop:minimize'),
  maximize: () => ipcRenderer.send('desktop:maximize'),
  close: () => ipcRenderer.send('desktop:close'),
});
