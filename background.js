import { extractDealsFromDOM, TARGET_URLS } from './scraper.js';

const ALARM_NAME = 'joybuy-scan';
const SCAN_INTERVAL_MINUTES = 180;

export async function setupAlarm() {
  const existing = await new Promise(resolve => chrome.alarms.get(ALARM_NAME, resolve));
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });
  }
}

export async function scanDeals() {
  return new Promise((resolve, reject) => {
    let tabId = null;

    chrome.tabs.create({ url: TARGET_URLS[0], active: false }, tab => {
      tabId = tab.id;
    });

    function onTabUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onTabUpdated);

      chrome.scripting.executeScript(
        { target: { tabId }, func: extractDealsFromDOM },
        results => {
          chrome.tabs.remove(tabId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(results?.[0]?.result ?? []);
        }
      );
    }

    chrome.tabs.onUpdated.addListener(onTabUpdated);
  });
}

export async function handleAlarm(alarm, _scanDeals = scanDeals) {
  if (alarm.name !== ALARM_NAME) return;
  try {
    const deals = await _scanDeals();
    chrome.storage.local.set({ deals, lastScan: new Date().toISOString(), scanStatus: 'ok' }, undefined);
  } catch {
    chrome.storage.local.set({ lastScan: new Date().toISOString(), scanStatus: 'error' }, undefined);
  }
}

export async function handleMessage(message, sender, sendResponse, _scanDeals = scanDeals) {
  if (message.type !== 'scan') return;
  try {
    const deals = await _scanDeals();
    chrome.storage.local.set({ deals, lastScan: new Date().toISOString(), scanStatus: 'ok' });
    sendResponse({ ok: true });
  } catch (err) {
    chrome.storage.local.set({ lastScan: new Date().toISOString(), scanStatus: 'error' });
    sendResponse({ ok: false, error: err.message });
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(setupAlarm);
  chrome.alarms.onAlarm.addListener(handleAlarm);
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg, sender, sendResponse);
    return true;
  });
}
