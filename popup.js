/**
 * popup.js — SculptEQ extension popup
 */

// ---------------------------------------------------------------------------
// EQ setup
// ---------------------------------------------------------------------------

const EQ_FREQ_LABELS = ['25','40','63','100','160','250','400','630','1k','1.6k','2.5k','4k','6.3k','10k','16k','20k'];
const NUM_BANDS = 16;
const eqGains = new Array(NUM_BANDS).fill(0);

const eqBandsEl = document.getElementById('eq-bands');

EQ_FREQ_LABELS.forEach((label, i) => {
  const band = document.createElement('div');
  band.className = 'eq-band';
  band.innerHTML = `
    <span class="val" id="eq-val-${i}">0</span>
    <input type="range" class="vertical" id="eq-${i}" min="-15" max="15" step="0.5" value="0" />
    <span class="freq">${label}</span>
  `;
  eqBandsEl.appendChild(band);

  band.querySelector(`#eq-${i}`).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    eqGains[i] = v;
    document.getElementById(`eq-val-${i}`).textContent = (v > 0 ? '+' : '') + v;
    sendDSP('eq-band', { index: i, gain: v });
  });
});

function applyEQBands(bands) {
  bands.forEach((gain, i) => {
    eqGains[i] = gain;
    const slider  = document.getElementById(`eq-${i}`);
    const display = document.getElementById(`eq-val-${i}`);
    if (slider)  slider.value = gain;
    if (display) display.textContent = (gain > 0 ? '+' : '') + gain;
  });
  sendDSP('eq-all', bands);
}

// ---------------------------------------------------------------------------
// Send DSP update to active tab
// ---------------------------------------------------------------------------

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendDSP(type, value) {
  const tab = await getActiveTab();
  if (!tab) { console.warn('[SculptEQ] No active tab'); return; }
  try {
    await chrome.tabs.sendMessage(tab.id, {
      source:  'sculpteq-popup',
      payload: { type, value },
    });
  } catch (e) {
    console.warn('[SculptEQ] sendMessage failed:', e.message);
    statusEl.textContent = 'Refresh the music tab (Ctrl+R) to activate';
    statusEl.className = '';
  }
}

// ---------------------------------------------------------------------------
// Status — ping the DSP script to see if it's active
// ---------------------------------------------------------------------------

const statusEl = document.getElementById('status');

async function updateStatus() {
  const tab = await getActiveTab();
  if (!tab) { statusEl.textContent = 'No tab found'; statusEl.className = ''; return; }

  const MUSIC_HOSTS = ['music.youtube.com', 'open.spotify.com', 'music.apple.com', 'listen.tidal.com'];
  let host;
  try { host = new URL(tab.url).hostname; } catch {}

  if (!MUSIC_HOSTS.includes(host)) {
    statusEl.textContent = 'Open a music tab to activate';
    statusEl.className = '';
    return;
  }

  statusEl.textContent = `Connected — ${tab.title || host}`;
  statusEl.className = 'active';
}

updateStatus();

// ---------------------------------------------------------------------------
// Master volume
// ---------------------------------------------------------------------------

document.getElementById('master-vol').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  document.getElementById('master-vol-display').textContent = Math.round(v * 100) + '%';
  sendDSP('masterVolume', v);
  chrome.storage.local.set({ masterVolume: v });
});

// ---------------------------------------------------------------------------
// Compressor
// ---------------------------------------------------------------------------

let compEnabled = false;

document.getElementById('toggle-compressor').addEventListener('click', () => {
  compEnabled = !compEnabled;
  document.getElementById('toggle-compressor').classList.toggle('on', compEnabled);
  document.getElementById('fx-compressor').classList.toggle('enabled', compEnabled);
  sendDSP('compressor', { enabled: compEnabled });
  chrome.storage.local.set({ compEnabled });
});

document.getElementById('comp-threshold').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  document.getElementById('comp-threshold-display').textContent = v + ' dB';
  sendDSP('compressor', { threshold: v });
  chrome.storage.local.set({ compThreshold: v });
});

document.getElementById('comp-ratio').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  document.getElementById('comp-ratio-display').textContent = v + ':1';
  sendDSP('compressor', { ratio: v });
  chrome.storage.local.set({ compRatio: v });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const BUILTIN_PRESETS = [
  { name: 'Flat',       bands: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
  { name: 'Bass Boost', bands: [7,6,5,4,2,1,0,0,0,0,0,0,0,0,0,0] },
  { name: 'Rock',       bands: [4,3,2,0,0,-1,0,1,2,3,3,2,1,0,0,0] },
  { name: 'Pop',        bands: [-1,0,1,2,3,3,2,1,0,0,0,0,-1,-1,-2,-2] },
  { name: 'Jazz',       bands: [3,2,1,0,-1,-1,0,1,2,3,3,2,1,0,0,0] },
  { name: 'Classical',  bands: [4,3,2,1,0,0,0,0,0,0,1,2,3,4,4,3] },
  { name: 'Vocal',      bands: [-3,-3,-2,0,2,4,5,5,4,2,0,-1,-2,-3,-3,-3] },
];

const presetSelect    = document.getElementById('preset-select');
const presetNameInput = document.getElementById('preset-name');

async function loadUserPresets() {
  const { userPresets = [] } = await chrome.storage.local.get('userPresets');
  return userPresets;
}

async function saveUserPresets(presets) {
  await chrome.storage.local.set({ userPresets: presets });
}

async function populatePresets() {
  const current = presetSelect.value;
  const userPresets = await loadUserPresets();

  presetSelect.innerHTML = '<option value="">— select preset —</option>';

  const builtinGroup = document.createElement('optgroup');
  builtinGroup.label = 'Built-in';
  BUILTIN_PRESETS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = '__builtin__' + p.name;
    opt.textContent = p.name;
    builtinGroup.appendChild(opt);
  });
  presetSelect.appendChild(builtinGroup);

  if (userPresets.length) {
    const userGroup = document.createElement('optgroup');
    userGroup.label = 'My presets';
    userPresets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = '__user__' + p.name;
      opt.textContent = p.name;
      userGroup.appendChild(opt);
    });
    presetSelect.appendChild(userGroup);
  }

  if ([...presetSelect.options].some((o) => o.value === current)) {
    presetSelect.value = current;
  }
}

