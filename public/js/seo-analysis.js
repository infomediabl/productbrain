/**
 * SEO Analysis UI (Modals + Trigger)
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderOwnProductSeo(), renderSeoAnalyses(), openSeoOwnModal(),
 *   closeSeoOwnModal(), submitSeoOwnModal(), openSeoModal(), closeSeoModal(),
 *   submitSeoModal(), pollSeoAnalysis(), viewSeoReport()
 * API: POST /api/containers/:id/seo-analysis,
 *   GET /api/containers/:id/seo-analysis/:storageKey/:analysisId
 * Interacts with: Navigates to seo-analysis.html via viewSeoReport()
 *
 * Renders own-product SEO audit section and competitor SEO analysis cards on the
 * container page. Triggers generation, polls for completion, and links to full reports.
 */
// ========== SEO Agent: SEO Analysis ==========

// ========== Own-Product SEO Audit ==========

function renderOwnProductSeo() {
  const el = document.getElementById('seo-own-product');
  if (!el) return;
  const p = container.my_product;
  if (!p || !p.website) {
    el.innerHTML = '';
    return;
  }

  const seoAnalyses = container.seo_analyses || {};
  const ownAnalyses = seoAnalyses['_own_product'] || [];
  const latest = [...ownAnalyses].reverse().find(a => a.status === 'completed');
  const isGenerating = ownAnalyses.some(a => a.status === 'generating');
  const score = latest?.result?.json_data?.overall_score;

  el.innerHTML = `
    <div class="entry-item my-product-entry" style="margin-bottom:12px;border-left-color:#7c3aed;">
      <div class="entry-header">
        <span class="badge badge-primary">My Product</span>
        <strong>${esc(p.name)}</strong>
        <span class="text-dim" style="font-size:12px;">${esc(p.website)}</span>
        ${latest && score !== undefined ? `<span class="badge" style="background:${score >= 70 ? '#16a34a15' : score >= 40 ? '#d9770615' : '#dc262615'};color:${score >= 70 ? '#15803d' : score >= 40 ? '#b45309' : '#b91c1c'};">SEO: ${score}/100</span>` : ''}
        ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim" style="font-size:12px;">Running SEO audit...</span>' : ''}
        <div style="margin-left:auto;display:flex;gap:6px;">
          ${!isGenerating ? `<button class="btn btn-primary btn-sm" onclick="openSeoOwnModal()">SEO Audit</button>` : ''}
          ${latest ? `${promptSentLink(latest.result)}<button class="btn btn-ghost btn-sm" onclick="viewSeoReport('_own_product', '${latest.id}')">View Report</button>` : ''}
        </div>
      </div>
      <div id="seo-own-status" style="display:none;"></div>
    </div>
    ${ownAnalyses.length > 0 ? '<div style="border-bottom:1px solid var(--border);margin-bottom:8px;"></div>' : ''}
  `;
}

function openSeoOwnModal() {
  const p = container.my_product;
  if (!p) return;
  document.getElementById('seo-own-modal-name').textContent = p.name;
  document.getElementById('seo-own-modal-website').textContent = p.website;
  document.getElementById('seo-own-focus-instructions').value = '';
  document.getElementById('seo-own-modal').style.display = 'flex';
}

function closeSeoOwnModal() {
  document.getElementById('seo-own-modal').style.display = 'none';
}

async function submitSeoOwnModal() {
  const focusInstructions = document.getElementById('seo-own-focus-instructions').value.trim();
  closeSeoOwnModal();

  const statusEl = document.getElementById('seo-own-status');
  statusEl.style.display = 'flex';
  statusEl.className = 'entry-analyze-status running';
  statusEl.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span>Running SEO audit for ${esc(container.my_product.name)}...</span>`;

  try {
    const res = await fetch(`/api/containers/${containerId}/seo-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'own_product', focus_instructions: focusInstructions }),
    });
    const data = await res.json();
    if (res.ok) {
      pollSeoAnalysis('_own_product', container.my_product.name, data.analysis_id);
    } else {
      statusEl.className = 'entry-analyze-status failed';
      statusEl.innerHTML = `<span>Failed: ${esc(data.error)}</span>`;
    }
  } catch (e) {
    statusEl.className = 'entry-analyze-status failed';
    statusEl.innerHTML = `<span>Error starting SEO audit</span>`;
  }
}

// ========== Competitor SEO Intelligence ==========

let pendingSeoCompetitorId = null;
let pendingSeoCompetitorName = null;

