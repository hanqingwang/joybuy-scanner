import { parseDeals, extractDealsFromDOM } from '../scraper.js';

// Fixture HTML mirrors the real joybuy.fr DOM structure observed on 2025-05.
// Product cards use the stable "sgm_pc" class; prices are carried in data-exp JSON
// (firprice = original price, secprice = sale price) with a .productCartItem DOM
// fallback. CSS module hashed class names (e.g. style_UK_product_card__XXXXX) are
// intentionally omitted since they change on every Next.js build.
const FIXTURE_HTML = `
<html><body>
  <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"299.99","secprice":"149.99","skuid":"10001"}}'>
    <a href="/dp/xiaomi-redmi-note-13/10001">
      <img alt="Xiaomi Redmi Note 13" src="https://img.joybuy.fr/phone.jpg" />
    </a>
    <div class="productCartItem">149,99 €</div>
    <div class="productCartItem">299,99 €</div>
  </div>
  <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"149.99","secprice":"89.99","skuid":"10002"}}'>
    <a href="/dp/amazfit-gtr-4/10002">
      <img alt="Amazfit GTR 4" src="https://img.joybuy.fr/watch.jpg" />
    </a>
    <div class="productCartItem">89,99 €</div>
    <div class="productCartItem">149,99 €</div>
  </div>
  <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"349.99","secprice":"209.99","skuid":"10003"}}'>
    <a href="/dp/sony-wh-1000xm5/10003">
      <img alt="Sony WH-1000XM5" src="https://img.joybuy.fr/headphones.jpg" />
    </a>
    <div class="productCartItem">209,99 €</div>
    <div class="productCartItem">349,99 €</div>
  </div>
</body></html>
`;

describe('parseDeals', () => {
  test('extracts title, prices, url, imageUrl from HTML', () => {
    const deals = parseDeals(FIXTURE_HTML, 'https://www.joybuy.fr');
    expect(deals[0]).toMatchObject({
      title: 'Xiaomi Redmi Note 13',
      originalPrice: 299.99,
      salePrice: 149.99,
      url: 'https://www.joybuy.fr/dp/xiaomi-redmi-note-13/10001',
      imageUrl: 'https://img.joybuy.fr/phone.jpg',
    });
  });

  test('computes discountPct correctly', () => {
    const deals = parseDeals(FIXTURE_HTML, 'https://www.joybuy.fr');
    const phone = deals.find(d => d.title === 'Xiaomi Redmi Note 13');
    expect(phone.discountPct).toBeCloseTo(50, 0);
  });

  test('returns deals sorted descending by discountPct', () => {
    const deals = parseDeals(FIXTURE_HTML, 'https://www.joybuy.fr');
    expect(deals[0].discountPct).toBeGreaterThanOrEqual(deals[1].discountPct);
    expect(deals[1].discountPct).toBeGreaterThanOrEqual(deals[2].discountPct);
  });

  test('returns max 10 deals', () => {
    const items = Array.from({ length: 12 }, (_, i) => `
      <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"${100 + i}.00","secprice":"${50 + i}.00","skuid":"${i}"}}'>
        <a href="/dp/product-${i}/${i}">
          <img alt="Product ${i}" src="https://img.joybuy.fr/item${i}.jpg" />
        </a>
        <div class="productCartItem">${50 + i},00 €</div>
        <div class="productCartItem">${100 + i},00 €</div>
      </div>
    `).join('');
    const html = `<html><body>${items}</body></html>`;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(10);
  });

  test('skips items with missing or unparseable prices', () => {
    const html = `
      <html><body>
        <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"-100","secprice":"50.00","skuid":"bad"}}'>
          <a href="/dp/bad/bad">
            <img alt="Bad Item" src="https://img.joybuy.fr/bad.jpg" />
          </a>
        </div>
        <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"100.00","secprice":"60.00","skuid":"good"}}'>
          <a href="/dp/good/good">
            <img alt="Good Item" src="https://img.joybuy.fr/good.jpg" />
          </a>
        </div>
      </body></html>
    `;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(1);
    expect(deals[0].title).toBe('Good Item');
  });

  test('skips items with no data-exp and no productCartItem fallback', () => {
    const html = `
      <html><body>
        <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"100.00","secprice":"60.00","skuid":"123"}}'>
          <a href="/dp/good/123">
            <img alt="Good Product" src="https://img.joybuy.fr/good.jpg" />
          </a>
        </div>
        <div class="sgm_pc">
          <a href="/dp/bad/456">
            <img alt="No Price Product" src="https://img.joybuy.fr/bad.jpg" />
          </a>
        </div>
      </body></html>
    `;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(1);
    expect(deals[0].title).toBe('Good Product');
  });

  test('returns empty array for HTML with no matching items', () => {
    const deals = parseDeals('<html><body><p>No deals</p></body></html>', 'https://www.joybuy.fr');
    expect(deals).toEqual([]);
  });

  test('skips non-product sgm_pc elements (e.g. banners)', () => {
    const html = `
      <html><body>
        <div class="sgm_pc" data-exp='{"biz_type":"banner","json_param":{}}'>
          <a href="/cms/sale"><img alt="Sale Banner" src="banner.jpg" /></a>
        </div>
        <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"80.00","secprice":"40.00","skuid":"p1"}}'>
          <a href="/dp/real-product/p1"><img alt="Real Product" src="product.jpg" /></a>
        </div>
      </body></html>
    `;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(1);
    expect(deals[0].title).toBe('Real Product');
  });
});

