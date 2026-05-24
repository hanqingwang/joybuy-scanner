// joybuy.fr is a client-side rendered Next.js SPA — product HTML is not available
// via a plain HTTP fetch. These selectors are placeholders that match the fixture
// HTML used in tests. Task 6 (Selector Calibration) will update them once the
// real DOM structure is observed in a running browser.
export const TARGET_URLS = [
  'https://www.joybuy.fr/promotions',
];

const SELECTORS = {
  item: '.product-item',
  title: '.product-title',
  originalPrice: '.original-price',
  salePrice: '.sale-price',
  link: 'a',
  image: 'img',
};

/**
 * Parse an HTML string and return up to 10 deals sorted by discount % descending.
 *
 * @param {string} html     - Raw HTML to parse
 * @param {string} baseUrl  - Base URL used to resolve relative hrefs
 * @returns {{ title: string, originalPrice: number, salePrice: number,
 *             discountPct: number, url: string, imageUrl: string }[]}
 */
export function parseDeals(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = Array.from(doc.querySelectorAll(SELECTORS.item));

  const deals = items.flatMap(item => {
    const title = item.querySelector(SELECTORS.title)?.textContent?.trim();
    const originalText = item.querySelector(SELECTORS.originalPrice)?.textContent?.trim();
    const saleText = item.querySelector(SELECTORS.salePrice)?.textContent?.trim();
    const href = item.querySelector(SELECTORS.link)?.getAttribute('href');
    const src = item.querySelector(SELECTORS.image)?.getAttribute('src');

    const originalPrice = parsePrice(originalText);
    const salePrice = parsePrice(saleText);

    if (!title || !originalPrice || !salePrice || originalPrice <= salePrice) return [];

    const discountPct = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    const url = href ? new URL(href, baseUrl).href : baseUrl;
    const imageUrl = src ?? '';

    return [{ title, originalPrice, salePrice, discountPct, url, imageUrl }];
  });

  return deals
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, 10);
}

/**
 * Fetch live deals from joybuy.fr (runs in the extension's service worker / content script).
 * Not called during tests.
 *
 * @returns {Promise<ReturnType<parseDeals>>}
 */
export async function fetchDeals() {
  const allDeals = [];

  for (const url of TARGET_URLS) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const html = await res.text();
    allDeals.push(...parseDeals(html, 'https://www.joybuy.fr'));
  }

  return allDeals
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, 10);
}

/**
 * Extract a numeric price from a text string.
 * Strips currency symbols and whitespace, normalises commas to dots.
 *
 * @param {string|undefined} text
 * @returns {number|null}
 */
function parsePrice(text) {
  if (!text) return null;
  const num = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}