function renderSeoAnalyses() {
  const el = document.getElementById('seo-analysis-list');
  if (container.competitors.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No competitors added.</div>';
    return;
  }

  const seoAnalyses = container.seo_analyses || {};

  el.innerHTML = container.competitors.map(comp => {
    const analyses = seoAnalyses[comp.id] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    const isGenerating = analyses.some(a => a.status === 'generating');
    const hasWebsite = !!comp.website;
    const score = latest?.result?.json_data?.overall_effectiveness ?? latest?.result?.json_data?.overall_score;

    return `
      <div class="entry-item competitor-entry" style="margin-bottom:8px;border-left-color:#0891b2;">
        <div class="entry-header">
          <span class="badge" style="background:#0891b215;color:#0e7490;">${esc(comp.name)}</span>
          ${hasWebsite ? `<span class="text-dim" style="font-size:12px;">${esc(comp.website)}</span>` : '<span class="text-dim" style="font-size:12px;">No website URL</span>'}
          ${latest && score !== undefined ? `<span class="badge" style="background:${score >= 70 ? '#16a34a15' : score >= 40 ? '#d9770615' : '#dc262615'};color:${score >= 70 ? '#15803d' : score >= 40 ? '#b45309' : '#b91c1c'};">SEO: ${score}/100</span>` : ''}
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim" style="font-size:12px;">Analyzing SEO...</span>' : ''}
          <div style="margin-left:auto;display:flex;gap:6px;">
            ${hasWebsite && !isGenerating ? `<button class="btn btn-primary btn-sm" onclick="openSeoModal('${comp.id}', '${esc(comp.name).replace(/'/g, "\\'")}', '${esc(comp.website).replace(/'/g, "\\'")}')">SEO Analysis</button>` : ''}
            ${latest ? `${promptSentLink(latest.result)}<button class="btn btn-ghost btn-sm" onclick="viewSeoReport('${comp.id}', '${latest.id}')">View Report</button>` : ''}
          </div>
        </div>
        ${!hasWebsite ? '<div class="text-dim" style="font-size:12px;padding:4px 0;">Add a website URL to this competitor to run SEO analysis</div>' : ''}
        <div id="seo-status-${comp.id}" style="display:none;"></div>
      </div>
    `;
  }).join('');
}

function openSeoModal(competitorId, competitorName, competitorWebsite) {
  pendingSeoCompetitorId = competitorId;
  pendingSeoCompetitorName = competitorName;
  document.getElementById('seo-modal-comp-name').textContent = competitorName;
  document.getElementById('seo-modal-comp-website').textContent = competitorWebsite;
  document.getElementById('seo-focus-instructions').value = '';
  document.getElementById('seo-modal').style.display = 'flex';
}

function closeSeoModal() {
  document.getElementById('seo-modal').style.display = 'none';
  pendingSeoCompetitorId = null;
  pendingSeoCompetitorName = null;
}

async function submitSeoModal() {
  if (!pendingSeoCompetitorId) return;
  const focusInstructions = document.getElementById('seo-focus-instructions').value.trim();
  const competitorId = pendingSeoCompetitorId;
  const competitorName = pendingSeoCompetitorName;
  closeSeoModal();

  const statusEl = document.getElementById(`seo-status-${competitorId}`);
  statusEl.style.display = 'flex';
  statusEl.className = 'entry-analyze-status running';
  statusEl.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span>Running SEO analysis for ${esc(competitorName)}...</span>`;

  try {
    const res = await fetch(`/api/containers/${containerId}/seo-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'competitor', competitor_id: competitorId, focus_instructions: focusInstructions }),
    });
    const data = await res.json();
    if (res.ok) {
      pollSeoAnalysis(competitorId, competitorName, data.analysis_id);
    } else {
      statusEl.className = 'entry-analyze-status failed';
      statusEl.innerHTML = `<span>Failed: ${esc(data.error)}</span>`;
    }
  } catch (e) {
    statusEl.className = 'entry-analyze-status failed';
    statusEl.innerHTML = `<span>Error starting SEO analysis</span>`;
  }
}

async function pollSeoAnalysis(storageKey, displayName, analysisId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/seo-analysis/${storageKey}/${analysisId}`);
    const data = await res.json();
    const statusElId = storageKey === '_own_product' ? 'seo-own-status' : `seo-status-${storageKey}`;
    const statusEl = document.getElementById(statusElId);

    if (data.status === 'completed') {
      statusEl.className = 'entry-analyze-status completed';
      const label = storageKey === '_own_product' ? 'SEO audit done!' : 'SEO analysis done!';
      statusEl.innerHTML = `<span>${label}</span> <button class="btn btn-primary btn-sm" onclick="viewSeoReport('${storageKey}', '${analysisId}')" style="padding:2px 8px;font-size:12px;">View Report</button>`;
      await loadContainer();
      return;
    } else if (data.status === 'failed') {
      statusEl.className = 'entry-analyze-status failed';
      statusEl.innerHTML = `<span>Failed: ${esc(data.result?.error || 'Unknown')}</span>`;
      return;
    }

    setTimeout(() => pollSeoAnalysis(storageKey, displayName, analysisId), 3000);
  } catch (e) {
    setTimeout(() => pollSeoAnalysis(storageKey, displayName, analysisId), 5000);
  }
}

function viewSeoReport(storageKey, analysisId) {
  window.location.href = `/seo-analysis.html?cid=${containerId}&key=${encodeURIComponent(storageKey)}&id=${encodeURIComponent(analysisId)}`;
}
