/**
 * Metadata / Notes UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc(), editingMetaId — from container.js
 * Globals defined: renderMetadata(), formatMetaType(), showMetadataForm(), hideMetadataForm(),
 *   importHtmlFile(), extractTextFromHtml(), saveMetadata(), editMetadata(), deleteMetadata()
 * API: POST /api/containers/:id/metadata, PUT /api/containers/:id/metadata/:metaId,
 *   DELETE /api/containers/:id/metadata/:metaId
 *
 * Manages product metadata notes (feedback, specs, A/B tests, etc.). Supports
 * creating, editing, deleting notes and importing HTML files as text content.
 */
// ========== Metadata ==========

function renderMetadata() {
  const el = document.getElementById('metadata-list');
  if (!container.metadata || container.metadata.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No notes yet. Add metadata about your product to improve AI proposals.</div>';
    return;
  }
  el.innerHTML = container.metadata.map(m => `
    <div class="metadata-item">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-meta-${m.type}">${formatMetaType(m.type)}</span>
          <strong>${esc(m.title)}</strong>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" onclick="editMetadata('${m.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMetadata('${m.id}')">Delete</button>
        </div>
      </div>
      <div class="metadata-content">${esc(m.content)}</div>
      <div class="text-dim" style="font-size:11px;margin-top:4px;">${new Date(m.created_at).toLocaleString()}</div>
    </div>
  `).join('');
}

function formatMetaType(type) {
  const labels = { user_feedback: 'Feedback', customer_notes: 'Customer Notes', product_specs: 'Specs', ab_tests: 'A/B Tests', form_data: 'Form Data', other: 'Other' };
  return labels[type] || type;
}

function showMetadataForm(meta) {
  editingMetaId = meta ? meta.id : null;
  document.getElementById('meta-type').value = meta ? meta.type : 'user_feedback';
  document.getElementById('meta-title').value = meta ? meta.title : '';
  document.getElementById('meta-content').value = meta ? meta.content : '';
  document.getElementById('metadata-form-container').style.display = 'block';
}

function hideMetadataForm() {
  editingMetaId = null;
  document.getElementById('metadata-form-container').style.display = 'none';
  const fileInput = document.getElementById('meta-html-file');
  if (fileInput) fileInput.value = '';
  const statusEl = document.getElementById('import-status');
  if (statusEl) statusEl.textContent = '';
}

function importHtmlFile(input) {
  const statusEl = document.getElementById('import-status');
  const file = input.files[0];
  if (!file) return;
  statusEl.textContent = 'Reading...';
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const html = e.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, noscript, svg, link, meta').forEach(el => el.remove());
      const body = doc.body || doc.documentElement;
      const text = extractTextFromHtml(body);
      document.getElementById('meta-content').value = text.trim();
      const titleEl = document.getElementById('meta-title');
      if (!titleEl.value.trim()) {
        const pageTitle = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || file.name.replace(/\.html?$/i, '');
        titleEl.value = pageTitle.substring(0, 200);
      }
      statusEl.textContent = `Imported (${text.length} chars)`;
    } catch (err) {
      statusEl.textContent = 'Error parsing HTML';
    }
  };
  reader.onerror = function() { statusEl.textContent = 'Error reading file'; };
  reader.readAsText(file);
}

function extractTextFromHtml(element) {
  const blocks = [];
  const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TD', 'TH', 'DT', 'DD']);
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { const text = node.textContent.replace(/\s+/g, ' ').trim(); if (text) blocks.push(text); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    if (tag.match(/^H[1-6]$/)) { const headingText = node.textContent.replace(/\s+/g, ' ').trim(); if (headingText) blocks.push('\n' + '#'.repeat(parseInt(tag[1])) + ' ' + headingText); return; }
    if (tag === 'LI') { const itemText = node.textContent.replace(/\s+/g, ' ').trim(); if (itemText) blocks.push('- ' + itemText); return; }
    for (const child of node.childNodes) walk(child);
    if (blockTags.has(tag)) blocks.push('\n');
  }
  walk(element);
  return blocks.join(' ').replace(/ +/g, ' ').replace(/\n +/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function saveMetadata() {
  const title = document.getElementById('meta-title').value.trim();
  if (!title) { alert('Title is required'); return; }
  const data = { type: document.getElementById('meta-type').value, title, content: document.getElementById('meta-content').value.trim() };
  const url = editingMetaId ? `/api/containers/${containerId}/metadata/${editingMetaId}` : `/api/containers/${containerId}/metadata`;
  const method = editingMetaId ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (res.ok) { hideMetadataForm(); await loadContainer(); } else { const err = await res.json(); alert(err.error || 'Failed to save'); }
}

function editMetadata(metaId) { const meta = container.metadata.find(m => m.id === metaId); if (meta) showMetadataForm(meta); }

async function deleteMetadata(metaId) {
  if (!confirm('Delete this note?')) return;
  await fetch(`/api/containers/${containerId}/metadata/${metaId}`, { method: 'DELETE' });
  await loadContainer();
}
