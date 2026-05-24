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

// Self-contained — re-declares SELECTORS and parsePrice inline because
// chrome.scripting.executeScript serializes the function and loses module scope.
export function extractDealsFromDOM() {
  const baseUrl = 'https://www.joybuy.fr';
  const SELECTORS = {
    item: '.product-item',
    title: '.product-title',
    originalPrice: '.original-price',
    salePrice: '.sale-price',
    link: 'a',
    image: 'img',
  };

  function parsePrice(text) {
    if (!text) return null;
    const num = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
    return isNaN(num) ? null : num;
  }

  const items = Array.from(document.querySelectorAll(SELECTORS.item));

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

function parsePrice(text) {
  if (!text) return null;
  const num = parseFloat(text.replace(/[^\d.,]/g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}
