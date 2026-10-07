// Batch & Expiry tracking: manage product batches with production dates, expiry dates, and quantities.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, today, fmtDate, fmtNum } from '../core/utils.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import { tr } from '../i18n/i18n.js';

const $ = window.jQuery;

// Get all batches for a product or all batches
export async function getBatches(productId = null) {
  const batches = await idb.getAll('batches');
  return productId ? batches.filter(b => b.productId === productId) : batches;
}

// Get active batches (not expired or archived)
export async function getActiveBatches(productId = null) {
  const batches = await getBatches(productId);
  return batches.filter(b => b.status === 'active' && b.expiryDate >= today());
}

// Get expiring batches (< 7 days from now)
export async function getExpiringBatches(days = 7) {
  const batches = await getBatches();
  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + days);
  const expireDateStr = expireDate.toISOString().split('T')[0];

  return batches.filter(b =>
    b.status === 'active' &&
    b.expiryDate >= today() &&
    b.expiryDate <= expireDateStr
  ).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

// Get expired batches
export async function getExpiredBatches() {
  const batches = await getBatches();
  return batches.filter(b => b.expiryDate < today() && b.status !== 'disposed');
}

// Save batch
export async function saveBatch(batch) {
  if (!batch.id) batch.id = `batch-${Date.now()}`;
  if (!batch.createdAt) batch.createdAt = today();
  if (!batch.status) batch.status = 'active';

  await idb.put('batches', batch);
  return batch;
}

// Delete batch
export async function deleteBatch(id) {
  await idb.delete('batches', id);
}

// Mark batch as disposed/expired
export async function disposeBatch(id) {
  const batch = await idb.get('batches', id);
  if (batch) {
    batch.status = 'disposed';
    batch.disposedAt = today();
    await idb.put('batches', batch);
  }
}

// Get batch details
export async function getBatch(id) {
  return idb.get('batches', id);
}

// Calculate days until expiry
function daysToExpiry(expiryDate) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Get batch status badge
function getBatchStatusBadge(batch) {
  const days = daysToExpiry(batch.expiryDate);
  if (batch.status === 'disposed') {
    return '<span class="badge text-bg-secondary">Disposed</span>';
  } else if (batch.status === 'archived') {
    return '<span class="badge text-bg-dark">Archived</span>';
  } else if (days < 0) {
    return '<span class="badge text-bg-danger">Expired</span>';
  } else if (days <= 3) {
    return '<span class="badge text-bg-danger">Expiring Soon</span>';
  } else if (days <= 7) {
    return '<span class="badge text-bg-warning">Expiring</span>';
  } else {
    return '<span class="badge text-bg-success">Active</span>';
  }
}

