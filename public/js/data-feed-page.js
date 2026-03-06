/**
 * User Data Feed — Standalone Page
 * Page: data-feed.html
 * API: POST /api/containers/:id/data-feed, GET /api/containers/:id/data-feeds/:id,
 *      DELETE /api/containers/:id/data-feeds/:id, POST /api/containers/:id/context
 *
 * CSV upload with drag-drop, table preview, AI analysis, and push-to-context.
 */
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const feedId = params.get('feedId');
let currentFeed = null;

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Init ----
(async function init() {
  if (!containerId) {
    document.getElementById('page-title').textContent = 'Error: No container ID';
    return;
  }

  document.getElementById('back-link').href = `/container.html?id=${containerId}`;

  // Load container name
  try {
    const res = await fetch(`/api/containers/${containerId}`);
    if (res.ok) {
      const c = await res.json();
      document.getElementById('page-title').textContent = `Data Feed — ${c.name}`;
      document.title = `Data Feed — ${c.name} - ProductBrain`;
    }
  } catch { /* ignore */ }

  setupDragDrop();
  loadHistory();

  if (feedId) {
    document.getElementById('upload-section').style.display = 'none';
    loadFeed(feedId);
  }
})();

// ---- Drag & Drop ----
function setupDragDrop() {
  const zone = document.getElementById('drop-zone');
  const input = document.getElementById('csv-file');

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'var(--border)';
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files.length > 0) handleFile(input.files[0]);
  });
}

