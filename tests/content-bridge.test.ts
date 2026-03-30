import { handleChromeMessage, handleWindowMessage } from '../src/content-bridge';

describe('handleChromeMessage', () => {
  let postMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    postMessageSpy = jest.spyOn(window, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('relays sculpteq-popup messages to the page', () => {
    const sendResponse = jest.fn();
    const payload = { type: 'eq-band', value: { index: 3, gain: 5 } };

    handleChromeMessage({ source: 'sculpteq-popup', payload }, {}, sendResponse);

    expect(postMessageSpy).toHaveBeenCalledWith(
      { source: 'sculpteq-bridge', payload },
      '*',
    );
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('ignores messages from other sources', () => {
    const sendResponse = jest.fn();

    handleChromeMessage({ source: 'some-other-extension', payload: {} }, {}, sendResponse);

    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('handleWindowMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards sculpteq-dsp messages via chrome.runtime.sendMessage', () => {
    const data = { source: 'sculpteq-dsp', type: 'pong' };
    handleWindowMessage(new MessageEvent('message', { data }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'sculpteq-content', type: 'pong' }),
    );
  });

  it('ignores messages from other sources', () => {
    handleWindowMessage(new MessageEvent('message', { data: { source: 'other', type: 'pong' } }));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores events with no data', () => {
    handleWindowMessage(new MessageEvent('message', { data: null }));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
