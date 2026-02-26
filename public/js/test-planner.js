/**
 * Test Planner UI (RPS Test Ideator — KNOWNS/UNKNOWNS Framework)
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderTestPlans(), openTestPlanModal(), closeTestPlanModal(),
 *   submitTestPlanModal(), pollTestPlan()
 * API: POST /api/containers/:id/test-plan, GET /api/containers/:id/test-plans/:planId
 * Interacts with: Links to test-plan.html for full report view
 *
 * Designs structured advertising tests using a KNOWNS/UNKNOWNS framework.
 * Supports focus area, budget constraint, target channels, and custom instructions.
 */
// ========== RPS Test Ideator (KNOWNS/UNKNOWNS Framework) ==========

function renderTestPlans() {
  const el = document.getElementById('testplan-list');
  const plans = container.test_plans || [];

  if (plans.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No RPS tests yet. Generate one to design structured advertising tests.</div>';
    return;
  }

  const sorted = [...plans].reverse();
  el.innerHTML = sorted.map(p => {
    const isGenerating = p.status === 'generating';
    const isDone = p.status === 'completed';
    const testCount = p.result?.json_data?.test_plans?.length || 0;

    return `
      <div class="proposal-item">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="status-dot ${isGenerating ? 'running' : p.status}"></span>
          <span>${new Date(p.created_at).toLocaleString()}</span>
          <span class="text-dim">${p.status}</span>
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Generating...</span>' : ''}
          ${isDone ? `<a href="/test-plan.html?cid=${containerId}&planId=${p.id}" class="btn btn-primary btn-sm" style="margin-left:auto;">View Plan</a>` : ''}
          ${isDone && testCount > 0 ? `<span class="text-dim" style="font-size:12px;">${testCount} tests</span>` : ''}
          ${p.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(p.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openTestPlanModal() {
  document.getElementById('testplan-focus').value = '';
  document.getElementById('testplan-budget').value = '';
  document.getElementById('testplan-instructions').value = '';
  document.querySelectorAll('.testplan-channel-cb').forEach(cb => cb.checked = false);
  document.getElementById('testplan-modal').style.display = 'flex';
}

function closeTestPlanModal() {
  document.getElementById('testplan-modal').style.display = 'none';
}

async function submitTestPlanModal() {
  const focus = document.getElementById('testplan-focus').value;
  const budget_constraint = document.getElementById('testplan-budget').value.trim();
  const user_instructions = document.getElementById('testplan-instructions').value.trim();
  const target_channels = [];
  document.querySelectorAll('.testplan-channel-cb:checked').forEach(cb => target_channels.push(cb.value));
  closeTestPlanModal();

  const btn = document.getElementById('testplan-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('testplan-status');
  statusEl.style.display = 'block';
  statusEl.className = 'status-bar running';
  statusEl.innerHTML = '<div class="spinner"></div><span>AI is classifying KNOWNS/UNKNOWNS and building test plans...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/test-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focus, budget_constraint, target_channels, user_instructions }),
    });
    const data = await res.json();
    if (res.ok) {
      pollTestPlan(data.plan_id);
    } else {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Create RPS Test';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Create RPS Test';
    alert('Failed to start test plan generation');
  }
}

async function pollTestPlan(planId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/test-plans/${planId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('testplan-status').style.display = 'none';
      document.getElementById('testplan-btn').disabled = false;
      document.getElementById('testplan-btn').textContent = 'Create RPS Test';
      await loadContainer();
      return;
    }
    setTimeout(() => pollTestPlan(planId), 3000);
  } catch (e) {
    setTimeout(() => pollTestPlan(planId), 5000);
  }
}

