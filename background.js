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
    let timeout = null;

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    }

    function onTabUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      cleanup();

      chrome.scripting.executeScript(
        { target: { tabId }, func: extractDealsFromDOM },
        results => {
          const err = chrome.runtime.lastError;
          chrome.tabs.remove(tabId);
          if (err) { reject(new Error(err.message)); return; }
          resolve(results?.[0]?.result ?? []);
        }
      );
    }

    chrome.tabs.create({ url: TARGET_URLS[0], active: false }, tab => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      tabId = tab.id;
      chrome.tabs.onUpdated.addListener(onTabUpdated);

      timeout = setTimeout(() => {
        cleanup();
        chrome.tabs.remove(tabId);
        reject(new Error('scan timed out'));
      }, 30000);
    });
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
    if (msg.type !== 'scan') return false;
    handleMessage(msg, sender, sendResponse);
    return true;
  });
}
