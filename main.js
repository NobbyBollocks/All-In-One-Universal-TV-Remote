const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { AndroidRemote, RemoteKeyCode, RemoteDirection } = require('androidtv-remote');

let mainWindow = null;
let remote = null;          // AndroidRemote instance (android mode)
let vestelHost = null;      // host in vestel mode
let mode = null;            // 'android' | 'vestel'
let configPath = null;

const VESTEL_CODES = {
  KEYCODE_POWER: 1012,
  KEYCODE_INFO: 1018,
  KEYCODE_SETTINGS: 1067,
  KEYCODE_DPAD_UP: 1020,
  KEYCODE_DPAD_DOWN: 1019,
  KEYCODE_DPAD_LEFT: 1021,
  KEYCODE_DPAD_RIGHT: 1022,
  KEYCODE_DPAD_CENTER: 1053,
  KEYCODE_BACK: 1010,
  KEYCODE_HOME: 1046,
  KEYCODE_MENU: 1048,
  KEYCODE_VOLUME_UP: 1016,
  KEYCODE_VOLUME_DOWN: 1017,
  KEYCODE_VOLUME_MUTE: 1013,
  KEYCODE_CHANNEL_UP: 1032,
  KEYCODE_CHANNEL_DOWN: 1033,
  KEYCODE_TV_INPUT: 1056,
  KEYCODE_MEDIA_REWIND: 1027,
  KEYCODE_MEDIA_FAST_FORWARD: 1028,
  KEYCODE_MEDIA_PLAY: 1025,
  KEYCODE_MEDIA_PAUSE: 1049,
  KEYCODE_MEDIA_STOP: 1024,
  KEYCODE_0: 1000, KEYCODE_1: 1001, KEYCODE_2: 1002, KEYCODE_3: 1003,
  KEYCODE_4: 1004, KEYCODE_5: 1005, KEYCODE_6: 1006, KEYCODE_7: 1007,
  KEYCODE_8: 1008, KEYCODE_9: 1009,
  KEYCODE_RED: 1055, KEYCODE_GREEN: 1054, KEYCODE_YELLOW: 1050, KEYCODE_BLUE: 1052,
  KEYCODE_GUIDE: 1047, KEYCODE_EPG: 1047
};

function getConfigPath() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'config.json');
  return configPath;
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('saveConfig', e);
  }
}

