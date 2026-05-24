// joybuy.fr is a client-side rendered Next.js SPA (App Router).
// The homepage (which redirects from /) serves SSR product listings.
// Product cards use the class "sgm_pc" (stable) with a "data-exp" JSON attribute
// that contains pricing data (firprice = original, secprice = sale) and skuId.
// CSS module class names (e.g. style_UK_product_card__XXXXX) have hashed suffixes
// that change on every deploy, so we avoid relying on them.
//
// Real DOM structure observed on joybuy.fr (2025-05):
//   <div class="sgm_pc style_UK_product_card__<hash>..."
//        data-exp='{"biz_type":"product","json_param":{"firprice":"32.99","secprice":"19.99","skuid":"10177595",...}}'>
//     <a href="/dp/<slug>/<skuId>">
//       <img alt="<product title>" class="style_UK_skuImg__<hash>" src="//images4.joy-sourcing.com/...">
//     </a>
//     <div class="style_title__<hash>"><product title></div>
//     <div class="style_mainPrice__<hash> productCartItem ...">  <!-- sale price spans -->
//     <div class="style_crossOffPrice__<hash> productCartItem"> <!-- original price spans -->
//   </div>
export const TARGET_URLS = [
  'https://www.joybuy.fr/',
];

// SELECTORS used by parseDeals (DOM-based, for test fixtures and DOMParser use).
// We keep the stable class names from the real site; CSS-module-hashed names are
// listed as comments and used in extractDealsFromDOM via data-exp instead.
const SELECTORS = {
  // Stable: "sgm_pc" is not a CSS module class — it never changes.
  // We filter further by requiring a data-exp attribute with biz_type=product.
  item: '.sgm_pc',
  // Title: the product image alt text equals the product title; also present in
  // a sibling div. We read from the first img[alt] inside the card.
  title: 'img[alt]',
  // Link: the anchor wrapping the product image always has href="/dp/..."
  link: 'a[href]',
  image: 'img',
  // Prices come from data-exp JSON (firprice/secprice). DOM fallback selectors:
  // .productCartItem is a stable non-hashed class applied to both price divs.
  // The first .productCartItem child is the sale price; the second is the crossed-out original.
  salePriceContainer: '.productCartItem',
};

export function parseDeals(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = Array.from(doc.querySelectorAll(SELECTORS.item));

  const deals = items.flatMap(item => {
    // Try to read prices from data-exp JSON first (most reliable)
    let originalPrice = null;
    let salePrice = null;

    // data-exp.firprice is an inflated internal reference price, NOT the displayed
    // crossed-out price. Use data-exp only to filter non-product cards and read secprice.
    const dataExp = item.getAttribute('data-exp');
    if (dataExp) {
      try {
        const exp = JSON.parse(dataExp);
        if (exp.biz_type !== 'product') return [];
        const sec = parseFloat((exp.json_param || {}).secprice);
        if (!isNaN(sec) && sec > 0) salePrice = sec;
      } catch (_) {
        // fall through to DOM parsing
      }
    }

    // .productCartItem: [0] = sale price, [1] = crossed-out original price.
    // Always read originalPrice from DOM — data-exp.firprice is unreliable.
    const priceContainers = Array.from(item.querySelectorAll(SELECTORS.salePriceContainer));
    if (priceContainers.length >= 1 && salePrice === null) {
      salePrice = parsePrice(priceContainers[0].textContent.trim());
    }
    if (priceContainers.length >= 2) {
      originalPrice = parsePrice(priceContainers[1].textContent.trim());
    }

    const title = item.querySelector(SELECTORS.title)?.getAttribute('alt')?.trim();
    const href = item.querySelector(SELECTORS.link)?.getAttribute('href');
    const src = item.querySelector(SELECTORS.image)?.getAttribute('src');

    if (!title || !originalPrice || !salePrice || originalPrice <= salePrice) return [];

    const discountPct = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    const url = href ? new URL(href, baseUrl).href : baseUrl;
    const imageUrl = src ? (src.startsWith('//') ? 'https:' + src : src) : '';

    return [{ title, originalPrice, salePrice, discountPct, url, imageUrl }];
  });

  return deals
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, 10);
}

// Self-contained — re-declares constants and helpers inline because
// chrome.scripting.executeScript serializes the function and loses module scope.
export function extractDealsFromDOM() {
  const baseUrl = 'https://www.joybuy.fr';

  function parsePrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^\d.,]/g, '');
    // Remove thousands-separator dots (e.g. "1.299,00" → "1299,00")
    const normalised = cleaned.replace(/\.(?=\d{3}(?:[,]|$))/g, '').replace(',', '.');
    const num = parseFloat(normalised);
    return isNaN(num) ? null : num;
  }

  // Product cards use the stable "sgm_pc" class; data-exp carries price metadata.
  const items = Array.from(document.querySelectorAll('.sgm_pc'));

  const deals = items.flatMap(item => {
    let originalPrice = null;
    let salePrice = null;

    // data-exp.firprice is an inflated internal reference price, NOT the displayed
    // crossed-out price. Use data-exp only to filter non-product cards and read secprice.
    const dataExp = item.getAttribute('data-exp');
    if (dataExp) {
      try {
        const exp = JSON.parse(dataExp);
        if (exp.biz_type !== 'product') return [];
        const sec = parseFloat((exp.json_param || {}).secprice);
        if (!isNaN(sec) && sec > 0) salePrice = sec;
      } catch (_) {
        // fall through to DOM parsing
      }
    }

    // .productCartItem: [0] = sale price, [1] = crossed-out original price.
    // Always read originalPrice from DOM — data-exp.firprice is unreliable.
    const priceContainers = Array.from(item.querySelectorAll('.productCartItem'));
    if (priceContainers.length >= 1 && salePrice === null) {
      salePrice = parsePrice(priceContainers[0].textContent.trim());
    }
    if (priceContainers.length >= 2) {
      originalPrice = parsePrice(priceContainers[1].textContent.trim());
    }

    const title = item.querySelector('img[alt]')?.getAttribute('alt')?.trim();
    const href = item.querySelector('a[href]')?.getAttribute('href');
    const src = item.querySelector('img')?.getAttribute('src');

    if (!title || !originalPrice || !salePrice || originalPrice <= salePrice) return [];

    const discountPct = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    const url = href ? new URL(href, baseUrl).href : baseUrl;
    const imageUrl = src ? (src.startsWith('//') ? 'https:' + src : src) : '';

    return [{ title, originalPrice, salePrice, discountPct, url, imageUrl }];
  });

  return deals
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, 10);
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,]/g, '');
  // Remove thousands-separator dots (e.g. "1.299,00" → "1299,00")
  const normalised = cleaned.replace(/\.(?=\d{3}(?:[,]|$))/g, '').replace(',', '.');
  const num = parseFloat(normalised);
  return isNaN(num) ? null : num;
}
