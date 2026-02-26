/**
 * Dashboard Page
 * Page: index.html (standalone — not loaded by container.html)
 * Globals used: (none — self-contained; defines own esc())
 * Globals defined: containers, loadContainers(), render(), deleteContainer(), esc()
 * API: GET /api/containers, DELETE /api/containers/:id
 *
 * Main landing page that lists all containers as cards with product name,
 * competitor count, and metadata count. Supports search filtering and deletion.
 */
const grid = document.getElementById('containers-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search');

let containers = [];

async function loadContainers() {
  const res = await fetch('/api/containers');
  containers = await res.json();
  render(containers);
}

function render(list) {
  if (list.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  grid.innerHTML = list.map(c => `
    <div class="card product-card" data-id="${c.id}">
      <h3>${esc(c.name)}</h3>
      <div class="meta">
        <span>${esc(c.my_product?.name || 'No product')}</span>
      </div>
      <div class="urls">
        <span class="badge badge-primary">${c.competitor_count} competitor${c.competitor_count !== 1 ? 's' : ''}</span>
        <span class="badge badge-meta-other">${c.metadata_count} note${c.metadata_count !== 1 ? 's' : ''}</span>
        ${c.last_analysis ? `<span class="badge badge-${c.last_analysis.status === 'completed' ? 'google' : c.last_analysis.status === 'failed' ? 'danger' : 'fb'}">${c.last_analysis.status}</span>` : ''}
      </div>
      <div class="actions">
        <a href="/container.html?id=${c.id}" class="btn btn-primary btn-sm">Open</a>
        <button class="btn btn-danger btn-sm" onclick="deleteContainer('${c.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function deleteContainer(id) {
  if (!confirm('Delete this container and all its data?')) return;
  await fetch(`/api/containers/${id}`, { method: 'DELETE' });
  loadContainers();
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

searchInput.addEventListener('input', () => {
  const q = searchInput.value.toLowerCase();
  const filtered = containers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.my_product?.name && c.my_product.name.toLowerCase().includes(q))
  );
  render(filtered);
});

loadContainers();
