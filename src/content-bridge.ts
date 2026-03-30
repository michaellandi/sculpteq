/**
 * content-bridge.ts — SculptEQ messaging bridge (runs in ISOLATED world)
 *
 * Relays messages between the extension popup (chrome.runtime)
 * and the DSP content script running in the MAIN world (window.postMessage).
 */

// Popup → DSP: forward chrome messages into the page via postMessage
export function handleChromeMessage(
  message: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (r: unknown) => void,
): void {
  if (message.source !== 'sculpteq-popup') return;
  window.postMessage({ source: 'sculpteq-bridge', payload: message.payload }, '*');
  sendResponse({ ok: true });
}

// DSP → Popup: forward page messages back through chrome.runtime
export function handleWindowMessage(e: MessageEvent): void {
  if (!e.data || e.data.source !== 'sculpteq-dsp') return;
  chrome.runtime.sendMessage({ ...e.data, source: 'sculpteq-content' }).catch(() => {});
}

chrome.runtime.onMessage.addListener(handleChromeMessage);
window.addEventListener('message', handleWindowMessage);
