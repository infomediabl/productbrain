/**
 * Competitor Analyzer Trigger UI (Scraped Ads Analyzer)
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js;
 *   getEntryAdStats() — from entries.js
 * Globals defined: renderCompetitorAnalyses(), analyzeCompetitor(), pollCompetitorAnalysis()
 * API: POST /api/containers/:id/competitor-analysis,
 *   GET /api/containers/:id/competitor-analysis/:compId/:analysisId
 * Interacts with: entries.js (getEntryAdStats), navigates to competitor-analysis.html
 *
 * Renders competitor analysis cards, triggers AI analysis of scraped ads per competitor,
 * polls for completion, and links to the standalone competitor-analysis.html report page.
 */
// ========== Scraped Ads Analyzer ==========

function renderCompetitorAnalyses() {
  const el = document.getElementById('competitor-analysis-list');
  if (container.competitors.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No competitors added.</div>';
    return;
  }

  const compAnalyses = container.competitor_analyses || {};

  el.innerHTML = container.competitors.map(comp => {
    const analyses = compAnalyses[comp.id] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    const hasData = getEntryAdStats(comp.id).fbCount > 0 || getEntryAdStats(comp.id).googleCount > 0;
    const isGenerating = analyses.some(a => a.status === 'generating');

    return `
      <div class="entry-item competitor-entry" style="margin-bottom:8px;">
        <div class="entry-header">
          <span class="badge badge-competitor">${esc(comp.name)}</span>
          ${latest ? `<span class="badge" style="background:#16a34a15;color:#15803d;">Analyzed</span>` : ''}
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim" style="font-size:12px;">Analyzing...</span>' : ''}
          <div style="margin-left:auto;display:flex;gap:6px;">
            ${!isGenerating ? `<button class="btn btn-primary btn-sm" onclick="analyzeCompetitor('${comp.id}', '${esc(comp.name).replace(/'/g, "\\'")}')">Analyze</button>` : ''}
            ${latest ? `${promptSentLink(latest.result)}<a href="/competitor-analysis.html?cid=${containerId}&compId=${comp.id}&aId=${latest.id}" class="btn btn-ghost btn-sm">View Analysis</a>` : ''}
          </div>
        </div>
        ${!hasData ? '<div class="text-dim" style="font-size:12px;padding:4px 0;">Tip: Scrape ads first for deeper analysis</div>' : ''}
        <div id="comp-analysis-status-${comp.id}" style="display:none;"></div>
      </div>
    `;
  }).join('');
}

async function analyzeCompetitor(competitorId, competitorName) {
  const statusEl = document.getElementById(`comp-analysis-status-${competitorId}`);
  statusEl.style.display = 'flex';
  statusEl.className = 'entry-analyze-status running';
  statusEl.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span>Running AI analysis for ${esc(competitorName)}...</span>`;

  try {
    const res = await fetch(`/api/containers/${containerId}/competitor-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitor_id: competitorId }),
    });
    const data = await res.json();
    if (res.ok) {
      pollCompetitorAnalysis(competitorId, competitorName, data.analysis_id);
    } else {
      statusEl.className = 'entry-analyze-status failed';
      statusEl.innerHTML = `<span>Failed: ${esc(data.error)}</span>`;
    }
  } catch (e) {
    statusEl.className = 'entry-analyze-status failed';
    statusEl.innerHTML = `<span>Error starting analysis</span>`;
  }
}

async function pollCompetitorAnalysis(competitorId, competitorName, analysisId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/competitor-analysis/${competitorId}/${analysisId}`);
    const data = await res.json();
    const statusEl = document.getElementById(`comp-analysis-status-${competitorId}`);

    if (data.status === 'completed') {
      statusEl.className = 'entry-analyze-status completed';
      statusEl.innerHTML = `<span>Analysis done!</span> <a href="/competitor-analysis.html?cid=${containerId}&compId=${competitorId}&aId=${analysisId}" class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:12px;">View</a>`;
      await loadContainer();
      return;
    } else if (data.status === 'failed') {
      statusEl.className = 'entry-analyze-status failed';
      statusEl.innerHTML = `<span>Failed: ${esc(data.result?.error || 'Unknown')}</span>`;
      return;
    }

    setTimeout(() => pollCompetitorAnalysis(competitorId, competitorName, analysisId), 3000);
  } catch (e) {
    setTimeout(() => pollCompetitorAnalysis(competitorId, competitorName, analysisId), 5000);
  }
}
