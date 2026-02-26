/**
 * Container Context Panel (Collector)
 * Page: container.html (loaded after container.js)
 * Globals used: containerId, esc() — from container.js
 * Globals defined: toggleContextPanel(), loadContainerContext(), renderContextItems(),
 *   pushAllContext(), clearAllContext(), deleteContextItem(), pushContextSection()
 * API: GET /api/containers/:id/context, POST /api/containers/:id/context,
 *   POST /api/containers/:id/context/push-all, DELETE /api/containers/:id/context,
 *   DELETE /api/containers/:id/context/:itemId
 *
 * Manages the collapsible context panel that stores pushed analysis items.
 * Supports push-all, clear-all, and per-item delete. Called by loadContainer().
 */
// ========== Container Context (Collector) ==========

let contextExpanded = false;

function toggleContextPanel() {
  contextExpanded = !contextExpanded;
  document.getElementById('context-panel').style.display = contextExpanded ? 'block' : 'none';
  document.getElementById('context-toggle-icon').style.transform = contextExpanded ? 'rotate(180deg)' : '';
}

async function loadContainerContext() {
  try {
    const res = await fetch(`/api/containers/${containerId}/context`);
    if (!res.ok) return;
    const items = await res.json();
    renderContextItems(items);
  } catch (e) {
    console.error('Failed to load context', e);
  }
}

function renderContextItems(items) {
  const countEl = document.getElementById('context-count');
  const listEl = document.getElementById('context-list');
  const emptyEl = document.getElementById('context-empty');

  countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  if (items.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  let html = '';
  for (const item of items) {
    const preview = (item.text_brief || JSON.stringify(item.content)).substring(0, 120) + (item.text_brief?.length > 120 || JSON.stringify(item.content).length > 120 ? '...' : '');
    const date = new Date(item.pushed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const sourceLabel = (item.source_type || 'manual').replace(/_/g, ' ');
    html += `
      <div class="context-item" style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="badge" style="font-size:10px;background:var(--surface2);border:1px solid var(--border);">${esc(sourceLabel)}</span>
            <strong style="font-size:13px;">${esc(item.section_name)}</strong>
          </div>
          <div class="text-dim" style="font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preview)}</div>
          <div class="text-dim" style="font-size:10px;margin-top:2px;">${date}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="deleteContextItem('${item.id}')" title="Remove" style="flex-shrink:0;padding:4px 8px;">&times;</button>
      </div>
    `;
  }
  listEl.innerHTML = html;
}

async function pushAllContext(evt) {
  const btn = evt.target;
  btn.disabled = true;
  btn.textContent = 'Pushing...';
  try {
    const res = await fetch(`/api/containers/${containerId}/context/push-all`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      await loadContainerContext();
      if (!contextExpanded) toggleContextPanel();
    } else {
      alert(data.error || 'Failed to push context');
    }
  } catch (e) {
    alert('Error pushing context');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push All';
  }
}

async function clearAllContext() {
  if (!confirm('Remove all context items?')) return;
  try {
    await fetch(`/api/containers/${containerId}/context`, { method: 'DELETE' });
    await loadContainerContext();
  } catch (e) {
    alert('Error clearing context');
  }
}

async function deleteContextItem(itemId) {
  try {
    await fetch(`/api/containers/${containerId}/context/${itemId}`, { method: 'DELETE' });
    await loadContainerContext();
  } catch (e) {
    alert('Error deleting context item');
  }
}

// Used by analysis pages to push a section
async function pushContextSection(sourceType, sourceId, sectionName, content) {
  try {
    const res = await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: sourceType, source_id: sourceId, section_name: sectionName, content }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('Push context failed', e);
  }
  return null;
}
