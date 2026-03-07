/**
 * Web Research Page JS
 * Page: research-web.html (standalone)
 * Globals defined: esc(), startSearch(), summarizeSelected(), pushAllSummaries(), etc.
 * API: POST /api/research-web/search, GET /api/research-web, GET /api/research-web/:id,
 *      POST /api/research-web/:id/summarize, DELETE /api/research-web/:id,
 *      POST /api/containers/:id/context (push)
 *
 * Two-phase web research: search → select sources → summarize → push to container context.
 */

let currentResearchId = null;
let pollTimer = null;
let containers = [];

// Push items registry (same pattern as keyword-strategy-page.js)
window._pushItems = [];

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ========== Init ==========

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  loadContainers();

  // Check URL param
  const params = new URLSearchParams(window.location.search);
  const rid = params.get('researchId');
  if (rid) loadResearch(rid);

  // Enter key on search input
  document.getElementById('rw-topic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startSearch();
  });
});

// ========== Containers (for push-to-context) ==========

async function loadContainers() {
  try {
    const res = await fetch('/api/containers');
    containers = await res.json();
    const sel = document.getElementById('rw-container-select');
    sel.innerHTML = '<option value="">Select a container...</option>';
    containers.forEach(c => {
      sel.innerHTML += `<option value="${esc(c.id)}">${esc(c.name)}</option>`;
    });
  } catch (e) { /* ignore */ }
}

// ========== History ==========

