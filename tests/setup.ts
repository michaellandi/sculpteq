// Mock the chrome extension APIs globally for all tests

const storage: Record<string, unknown> = {};

(global as unknown as Record<string, unknown>).chrome = {
  storage: {
    local: {
      get: jest.fn((_keys: unknown, callback: (r: Record<string, unknown>) => void) => {
        callback({ ...storage });
      }),
      set: jest.fn((items: Record<string, unknown>) => {
        Object.assign(storage, items);
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
};
