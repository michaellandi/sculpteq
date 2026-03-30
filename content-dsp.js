/**
 * content-dsp.js — SculptEQ DSP chain (runs in MAIN world)
 *
 * Patches the page's Web Audio API and routes all media element audio
 * through a 16-band parametric EQ + compressor chain.
 *
 * Receives DSP parameter updates via window.postMessage from content-bridge.js.
 */

const EQ_BANDS = [
  { freq: 25,    type: 'lowshelf'  },
  { freq: 40,    type: 'peaking'   },
  { freq: 63,    type: 'peaking'   },
  { freq: 100,   type: 'peaking'   },
  { freq: 160,   type: 'peaking'   },
  { freq: 250,   type: 'peaking'   },
  { freq: 400,   type: 'peaking'   },
  { freq: 630,   type: 'peaking'   },
  { freq: 1000,  type: 'peaking'   },
  { freq: 1600,  type: 'peaking'   },
  { freq: 2500,  type: 'peaking'   },
  { freq: 4000,  type: 'peaking'   },
  { freq: 6300,  type: 'peaking'   },
  { freq: 10000, type: 'peaking'   },
  { freq: 16000, type: 'peaking'   },
  { freq: 20000, type: 'highshelf' },
];

// ---------------------------------------------------------------------------
// DSP state
// ---------------------------------------------------------------------------

let audioCtx    = null;
let eqFilters   = [];
let compressor  = null;
let masterGain  = null;
let entryNode   = null;
let widenerNodes = null; // { splitter, merger, gainLL, gainRL, gainLR, gainRR }

const dspState = {
  eq:           new Array(16).fill(0),
  compressor:   { enabled: false, threshold: -24, ratio: 4 },
  masterVolume: 1.0,
  stereoWidth:  1.0,
};

const connectedElements = new WeakSet();

const OriginalAudioContext          = window.AudioContext || window.webkitAudioContext;
const nativeCreateMediaElementSource = OriginalAudioContext.prototype.createMediaElementSource;

// ---------------------------------------------------------------------------
// Build DSP chain
// ---------------------------------------------------------------------------

function buildDSPChain(ctx) {
  eqFilters = EQ_BANDS.map((band) => {
    const f = ctx.createBiquadFilter();
    f.type            = band.type;
    f.frequency.value = band.freq;
    f.gain.value      = 0;
    if (band.type === 'peaking') f.Q.value = 1.4;
    return f;
  });

  for (let i = 0; i < eqFilters.length - 1; i++) {
    eqFilters[i].connect(eqFilters[i + 1]);
  }

  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = dspState.compressor.threshold;
  compressor.ratio.value     = dspState.compressor.ratio;
  compressor.attack.value    = 0.003;
  compressor.release.value   = 0.25;

  masterGain = ctx.createGain();
  masterGain.gain.value = dspState.masterVolume;

  // Stereo widener using mid-side processing
  // L_out = ((1+w)/2)*L + ((1-w)/2)*R
  // R_out = ((1-w)/2)*L + ((1+w)/2)*R
  const splitter = ctx.createChannelSplitter(2);
  const merger   = ctx.createChannelMerger(2);
  const gainLL   = ctx.createGain(); // L → L_out
  const gainRL   = ctx.createGain(); // R → L_out
  const gainLR   = ctx.createGain(); // L → R_out
  const gainRR   = ctx.createGain(); // R → R_out

  splitter.connect(gainLL, 0); splitter.connect(gainRL, 1);
  splitter.connect(gainLR, 0); splitter.connect(gainRR, 1);
  gainLL.connect(merger, 0, 0); gainRL.connect(merger, 0, 0);
  gainLR.connect(merger, 0, 1); gainRR.connect(merger, 0, 1);

  widenerNodes = { splitter, merger, gainLL, gainRL, gainLR, gainRR };
  applyStereoWidth(dspState.stereoWidth);

  eqFilters[eqFilters.length - 1].connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(splitter);
  merger.connect(ctx.destination);

  entryNode = eqFilters[0];
  console.log('[SculptEQ] 16-band DSP chain built');
}

