/**
 * Add / Edit Container Form
 * Page: add-container.html (standalone — not loaded by container.html)
 * Globals used: (none — self-contained; defines own esc())
 * Globals defined: editId, competitorCount, toggleMyProduct(), addCompetitor(),
 *   removeCompetitor(), updateNumbers(), loadContainer(), esc()
 * API: POST /api/containers, PUT /api/containers/:id, GET /api/containers/:id
 *
 * Form for creating or editing a container. Manages my-product fields and
 * up to 25 competitor entries with name, website, and ad library URLs.
 */
const form = document.getElementById('container-form');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const competitorsList = document.getElementById('competitors-list');
const addCompBtn = document.getElementById('add-competitor-btn');
const noProductCheckbox = document.getElementById('no_my_product');

const params = new URLSearchParams(window.location.search);
const editId = params.get('id');

let competitorCount = 0;

function toggleMyProduct() {
  const section = document.getElementById('my-product-section');
  const nameInput = document.getElementById('my_name');
  if (noProductCheckbox.checked) {
    section.style.display = 'none';
    nameInput.required = false;
  } else {
    section.style.display = '';
    nameInput.required = true;
  }
}

if (editId) {
  formTitle.textContent = 'Edit Container';
  submitBtn.textContent = 'Update Container';
  document.title = 'Edit Container - ProductBrain';
  loadContainer(editId);
} else {
  addCompetitor();
}

function addCompetitor(data) {
  if (competitorCount >= 25) { alert('Maximum 25 competitors'); return; }
  competitorCount++;
  const idx = competitorCount;
  const div = document.createElement('div');
  div.className = 'competitor-entry card';
  div.style.marginBottom = '12px';
  div.style.padding = '16px';
  div.dataset.idx = idx;
  if (data && data.id) div.dataset.compId = data.id;
  div.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <strong>Competitor ${idx}</strong>
      <button type="button" class="btn btn-danger btn-sm" onclick="removeCompetitor(this)">Remove</button>
    </div>
    <div class="form-group">
      <label>Name *</label>
      <input type="text" class="comp-name" required placeholder="Competitor name" value="${esc(data?.name || '')}">
    </div>
    <div class="form-group">
      <label>Website</label>
      <input type="url" class="comp-website" placeholder="https://..." value="${esc(data?.website || '')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Facebook Ads Library URL</label>
        <input type="url" class="comp-fb" placeholder="https://www.facebook.com/ads/library/?..." value="${esc(data?.fb_ads_url || '')}">
      </div>
      <div class="form-group">
        <label>Google Ads Transparency URL</label>
        <input type="url" class="comp-google" placeholder="https://adstransparency.google.com/advertiser/..." value="${esc(data?.google_ads_url || '')}">
      </div>
    </div>
  `;
  competitorsList.appendChild(div);
  updateNumbers();
}

function removeCompetitor(btn) {
  btn.closest('.competitor-entry').remove();
  competitorCount--;
  updateNumbers();
}

function updateNumbers() {
  const entries = competitorsList.querySelectorAll('.competitor-entry');
  entries.forEach((el, i) => {
    el.querySelector('strong').textContent = `Competitor ${i + 1}`;
  });
}

addCompBtn.addEventListener('click', () => addCompetitor());

async function loadContainer(id) {
  const res = await fetch(`/api/containers/${id}`);
  if (!res.ok) { alert('Container not found'); window.location.href = '/'; return; }
  const c = await res.json();
  document.getElementById('name').value = c.name || '';
  if (!c.my_product) {
    noProductCheckbox.checked = true;
    toggleMyProduct();
  } else {
    document.getElementById('my_name').value = c.my_product.name || '';
    document.getElementById('my_website').value = c.my_product.website || '';
    document.getElementById('my_fb').value = c.my_product.fb_ads_url || '';
    document.getElementById('my_google').value = c.my_product.google_ads_url || '';
    document.getElementById('my_site_type').value = c.my_product.site_type || '';
    document.getElementById('my_unique_angle').value = c.my_product.unique_angle || '';
    document.getElementById('my_target_audience').value = c.my_product.target_audience || '';
  }
  for (const comp of c.competitors) {
    addCompetitor(comp);
  }
  if (c.competitors.length === 0) addCompetitor();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const competitors = [];
  for (const entry of competitorsList.querySelectorAll('.competitor-entry')) {
    const name = entry.querySelector('.comp-name').value.trim();
    if (!name) continue;
    competitors.push({
      id: entry.dataset.compId || undefined,
      name,
      website: entry.querySelector('.comp-website').value.trim(),
      fb_ads_url: entry.querySelector('.comp-fb').value.trim(),
      google_ads_url: entry.querySelector('.comp-google').value.trim(),
    });
  }

  const data = {
    name: document.getElementById('name').value.trim(),
    my_product: noProductCheckbox.checked ? null : {
      name: document.getElementById('my_name').value.trim(),
      website: document.getElementById('my_website').value.trim(),
      fb_ads_url: document.getElementById('my_fb').value.trim(),
      google_ads_url: document.getElementById('my_google').value.trim(),
      site_type: document.getElementById('my_site_type').value.trim(),
      unique_angle: document.getElementById('my_unique_angle').value.trim(),
      target_audience: document.getElementById('my_target_audience').value.trim(),
    },
    competitors,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const url = editId ? `/api/containers/${editId}` : '/api/containers';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const result = await res.json();
      window.location.href = editId ? `/container.html?id=${editId}` : `/container.html?id=${result.id}`;
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to save');
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Update Container' : 'Create Container';
    }
  } catch (e) {
    alert('Failed to save');
    submitBtn.disabled = false;
    submitBtn.textContent = editId ? 'Update Container' : 'Create Container';
  }
});

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
