/**
 * content-dsp.ts — SculptEQ DSP chain (runs in MAIN world)
 *
 * Patches the page's Web Audio API and routes all media element audio
 * through a 16-band parametric EQ + compressor chain.
 *
 * Receives DSP parameter updates via window.postMessage from content-bridge.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BandDef {
  freq: number;
  type: BiquadFilterType;
}

interface CompressorState {
  enabled: boolean;
  threshold: number;
  ratio: number;
}

interface DspState {
  eq: number[];
  compressor: CompressorState;
  masterVolume: number;
  stereoWidth: number;
}

interface WidenerNodes {
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  gainLL: GainNode;
  gainRL: GainNode;
  gainLR: GainNode;
  gainRR: GainNode;
}

type DspMessage =
  | { type: 'eq-band';      value: { index: number; gain: number } }
  | { type: 'eq-all';       value: number[] }
  | { type: 'compressor';   value: Partial<CompressorState> }
  | { type: 'masterVolume'; value: number }
  | { type: 'stereoWidth';  value: number }
  | { type: 'ping' };

// ---------------------------------------------------------------------------
// EQ band definitions
// ---------------------------------------------------------------------------

const EQ_BANDS: BandDef[] = [
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

let audioCtx:     AudioContext | null = null;
let eqFilters:    BiquadFilterNode[]  = [];
let compressor:   DynamicsCompressorNode | null = null;
let masterGain:   GainNode | null = null;
let entryNode:    BiquadFilterNode | null = null;
let widenerNodes: WidenerNodes | null = null;

const dspState: DspState = {
  eq:           new Array(16).fill(0) as number[],
  compressor:   { enabled: false, threshold: -24, ratio: 4 },
  masterVolume: 1.0,
  stereoWidth:  1.0,
};

const connectedElements = new WeakSet<HTMLMediaElement>();

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
const OriginalAudioContext =
  window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext!;
const nativeCreateMediaElementSource =
  OriginalAudioContext.prototype.createMediaElementSource.bind as
  (thisArg: AudioContext, el: HTMLMediaElement) => MediaElementAudioSourceNode;

// ---------------------------------------------------------------------------
// Build DSP chain
// ---------------------------------------------------------------------------

function buildDSPChain(ctx: AudioContext): void {
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
  const gainLL   = ctx.createGain();
  const gainRL   = ctx.createGain();
  const gainLR   = ctx.createGain();
  const gainRR   = ctx.createGain();

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

function getOrCreateContext(): AudioContext {
  if (audioCtx) return audioCtx;
  audioCtx = new OriginalAudioContext();
  buildDSPChain(audioCtx);
  return audioCtx;
}

// ---------------------------------------------------------------------------
// Connect media elements
// ---------------------------------------------------------------------------

function connectElement(el: HTMLMediaElement): void {
  if (connectedElements.has(el)) return;
  connectedElements.add(el);
  const ctx = getOrCreateContext();
  try {
    const source = OriginalAudioContext.prototype.createMediaElementSource.call(ctx, el);
    source.connect(entryNode!);
    if (ctx.state === 'suspended') ctx.resume();
    console.log(`[SculptEQ] Connected <${el.tagName.toLowerCase()}>`);
  } catch (e) {
    console.warn('[SculptEQ] Could not connect element:', (e as Error).message);
  }
}

function hookElements(): void {
  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(connectElement);
}

(['play', 'playing', 'canplay'] as const).forEach((evt) => {
  document.addEventListener(evt, (e: Event) => {
    if (e.target instanceof HTMLMediaElement) connectElement(e.target);
  }, { capture: true });
});

// Patch AudioContext so the page's own context gets routed through our chain
window.AudioContext = (window as WindowWithWebkit).webkitAudioContext = class extends OriginalAudioContext {
  constructor(...args: unknown[]) {
    super(...(args as []));
    if (!audioCtx) { audioCtx = this; buildDSPChain(this); }
  }
  createMediaElementSource(el: HTMLMediaElement): MediaElementAudioSourceNode {
    connectElement(el);
    const silent = this.createGain();
    silent.gain.value = 0;
    // Return a silent gain node — the real routing is done inside connectElement
    return silent as unknown as MediaElementAudioSourceNode;
  }
};

function initObservers(): void {
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

function applyStereoWidth(w: number): void {
  if (!widenerNodes) return;
  const { gainLL, gainRL, gainLR, gainRR } = widenerNodes;
  gainLL.gain.value = (1 + w) / 2;
  gainRL.gain.value = (1 - w) / 2;
  gainLR.gain.value = (1 - w) / 2;
  gainRR.gain.value = (1 + w) / 2;
}

function applyParams(): void {
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
// Receive messages from content-bridge.ts (ISOLATED world → MAIN world)
// ---------------------------------------------------------------------------

window.addEventListener('message', (e: MessageEvent) => {
  if (!e.data || e.data.source !== 'sculpteq-bridge') return;
  const msg = e.data.payload as DspMessage;

  switch (msg.type) {
    case 'eq-band':
      dspState.eq[msg.value.index] = msg.value.gain;
      if (eqFilters[msg.value.index]) eqFilters[msg.value.index].gain.value = msg.value.gain;
      break;
    case 'eq-all':
      dspState.eq = [...msg.value];
      applyParams();
      break;
    case 'compressor':
      Object.assign(dspState.compressor, msg.value);
      applyParams();
      break;
    case 'masterVolume':
      dspState.masterVolume = msg.value;
      if (masterGain) masterGain.gain.value = msg.value;
      break;
    case 'stereoWidth':
      dspState.stereoWidth = msg.value;
      applyStereoWidth(msg.value);
      break;
    case 'ping':
      window.postMessage({ source: 'sculpteq-dsp', type: 'pong' }, '*');
      break;
  }
});

console.log('[SculptEQ] content-dsp.ts loaded');
