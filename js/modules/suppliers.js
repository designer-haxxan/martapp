// Supplier management: profiles, pricing tiers, and payment terms.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, today, fmtNum, fmtDate } from '../core/utils.js';
import * as Auth from '../services/auth.js';
import { tr } from '../i18n/i18n.js';

const $ = window.jQuery;

// Get all suppliers
export async function getSuppliers() {
  return idb.getAll('suppliers');
}

// Save supplier
export async function saveSupplier(supplier) {
  if (!supplier.id) supplier.id = `supplier-${Date.now()}`;
  if (!supplier.createdAt) supplier.createdAt = today();
  supplier.updatedAt = today();

  await idb.put('suppliers', supplier);
  return supplier;
}

// Delete supplier
export async function deleteSupplier(id) {
  await idb.delete('suppliers', id);
}

// Get supplier
export async function getSupplier(id) {
  return idb.get('suppliers', id);
}

// Add/Update supplier pricing
export async function savePricing(pricing) {
  if (!pricing.id) pricing.id = `pricing-${Date.now()}`;
  pricing.updatedAt = today();

  await idb.put('supplierPricing', pricing);
  return pricing;
}

// Get supplier pricing for product
export async function getProductPricing(supplierId, productId) {
  const all = await idb.getAll('supplierPricing');
  return all.find(p => p.supplierId === supplierId && p.productId === productId);
}

// Get all pricing for supplier
export async function getSupplierPricing(supplierId) {
  const all = await idb.getAll('supplierPricing');
  return all.filter(p => p.supplierId === supplierId);
}

