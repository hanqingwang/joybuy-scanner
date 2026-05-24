import { parseDeals } from '../scraper.js';

// Fixture HTML mirrors placeholder selectors (joybuy.fr is JS-rendered; no product HTML available via curl)
const FIXTURE_HTML = `
<html><body>
  <div class="product-item">
    <a href="/product/phone-123">
      <img src="https://img.joybuy.fr/phone.jpg" />
      <h3 class="product-title">Xiaomi Redmi Note 13</h3>
      <del class="original-price">299.99</del>
      <span class="sale-price">149.99</span>
    </a>
  </div>
  <div class="product-item">
    <a href="/product/watch-456">
      <img src="https://img.joybuy.fr/watch.jpg" />
      <h3 class="product-title">Amazfit GTR 4</h3>
      <del class="original-price">149.99</del>
      <span class="sale-price">89.99</span>
    </a>
  </div>
  <div class="product-item">
    <a href="/product/headphones-789">
      <img src="https://img.joybuy.fr/headphones.jpg" />
      <h3 class="product-title">Sony WH-1000XM5</h3>
      <del class="original-price">349.99</del>
      <span class="sale-price">209.99</span>
    </a>
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
      url: 'https://www.joybuy.fr/product/phone-123',
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
      <div class="product-item">
        <a href="/product/item-${i}">
          <img src="https://img.joybuy.fr/item${i}.jpg" />
          <h3 class="product-title">Product ${i}</h3>
          <del class="original-price">${100 + i}.00</del>
          <span class="sale-price">${50 + i}.00</span>
        </a>
      </div>
    `).join('');
    const html = `<html><body>${items}</body></html>`;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBeLessThanOrEqual(10);
  });

  test('skips items with missing or unparseable prices', () => {
    const html = `
      <html><body>
        <div class="product-item">
          <a href="/product/bad">
            <img src="https://img.joybuy.fr/bad.jpg" />
            <h3 class="product-title">Bad Item</h3>
            <del class="original-price"></del>
            <span class="sale-price">50.00</span>
          </a>
        </div>
        <div class="product-item">
          <a href="/product/good">
            <img src="https://img.joybuy.fr/good.jpg" />
            <h3 class="product-title">Good Item</h3>
            <del class="original-price">100.00</del>
            <span class="sale-price">60.00</span>
          </a>
        </div>
      </body></html>
    `;
    const deals = parseDeals(html, 'https://www.joybuy.fr');
    expect(deals.length).toBe(1);
    expect(deals[0].title).toBe('Good Item');
  });

  test('returns empty array for HTML with no matching items', () => {
    const deals = parseDeals('<html><body><p>No deals</p></body></html>', 'https://www.joybuy.fr');
    expect(deals).toEqual([]);
  });
});
