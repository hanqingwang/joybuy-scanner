// joybuy.fr is a client-side rendered Next.js SPA (App Router).
// The homepage serves SSR product listings. Product cards use the class "sgm_pc"
// (stable) with a "data-exp" JSON attribute.
//
// IMPORTANT — firprice/secprice roles vary by page type (verified 2025-05):
//   Homepage:          fir=original(higher), sec=sale(lower)
//   /promo/best-seller: fir=sale(lower),     sec=original(higher)  — SWAPPED
//   Category pages:    json_param missing prices entirely — use DOM fallback
//   firprice/secprice = -100 is a sentinel meaning "no price" — skip.
// Strategy: treat max(fir,sec) as original and min(fir,sec) as sale.
// DOM fallback (.productCartItem) used only when json_param has no prices.
// All pages that list discounted products. Sourced from sitemap.xml (2025-05).
// The homepage + all /promo/best-seller category pages.
export const TARGET_URLS = [
  'https://www.joybuy.fr/',
  'https://www.joybuy.fr/promo/best-seller',
  'https://www.joybuy.fr/promo/best-seller/T%C3%A9l%C3%A9phones%20et%20tablettes/a76430fd6881430cb6b2b36d39612563',
  'https://www.joybuy.fr/promo/best-seller/Audio%20et%20Hi-Fi/6e9d7d20232a45baa8c50cc5090e01a6',
  'https://www.joybuy.fr/promo/best-seller/%C3%89lectrom%C3%A9nager/59e022726ab742beb6b817f0086ffd95',
  'https://www.joybuy.fr/promo/best-seller/Petits%20Appareils%20de%20Cuisine/fcdaaae6a03b4525935cf47b9167668e',
  'https://www.joybuy.fr/promo/best-seller/Entretien%20des%20Sols/665e1c40b9dc4274b03168ee8beea9a8',
  'https://www.joybuy.fr/promo/best-seller/Soin%20de%20la%20Peau/2794c8ae37a74bcb8e0e37b4faefa517',
  'https://www.joybuy.fr/promo/best-seller/Jeux%20Vid%C3%A9os%20et%20consoles/d80ce4bd8f6c407d8d43fbcd76778a48',
  'https://www.joybuy.fr/promo/best-seller/Maquillage/70599b62b611492aabc41778ac251978',
  'https://www.joybuy.fr/promo/best-seller/Machines%20%C3%A0%20Caf%C3%A9/87a52eea3aa448c9b601661c119c73b0',
  'https://www.joybuy.fr/promo/best-seller/Maison%20%26%20D%C3%A9coration/d8040e8a42274c61946b7438d421dc31',
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
        const p = exp.json_param || {};
        const fir = parseFloat(p.firprice);
        const sec = parseFloat(p.secprice);
        const a = (!isNaN(fir) && fir > 0) ? fir : null;
        const b = (!isNaN(sec) && sec > 0) ? sec : null;
        if (a && b) { originalPrice = Math.max(a, b); salePrice = Math.min(a, b); }
      } catch (_) {
        return [];
      }
    }

    // DOM fallback when json_param has no prices (category pages)
    if (!originalPrice || !salePrice) {
      const priceEls = Array.from(item.querySelectorAll(SELECTORS.salePriceContainer));
      if (priceEls.length >= 2) {
        const p0 = parsePrice(priceEls[0].textContent);
        const p1 = parsePrice(priceEls[1].textContent);
        if (p0 && p1) { originalPrice = Math.max(p0, p1); salePrice = Math.min(p0, p1); }
      }
    }

    const title = item.querySelector(SELECTORS.title)?.getAttribute('alt')?.trim();
    const href = item.querySelector(SELECTORS.link)?.getAttribute('href');
    const src = item.querySelector(SELECTORS.image)?.getAttribute('src');

    if (!title || !originalPrice || !salePrice || originalPrice <= salePrice) return [];
    if (originalPrice > salePrice * 10) return [];

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

    const dataExp = item.getAttribute('data-exp');
    if (dataExp) {
      try {
        const exp = JSON.parse(dataExp);
        if (exp.biz_type !== 'product') return [];
        const p = exp.json_param || {};
        const fir = parseFloat(p.firprice);
        const sec = parseFloat(p.secprice);
        const a = (!isNaN(fir) && fir > 0) ? fir : null;
        const b = (!isNaN(sec) && sec > 0) ? sec : null;
        if (a && b) { originalPrice = Math.max(a, b); salePrice = Math.min(a, b); }
      } catch (_) {
        return [];
      }
    }

    // DOM fallback when json_param has no prices (category pages)
    if (!originalPrice || !salePrice) {
      const priceEls = Array.from(item.querySelectorAll('.productCartItem'));
      if (priceEls.length >= 2) {
        const p0 = parsePrice(priceEls[0].textContent);
        const p1 = parsePrice(priceEls[1].textContent);
        if (p0 && p1) { originalPrice = Math.max(p0, p1); salePrice = Math.min(p0, p1); }
      }
    }

    const title = item.querySelector('img[alt]')?.getAttribute('alt')?.trim();
    const href = item.querySelector('a[href]')?.getAttribute('href');
    const src = item.querySelector('img')?.getAttribute('src');

    if (!title || !originalPrice || !salePrice || originalPrice <= salePrice) return [];
    if (originalPrice > salePrice * 10) return [];

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