// Create supplier dialog
export async function editSupplier(supplier = null) {
  const s = supplier || { paymentTerms: 'Cash on Delivery', creditDays: 0, creditLimit: 0 };

  return UI.formModal({
    title: supplier ? `Edit Supplier` : 'New Supplier',
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">Supplier Name *</label>
        <input type="text" name="name" class="form-control" value="${esc(s.name || '')}" required>
      </div>
      <div class="col-md-6"><label class="form-label">Contact Person</label>
        <input type="text" name="contactPerson" class="form-control" value="${esc(s.contactPerson || '')}">
      </div>
      <div class="col-md-6"><label class="form-label">Supplier Code</label>
        <input type="text" name="code" class="form-control" value="${esc(s.code || '')}">
      </div>
      <div class="col-md-6"><label class="form-label">Phone</label>
        <input type="tel" name="phone" class="form-control" value="${esc(s.phone || '')}">
      </div>
      <div class="col-md-6"><label class="form-label">Email</label>
        <input type="email" name="email" class="form-control" value="${esc(s.email || '')}">
      </div>
      <div class="col-12"><label class="form-label">Address</label>
        <textarea name="address" class="form-control" rows="2">${esc(s.address || '')}</textarea>
      </div>
      <div class="col-md-6"><label class="form-label">Payment Terms</label>
        <select name="paymentTerms" class="form-select">
          <option value="Cash on Delivery" ${s.paymentTerms === 'Cash on Delivery' ? 'selected' : ''}>Cash on Delivery</option>
          <option value="Advance Payment" ${s.paymentTerms === 'Advance Payment' ? 'selected' : ''}>Advance Payment</option>
          <option value="Credit Terms" ${s.paymentTerms === 'Credit Terms' ? 'selected' : ''}>Credit Terms</option>
          <option value="Check on Delivery" ${s.paymentTerms === 'Check on Delivery' ? 'selected' : ''}>Check on Delivery</option>
        </select>
      </div>
      <div class="col-md-6"><label class="form-label">Credit Days (if applicable)</label>
        <input type="number" name="creditDays" class="form-control" value="${s.creditDays || 0}">
      </div>
      <div class="col-md-6"><label class="form-label">Credit Limit</label>
        <input type="number" name="creditLimit" class="form-control" inputmode="decimal" value="${s.creditLimit || 0}" step="0.01">
      </div>
      <div class="col-12"><label class="form-label">Categories Supplied (comma-separated)</label>
        <input type="text" name="categories" class="form-control" value="${esc((s.categories || []).join(', '))}" placeholder="Bakery, Dairy, Produce">
      </div>
      <div class="col-12"><label class="form-label">Notes</label>
        <textarea name="notes" class="form-control" rows="2">${esc(s.notes || '')}</textarea>
      </div>
    </div>`,
    onSubmit: (v) => {
      const categories = v.categories ? v.categories.split(',').map(c => c.trim()).filter(c => c) : [];
      return saveSupplier({
        ...s,
        ...v,
        creditDays: parseInt(v.creditDays) || 0,
        creditLimit: parseFloat(v.creditLimit) || 0,
        categories
      });
    }
  });
}

// Main supplier list render
async function renderList(el) {
  const $el = $(el);

  $el.html(`
    ${UI.pageHeader(tr('suppliers'), `<button class="btn btn-primary btn-sm btn-add"><i class="bi bi-plus-lg"></i> ${tr('add')}</button>`)}
    <div class="list-card"></div>
  `);

  const load = async () => {
    const suppliers = await getSuppliers();

    if (suppliers.length === 0) {
      $el.find('.list-card').html(UI.emptyState('No suppliers yet', 'box'));
      return;
    }

    const html = suppliers.map((s) => {
      const categories = (s.categories || []).join(', ') || 'General';
      return `<a class="list-row" href="#/suppliers/${encodeURIComponent(s.id)}">
        <div class="main">
          <div class="title">${esc(s.name)}</div>
          <div class="sub">📞 ${esc(s.phone || 'N/A')} • ${esc(categories)}</div>
        </div>
        <div class="end">
          <div class="small text-body-secondary">${esc(s.paymentTerms)}</div>
        </div>
      </a>`;
    }).join('');

    $el.find('.list-card').html(html);
  };

  await load();

  $el.on('click', '.btn-add', async () => { if (await editSupplier()) load(); });
}

// Supplier detail view
async function renderDetail(el, id) {
  const $el = $(el).off();
  const supplier = await getSupplier(id);

  if (!supplier) {
    $el.html(UI.pageHeader(tr('suppliers'), '', '#/suppliers') + UI.emptyState('Supplier not found', 'x-circle'));
    return;
  }

  const pricing = await getSupplierPricing(id);

  $el.html(`
    ${UI.pageHeader(esc(supplier.name), `
      <button class="btn btn-light btn-sm btn-edit"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-light btn-sm btn-delete"><i class="bi bi-trash"></i></button>
    `, '#/suppliers')}

    <div class="card mb-3">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <div class="stat-label">Contact Person</div>
            <div class="stat-value">${esc(supplier.contactPerson || 'N/A')}</div>
          </div>
          <div class="col-md-6">
            <div class="stat-label">Supplier Code</div>
            <div class="stat-value">${esc(supplier.code || 'N/A')}</div>
          </div>
          <div class="col-md-6">
            <div class="stat-label">Phone</div>
            <div><a href="tel:${esc(supplier.phone)}">${esc(supplier.phone || 'N/A')}</a></div>
          </div>
          <div class="col-md-6">
            <div class="stat-label">Email</div>
            <div><a href="mailto:${esc(supplier.email)}">${esc(supplier.email || 'N/A')}</a></div>
          </div>
          <div class="col-12">
            <div class="stat-label">Address</div>
            <div>${esc(supplier.address || 'N/A')}</div>
          </div>
          <div class="col-md-6">
            <div class="stat-label">Payment Terms</div>
            <div>${esc(supplier.paymentTerms)}</div>
          </div>
          <div class="col-md-6">
            <div class="stat-label">Credit Terms</div>
            <div>${supplier.creditDays} days (Limit: ৳${fmtNum(supplier.creditLimit)})</div>
          </div>
          <div class="col-12">
            <div class="stat-label">Categories</div>
            <div>${(supplier.categories || []).map(c => `<span class="badge bg-primary">${esc(c)}</span>`).join(' ')}</div>
          </div>
        </div>
        ${supplier.notes ? `<div class="mt-3 p-2 bg-light rounded"><strong>Notes:</strong> ${esc(supplier.notes)}</div>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Bulk Pricing</h5>
        <button class="btn btn-primary btn-sm btn-add-pricing"><i class="bi bi-plus-lg"></i> Add Price</button>
      </div>
      <div class="pricing-list"></div>
    </div>
  `);

  const loadPricing = async () => {
    const prices = await getSupplierPricing(id);
    if (prices.length === 0) {
      $el.find('.pricing-list').html('<div class="p-3 text-center text-body-secondary">No bulk pricing configured</div>');
      return;
    }

    const html = prices.map((p) => {
      return `<div class="list-row" style="padding: 10px 14px; border-bottom: 1px solid var(--bs-border-color-translucent);">
        <div class="main">
          <div class="title">${esc(p.productName || p.productId)} - Minimum: ${p.minQuantity} units</div>
          <div class="sub">Price: ৳${fmtNum(p.pricePerUnit)}/unit</div>
        </div>
        <div class="end">
          <button class="btn btn-sm btn-light btn-edit-price" data-price-id="${esc(p.id)}"><i class="bi bi-pencil"></i></button>
        </div>
      </div>`;
    }).join('');

    $el.find('.pricing-list').html(html);
  };

  await loadPricing();

  $el.on('click', '.btn-edit', async () => { if (await editSupplier(supplier)) renderDetail(el, id); });

  $el.on('click', '.btn-delete', async () => {
    if (await UI.confirmDialog(`Delete supplier "${supplier.name}"?`, { okLabel: 'Delete', okClass: 'btn-danger' })) {
      await deleteSupplier(id);
      UI.toast('Supplier deleted');
      location.hash = '#/suppliers';
    }
  });

  $el.on('click', '.btn-add-pricing', async () => {
    // Simple pricing dialog
    const products = await idb.getAll('products');
    const result = await UI.formModal({
      title: 'Add Bulk Pricing',
      body: `<div class="row g-2">
        <div class="col-12"><label class="form-label">Product *</label>
          <select name="productId" class="form-select" required>
            <option value="">Select product...</option>
            ${products.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="col-6"><label class="form-label">Min. Quantity *</label>
          <input type="number" name="minQuantity" class="form-control" value="10" required>
        </div>
        <div class="col-6"><label class="form-label">Price per Unit *</label>
          <input type="number" name="pricePerUnit" class="form-control" inputmode="decimal" placeholder="0.00" step="0.01" required>
        </div>
      </div>`,
      onSubmit: async (v) => {
        const product = products.find(p => p.id === v.productId);
        await savePricing({
          supplierId: id,
          productId: v.productId,
          productName: product?.name,
          minQuantity: parseInt(v.minQuantity),
          pricePerUnit: parseFloat(v.pricePerUnit),
        });
        await loadPricing();
      }
    });
  });
}

export default {
  async render(el, { route }) {
    if (!Auth.can('purchase.manage')) {
      $(el).html(UI.pageHeader(tr('suppliers'), '') + UI.emptyState('Access denied', 'lock'));
      return;
    }

    const [, id] = route.split('/');
    if (id) renderDetail(el, decodeURIComponent(id));
    else renderList(el);
  }
}
