import { TARGET_URLS } from './scraper.js';

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

      // Inject a polling wrapper: wait up to 8s for React to hydrate product cards,
      // then run the real extractor. Returns deals array (may be empty).
      function extractWithRetry() {
        return new Promise(resolve => {
          const deadline = Date.now() + 8000;

          function attempt() {
            // Check if the page redirected to login
            if (location.href.includes('/login') || document.title.includes('403')) {
              resolve({ deals: [], diagnostic: 'login_wall: ' + location.href });
              return;
            }

            const cards = document.querySelectorAll('.sgm_pc');
            if (cards.length > 0 || Date.now() >= deadline) {
              // Run the real extractor inline (self-contained copy)
              const baseUrl = 'https://www.joybuy.fr';
              const items = Array.from(document.querySelectorAll('.sgm_pc'));
              const deals = items.flatMap(item => {
                let originalPrice = null;
                let salePrice = null;
                const dataExp = item.getAttribute('data-exp');
                if (!dataExp) return [];
                try {
                  const exp = JSON.parse(dataExp);
                  if (exp.biz_type !== 'product') return [];
                  const params = exp.json_param || {};
                  const fir = parseFloat(params.firprice);
                  const sec = parseFloat(params.secprice);
                  if (!isNaN(fir) && fir > 0) salePrice = fir;
                  if (!isNaN(sec) && sec > 0) originalPrice = sec;
                } catch (_) { return []; }
                const title = item.querySelector('img[alt]')?.getAttribute('alt')?.trim();
                const href = item.querySelector('a[href]')?.getAttribute('href');
                const src = item.querySelector('img')?.getAttribute('src');
                if (!title || !originalPrice || !salePrice || originalPrice <= salePrice) return [];
                const discountPct = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
                const url = href ? new URL(href, baseUrl).href : baseUrl;
                const imageUrl = src ? (src.startsWith('//') ? 'https:' + src : src) : '';
                return [{ title, originalPrice, salePrice, discountPct, url, imageUrl }];
              }).sort((a, b) => b.discountPct - a.discountPct).slice(0, 10);

              // Dump first 5 cards' raw data-exp for debugging
              const cardDump = Array.from(cards).slice(0, 5).map(card => {
                try {
                  const e = JSON.parse(card.getAttribute('data-exp') || '{}');
                  const p = e.json_param || {};
                  return `[${e.biz_type}] fir=${p.firprice} sec=${p.secprice} title=${card.querySelector('img')?.alt?.slice(0,20)}`;
                } catch { return 'parse-error'; }
              });

              resolve({
                deals,
                diagnostic: `sgm_pc:${cards.length} url:${location.href} title:${document.title} | ${cardDump.join(' | ')}`,
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
          if (result?.diagnostic) {
            console.log('[joybuy-scanner] diagnostic:', result.diagnostic);
          }
          resolve(result?.deals ?? []);
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
