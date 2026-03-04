/**
 * SpinOff Ideas UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js;
 *   getEntryAdStats() — from entries.js
 * Globals defined: renderSpinoffIdeas(), openSpinoffModal(), closeSpinoffModal(),
 *   submitSpinoffModal(), toggleSpinoffCompetitors(), updateSpinoffCompetitors(),
 *   pollSpinoffIdea(), spinoffPollTimer
 * API: POST /api/containers/:id/spinoff-ideas, GET /api/containers/:id/spinoff-ideas/:ideaId
 *
 * Generates spin-off product/business ideas adjacent to the current market.
 * Uses competitor data, SEO analyses, and container context to propose new opportunities.
 */
// ========== SpinOff Ideas ==========

let spinoffPollTimer = null;
let spinoffSelectedCompetitors = [];

function renderSpinoffIdeas() {
  const el = document.getElementById('spinoff-list');
  const ideas = container.spinoff_ideas || [];
  const hasData = container.my_product
    || container.competitors.some(c => getEntryAdStats(c.id).fbCount > 0 || getEntryAdStats(c.id).googleCount > 0)
    || Object.values(container.competitor_analyses || {}).some(arr => arr.some(a => a.status === 'completed'))
    || (container.container_context || []).length > 0;

  document.getElementById('spinoff-btn').disabled = !hasData;

  if (ideas.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No spin-off ideas yet. Add product info, scrape ads, or run analyses first.</div>';
    return;
  }

  const sorted = [...ideas].reverse();
  let html = '';
  for (const idea of sorted) {
    if (idea.status === 'generating') {
      html += `<div class="analysis-item"><div style="display:flex;align-items:center;gap:8px;">
        <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
        <span class="text-dim">Generating spin-off ideas...</span>
      </div></div>`;
      continue;
    }
    if (idea.status === 'failed') {
      html += `<div class="analysis-item"><span class="status-dot failed"></span><span class="text-dim">Failed: ${esc(idea.result?.error || 'Unknown')}</span></div>`;
      continue;
    }
    if (idea.status === 'completed' && idea.result?.json_data) {
      const json = idea.result.json_data;
      const spinoffs = json.spinoff_ideas || [];
      const reportUrl = `/spinoff-ideas.html?cid=${containerId}&ideaId=${idea.id}`;

      html += `<div class="analysis-item" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span class="status-dot completed"></span>
            <span style="font-size:13px;font-weight:600;">${spinoffs.length} Spin-Off Ideas</span>
            ${json.landscape_summary?.market_type ? `<span class="badge" style="background:#6366f115;color:#6366f1;font-size:10px;">${esc(json.landscape_summary.market_type)}</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-dim);">${new Date(idea.created_at).toLocaleString()}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
            ${spinoffs.slice(0, 5).map(si => {
              const effortColor = si.effort_estimate === 'low' ? '#16a34a' : si.effort_estimate === 'high' ? '#dc2626' : '#d97706';
              const effortBg = si.effort_estimate === 'low' ? '#16a34a15' : si.effort_estimate === 'high' ? '#dc262615' : '#d9770615';
              return `<span class="badge" style="background:${effortBg};color:${effortColor};font-size:10px;">${esc(si.idea_name)}</span>`;
            }).join('')}
          </div>
        </div>
        <a href="${reportUrl}" class="btn btn-primary btn-sm" style="white-space:nowrap;">View Report</a>
      </div>`;
    }
  }
  el.innerHTML = html;
}

function openSpinoffModal() {
  const modal = document.getElementById('spinoff-modal');
  const body = document.getElementById('spinoff-modal-body');
  spinoffSelectedCompetitors = [];

  const compInfos = container.competitors.map(comp => ({
    comp,
    stats: getEntryAdStats(comp.id),
    hasAnalysis: ((container.competitor_analyses || {})[comp.id] || []).some(a => a.status === 'completed'),
    hasSeo: ((container.seo_analyses || {})[comp.id] || []).some(a => a.status === 'completed'),
  }));

  let html = `<div style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong style="font-size:14px;">Select competitors:</strong>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="toggleSpinoffCompetitors(true)" style="padding:3px 8px;font-size:12px;">Select All</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleSpinoffCompetitors(false)" style="padding:3px 8px;font-size:12px;">Deselect All</button>
      </div>
    </div>`;

  for (const { comp, stats, hasAnalysis, hasSeo } of compInfos) {
    const hasData = stats.fbCount > 0 || stats.googleCount > 0 || hasAnalysis || hasSeo;
    html += `
      <div class="entry-checkbox" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;">
        <input type="checkbox" id="spinoff-comp-${comp.id}" value="${comp.id}" ${hasData ? 'checked' : ''} onchange="updateSpinoffCompetitors()">
        <label for="spinoff-comp-${comp.id}" style="flex:1;cursor:pointer;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong style="font-size:13px;">${esc(comp.name)}</strong>
            ${hasAnalysis ? '<span class="badge" style="background:#16a34a15;color:#15803d;font-size:10px;">AI Analyzed</span>' : ''}
            ${hasSeo ? '<span class="badge" style="background:#06b6d415;color:#0891b2;font-size:10px;">SEO</span>' : ''}
          </div>
          ${stats.fbCount > 0 || stats.googleCount > 0 ? `<div style="display:flex;gap:6px;margin-top:4px;"><span class="badge badge-fb">FB: ${stats.fbCount}</span><span class="badge badge-google">Google: ${stats.googleCount}</span></div>` : ''}
          ${!hasData ? '<div class="text-dim" style="font-size:12px;">No data</div>' : ''}
        </label>
      </div>`;
  }

  html += `</div>`;

  const contextCount = (container.container_context || []).length;
  html += `
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
      <div style="margin-bottom:12px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="spinoff-include-context" checked>
          <strong style="font-size:13px;">Include Container Context</strong>
          <span class="text-dim" style="font-size:12px;">(${contextCount} item${contextCount !== 1 ? 's' : ''})</span>
        </label>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;">Additional Instructions <span class="text-dim" style="font-weight:400;">(optional)</span></label>
        <textarea id="spinoff-user-prompt" rows="3" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;"
          placeholder="e.g. Focus on mobile app ideas, look for B2B opportunities, consider subscription models..."></textarea>
      </div>
    </div>`;

  body.innerHTML = html;
  modal.style.display = 'flex';
  updateSpinoffCompetitors();
}

function toggleSpinoffCompetitors(checked) {
  document.querySelectorAll('#spinoff-modal-body input[id^="spinoff-comp-"]').forEach(chk => chk.checked = checked);
  updateSpinoffCompetitors();
}

function updateSpinoffCompetitors() {
  spinoffSelectedCompetitors = [];
  document.querySelectorAll('#spinoff-modal-body input[id^="spinoff-comp-"]:checked').forEach(chk => spinoffSelectedCompetitors.push(chk.value));
}

function closeSpinoffModal() {
  document.getElementById('spinoff-modal').style.display = 'none';
}

async function submitSpinoffModal() {
  const includeContext = document.getElementById('spinoff-include-context')?.checked !== false;
  const userPrompt = (document.getElementById('spinoff-user-prompt')?.value || '').trim();
  closeSpinoffModal();

  const btn = document.getElementById('spinoff-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('spinoff-status');

  try {
    const res = await fetch(`/api/containers/${containerId}/spinoff-ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitor_ids: spinoffSelectedCompetitors.length > 0 ? spinoffSelectedCompetitors : null,
        include_context: includeContext,
        user_prompt: userPrompt || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.display = 'block';
      statusEl.className = 'status-bar running';
      statusEl.innerHTML = '<div class="spinner"></div><span>AI is analyzing data to propose spin-off ideas...</span>';
      await loadContainer();
      pollSpinoffIdea(data.idea_id);
    } else {
      alert(data.error || 'Failed');
      btn.disabled = false;
      btn.textContent = 'Generate Ideas';
    }
  } catch (e) {
    alert('Failed to start spin-off ideation');
    btn.disabled = false;
    btn.textContent = 'Generate Ideas';
  }
}

async function pollSpinoffIdea(ideaId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/spinoff-ideas/${ideaId}`);
    const data = await res.json();
    const statusEl = document.getElementById('spinoff-status');
    const btn = document.getElementById('spinoff-btn');

    if (data.status === 'completed' || data.status === 'failed') {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Generate Ideas';
      await loadContainer();
      return;
    }
    spinoffPollTimer = setTimeout(() => pollSpinoffIdea(ideaId), 3000);
  } catch (e) {
    spinoffPollTimer = setTimeout(() => pollSpinoffIdea(ideaId), 5000);
  }
}
