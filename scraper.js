// joybuy.fr is a client-side rendered Next.js SPA (App Router).
// The homepage serves SSR product listings. Product cards use the class "sgm_pc"
// (stable) with a "data-exp" JSON attribute.
//
// IMPORTANT — verified against product detail page RSC payloads (2025-05):
//   data-exp.firprice = sale price (maps to mainPrice on detail page)
//   data-exp.secprice = crossed-out original price (maps to crossOffPrice on detail page)
// The naming is counter-intuitive ("fir" = first/sale, "sec" = second/original).
// .productCartItem DOM nodes render inflated MSRP reference values — do NOT use them.
//
// Real DOM structure observed on joybuy.fr (2025-05):
//   <div class="sgm_pc style_UK_product_card__<hash>..."
//        data-exp='{"biz_type":"product","json_param":{"firprice":"26.64","secprice":"28.39","skuid":"10177595",...}}'>
//     <a href="/dp/<slug>/<skuId>">
//       <img alt="<product title>" class="style_UK_skuImg__<hash>" src="//images4.joy-sourcing.com/...">
//     </a>
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
  // Prices come exclusively from data-exp JSON (firprice=sale, secprice=original).
  // .productCartItem is kept here for reference but NOT used — those nodes contain
  // inflated MSRP reference values that do not match real product prices.
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
        const params = exp.json_param || {};
        // On joybuy.fr homepage cards: firprice = sale price (mainPrice),
        // secprice = crossed-out original price (crossOffPrice).
        // .productCartItem DOM nodes contain inflated reference prices — do not use them.
        const fir = parseFloat(params.firprice);
        const sec = parseFloat(params.secprice);
        if (!isNaN(fir) && fir > 0) salePrice = fir;
        if (!isNaN(sec) && sec > 0) originalPrice = sec;
      } catch (_) {
        return [];
      }
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

    // firprice = sale price (mainPrice), secprice = crossed-out original (crossOffPrice).
    // .productCartItem DOM nodes contain inflated reference prices — do not use them.
    const dataExp = item.getAttribute('data-exp');
    if (dataExp) {
      try {
        const exp = JSON.parse(dataExp);
        if (exp.biz_type !== 'product') return [];
        const params = exp.json_param || {};
        const fir = parseFloat(params.firprice);
        const sec = parseFloat(params.secprice);
        if (!isNaN(fir) && fir > 0) salePrice = fir;
        if (!isNaN(sec) && sec > 0) originalPrice = sec;
      } catch (_) {
        return [];
      }
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