async function handleFile(file) {
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  status.innerHTML = '<span class="spinner"></span> Reading file...';

  try {
    const text = await file.text();
    if (!text.trim()) {
      status.innerHTML = '<span style="color:var(--danger);">File is empty.</span>';
      return;
    }

    status.innerHTML = '<span class="spinner"></span> Uploading and analyzing...';

    const res = await fetch(`/api/containers/${containerId}/data-feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text: text, filename: file.name }),
    });

    if (!res.ok) {
      const err = await res.json();
      status.innerHTML = `<span style="color:var(--danger);">Upload failed: ${esc(err.error)}</span>`;
      return;
    }

    const result = await res.json();
    status.innerHTML = '<span style="color:var(--success);">Uploaded! Redirecting...</span>';

    // Redirect to report view
    setTimeout(() => {
      window.location.href = `/data-feed.html?cid=${containerId}&feedId=${result.feed_id}`;
    }, 500);
  } catch (err) {
    status.innerHTML = `<span style="color:var(--danger);">Error: ${esc(err.message)}</span>`;
  }
}

// ---- Load Feed ----
async function loadFeed(id) {
  const section = document.getElementById('report-section');
  section.style.display = 'block';

  try {
    const res = await fetch(`/api/containers/${containerId}/data-feeds/${id}`);
    if (!res.ok) {
      section.innerHTML = '<div class="card"><p style="color:var(--danger);">Feed not found.</p></div>';
      return;
    }

    currentFeed = await res.json();
    renderFeed();

    if (currentFeed.status === 'analyzing') {
      pollFeed(id);
    }
  } catch (err) {
    section.innerHTML = `<div class="card"><p style="color:var(--danger);">Error: ${esc(err.message)}</p></div>`;
  }
}

function renderFeed() {
  const f = currentFeed;
  document.getElementById('feed-filename').textContent = f.filename;
  document.getElementById('feed-meta').textContent = `${f.row_count} rows, ${f.columns.length} columns — ${new Date(f.created_at).toLocaleString()}`;

  // Table preview
  renderTable(f.columns, f.preview_rows || []);

  // Analysis
  if (f.status === 'completed' && f.result) {
    renderAnalysis(f.result);
  } else if (f.status === 'analyzing') {
    const el = document.getElementById('analysis-status');
    el.style.display = 'block';
    el.innerHTML = '<span class="spinner"></span> AI is analyzing your data...';
  } else if (f.status === 'failed') {
    const el = document.getElementById('analysis-status');
    el.style.display = 'block';
    el.innerHTML = `<span style="color:var(--danger);">Analysis failed: ${esc(f.result?.error || 'Unknown error')}</span>`;
  }
}

function renderTable(columns, rows) {
  const el = document.getElementById('table-preview');
  if (!columns.length) { el.innerHTML = ''; return; }

  const maxCols = Math.min(columns.length, 10);
  const displayCols = columns.slice(0, maxCols);
  const extraCols = columns.length - maxCols;

  let html = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">Showing first ${rows.length} of ${currentFeed.row_count} rows${extraCols > 0 ? `, ${maxCols} of ${columns.length} columns` : ''}</div>`;
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<thead><tr>';
  for (const col of displayCols) {
    html += `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);white-space:nowrap;">${esc(col)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    html += '<tr>';
    for (const col of displayCols) {
      const val = String(row[col] || '');
      html += `<td style="padding:4px 8px;border-bottom:1px solid var(--border);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(val)}">${esc(val.slice(0, 80))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderAnalysis(result) {
  const section = document.getElementById('analysis-section');
  section.style.display = 'block';

  // Summary
  document.getElementById('analysis-summary').innerHTML = `
    <div style="font-size:14px;line-height:1.6;">${esc(result.summary || '')}</div>`;

  // Key Metrics
  const grid = document.getElementById('metrics-grid');
  if (result.key_metrics && result.key_metrics.length > 0) {
    grid.innerHTML = result.key_metrics.map(m => `
      <div class="card" style="flex:1;min-width:180px;padding:12px;">
        <div class="text-dim" style="font-size:11px;text-transform:uppercase;">${esc(m.label)}</div>
        <div style="font-size:18px;font-weight:700;margin:4px 0;">${esc(m.value)}</div>
        <div style="font-size:12px;color:var(--text-dim);">${esc(m.interpretation || '')}</div>
      </div>`).join('');
  }

  // Insights
  const list = document.getElementById('insights-list');
  if (result.insights && result.insights.length > 0) {
    list.innerHTML = '<h4 style="font-size:14px;margin-bottom:8px;">Insights</h4>' +
      result.insights.map((insight, i) => `
        <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start;">
          <span style="font-weight:700;color:var(--primary);min-width:20px;">${i + 1}.</span>
          <span style="font-size:13px;">${esc(insight)}</span>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;white-space:nowrap;" onclick="pushInsightToContext(${i})">Push</button>
        </div>`).join('');
  }
}

function pollFeed(id) {
  setTimeout(async () => {
    try {
      const res = await fetch(`/api/containers/${containerId}/data-feeds/${id}`);
      if (!res.ok) return;
      const feed = await res.json();
      currentFeed = feed;
      if (feed.status === 'analyzing') {
        pollFeed(id);
      } else {
        renderFeed();
        document.getElementById('analysis-status').style.display = 'none';
      }
    } catch { /* ignore */ }
  }, 3000);
}

// ---- History ----
async function loadHistory() {
  try {
    const res = await fetch(`/api/containers/${containerId}/data-feeds`);
    if (!res.ok) return;
    const feeds = await res.json();
    const el = document.getElementById('feed-history');

    if (!feeds.length) {
      el.innerHTML = '<div class="text-dim" style="font-size:13px;">No feeds uploaded yet.</div>';
      return;
    }

    el.innerHTML = feeds.reverse().map(f => {
      const date = new Date(f.created_at).toLocaleDateString();
      const active = feedId === f.id ? 'font-weight:700;' : '';
      const statusColor = f.status === 'completed' ? 'var(--success)' : f.status === 'failed' ? 'var(--danger)' : 'var(--text-dim)';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);${active}">
          <a href="/data-feed.html?cid=${containerId}&feedId=${f.id}" style="font-size:13px;">${esc(f.filename)}</a>
          <div style="display:flex;gap:12px;align-items:center;">
            <span class="text-dim" style="font-size:12px;">${f.row_count} rows</span>
            <span style="font-size:12px;color:${statusColor};">${f.status}</span>
            <span class="text-dim" style="font-size:11px;">${date}</span>
          </div>
        </div>`;
    }).join('');
  } catch { /* ignore */ }
}

// ---- Actions ----
async function deleteFeed() {
  if (!currentFeed || !confirm('Delete this data feed?')) return;
  try {
    await fetch(`/api/containers/${containerId}/data-feeds/${currentFeed.id}`, { method: 'DELETE' });
    window.location.href = `/data-feed.html?cid=${containerId}`;
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

async function pushToContext(sourceType, sectionName, content) {
  try {
    await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: sourceType, source_id: currentFeed.id, section_name: sectionName, content }),
    });
  } catch { /* ignore */ }
}

async function pushInsightToContext(idx) {
  const insight = currentFeed.result?.insights?.[idx];
  if (!insight) return;
  await pushToContext('data_feed', `Insight ${idx + 1}`, { insight });
  const btns = document.querySelectorAll('#insights-list .btn');
  if (btns[idx]) { btns[idx].textContent = 'Pushed'; btns[idx].disabled = true; }
}

async function pushAllToContext() {
  if (!currentFeed?.result) return;
  const r = currentFeed.result;
  const items = [];
  if (r.summary) items.push({ section: 'Summary', content: { summary: r.summary } });
  if (r.key_metrics) items.push({ section: 'Key Metrics', content: { key_metrics: r.key_metrics } });
  if (r.insights) items.push({ section: 'Insights', content: { insights: r.insights } });

  for (const item of items) {
    await pushToContext('data_feed', item.section, item.content);
  }
  alert(`Pushed ${items.length} sections to context.`);
}