describe('parsePrice (via parseDeals)', () => {
  test('handles European format: 1.299,00 € (dot thousands, comma decimal)', () => {
    const html = `
      <html><body>
        <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"1299.00","secprice":"799.00","skuid":"tv1"}}'>
          <a href="/dp/samsung-tv/tv1">
            <img alt="Samsung TV" src="img.jpg" />
          </a>
        </div>
      </body></html>`;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(1);
    expect(deals[0].originalPrice).toBeCloseTo(1299.0, 1);
    expect(deals[0].salePrice).toBeCloseTo(799.0, 1);
    expect(deals[0].discountPct).toBeCloseTo(38, 0);
  });

  test('handles simple comma decimal: 149,99 € via DOM fallback', () => {
    const html = `
      <html><body>
        <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"-100","secprice":"-100","skuid":"w1"}}'>
          <a href="/dp/watch/w1">
            <img alt="Watch" src="img.jpg" />
          </a>
          <div class="productCartItem">89,99 €</div>
          <div class="productCartItem">149,99 €</div>
        </div>
      </body></html>`;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(1);
    expect(deals[0].originalPrice).toBeCloseTo(149.99, 2);
    expect(deals[0].salePrice).toBeCloseTo(89.99, 2);
  });
});

describe('extractDealsFromDOM', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"299.99","secprice":"149.99","skuid":"10001"}}'>
        <a href="/dp/xiaomi-redmi-note-13/10001">
          <img alt="Xiaomi Redmi Note 13" src="https://img.joybuy.fr/phone.jpg" />
        </a>
        <div class="productCartItem">149,99 €</div>
        <div class="productCartItem">299,99 €</div>
      </div>
      <div class="sgm_pc" data-exp='{"biz_type":"product","json_param":{"firprice":"149.99","secprice":"89.99","skuid":"10002"}}'>
        <a href="/dp/amazfit-gtr-4/10002">
          <img alt="Amazfit GTR 4" src="https://img.joybuy.fr/watch.jpg" />
        </a>
        <div class="productCartItem">89,99 €</div>
        <div class="productCartItem">149,99 €</div>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('extracts deals from the live DOM', () => {
    const deals = extractDealsFromDOM();
    expect(deals.length).toBe(2);
    expect(deals[0]).toMatchObject({
      title: 'Xiaomi Redmi Note 13',
      originalPrice: 299.99,
      salePrice: 149.99,
    });
  });

  test('returns deals sorted descending by discountPct', () => {
    const deals = extractDealsFromDOM();
    expect(deals[0].discountPct).toBeGreaterThanOrEqual(deals[1].discountPct);
  });

  test('returns empty array when no product items in DOM', () => {
    document.body.innerHTML = '<p>No deals</p>';
    const deals = extractDealsFromDOM();
    expect(deals).toEqual([]);
  });
});
