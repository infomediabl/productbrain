/**
 * Proposal UI (Magic AI)
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js;
 *   getEntryAdStats() — from entries.js
 * Globals defined: renderProposals(), startProposal(), toggleAllCompetitors(),
 *   updateSelectedCompetitors(), closeProposalModal(), submitProposalModal(),
 *   pollProposalStatus(), proposalPollTimer
 * API: POST /api/containers/:id/propose, GET /api/containers/:id/proposals/:proposalId
 * Interacts with: entries.js (getEntryAdStats), prompts.js (generatePromptsFromProposal button)
 *
 * Generates AI proposals based on scraped ads and competitor analyses. Allows competitor
 * selection, product context input, and custom instructions. Links to proposal.html report.
 */
// ========== Magic AI ==========

function renderProposals() {
  const el = document.getElementById('proposals-list');
  const proposals = container.proposals || [];
  const hasData = container.competitors.some(c => getEntryAdStats(c.id).fbCount > 0 || getEntryAdStats(c.id).googleCount > 0);
  document.getElementById('propose-btn').disabled = !hasData;

  if (proposals.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No proposals yet. Scrape ads and optionally analyze competitors first.</div>';
    return;
  }

  const sorted = [...proposals].reverse();
  el.innerHTML = sorted.map(p => `
    <div class="proposal-item">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="status-dot ${p.status === 'generating' ? 'running' : p.status}"></span>
        <span>${new Date(p.created_at).toLocaleString()}</span>
        <span class="text-dim">${p.status}</span>
        ${p.status === 'completed' ? `
          ${promptSentLink(p.result)}
          <a href="/proposal.html?cid=${containerId}&pid=${p.id}" class="btn btn-primary btn-sm" style="margin-left:auto;">View</a>
          <button class="btn btn-ghost btn-sm" onclick="generatePromptsFromProposal('${p.id}')">Generate Prompts</button>
        ` : ''}
        ${p.status === 'failed' && p.result?.error ? `<span class="text-dim" style="font-size:12px;">${esc(p.result.error).substring(0, 80)}</span>` : ''}
        ${p.status === 'generating' ? `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Generating...</span>` : ''}
      </div>
    </div>
  `).join('');
}

let proposalPollTimer = null;
let proposalSelectedCompetitors = [];

function startProposal() {
  const modal = document.getElementById('proposal-modal');
  const body = document.getElementById('proposal-modal-body');
  proposalSelectedCompetitors = [];

  const compInfos = container.competitors.map(comp => ({
    comp,
    stats: getEntryAdStats(comp.id),
    hasAnalysis: ((container.competitor_analyses || {})[comp.id] || []).some(a => a.status === 'completed'),
  }));

  let html = `<div style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong style="font-size:14px;">Select competitors:</strong>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="toggleAllCompetitors(true)" style="padding:3px 8px;font-size:12px;">Select All</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleAllCompetitors(false)" style="padding:3px 8px;font-size:12px;">Deselect All</button>
      </div>
    </div>`;

  for (const { comp, stats, hasAnalysis } of compInfos) {
    const hasData = stats.fbCount > 0 || stats.googleCount > 0;
    html += `
      <div class="entry-checkbox" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;">
        <input type="checkbox" id="comp-chk-${comp.id}" value="${comp.id}" ${hasData ? 'checked' : ''} onchange="updateSelectedCompetitors()">
        <label for="comp-chk-${comp.id}" style="flex:1;cursor:pointer;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong style="font-size:13px;">${esc(comp.name)}</strong>
            ${hasAnalysis ? '<span class="badge" style="background:#16a34a15;color:#15803d;font-size:10px;">AI Analyzed</span>' : ''}
          </div>
          ${hasData ? `<div style="display:flex;gap:6px;margin-top:4px;"><span class="badge badge-fb">FB: ${stats.fbCount}</span><span class="badge badge-google">Google: ${stats.googleCount}</span></div>` : '<div class="text-dim" style="font-size:12px;">No data</div>'}
        </label>
      </div>`;
  }

  html += `</div>`;

  const productName = container.my_product?.name || '';
  const productWebsite = container.my_product?.website || '';
  const siteType = container.my_product?.site_type || '';
  let defaultContext = '';
  if (productName) {
    defaultContext = productName;
    if (productWebsite) defaultContext += ' — ' + productWebsite;
    if (siteType) defaultContext += '\nType: ' + siteType;
    if (container.my_product?.unique_angle) defaultContext += '\nAngle: ' + container.my_product.unique_angle;
  }

  html += `
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;">Product Context</label>
        <textarea id="proposal-context" rows="3" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;"
          placeholder="Describe your product, target audience, USPs...">${esc(defaultContext)}</textarea>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:13px;font-weight:600;">Additional Instructions</label>
        <textarea id="proposal-prompt" rows="3" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;"
          placeholder="e.g. Focus on video ads, prioritize Facebook..."></textarea>
      </div>
    </div>`;

  body.innerHTML = html;
  modal.style.display = 'flex';
  updateSelectedCompetitors();
}

function toggleAllCompetitors(checked) {
  document.querySelectorAll('#proposal-modal-body .entry-checkbox input[id^="comp-chk-"]').forEach(chk => chk.checked = checked);
  updateSelectedCompetitors();
}

function updateSelectedCompetitors() {
  proposalSelectedCompetitors = [];
  document.querySelectorAll('#proposal-modal-body .entry-checkbox input[id^="comp-chk-"]:checked').forEach(chk => proposalSelectedCompetitors.push(chk.value));
}

function closeProposalModal() {
  document.getElementById('proposal-modal').style.display = 'none';
  document.getElementById('modal-generate-btn').style.display = '';
}

async function submitProposalModal() {
  if (proposalSelectedCompetitors.length === 0) { alert('Select at least one competitor.'); return; }
  const userContext = (document.getElementById('proposal-context')?.value || '').trim();
  const userPrompt = (document.getElementById('proposal-prompt')?.value || '').trim();
  closeProposalModal();

  const btn = document.getElementById('propose-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('proposal-status');

  try {
    const res = await fetch(`/api/containers/${containerId}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitor_ids: proposalSelectedCompetitors, user_context: userContext, user_prompt: userPrompt }),
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.display = 'block';
      statusEl.className = 'status-bar running';
      statusEl.innerHTML = '<div class="spinner"></div><span>Claude is analyzing data from scraper + competitor analyses...</span>';
      pollProposalStatus(data.proposal_id);
    } else {
      alert(data.error || 'Failed');
      btn.disabled = false;
      btn.textContent = 'Generate Proposal';
    }
  } catch (e) {
    alert('Failed to start');
    btn.disabled = false;
    btn.textContent = 'Generate Proposal';
  }
}

async function pollProposalStatus(proposalId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/proposals/${proposalId}`);
    const data = await res.json();
    const statusEl = document.getElementById('proposal-status');

    if (data.status === 'completed' || data.status === 'failed') {
      statusEl.style.display = 'none';
      document.getElementById('propose-btn').disabled = false;
      document.getElementById('propose-btn').textContent = 'Generate Proposal';
      await loadContainer();
      return;
    }

    proposalPollTimer = setTimeout(() => pollProposalStatus(proposalId), 3000);
  } catch (e) {
    proposalPollTimer = setTimeout(() => pollProposalStatus(proposalId), 5000);
  }
}

