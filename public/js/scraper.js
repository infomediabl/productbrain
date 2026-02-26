/**
 * Scraper UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderScrapes(), startScrape(), startSingleScrape(), openScrapeModal(),
 *   closeScrapeModal(), getScrapeOptions(), submitScrapeModal(), doStartScrape(),
 *   doStartSingleScrape(), pollSingleScrape(), pollScrapeStatus(), scrapePollTimer
 * API: POST /api/containers/:id/scrape, GET /api/containers/:id/scrapes/:scrapeId
 * Interacts with: entries.js (per-entry scrape buttons call startSingleScrape),
 *   scrape-validator.js (renderValidationBadge used in renderScrapes)
 *
 * Handles scraping ads from Facebook/Google Ad Libraries. Supports full-container and
 * per-entry scraping with platform and limit options. Polls for completion and reloads container.
 */
// ========== AGENT 1: Scraper ==========

function renderScrapes() {
  const el = document.getElementById('scrapes-list');
  const scrapes = container.scrape_results || [];
  // Also include legacy analyses
  const legacyAnalyses = container.analyses || [];
  const all = [...scrapes, ...legacyAnalyses];

  if (all.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No scrapes yet. Use per-entry scrape buttons in the sidebar to start.</div>';
    return;
  }

  const sorted = [...all].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  el.innerHTML = sorted.map(a => {
    const isLegacy = !container.scrape_results.some(s => s.id === a.id);
    const viewUrl = isLegacy
      ? `/analysis.html?cid=${containerId}&aid=${a.id}`
      : `/analysis.html?cid=${containerId}&aid=${a.id}&type=scrape`;
    const isDone = a.status === 'completed' || a.status === 'timed_out';
    const v = a.validation;
    const vStatus = v?.status;
    const vScore = v?.report?.overall_score;

    const meta = a.scrape_meta;
    const entryLabel = meta?.entry_names?.length ? esc(meta.entry_names.join(', ')) : '';
    const platLabel = meta?.platforms?.length
      ? (meta.platforms.includes('facebook') && meta.platforms.includes('google') ? 'FB + Google'
        : meta.platforms.includes('facebook') ? 'Facebook' : 'Google')
      : '';

    return `
      <div class="analysis-item" style="flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <span class="status-dot ${a.status}"></span>
          <a href="${viewUrl}">${entryLabel || 'Scrape'}</a>
          ${platLabel ? `<span class="badge" style="background:#4f46e510;color:var(--primary);font-size:11px;">${platLabel}</span>` : ''}
          <span class="text-dim" style="font-size:12px;">${new Date(a.started_at).toLocaleString()}</span>
          <span class="text-dim">${a.status}</span>
          ${isLegacy ? '<span class="badge" style="background:#6b708515;color:#6b7085;">legacy</span>' : ''}
          ${a.trigger === 'auto' ? '<span class="badge badge-auto" style="font-size:11px;">AUTO</span>' : ''}
          ${a.new_ads_count > 0 ? `<span class="badge badge-new" style="font-size:11px;">+${a.new_ads_count} new</span>` : ''}
          ${a.error_message ? `<span class="text-dim" style="font-size:12px;">${esc(a.error_message).substring(0, 60)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${vStatus === 'completed' ? renderValidationBadge(v) : ''}
          ${vStatus === 'running' ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim" style="font-size:12px;">Validating...</span>' : ''}
          ${isDone && vStatus !== 'running' ? `<button class="btn btn-ghost btn-sm" onclick="validateScrape('${a.id}')" style="font-size:12px;padding:3px 8px;">${vStatus === 'completed' ? 'Re-validate' : 'Validate'}</button>` : ''}
          ${vStatus === 'completed' ? `<button class="btn btn-ghost btn-sm" onclick="showValidationReport('${a.id}')" style="font-size:12px;padding:3px 8px;">Report</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

let scrapePollTimer = null;
let pendingScrapeEntryId = null;
let pendingScrapeEntryName = null;

function startScrape() {
  pendingScrapeEntryId = null;
  pendingScrapeEntryName = null;
  openScrapeModal(null, null);
}

function startSingleScrape(entryId, entryName) {
  pendingScrapeEntryId = entryId;
  pendingScrapeEntryName = entryName;
  openScrapeModal(entryId, entryName);
}

function openScrapeModal(entryId, entryName) {
  const modal = document.getElementById('scrape-modal');
  const entryInfo = document.getElementById('scrape-modal-entry');
  if (entryId && entryName) {
    entryInfo.style.display = 'block';
    document.getElementById('scrape-modal-entry-name').textContent = entryName;
  } else {
    entryInfo.style.display = 'none';
  }
  // Reset defaults
  document.getElementById('scrape-opt-fb').checked = true;
  document.getElementById('scrape-opt-google').checked = true;
  document.getElementById('scrape-opt-fb-limit').value = '0';
  document.getElementById('scrape-opt-google-limit').value = '0';
  document.getElementById('scrape-opt-sort').value = 'impressions';
  modal.style.display = 'flex';
}

function closeScrapeModal() {
  document.getElementById('scrape-modal').style.display = 'none';
}

function getScrapeOptions() {
  const platforms = [];
  if (document.getElementById('scrape-opt-fb').checked) platforms.push('facebook');
  if (document.getElementById('scrape-opt-google').checked) platforms.push('google');
  return {
    platforms,
    fb_limit: parseInt(document.getElementById('scrape-opt-fb-limit').value) || 0,
    google_limit: parseInt(document.getElementById('scrape-opt-google-limit').value) || 0,
    sort_by: document.getElementById('scrape-opt-sort').value,
  };
}

async function submitScrapeModal() {
  const opts = getScrapeOptions();
  if (opts.platforms.length === 0) { alert('Select at least one platform.'); return; }
  closeScrapeModal();

  if (pendingScrapeEntryId) {
    await doStartSingleScrape(pendingScrapeEntryId, pendingScrapeEntryName, opts);
  } else {
    await doStartScrape(opts);
  }
}

async function doStartScrape(opts) {
  const btn = document.getElementById('scrape-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
  const statusEl = document.getElementById('scrape-status');

  try {
    const res = await fetch(`/api/containers/${containerId}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    if (res.ok) {
      const platLabel = opts.platforms.join(' + ');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'status-bar running';
        statusEl.innerHTML = `<div class="spinner"></div><span>Scraping ${platLabel} ads with OCR... this may take several minutes.</span>`;
      }
      pollScrapeStatus(data.scrape_id);
    } else {
      alert(data.error || 'Failed to start');
      if (btn) { btn.disabled = false; btn.textContent = 'Scrape All Ads'; }
    }
  } catch (e) {
    alert('Failed to start scrape');
    if (btn) { btn.disabled = false; btn.textContent = 'Scrape All Ads'; }
  }
}

async function doStartSingleScrape(entryId, entryName, opts) {
  const btn = document.getElementById(`scrape-btn-${entryId}`);
  const statusEl = document.getElementById(`scrape-status-${entryId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }

  try {
    const res = await fetch(`/api/containers/${containerId}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_id: entryId, ...opts }),
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.display = 'flex';
      statusEl.className = 'entry-analyze-status running';
      statusEl.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span>Scraping ${esc(entryName)}...</span>`;
      pollSingleScrape(entryId, entryName, data.scrape_id);
    } else {
      alert(data.error || 'Failed to start');
      if (btn) { btn.disabled = false; btn.textContent = 'Scrape'; }
    }
  } catch (e) {
    alert('Failed to start scrape');
    if (btn) { btn.disabled = false; btn.textContent = 'Scrape'; }
  }
}

async function pollSingleScrape(entryId, entryName, scrapeId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/scrapes/${scrapeId}`);
    const data = await res.json();
    const btn = document.getElementById(`scrape-btn-${entryId}`);
    const statusEl = document.getElementById(`scrape-status-${entryId}`);

    if (data.status === 'completed') {
      statusEl.className = 'entry-analyze-status completed';
      statusEl.innerHTML = `<span>Done!</span> <a href="/analysis.html?cid=${containerId}&aid=${scrapeId}&type=scrape" class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:12px;">View</a>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Scrape'; }
      await loadContainer();
      return;
    } else if (data.status === 'timed_out' || data.status === 'failed') {
      statusEl.className = 'entry-analyze-status failed';
      statusEl.innerHTML = `<span>${data.status === 'timed_out' ? 'Timed out' : 'Failed'}: ${esc(data.error_message || '')}</span>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Scrape'; }
      await loadContainer();
      return;
    }

    setTimeout(() => pollSingleScrape(entryId, entryName, scrapeId), 2000);
  } catch (e) {
    setTimeout(() => pollSingleScrape(entryId, entryName, scrapeId), 3000);
  }
}

async function pollScrapeStatus(scrapeId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/scrapes/${scrapeId}`);
    const data = await res.json();
    const statusEl = document.getElementById('scrape-status');
    const btn = document.getElementById('scrape-btn');

    if (data.status === 'completed' || data.status === 'timed_out' || data.status === 'failed') {
      if (statusEl) {
        statusEl.className = `status-bar ${data.status === 'completed' ? 'completed' : 'failed'}`;
        statusEl.innerHTML = `<span>${data.status === 'completed' ? 'Scraping completed!' : data.status === 'timed_out' ? 'Timed out' : 'Failed'} ${data.error_message ? '(' + esc(data.error_message).substring(0, 80) + ')' : ''}</span>
          <a href="/analysis.html?cid=${containerId}&aid=${scrapeId}&type=scrape" class="btn btn-primary btn-sm" style="margin-left:12px;">View Results</a>`;
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Scrape All Ads'; }
      await loadContainer();
      return;
    }

    scrapePollTimer = setTimeout(() => pollScrapeStatus(scrapeId), 2000);
  } catch (e) {
    scrapePollTimer = setTimeout(() => pollScrapeStatus(scrapeId), 3000);
  }
}
