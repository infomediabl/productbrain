/**
 * Test Plan Report — STANDALONE PAGE
 * Page: test-plan.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, planId, loadTestPlan(), renderTestPlan(), esc()
 * API: GET /api/containers/:id/test-plans/:planId, GET /api/containers/:id
 *
 * Displays a full test plan report using the KNOWNS/UNKNOWNS framework. Shows
 * data classification, individual test plans with hypotheses, budgets, success criteria,
 * and recommended sequence. Supports print.
 */
// Standalone test plan report page — follows proposal-report.js pattern
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const planId = params.get('planId');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('testplan-content');
const backLink = document.getElementById('back-link');
const printBtn = document.getElementById('print-btn');

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !planId) {
  statusText.textContent = 'Missing parameters (cid, planId).';
  statusBar.className = 'status-bar failed';
} else {
  loadTestPlan();
}

async function loadTestPlan() {
  try {
    const res = await fetch(`/api/containers/${containerId}/test-plans/${planId}`);
    if (!res.ok) {
      statusText.textContent = 'Test plan not found.';
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      return;
    }
    const plan = await res.json();

    if (plan.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'Test plan is still generating...';
      setTimeout(loadTestPlan, 3000);
      return;
    }

    if (plan.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Test plan failed: ${plan.result?.error || 'Unknown error'}`;
      return;
    }

    // Completed
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    let container = null;
    try {
      const cRes = await fetch(`/api/containers/${containerId}`);
      if (cRes.ok) container = await cRes.json();
    } catch (e) {}

    const containerName = container?.name || '';
    statusText.textContent = `Test Plan — ${containerName} — ${new Date(plan.created_at).toLocaleString()}`;
    printBtn.style.display = '';

    renderTestPlan(plan, container);
  } catch (e) {
    statusText.textContent = 'Error loading test plan.';
    statusBar.className = 'status-bar failed';
    statusBar.querySelector('.spinner').style.display = 'none';
  }
}

function renderTestPlan(plan, container) {
  const r = plan.result;
  if (!r) { contentDiv.innerHTML = '<div class="card">No data</div>'; return; }

  const json = r.json_data;
  let html = '';

  // Report Header
  html += `<div class="report-header">
    <div>
      <h2>Test Plan — KNOWNS/UNKNOWNS Framework</h2>
      <div class="report-meta">${new Date(r.generated_at || plan.created_at).toLocaleString()}</div>
    </div>
  </div>`;

  if (!json) {
    html += `<div class="card"><div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text || 'No data')}</div></div>`;
    contentDiv.innerHTML = html;
    return;
  }

  // Data Classification
  const dc = json.data_classification || r.classification || {};
  const dcKnowns = dc.knowns || [];
  const dcUnknowns = dc.unknowns || [];

  if (dcKnowns.length > 0 || dcUnknowns.length > 0) {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">`;

    // Knowns column
    html += `<div style="background:#16a34a08;border:1px solid #16a34a20;border-radius:8px;padding:14px 16px;">
      <div style="font-size:14px;font-weight:700;color:var(--success);margin-bottom:10px;">KNOWNS (${dcKnowns.length})</div>`;
    for (const k of dcKnowns.slice(0, 20)) {
      const rel = k.relevance || '';
      const relBadge = rel === 'high' ? 'background:#16a34a15;color:#15803d;' : rel === 'medium' ? 'background:#d9770615;color:#b45309;' : 'background:#6b708510;color:#6b7085;';
      html += `<div style="font-size:12px;margin-bottom:4px;display:flex;gap:6px;align-items:flex-start;">
        <span class="badge" style="${relBadge}font-size:10px;flex-shrink:0;">${esc(k.source || '')}</span>
        <span>${esc(k.detail || k.category || '')}</span>
      </div>`;
    }
    if (dcKnowns.length > 20) html += `<div class="text-dim" style="font-size:11px;">...and ${dcKnowns.length - 20} more</div>`;
    html += `</div>`;

    // Unknowns column
    html += `<div style="background:#dc262608;border:1px solid #dc262620;border-radius:8px;padding:14px 16px;">
      <div style="font-size:14px;font-weight:700;color:var(--danger);margin-bottom:10px;">UNKNOWNS (${dcUnknowns.length})</div>`;
    for (const u of dcUnknowns) {
      const pBadge = u.priority === 'high' ? 'background:#dc262615;color:#b91c1c;' : u.priority === 'medium' ? 'background:#d9770615;color:#b45309;' : 'background:#6b708510;color:#6b7085;';
      html += `<div style="font-size:12px;margin-bottom:4px;display:flex;gap:6px;align-items:flex-start;">
        <span class="badge" style="${pBadge}font-size:10px;flex-shrink:0;">${esc(u.priority || '')}</span>
        <span>${esc(u.detail || u.category || '')}</span>
        ${u.can_be_tested ? '<span style="color:var(--success);font-size:10px;">testable</span>' : ''}
      </div>`;
    }
    html += `</div></div>`;
  }

  // Test Plans
  const tests = json.test_plans || [];
  if (tests.length > 0) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Tests</span><h3>Test Plans (${tests.length})</h3></div>`;

    for (const t of tests) {
      const prColor = t.priority === 'high' ? '#dc2626' : t.priority === 'medium' ? '#d97706' : '#6b7085';
      const channelBadge = t.channel ? `<span class="badge" style="background:#4f46e515;color:#4338ca;">${esc(t.channel)}</span>` : '';

      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-left:4px solid ${prColor};border-radius:8px;padding:16px;margin-bottom:12px;">`;
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <span style="background:${prColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">TEST ${t.test_number || ''}</span>
        ${channelBadge}
        <span style="font-size:15px;font-weight:600;">${esc(t.title || '')}</span>
        <span class="badge" style="background:${prColor}15;color:${prColor};margin-left:auto;">${esc(t.priority || '')}</span>
      </div>`;

      // Hypothesis
      if (t.hypothesis) {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px;font-size:13px;font-style:italic;">${esc(t.hypothesis)}</div>`;
      }

      // Knowns leveraged vs Unknowns being tested
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">`;
      html += `<div><div style="font-size:11px;font-weight:700;color:var(--success);margin-bottom:4px;">KNOWNS LEVERAGED</div>`;
      for (const k of (t.knowns_leveraged || [])) {
        html += `<div style="font-size:12px;margin-bottom:2px;">- ${esc(k)}</div>`;
      }
      html += `</div>`;
      html += `<div><div style="font-size:11px;font-weight:700;color:var(--danger);margin-bottom:4px;">UNKNOWNS BEING TESTED</div>`;
      for (const u of (t.unknowns_being_tested || [])) {
        html += `<div style="font-size:12px;margin-bottom:2px;">- ${esc(u)}</div>`;
      }
      html += `</div></div>`;

      // Geo, Keywords, Audience, Creative
      const details = [];
      if (t.geo?.target_countries) details.push(`<strong>Geo:</strong> ${esc((t.geo.target_countries || []).join(', '))} — ${esc(t.geo.rationale || '')}`);
      if (t.keywords?.primary) details.push(`<strong>Keywords:</strong> ${esc((t.keywords.primary || []).join(', '))}${t.keywords.source ? ` (${esc(t.keywords.source)})` : ''}`);
      if (t.audience?.description) details.push(`<strong>Audience:</strong> ${esc(t.audience.description)}`);
      if (t.creative_direction?.angle) details.push(`<strong>Creative:</strong> ${esc(t.creative_direction.angle)} [${esc(t.creative_direction.ad_format || '')}]${t.creative_direction.based_on ? ` — based on: ${esc(t.creative_direction.based_on)}` : ''}`);

      if (details.length > 0) {
        html += `<div style="font-size:12px;line-height:1.6;margin-bottom:10px;">${details.join('<br>')}</div>`;
      }

      // Budget + Success Criteria
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">`;
      if (t.budget) {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:4px;">BUDGET</div>
          <div style="font-size:14px;font-weight:600;">$${t.budget.daily_budget_usd || '?'}/day x ${t.budget.duration_days || '?'} days = $${t.budget.total_budget_usd || '?'}</div>
          <div style="font-size:11px;color:var(--text-dim);">${esc(t.budget.rationale || '')}</div>
        </div>`;
      }
      if (t.success_criteria) {
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-dim);margin-bottom:4px;">SUCCESS CRITERIA</div>
          <div style="font-size:14px;font-weight:600;">${esc(t.success_criteria.primary_metric || '')} ${esc(t.success_criteria.target_value || '')}</div>
          <div style="font-size:11px;color:var(--text-dim);">Benchmark: ${esc(t.success_criteria.benchmark_source || '')}</div>
          ${t.success_criteria.minimum_sample ? `<div style="font-size:11px;color:var(--text-dim);">Min sample: ${esc(t.success_criteria.minimum_sample)}</div>` : ''}
        </div>`;
      }
      html += `</div>`;

      html += `</div>`;
    }
    html += `</div>`;
  }

  // Recommended Sequence
  if (json.recommended_sequence) {
    html += `<div style="background:#4f46e508;border:1px solid #4f46e520;border-radius:8px;padding:14px 18px;margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:6px;">Recommended Sequence</div>
      <div style="font-size:13px;line-height:1.6;">${esc(json.recommended_sequence)}</div>
    </div>`;
  }

  // Total Budget
  if (json.total_budget_estimate) {
    html += `<div style="text-align:center;margin-top:12px;font-size:14px;font-weight:600;color:var(--text-dim);">Total Budget Estimate: ${esc(json.total_budget_estimate)}</div>`;
  }

  contentDiv.innerHTML = html;
}

// --- Utilities ---

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
