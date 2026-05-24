import { jest } from '@jest/globals';
import { handleAlarm, handleMessage, setupAlarm } from '../background.js';

const mockStorage = {};
const mockAlarms = {};
let tabUpdateListeners = [];

global.chrome = {
  alarms: {
    create: jest.fn((name, opts) => { mockAlarms[name] = opts; }),
    get: jest.fn((name, cb) => cb(mockAlarms[name] ?? null)),
    onAlarm: { addListener: jest.fn() },
  },
  storage: {
    local: {
      set: jest.fn((data, cb) => { Object.assign(mockStorage, data); cb?.(); }),
      get: jest.fn((keys, cb) => {
        const result = {};
        keys.forEach(k => { result[k] = mockStorage[k]; });
        cb(result);
      }),
    },
  },
  tabs: {
    create: jest.fn(),
    remove: jest.fn(),
    onUpdated: {
      addListener: jest.fn(fn => tabUpdateListeners.push(fn)),
      removeListener: jest.fn(fn => { tabUpdateListeners = tabUpdateListeners.filter(l => l !== fn); }),
    },
  },
  scripting: {
    executeScript: jest.fn(),
  },
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
  },
};

const mockScanDeals = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  Object.keys(mockAlarms).forEach(k => delete mockAlarms[k]);
  tabUpdateListeners = [];
});

describe('setupAlarm', () => {
  test('creates alarm if not already set', async () => {
    await setupAlarm();
    expect(chrome.alarms.create).toHaveBeenCalledWith('joybuy-scan', {
      periodInMinutes: 180,
    });
  });

  test('does not create duplicate alarm if already exists', async () => {
    mockAlarms['joybuy-scan'] = { periodInMinutes: 180 };
    await setupAlarm();
    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });
});

describe('handleAlarm', () => {
  test('ignores alarms with wrong name', async () => {
    await handleAlarm({ name: 'some-other-alarm' }, mockScanDeals);
    expect(mockScanDeals).not.toHaveBeenCalled();
  });

  test('calls scanDeals and writes ok status on success', async () => {
    const deals = [{ title: 'Phone', discountPct: 50 }];
    mockScanDeals.mockResolvedValue(deals);
    await handleAlarm({ name: 'joybuy-scan' }, mockScanDeals);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ deals, scanStatus: 'ok' }),
      undefined
    );
    expect(mockStorage.scanStatus).toBe('ok');
  });

  test('writes error status when scanDeals throws', async () => {
    mockScanDeals.mockRejectedValue(new Error('tab failed'));
    await handleAlarm({ name: 'joybuy-scan' }, mockScanDeals);
    expect(mockStorage.scanStatus).toBe('error');
    expect(mockStorage.deals).toBeUndefined();
  });

  test('stores ISO timestamp in lastScan', async () => {
    mockScanDeals.mockResolvedValue([]);
    await handleAlarm({ name: 'joybuy-scan' }, mockScanDeals);
    expect(mockStorage.lastScan).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('handleMessage', () => {
  test('triggers scan on { type: "scan" } message', async () => {
    const deals = [{ title: 'Watch', discountPct: 40 }];
    mockScanDeals.mockResolvedValue(deals);
    const sendResponse = jest.fn();
    await handleMessage({ type: 'scan' }, null, sendResponse, mockScanDeals);
    expect(mockScanDeals).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  test('sends { ok: false, error } when scan fails', async () => {
    mockScanDeals.mockRejectedValue(new Error('timeout'));
    const sendResponse = jest.fn();
    await handleMessage({ type: 'scan' }, null, sendResponse, mockScanDeals);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'timeout' });
  });

  test('ignores unrecognised message types', async () => {
    const sendResponse = jest.fn();
    await handleMessage({ type: 'unknown' }, null, sendResponse, mockScanDeals);
    expect(mockScanDeals).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
