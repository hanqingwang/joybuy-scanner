document.addEventListener('DOMContentLoaded', () => {
  loadAndRender();

  document.getElementById('scan-now-btn').addEventListener('click', () => {
    const btn = document.getElementById('scan-now-btn');
    btn.disabled = true;
    btn.textContent = 'Scanning...';

    chrome.runtime.sendMessage({ type: 'scan' }, () => {
      loadAndRender();
      btn.disabled = false;
      btn.textContent = 'Scan Now';
    });
  });
});

function loadAndRender() {
  chrome.storage.local.get(['deals', 'lastScan', 'scanStatus'], ({ deals, lastScan, scanStatus }) => {
    renderStatus(lastScan, scanStatus, deals?.length ?? 0);
    renderDeals(deals, scanStatus);
  });
}

function renderStatus(lastScan, scanStatus, count) {
  const lastScanEl = document.getElementById('last-scan-text');
  const countEl = document.getElementById('deal-count-text');

  if (!lastScan) {
    lastScanEl.textContent = 'Aucun scan effectué';
    countEl.textContent = '';
    return;
  }

  const age = formatAge(new Date(lastScan));
  lastScanEl.textContent = scanStatus === 'error'
    ? `Dernier scan échoué · ${age}`
    : `Dernier scan : ${age}`;

  countEl.textContent = scanStatus === 'ok' ? `${count} offre${count !== 1 ? 's' : ''}` : '';
}

function renderDeals(deals, scanStatus) {
  const list = document.getElementById('deal-list');

  if (scanStatus === 'error') {
    list.innerHTML = `<div class="error-state">Scan échoué.<br/>Vérifiez votre connexion et cliquez sur <strong>Scan Now</strong>.</div>`;
    return;
  }

  if (!deals || deals.length === 0) {
    list.innerHTML = `<div class="empty-state">Aucune offre trouvée.<br/>Cliquez sur <strong>Scan Now</strong> pour lancer un scan.</div>`;
    return;
  }

  list.innerHTML = deals.map(deal => `
    <a class="deal-item" href="${escHtml(deal.url)}" target="_blank">
      ${deal.imageUrl
        ? `<img class="deal-thumb" src="${escHtml(deal.imageUrl)}" alt="" />`
        : `<div class="deal-thumb-placeholder">🛍️</div>`
      }
      <div class="deal-info">
        <div class="deal-title">${escHtml(deal.title)}</div>
        <div class="deal-prices">
          <span class="original-price">€${deal.originalPrice.toFixed(2)}</span>
          <span class="sale-price">€${deal.salePrice.toFixed(2)}</span>
        </div>
      </div>
      <span class="discount-badge ${deal.discountPct >= 40 ? 'high' : 'medium'}">-${deal.discountPct}%</span>
    </a>
  `).join('');
}

function formatAge(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  return `il y a ${Math.floor(diffH / 24)}j`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
