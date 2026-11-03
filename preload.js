const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tv', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  connect: (host, cert) => ipcRenderer.invoke('remote:connect', { host, cert }),
  disconnect: () => ipcRenderer.invoke('remote:disconnect'),
  sendCode: (code) => ipcRenderer.invoke('remote:sendCode', code),
  sendKey: (key, direction) => ipcRenderer.invoke('remote:sendKey', { key, direction }),
  sendPower: () => ipcRenderer.invoke('remote:sendPower'),
  sendAppLink: (link) => ipcRenderer.invoke('remote:sendAppLink', link),
  scanNetwork: (subnet) => ipcRenderer.invoke('net:scan', { subnet }),
  getKeyCodes: () => ipcRenderer.invoke('remote:keyCodes'),
  on: (channel, cb) => {
    const allowed = ['remote:secret', 'remote:ready', 'remote:powered', 'remote:volume',
      'remote:current_app', 'remote:unpaired', 'remote:error', 'remote:disconnected',
      'net:scanProgress'];
    if (allowed.includes(channel)) {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  }
});
