const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const ipInput = document.getElementById('ipInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const scanBtn = document.getElementById('scanBtn');
const scanStatus = document.getElementById('scanStatus');
const extraInfo = document.getElementById('extraInfo');

const pairModal = document.getElementById('pairModal');
const pairCode = document.getElementById('pairCode');
const pairSubmit = document.getElementById('pairSubmit');
const pairCancel = document.getElementById('pairCancel');

const scanModal = document.getElementById('scanModal');
const scanResults = document.getElementById('scanResults');
const scanClose = document.getElementById('scanClose');

let connected = false;

function setStatus(state, text) {
  statusDot.className = 'dot ' + state;
  statusText.textContent = text;
}

// Load saved config
(async () => {
  const cfg = await window.tv.getConfig();
  if (cfg && cfg.host) ipInput.value = cfg.host;
})();

// Event listeners
window.tv.on('remote:secret', () => {
  pairModal.classList.remove('hidden');
  pairCode.value = '';
  pairCode.focus();
});
window.tv.on('remote:ready', (info) => {
  connected = true;
  if (info && info.vestel) {
    setStatus('connected', 'Connected (Vestel SmartCenter)');
    const apps = document.querySelector('.apps');
    if (apps) apps.style.display = 'none';
  } else {
    setStatus('connected', 'Connected');
    const apps = document.querySelector('.apps');
    if (apps) apps.style.display = '';
    extraInfo.textContent = info && info.cert ? 'Paired' : '';
  }
});
window.tv.on('remote:powered', (p) => { extraInfo.textContent = 'Power: ' + p; });
window.tv.on('remote:volume', (v) => { extraInfo.textContent = `Vol ${v.level}/${v.maximum} Muted:${v.muted}`; });
window.tv.on('remote:current_app', (a) => { extraInfo.textContent = 'App: ' + a; });
window.tv.on('remote:unpaired', () => {
  connected = false;
  setStatus('disconnected', 'Unpaired - reconnect');
});
window.tv.on('remote:error', (e) => { extraInfo.textContent = 'Error: ' + (e && e.error ? JSON.stringify(e.error) : e); });
window.tv.on('remote:disconnected', () => {
  connected = false;
  setStatus('disconnected', 'Disconnected');
  const apps = document.querySelector('.apps');
  if (apps) apps.style.display = '';
});
window.tv.on('net:scanProgress', (p) => {
  scanStatus.textContent = `Scanned ${p.scanned}/${p.total}, found ${p.found.length}`;
});

connectBtn.addEventListener('click', async () => {
  const host = ipInput.value.trim();
  if (!host) { alert('Enter TV IP'); return; }
  setStatus('connecting', 'Connecting...');
  const cfg = await window.tv.getConfig();
  const cert = cfg && cfg.host === host ? cfg.cert : null;
  const res = await window.tv.connect(host, cert);
  if (!res.ok) {
    setStatus('disconnected', 'Failed: ' + res.error);
  }
  // Status is updated by remote:ready / remote:error events
  await window.tv.saveConfig({ host });
});

disconnectBtn.addEventListener('click', async () => {
  await window.tv.disconnect();
});

// Pairing modal
pairSubmit.addEventListener('click', async () => {
  const code = pairCode.value.trim();
  if (!code) return;
  await window.tv.sendCode(code);
  pairModal.classList.add('hidden');
});
pairCancel.addEventListener('click', () => pairModal.classList.add('hidden'));

// Scan
scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanStatus.textContent = 'Scanning...';
  scanResults.innerHTML = '';
  const res = await window.tv.scanNetwork();
  scanBtn.disabled = false;
  if (!res.ok) { scanStatus.textContent = 'Scan failed: ' + res.error; return; }
  scanStatus.textContent = `Found ${res.results.length} device(s)`;
  if (res.results.length === 0) {
    scanResults.innerHTML = '<div class="muted">No devices found. Make sure TV is on and on same network.</div>';
  } else {
    scanResults.innerHTML = res.results.map(r =>
      `<div class="scanItem" data-ip="${r.ip}">${r.ip} (port ${r.port})</div>`
    ).join('');
    scanResults.querySelectorAll('.scanItem').forEach(el => {
      el.addEventListener('click', () => {
        ipInput.value = el.dataset.ip;
        scanModal.classList.add('hidden');
      });
    });
  }
  scanModal.classList.remove('hidden');
});
scanClose.addEventListener('click', () => scanModal.classList.add('hidden'));

// Remote buttons
document.querySelectorAll('[data-key]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const key = btn.dataset.key;
    await window.tv.sendKey(key, 'SHORT');
  });
});

document.querySelectorAll('[data-applink]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const link = btn.dataset.applink;
    if (link) await window.tv.sendAppLink(link);
  });
});

// Long-press handling for volume repeat? keep simple.