// Create batch dialog
export async function editBatch(batch = null, productId = null) {
  const b = batch || { status: 'active', quantity: 0, costPrice: 0 };
  const products = await idb.getAll('products');

  return UI.formModal({
    title: batch ? `Edit Batch` : 'New Batch',
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">Product *</label>
        <select name="productId" class="form-select" ${batch ? 'disabled' : ''} required>
          <option value="">Select product...</option>
          ${products.map(p => `<option value="${esc(p.id)}" ${p.id === (b.productId || productId) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="col-6"><label class="form-label">Production Date *</label>
        <input type="date" name="productionDate" class="form-control" value="${esc(b.productionDate || today())}" required>
      </div>
      <div class="col-6"><label class="form-label">Expiry Date *</label>
        <input type="date" name="expiryDate" class="form-control" value="${esc(b.expiryDate || '')}" required>
      </div>
      <div class="col-6"><label class="form-label">Quantity *</label>
        <input type="number" name="quantity" class="form-control" inputmode="decimal" value="${b.quantity || ''}" placeholder="0" required>
      </div>
      <div class="col-6"><label class="form-label">Cost Price (per unit)</label>
        <input type="number" name="costPrice" class="form-control" inputmode="decimal" value="${b.costPrice || ''}" placeholder="0" step="0.01">
      </div>
      <div class="col-12"><label class="form-label">Status</label>
        <select name="status" class="form-select">
          <option value="active" ${b.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="archived" ${b.status === 'archived' ? 'selected' : ''}>Archived</option>
          <option value="disposed" ${b.status === 'disposed' ? 'selected' : ''}>Disposed</option>
        </select>
      </div>
      <div class="col-12"><label class="form-label">Notes</label>
        <textarea name="notes" class="form-control" rows="2">${esc(b.notes || '')}</textarea>
      </div>
    </div>`,
    onSubmit: (v) => saveBatch({ ...b, ...v, quantity: parseFloat(v.quantity), costPrice: parseFloat(v.costPrice) }),
  });
}

// Main batch list render
async function renderList(el) {
  const $el = $(el);
  const expiringBatches = await getExpiringBatches(7);
  const expiredBatches = await getExpiredBatches();

  $el.html(`
    ${UI.pageHeader(tr('batchTracking'), `<button class="btn btn-primary btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${tr('newBatch')}</button>`)}
    <div class="alerts"></div>
    <div class="tabs"></div>
  `);

  // Show alerts for expiring/expired items
  let alertsHtml = '';
  if (expiredBatches.length > 0) {
    alertsHtml += `<div class="alert alert-danger"><strong>⚠️ ${expiredBatches.length}</strong> expired batches - review for disposal</div>`;
  }
  if (expiringBatches.length > 0) {
    alertsHtml += `<div class="alert alert-warning"><strong>⏰ ${expiringBatches.length}</strong> batches expiring within 7 days</div>`;
  }

  if (alertsHtml) $el.find('.alerts').html(alertsHtml);

  // Tab navigation
  const tabs = [
    { id: 'active', label: tr('active'), filter: (b) => b.status === 'active' && b.expiryDate >= today() },
    { id: 'expiring', label: tr('aboutToExpire'), filter: (b) => b.status === 'active' && daysToExpiry(b.expiryDate) <= 7 && daysToExpiry(b.expiryDate) >= 0 },
    { id: 'expired', label: tr('expired'), filter: (b) => b.expiryDate < today() },
    { id: 'archived', label: tr('archived'), filter: (b) => b.status === 'archived' || b.status === 'disposed' },
  ];

  const tabsHtml = `<div class="btn-group mb-3" role="tablist">
    ${tabs.map(t => `<button class="btn btn-outline-secondary btn-tab" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}
  </div>`;

  $el.find('.tabs').append(tabsHtml);
  $el.find('.btn-tab').first().addClass('active');

  const load = async () => {
    const batches = await getBatches();

    tabs.forEach(tab => {
      const filtered = batches.filter(tab.filter);
      const html = filtered.length ? `
        <div class="list-card">
          ${filtered.map((b) => {
            const product = Catalog.findProductById(b.productId);
            const daysLeft = daysToExpiry(b.expiryDate);
            return `<a class="list-row" href="#/batches/${encodeURIComponent(b.id)}">
              <div class="main">
                <div class="title">${esc(product?.name || b.productId)} - ${esc(b.productionDate)}</div>
                <div class="sub">Expires: ${esc(b.expiryDate)} (${daysLeft >= 0 ? daysLeft + ' days' : 'expired'})</div>
              </div>
              <div class="end">
                <div class="fw-semibold">${fmtNum(b.quantity)} units</div>
                <div class="small text-body-secondary">৳${fmtNum(b.costPrice * b.quantity)}</div>
              </div>
            </a>`;
          }).join('')}
        </div>
      ` : `<div class="empty-state text-center py-4"><div class="text-body-secondary">No batches in this category</div></div>`;

      $el.find(`[data-tab-content="${tab.id}"]`).html(html);
    });
  };

  // Create tab content areas
  const contentHtml = tabs.map(t => `<div data-tab-content="${t.id}"></div>`).join('');
  $el.append(contentHtml);

  await load();

  // Tab switching
  $el.on('click', '.btn-tab', function() {
    $el.find('.btn-tab').removeClass('active');
    $(this).addClass('active');
    const tabId = $(this).data('tab');
    $el.find('[data-tab-content]').addClass('d-none');
    $el.find(`[data-tab-content="${tabId}"]`).removeClass('d-none');
  });

  $el.find('.btn-tab').first().trigger('click');

  $el.on('click', '.btn-add', async () => { if (await editBatch()) load(); });
}

// Batch detail view
async function renderDetail(el, id) {
  const $el = $(el).off();
  const batch = await getBatch(id);

  if (!batch) {
    $el.html(UI.pageHeader(tr('batchTracking'), '', '#/batches') + UI.emptyState('Batch not found', 'x-circle'));
    return;
  }

  const product = Catalog.findProductById(batch.productId);
  const daysLeft = daysToExpiry(batch.expiryDate);
  const costTotal = batch.quantity * (batch.costPrice || 0);

  $el.html(`
    ${UI.pageHeader(`${esc(product?.name || batch.productId)}`, `
      <button class="btn btn-light btn-sm btn-edit"><i class="bi bi-pencil"></i></button>
      ${batch.status === 'active' ? `<button class="btn btn-light btn-sm btn-dispose"><i class="bi bi-trash"></i> Dispose</button>` : ''}
    `, '#/batches')}

    <div class="card mb-3">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-sm-6">
            <div class="stat-label">Production Date</div>
            <div class="stat-value">${esc(batch.productionDate)}</div>
          </div>
          <div class="col-sm-6">
            <div class="stat-label">Expiry Date</div>
            <div class="stat-value">${esc(batch.expiryDate)}</div>
          </div>
          <div class="col-sm-6">
            <div class="stat-label">Days Until Expiry</div>
            <div class="stat-value">${daysLeft >= 0 ? daysLeft : '0 (EXPIRED)'}</div>
          </div>
          <div class="col-sm-6">
            <div class="stat-label">Status</div>
            <div>${getBatchStatusBadge(batch)}</div>
          </div>
          <div class="col-sm-6">
            <div class="stat-label">Quantity</div>
            <div class="stat-value">${fmtNum(batch.quantity)} units</div>
          </div>
          <div class="col-sm-6">
            <div class="stat-label">Total Cost</div>
            <div class="stat-value">৳${fmtNum(costTotal)}</div>
          </div>
        </div>
        ${batch.notes ? `<div class="mt-3 p-2 bg-light rounded"><strong>Notes:</strong> ${esc(batch.notes)}</div>` : ''}
      </div>
    </div>
  `);

  $el.on('click', '.btn-edit', async () => { if (await editBatch(batch)) renderDetail(el, id); });
  $el.on('click', '.btn-dispose', async () => {
    if (await UI.confirmDialog(`Mark batch as disposed?`, { okLabel: 'Dispose', okClass: 'btn-danger' })) {
      await disposeBatch(id);
      UI.toast('Batch disposed');
      location.hash = '#/batches';
    }
  });
}

export default {
  async render(el, { route }) {
    if (!Auth.can('stock.manage')) {
      $(el).html(UI.pageHeader(tr('batchTracking'), '') + UI.emptyState('Access denied', 'lock'));
      return;
    }

    const [, id] = route.split('/');
    if (id) renderDetail(el, decodeURIComponent(id));
    else renderList(el);
  }
}