async function getSelectedBands() {
  const val = presetSelect.value;
  if (!val) return null;

  if (val.startsWith('__builtin__')) {
    const name = val.slice('__builtin__'.length);
    return BUILTIN_PRESETS.find((p) => p.name === name)?.bands ?? null;
  }
  if (val.startsWith('__user__')) {
    const name = val.slice('__user__'.length);
    const userPresets = await loadUserPresets();
    return userPresets.find((p) => p.name === name)?.bands ?? null;
  }
  return null;
}

document.getElementById('preset-load-btn').addEventListener('click', async () => {
  const bands = await getSelectedBands();
  if (bands) applyEQBands(bands);
});

const presetNameRow    = document.getElementById('preset-name-row');
const presetConfirmBtn = document.getElementById('preset-confirm-btn');
const presetCancelBtn  = document.getElementById('preset-cancel-btn');

function showNameInput() {
  presetNameRow.style.display = 'flex';
  presetNameInput.value = '';
  presetNameInput.focus();
}

function hideNameInput() {
  presetNameRow.style.display = 'none';
  presetNameInput.value = '';
}

document.getElementById('preset-save-btn').addEventListener('click', showNameInput);
presetCancelBtn.addEventListener('click', hideNameInput);

async function confirmSave() {
  const name = presetNameInput.value.trim();
  if (!name) return;
  const userPresets = (await loadUserPresets()).filter((p) => p.name !== name);
  userPresets.push({ name, bands: [...eqGains] });
  await saveUserPresets(userPresets);
  await populatePresets();
  presetSelect.value = '__user__' + name;
  hideNameInput();
}

presetConfirmBtn.addEventListener('click', confirmSave);
presetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmSave();
  if (e.key === 'Escape') hideNameInput();
});

document.getElementById('preset-delete-btn').addEventListener('click', async () => {
  const val = presetSelect.value;
  if (!val.startsWith('__user__')) return;
  const name = val.slice('__user__'.length);
  const userPresets = (await loadUserPresets()).filter((p) => p.name !== name);
  await saveUserPresets(userPresets);
  await populatePresets();
});

// Stereo widener
document.getElementById('stereo-width').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  document.getElementById('stereo-width-display').textContent =
    v < 0.95 ? Math.round(v * 100) + '%' : v > 1.05 ? '+' + Math.round((v - 1) * 100) + '%' : 'Normal';
  sendDSP('stereoWidth', v);
  chrome.storage.local.set({ stereoWidth: v });
});

// Restore saved state when popup opens
chrome.storage.local.get(
  ['eqState', 'masterVolume', 'compEnabled', 'compThreshold', 'compRatio', 'stereoWidth'],
  (s) => {
    if (s.eqState) applyEQBands(s.eqState);

    if (s.masterVolume != null) {
      document.getElementById('master-vol').value = s.masterVolume;
      document.getElementById('master-vol-display').textContent = Math.round(s.masterVolume * 100) + '%';
    }

    if (s.compEnabled) {
      compEnabled = true;
      document.getElementById('toggle-compressor').classList.add('on');
      document.getElementById('fx-compressor').classList.add('enabled');
    }
    if (s.compThreshold != null) {
      document.getElementById('comp-threshold').value = s.compThreshold;
      document.getElementById('comp-threshold-display').textContent = s.compThreshold + ' dB';
    }
    if (s.compRatio != null) {
      document.getElementById('comp-ratio').value = s.compRatio;
      document.getElementById('comp-ratio-display').textContent = s.compRatio + ':1';
    }

    if (s.stereoWidth != null) {
      const w = s.stereoWidth;
      document.getElementById('stereo-width').value = w;
      document.getElementById('stereo-width-display').textContent =
        w < 0.95 ? Math.round(w * 100) + '%' : w > 1.05 ? '+' + Math.round((w - 1) * 100) + '%' : 'Normal';
    }
  }
);

// Persist EQ state on any change
function persistEQState() {
  chrome.storage.local.set({ eqState: [...eqGains] });
}
document.getElementById('eq-bands').addEventListener('input', persistEQState);

// Init
populatePresets();
