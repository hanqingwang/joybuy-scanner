import { TARGET_URLS } from './scraper.js';

const ALARM_NAME = 'joybuy-scan';
const SCAN_INTERVAL_MINUTES = 180;

export async function setupAlarm() {
  const existing = await new Promise(resolve => chrome.alarms.get(ALARM_NAME, resolve));
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });
  }
}

// Opens a single URL in a hidden tab, waits for product cards to hydrate,
// extracts deals, closes the tab. Resolves with a deals array (may be empty).
function scanUrl(url) {
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

      // Polls up to 8s for React hydration, then extracts deals from .sgm_pc cards.
      // Self-contained: no module scope available inside executeScript.
      function extractWithRetry() {
        return new Promise(resolve => {
          const deadline = Date.now() + 8000;

          function attempt() {
            if (location.href.includes('/login') || document.title.includes('403')) {
              resolve([]);
              return;
            }
            const cards = document.querySelectorAll('.sgm_pc');
            if (cards.length > 0 || Date.now() >= deadline) {
              const baseUrl = 'https://www.joybuy.fr';
              const deals = Array.from(cards).flatMap(item => {
                const dataExp = item.getAttribute('data-exp');
                if (!dataExp) return [];
                try {
                  const exp = JSON.parse(dataExp);
                  if (exp.biz_type !== 'product') return [];
                  const params = exp.json_param || {};
                  const fir = parseFloat(params.firprice);
                  const sec = parseFloat(params.secprice);
                  const originalPrice = (!isNaN(fir) && fir > 0) ? fir : null;
                  const salePrice = (!isNaN(sec) && sec > 0) ? sec : null;
                  if (!originalPrice || !salePrice || originalPrice <= salePrice) return [];
                  const skuid = params.skuid || '';
                  const title = item.querySelector('img[alt]')?.getAttribute('alt')?.trim();
                  const href = item.querySelector('a[href]')?.getAttribute('href');
                  const src = item.querySelector('img')?.getAttribute('src');
                  if (!title) return [];
                  const discountPct = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
                  const url = href ? new URL(href, baseUrl).href : baseUrl;
                  const imageUrl = src ? (src.startsWith('//') ? 'https:' + src : src) : '';
                  return [{ skuid, title, originalPrice, salePrice, discountPct, url, imageUrl }];
                } catch (_) { return []; }
              });

              // Dump raw data-exp JSON for first card to see all field names
              const rawFirst = cards[0]?.getAttribute('data-exp') || 'none';
              const cardSamples = rawFirst.slice(0, 300);
              resolve({
                deals,
                diag: `url=${location.href.slice(22,60)} sgm_pc=${cards.length} samples=${cardSamples}`,
              });
            } else {
              setTimeout(attempt, 500);
            }
          }
          attempt();
        });
      }

      chrome.scripting.executeScript(
        { target: { tabId }, func: extractWithRetry },
        results => {
          const err = chrome.runtime.lastError;
          chrome.tabs.remove(tabId);
          if (err) { reject(new Error(err.message)); return; }
          const result = results?.[0]?.result;
          if (result?.diag) console.log('[joybuy-scanner] page diag:', result.diag);
          resolve(result?.deals ?? []);
        }
      );
    }

    chrome.tabs.create({ url, active: false }, tab => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      tabId = tab.id;
      chrome.tabs.onUpdated.addListener(onTabUpdated);
      timeout = setTimeout(() => {
        cleanup();
        chrome.tabs.remove(tabId);
        resolve([]); // timeout on one page shouldn't abort the whole scan
      }, 30000);
    });
  });
}

// Scans all TARGET_URLS sequentially, deduplicates by skuid, returns top 10 by discount.
export async function scanDeals() {
  const seen = new Set();
  const all = [];

  for (const url of TARGET_URLS) {
    try {
      const deals = await scanUrl(url);
      console.log(`[joybuy-scanner] ${new URL(url).pathname} → ${deals.length} deals`);
      for (const deal of deals) {
        const key = deal.skuid || deal.url;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(deal);
        }
      }
    } catch (err) {
      console.log(`[joybuy-scanner] ${new URL(url).pathname} → ERROR: ${err.message}`);
    }
  }

  return all
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, 10);
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
