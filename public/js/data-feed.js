/**
 * User Data Feed UI (Dashboard Card)
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderDataFeeds()
 * API: GET /api/containers/:id/data-feeds
 *
 * Shows list of uploaded data feeds with status. Links to standalone page.
 */

function renderDataFeeds() {
  const section = document.getElementById('userfeed-section');
  if (!section) return;

  const feeds = container.data_feeds || [];
  const list = document.getElementById('datafeed-list');
  if (!list) return;

  if (feeds.length === 0) {
    list.innerHTML = '<div class="text-dim" style="font-size:13px;padding:8px 0;">No data feeds uploaded yet.</div>';
    return;
  }

  list.innerHTML = feeds.slice().reverse().map(f => {
    const date = new Date(f.created_at).toLocaleDateString();
    const statusClass = f.status === 'completed' ? 'color:var(--success)' : f.status === 'failed' ? 'color:var(--danger)' : 'color:var(--text-dim)';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
        <div>
          <strong style="font-size:13px;">${esc(f.filename)}</strong>
          <span class="text-dim" style="font-size:12px;margin-left:8px;">${f.row_count} rows, ${(f.columns || []).length} cols</span>
          <span class="text-dim" style="font-size:11px;margin-left:8px;">${date}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="font-size:12px;${statusClass};">${f.status}</span>
          ${f.status === 'completed' ? `${promptSentLink(f.result)}<a href="/data-feed.html?cid=${containerId}&feedId=${f.id}" class="btn btn-ghost btn-sm">View</a>` : ''}
        </div>
      </div>`;
  }).join('');
}
