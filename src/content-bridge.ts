/**
 * content-bridge.ts — SculptEQ messaging bridge (runs in ISOLATED world)
 *
 * Relays messages between the extension popup (chrome.runtime)
 * and the DSP content script running in the MAIN world (window.postMessage).
 */

// Popup → DSP: forward chrome messages into the page via postMessage
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.source !== 'sculpteq-popup') return;
  window.postMessage({ source: 'sculpteq-bridge', payload: message.payload }, '*');
  sendResponse({ ok: true });
});

// DSP → Popup: forward page messages back through chrome.runtime
window.addEventListener('message', (e: MessageEvent) => {
  if (!e.data || e.data.source !== 'sculpteq-dsp') return;
  chrome.runtime.sendMessage({ source: 'sculpteq-content', ...e.data }).catch(() => {});
});
