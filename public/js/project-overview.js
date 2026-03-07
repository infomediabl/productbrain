/**
 * Project Overview UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderProjectOverview()
 * API: POST /api/containers/:id/project-overview, GET /api/containers/:id/project-overview
 *
 * Shows an AI-generated project overview at the top of the dashboard.
 */

let overviewPollTimer = null;

function renderProjectOverview() {
  const section = document.getElementById('overview-section');
  if (!section) return;

  const overview = container.project_overview;
  const content = document.getElementById('overview-content');

  if (!overview || !overview.status) {
    content.innerHTML = `
      <div style="text-align:center;padding:16px 0;color:var(--text-dim);font-size:13px;">
        No overview generated yet.
        <button class="btn btn-primary btn-sm" style="margin-left:12px;" onclick="generateOverview()">Generate Overview</button>
      </div>`;
    return;
  }

  if (overview.status === 'generating') {
    content.innerHTML = `
      <div style="padding:12px 0;color:var(--text-dim);font-size:13px;">
        <span class="spinner"></span> Generating overview...
      </div>`;
    pollOverview();
    return;
  }

  if (overview.status === 'failed') {
    content.innerHTML = `
      <div style="padding:12px 0;color:var(--danger);font-size:13px;">
        Overview generation failed. <button class="btn btn-ghost btn-sm" onclick="generateOverview()">Retry</button>
      </div>`;
    return;
  }

  // Completed
  const text = overview.result?.text || 'No overview text.';
  const date = new Date(overview.created_at).toLocaleString();
  // Split into sentences for better readability
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const formatted = sentences.length > 1
    ? sentences.map(s => `<span style="display:inline;">${esc(s)}</span>`).join(' ')
    : esc(text);
  content.innerHTML = `
    <div style="font-size:15px;line-height:1.75;color:var(--text);letter-spacing:-0.01em;margin-bottom:12px;font-weight:400;">${formatted}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
      <span class="text-dim" style="font-size:11px;">Generated: ${date}${promptSentLink(overview.result)}</span>
      <button class="btn btn-ghost btn-sm" onclick="generateOverview()">&#x21bb; Refresh</button>
    </div>`;
}

async function generateOverview() {
  const content = document.getElementById('overview-content');
  content.innerHTML = `
    <div style="padding:12px 0;color:var(--text-dim);font-size:13px;">
      <span class="spinner"></span> Generating overview...
    </div>`;

  try {
    await fetch(`/api/containers/${containerId}/project-overview`, { method: 'POST' });
    pollOverview();
  } catch (err) {
    content.innerHTML = `<div style="color:var(--danger);font-size:13px;">Error: ${esc(err.message)}</div>`;
  }
}

function pollOverview() {
  if (overviewPollTimer) clearTimeout(overviewPollTimer);
  overviewPollTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/containers/${containerId}/project-overview`);
      if (!res.ok) return;
      const overview = await res.json();
      if (overview && overview.status !== 'generating') {
        container.project_overview = overview;
        renderProjectOverview();
      } else {
        pollOverview();
      }
    } catch { /* ignore */ }
  }, 3000);
}