async function loadHistory() {
  try {
    const res = await fetch('/api/research-web');
    const list = await res.json();
    const el = document.getElementById('rw-history');

    if (!list.length) {
      el.innerHTML = '<div class="rw-history-empty">No research yet</div>';
      return;
    }

    // Sort by created_at descending
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    el.innerHTML = list.map(r => {
      const active = r.id === currentResearchId ? ' active' : '';
      const date = new Date(r.created_at).toLocaleDateString();
      const status = r.status === 'completed' ? '' : ` [${r.status}]`;
      return `<div class="rw-history-item${active}" onclick="loadResearch('${esc(r.id)}')">
        <span class="rw-history-topic">${esc(r.topic)}</span>
        <span class="rw-history-meta">${date} &middot; ${r.source_count} sources${r.summary_count ? ` &middot; ${r.summary_count} summaries` : ''}${status}</span>
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('rw-history').innerHTML = '<div class="rw-history-empty">Failed to load</div>';
  }
}

function newResearch() {
  currentResearchId = null;
  clearPoll();
  window._pushItems = [];

  document.getElementById('rw-topic').value = '';
  document.getElementById('rw-status').style.display = 'none';
  document.getElementById('rw-sources').style.display = 'none';
  document.getElementById('rw-summaries').style.display = 'none';
  document.getElementById('rw-push-section').style.display = 'none';
  document.getElementById('rw-delete-area').style.display = 'none';
  document.getElementById('rw-search-btn').disabled = false;

  // Update URL
  window.history.pushState({}, '', '/research-web.html');
  loadHistory();
}

// ========== Search ==========

async function startSearch() {
  const topic = document.getElementById('rw-topic').value.trim();
  if (!topic) return;

  const btn = document.getElementById('rw-search-btn');
  btn.disabled = true;

  // Reset UI
  document.getElementById('rw-sources').style.display = 'none';
  document.getElementById('rw-summaries').style.display = 'none';
  document.getElementById('rw-push-section').style.display = 'none';
  document.getElementById('rw-delete-area').style.display = 'none';
  window._pushItems = [];

  showStatus('Searching the web...', true);

  try {
    const res = await fetch('/api/research-web/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    if (!res.ok) {
      const err = await res.json();
      showStatus(`Error: ${err.error}`, false);
      btn.disabled = false;
      return;
    }

    const data = await res.json();
    currentResearchId = data.research_id;
    window.history.pushState({}, '', `?researchId=${currentResearchId}`);
    startPoll();
  } catch (e) {
    showStatus(`Error: ${e.message}`, false);
    btn.disabled = false;
  }
}

// ========== Load existing research ==========

async function loadResearch(researchId) {
  clearPoll();
  currentResearchId = researchId;
  window._pushItems = [];
  window.history.pushState({}, '', `?researchId=${researchId}`);

  showStatus('Loading...', true);

  try {
    const res = await fetch(`/api/research-web/${researchId}`);
    if (!res.ok) {
      showStatus('Research not found', false);
      return;
    }
    const record = await res.json();
    renderRecord(record);
    loadHistory();
  } catch (e) {
    showStatus(`Error: ${e.message}`, false);
  }
}

// ========== Polling ==========

function startPoll() {
  clearPoll();
  poll();
}

function clearPoll() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

async function poll() {
  if (!currentResearchId) return;

  try {
    const res = await fetch(`/api/research-web/${currentResearchId}`);
    if (!res.ok) return;
    const record = await res.json();

    renderRecord(record);

    if (record.status === 'searching' || record.status === 'summarizing') {
      pollTimer = setTimeout(poll, 3000);
    } else {
      loadHistory();
    }
  } catch (e) {
    pollTimer = setTimeout(poll, 5000);
  }
}

// ========== Render ==========

function renderRecord(record) {
  const btn = document.getElementById('rw-search-btn');
  document.getElementById('rw-topic').value = record.topic || '';

  if (record.status === 'searching') {
    showStatus('Searching the web... This may take 15-30 seconds.', true);
    btn.disabled = true;
    document.getElementById('rw-sources').style.display = 'none';
    document.getElementById('rw-summaries').style.display = 'none';
    document.getElementById('rw-delete-area').style.display = 'none';
    return;
  }

  if (record.status === 'failed') {
    showStatus(`Search failed: ${record.result?.error || 'Unknown error'}`, false);
    btn.disabled = false;
    document.getElementById('rw-delete-area').style.display = 'block';
    return;
  }

  // Hide status
  document.getElementById('rw-status').style.display = 'none';
  btn.disabled = false;

  // Render sources
  if (record.result?.sources?.length) {
    renderSources(record.result.sources, record.result.search_summary);
  }

  // Render summaries
  if (record.result?.summaries?.length) {
    renderSummaries(record.result.summaries, record.result.combined_brief);
  } else {
    document.getElementById('rw-summaries').style.display = 'none';
    document.getElementById('rw-push-section').style.display = 'none';
  }

  // Show summarize button state
  const sumBtn = document.getElementById('rw-summarize-btn');
  if (record.status === 'summarizing') {
    sumBtn.disabled = true;
    sumBtn.textContent = 'Summarizing...';
    showStatus('Summarizing sources... Results will appear incrementally.', true);
  } else {
    sumBtn.disabled = false;
    sumBtn.textContent = 'Summarize Selected';
  }

  document.getElementById('rw-delete-area').style.display = 'block';

  // Show prompt link if available
  const promptArea = document.getElementById('rw-prompt-link');
  if (promptArea && record.result?.prompt_sent && typeof showPromptSent === 'function') {
    promptArea.innerHTML = `<a href="#" onclick="showPromptSent(window._rwPromptSent);return false" style="font-size:12px;color:var(--primary);opacity:0.7;text-decoration:none;" title="View the prompt sent to AI">View Prompt Sent</a>`;
    window._rwPromptSent = record.result.prompt_sent;
  }
}

function renderSources(sources, searchSummary) {
  const section = document.getElementById('rw-sources');
  section.style.display = 'block';

  // Search summary
  const summaryBox = document.getElementById('rw-search-summary-box');
  if (searchSummary) {
    summaryBox.innerHTML = `<div class="rw-search-summary">${esc(searchSummary)}</div>`;
  } else {
    summaryBox.innerHTML = '';
  }

  const list = document.getElementById('rw-source-list');
  list.innerHTML = sources.map(s => {
    const typeLabel = s.type || 'article';
    return `<div class="rw-source-card" data-source-id="${esc(s.id)}">
      <input type="checkbox" value="${esc(s.id)}" onchange="updateSummarizeBtn()">
      <div class="rw-source-body">
        <div class="rw-source-title">
          <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>
          <span class="rw-source-type">${esc(typeLabel)}</span>
        </div>
        <div class="rw-source-url">${esc(s.url)}</div>
        ${s.snippet ? `<div class="rw-source-snippet">${esc(s.snippet)}</div>` : ''}
        ${s.relevance_note ? `<div class="rw-source-relevance">${esc(s.relevance_note)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderSummaries(summaries, combinedBrief) {
  const section = document.getElementById('rw-summaries');
  section.style.display = 'block';
  document.getElementById('rw-push-section').style.display = 'block';

  // Reset push items
  window._pushItems = [];

  // Combined brief
  const briefBox = document.getElementById('rw-combined-brief-box');
  if (combinedBrief) {
    const briefIdx = registerPushItem('combined_brief', 'Combined Research Brief', {
      summary: combinedBrief,
      title: `Research: ${document.getElementById('rw-topic').value}`,
    });
    briefBox.innerHTML = `<div class="rw-combined-brief">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <h4>Combined Brief</h4>
        <button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${briefIdx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;">Push</button>
      </div>
      <p>${esc(combinedBrief)}</p>
    </div>`;
  } else {
    briefBox.innerHTML = '';
  }

  // Individual summaries
  const list = document.getElementById('rw-summary-list');
  list.innerHTML = summaries.map(s => {
    const isError = s.summary?.startsWith('Error:') || s.summary?.startsWith('Could not fetch');

    const pushIdx = registerPushItem(s.source_id, s.title || s.url, {
      title: s.title,
      url: s.url,
      summary: s.summary,
      key_insights: s.key_insights,
      relevance_to_topic: s.relevance_to_topic,
    });

    const insightsHtml = s.key_insights?.length
      ? `<ul class="rw-insights">${s.key_insights.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
      : '';

    return `<div class="rw-summary-card" ${isError ? 'style="opacity:0.6;"' : ''}>
      <div class="rw-summary-header">
        <div>
          <div class="rw-summary-title">${esc(s.title || s.url)}</div>
          <div style="font-size:11px;color:var(--text-dim);"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>
        </div>
        ${!isError ? `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${pushIdx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;">Push</button>` : ''}
      </div>
      <div class="rw-summary-text">${esc(s.summary)}</div>
      ${insightsHtml}
      ${s.relevance_to_topic ? `<div class="rw-source-relevance">${esc(s.relevance_to_topic)}</div>` : ''}
    </div>`;
  }).join('');
}

// ========== Source selection ==========

function toggleAllSources() {
  const checkboxes = document.querySelectorAll('#rw-source-list input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => cb.checked = !allChecked);
  updateSummarizeBtn();
}

function updateSummarizeBtn() {
  const checked = document.querySelectorAll('#rw-source-list input[type="checkbox"]:checked');
  const btn = document.getElementById('rw-summarize-btn');
  btn.textContent = checked.length > 0 ? `Summarize Selected (${checked.length})` : 'Summarize Selected';
}

function getSelectedSourceIds() {
  return Array.from(document.querySelectorAll('#rw-source-list input[type="checkbox"]:checked'))
    .map(cb => cb.value);
}

// ========== Summarize ==========

async function summarizeSelected() {
  const sourceIds = getSelectedSourceIds();
  if (!sourceIds.length) return alert('Select at least one source to summarize.');
  if (!currentResearchId) return;

  const btn = document.getElementById('rw-summarize-btn');
  btn.disabled = true;
  btn.textContent = 'Summarizing...';
  showStatus('Summarizing sources... Results will appear incrementally.', true);

  try {
    const res = await fetch(`/api/research-web/${currentResearchId}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_ids: sourceIds }),
    });

    if (!res.ok) {
      const err = await res.json();
      showStatus(`Error: ${err.error}`, false);
      btn.disabled = false;
      btn.textContent = 'Summarize Selected';
      return;
    }

    startPoll();
  } catch (e) {
    showStatus(`Error: ${e.message}`, false);
    btn.disabled = false;
    btn.textContent = 'Summarize Selected';
  }
}

// ========== Push to Context ==========

function registerPushItem(sectionKey, label, content) {
  const idx = window._pushItems.length;
  window._pushItems.push({ sectionKey, label, content });
  return idx;
}

async function pushRegisteredItem(idx, btn) {
  const item = window._pushItems[idx];
  if (!item) return;

  const containerId = document.getElementById('rw-container-select').value;
  if (!containerId) return alert('Select a container first.');

  btn.disabled = true;
  btn.textContent = 'Pushing...';

  try {
    const res = await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'web_research',
        source_id: currentResearchId,
        section_name: item.label,
        content: item.content,
      }),
    });

    if (res.ok) {
      btn.textContent = 'Pushed!';
      btn.style.color = 'var(--success)';
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Push'; btn.style.color = ''; }, 2000);
    } else {
      btn.disabled = false;
      btn.textContent = 'Push';
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Push';
  }
}

async function pushAllSummaries() {
  const containerId = document.getElementById('rw-container-select').value;
  if (!containerId) return alert('Select a container first.');
  if (!window._pushItems.length) return alert('No summaries to push.');

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Pushing...';

  let pushed = 0;
  for (const item of window._pushItems) {
    try {
      await fetch(`/api/containers/${containerId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'web_research',
          source_id: currentResearchId,
          section_name: item.label,
          content: item.content,
        }),
      });
      pushed++;
    } catch (e) { /* continue */ }
  }

  btn.textContent = `Pushed ${pushed} items!`;
  btn.style.color = 'var(--success)';
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Push All Summaries'; btn.style.color = ''; }, 2000);
}

// ========== Delete ==========

async function deleteResearch() {
  if (!currentResearchId) return;
  if (!confirm('Delete this research session?')) return;

  try {
    await fetch(`/api/research-web/${currentResearchId}`, { method: 'DELETE' });
    newResearch();
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
}

// ========== Status ==========

function showStatus(msg, spinning) {
  const el = document.getElementById('rw-status');
  el.style.display = 'block';
  el.innerHTML = (spinning ? '<span class="spinner"></span> ' : '') + esc(msg);
}