function getOrCreateContext() {
  if (audioCtx) return audioCtx;
  audioCtx = new OriginalAudioContext();
  buildDSPChain(audioCtx);
  return audioCtx;
}

// ---------------------------------------------------------------------------
// Connect media elements
// ---------------------------------------------------------------------------

function connectElement(el) {
  if (connectedElements.has(el)) return;
  connectedElements.add(el);
  const ctx = getOrCreateContext();
  try {
    const source = nativeCreateMediaElementSource.call(ctx, el);
    source.connect(entryNode);
    if (ctx.state === 'suspended') ctx.resume();
    console.log(`[SculptEQ] Connected <${el.tagName.toLowerCase()}>`);
  } catch (e) {
    console.warn('[SculptEQ] Could not connect element:', e.message);
  }
}

function hookElements() {
  document.querySelectorAll('video, audio').forEach(connectElement);
}

['play', 'playing', 'canplay'].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    if (e.target instanceof HTMLMediaElement) connectElement(e.target);
  }, { capture: true });
});

// Patch AudioContext so the page's own context gets routed through our chain
window.AudioContext = window.webkitAudioContext = class extends OriginalAudioContext {
  constructor(...args) {
    super(...args);
    if (!audioCtx) { audioCtx = this; buildDSPChain(this); }
  }
  createMediaElementSource(el) {
    connectElement(el);
    const silent = this.createGain();
    silent.gain.value = 0;
    return silent;
  }
};

function initObservers() {
  hookElements();
  new MutationObserver(hookElements).observe(document.documentElement, {
    childList: true, subtree: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObservers);
} else {
  initObservers();
}

// ---------------------------------------------------------------------------
// Apply DSP parameters
// ---------------------------------------------------------------------------

function applyStereoWidth(w) {
  if (!widenerNodes) return;
  const { gainLL, gainRL, gainLR, gainRR } = widenerNodes;
  gainLL.gain.value = (1 + w) / 2;
  gainRL.gain.value = (1 - w) / 2;
  gainLR.gain.value = (1 - w) / 2;
  gainRR.gain.value = (1 + w) / 2;
}

function applyParams() {
  if (!eqFilters.length) return;
  dspState.eq.forEach((gain, i) => {
    if (eqFilters[i]) eqFilters[i].gain.value = gain;
  });
  if (compressor) {
    compressor.threshold.value = dspState.compressor.enabled ? dspState.compressor.threshold : 0;
    compressor.ratio.value     = dspState.compressor.enabled ? dspState.compressor.ratio : 1;
  }
  if (masterGain) masterGain.gain.value = dspState.masterVolume;
}

// ---------------------------------------------------------------------------
// Receive messages from content-bridge.js (ISOLATED world → MAIN world)
// ---------------------------------------------------------------------------

window.addEventListener('message', (e) => {
  if (!e.data || e.data.source !== 'sculpteq-bridge') return;
  const { type, value } = e.data.payload;

  switch (type) {
    case 'eq-band':
      dspState.eq[value.index] = value.gain;
      if (eqFilters[value.index]) eqFilters[value.index].gain.value = value.gain;
      break;
    case 'eq-all':
      dspState.eq = [...value];
      applyParams();
      break;
    case 'compressor':
      Object.assign(dspState.compressor, value);
      applyParams();
      break;
    case 'masterVolume':
      dspState.masterVolume = value;
      if (masterGain) masterGain.gain.value = value;
      break;
    case 'stereoWidth':
      dspState.stereoWidth = value;
      applyStereoWidth(value);
      break;
    case 'ping':
      window.postMessage({ source: 'sculpteq-dsp', type: 'pong' }, '*');
      break;
  }
});

console.log('[SculptEQ] content-dsp.js loaded');