function getLogPath() { return path.join(app.getPath('userData'), 'app.log'); }
function log(msg) {
  try { fs.appendFileSync(getLogPath(), new Date().toISOString() + ' ' + msg + '\n'); } catch (e) {}
  console.log(msg);
}
function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function portOpen(host, port, timeoutMs) {
  timeoutMs = timeoutMs || 400;
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

function sendVestel(host, code) {
  return new Promise((resolve, reject) => {
    const body = '<remote><key code=' + code + '/></remote>';
    const req = http.request({
      hostname: host,
      port: 56789,
      path: '/apps/SmartCenter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(true));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 760,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'TV Remote'
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (remote) { try { remote.stop(); } catch (e) {} remote = null; }
  vestelHost = null; mode = null;
  if (process.platform !== 'darwin') app.quit();
});

// IPC: get config
ipcMain.handle('config:get', async () => loadConfig());

ipcMain.handle('config:save', async (_e, cfg) => {
  const cur = loadConfig();
  saveConfig(Object.assign(cur, cfg));
  return true;
});

// Connect
ipcMain.handle('remote:connect', async (_e, { host, cert }) => {
  try {
    log('connect to ' + host);
    if (remote) { try { remote.stop(); } catch (e) {} remote = null; }
    vestelHost = null; mode = null;

    // Prefer Vestel SmartCenter if its port answers
    const vestelOpenFirst = await portOpen(host, 56789);
    if (vestelOpenFirst) {
      vestelHost = host;
      mode = 'vestel';
      const cfg = loadConfig();
      cfg.host = host;
      cfg.mode = 'vestel';
      delete cfg.cert;
      saveConfig(cfg);
      send('remote:ready', { vestel: true });
      return { ok: true };
    }

    // Otherwise try Android TV if its port answers
    const androidOpen = (await portOpen(host, 6467)) || (await portOpen(host, 6466));
    if (androidOpen) {
      remote = new AndroidRemote(host, {
        pairing_port: 6467,
        remote_port: 6466,
        name: 'PC TV Remote',
        service_name: 'PC TV Remote',
        cert: cert || {}
      });

      remote.on('secret', () => send('remote:secret'));
      remote.on('ready', () => {
        const c = remote.getCertificate();
        const cfg = loadConfig();
        cfg.host = host;
        cfg.mode = 'android';
        cfg.cert = c;
        saveConfig(cfg);
        send('remote:ready', { cert: c, vestel: false });
      });
      remote.on('powered', (powered) => send('remote:powered', powered));
      remote.on('volume', (volume) => send('remote:volume', volume));
      remote.on('current_app', (app) => send('remote:current_app', app));
      remote.on('unpaired', () => {
        const cfg = loadConfig();
        delete cfg.cert;
        saveConfig(cfg);
        send('remote:unpaired');
      });
      remote.on('error', (err) => send('remote:error', err));

      const started = await remote.start();
      if (!started) {
        remote = null;
        return { ok: false, error: 'connection failed' };
      }
      if (remote && remote.remoteManager) {
        remote.remoteManager.on('error', (err) => send('remote:error', err));
      }
      mode = 'android';
      return { ok: true };
    }

    return { ok: false, error: 'no supported TV found on this host' };
  } catch (err) {
    console.error('connect error', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('remote:disconnect', async () => {
  if (remote) { try { remote.stop(); } catch (e) {} remote = null; }
  vestelHost = null; mode = null;
  send('remote:disconnected');
  return true;
});

ipcMain.handle('remote:sendCode', async (_e, code) => {
  if (mode !== 'android' || !remote) return { ok: false, error: 'not connected' };
  try {
    remote.sendCode(code);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('remote:sendKey', async (_e, { key, direction }) => {
  if (mode === 'vestel') {
    if (!vestelHost) return { ok: false, error: 'not connected' };
    const code = VESTEL_CODES[key];
    if (code === undefined) return { ok: false, error: 'unsupported key on Vestel' };
    try {
      await sendVestel(vestelHost, code);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  if (!remote) return { ok: false, error: 'not connected' };
  try {
    const kc = RemoteKeyCode[key] !== undefined ? RemoteKeyCode[key] : key;
    const dir = RemoteDirection[direction] !== undefined ? RemoteDirection[direction] : (direction || RemoteDirection.SHORT);
    remote.sendKey(kc, dir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('remote:sendPower', async () => {
  if (mode === 'vestel') {
    if (!vestelHost) return { ok: false, error: 'not connected' };
    try { await sendVestel(vestelHost, 1012); return { ok: true }; }
    catch (err) { return { ok: false, error: String(err) }; }
  }
  if (!remote) return { ok: false, error: 'not connected' };
  try { remote.sendPower(); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

ipcMain.handle('remote:sendAppLink', async (_e, link) => {
  if (mode === 'vestel') return { ok: false, error: 'app launch not supported on Vestel' };
  if (!remote) return { ok: false, error: 'not connected' };
  try { remote.sendAppLink(link); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Network scan
ipcMain.handle('net:scan', async (_e, { subnet }) => {
  const results = [];

  let prefixes = [];
  if (subnet) {
    prefixes = [subnet.replace(/\.0\/24$/, '')];
  } else {
    const nets = os.networkInterfaces();
    const seen = new Set();
    for (const name of Object.keys(nets)) {
      for (const iface of nets[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const prefix = iface.address.split('.').slice(0, 3).join('.');
          if (!seen.has(prefix)) { seen.add(prefix); prefixes.push(prefix); }
        }
      }
    }
  }
  if (prefixes.length === 0) return { ok: false, error: 'no network interface', results: [] };

  const ports = [6467, 6466, 56789];
  const concurrency = 64;
  const timeoutMs = 500;
  const queue = [];
  for (const prefix of prefixes) {
    for (let i = 1; i <= 254; i++) {
      for (const port of ports) {
        queue.push({ ip: prefix + '.' + i, port: port });
      }
    }
  }

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const my = idx++;
      const { ip, port } = queue[my];
      const ok = await new Promise((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(timeoutMs);
        sock.on('connect', () => { sock.destroy(); resolve(true); });
        sock.on('timeout', () => { sock.destroy(); resolve(false); });
        sock.on('error', () => { sock.destroy(); resolve(false); });
        sock.connect(port, ip);
      });
      if (ok) {
        if (!results.find(r => r.ip === ip)) results.push({ ip, port });
        send('net:scanProgress', { found: results.slice(), scanned: my + 1, total: queue.length });
      }
    }
  }
  const workers = [];
  for (let w = 0; w < concurrency; w++) workers.push(worker());
  await Promise.all(workers);
  const uniq = [];
  const seenIp = new Set();
  for (const r of results) {
    if (!seenIp.has(r.ip)) { seenIp.add(r.ip); uniq.push(r); }
  }
  return { ok: true, results: uniq, subnet: prefixes.join(', ') + '.0/24' };
});

ipcMain.handle('remote:keyCodes', async () => {
  return { keyCodes: Object.keys(RemoteKeyCode), directions: Object.keys(RemoteDirection) };
});

ipcMain.handle('remote:getMode', async () => mode);
