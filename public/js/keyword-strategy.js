/**
 * Keyword Strategy UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderKeywordStrategies(), openKeywordModal(), closeKeywordModal(),
 *   submitKeywordModal(), pollKeywordStrategy(), viewKeywordStrategy()
 * API: POST /api/containers/:id/keyword-strategy,
 *   GET /api/containers/:id/keyword-strategies/:strategyId
 *
 * Generates keyword strategies from competitor and SEO data. Displays results
 * with keyword clusters, quick wins, and competitor gaps in a modal view.
 */
// ========== Keyword Strategy Ideator ==========

function renderKeywordStrategies() {
  const el = document.getElementById('keyword-list');
  const strategies = container.keyword_strategies || [];

  if (strategies.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No keyword strategies yet. Generate one using competitor & SEO data.</div>';
    return;
  }

  const sorted = [...strategies].reverse();
  el.innerHTML = sorted.map(s => {
    const isGenerating = s.status === 'generating';
    const isDone = s.status === 'completed';
    const clusters = s.result?.json_data?.keyword_clusters || [];

    return `
      <div class="proposal-item">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="status-dot ${isGenerating ? 'running' : s.status}"></span>
          <span>${new Date(s.created_at).toLocaleString()}</span>
          <span class="text-dim">${s.status}</span>
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Generating...</span>' : ''}
          ${isDone ? `<button class="btn btn-primary btn-sm" onclick="viewKeywordStrategy('${s.id}')" style="margin-left:auto;">View Strategy</button>` : ''}
          ${isDone && clusters.length > 0 ? `<span class="text-dim" style="font-size:12px;">${clusters.length} clusters</span>` : ''}
          ${s.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(s.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openKeywordModal() {
  document.getElementById('keyword-niche').value = '';
  document.getElementById('keyword-goals').value = '';
  document.getElementById('keyword-budget').value = '';
  document.getElementById('keyword-modal').style.display = 'flex';
}

function closeKeywordModal() {
  document.getElementById('keyword-modal').style.display = 'none';
}

async function submitKeywordModal() {
  const niche = document.getElementById('keyword-niche').value.trim();
  const goals = document.getElementById('keyword-goals').value.trim();
  const budget_level = document.getElementById('keyword-budget').value;
  closeKeywordModal();

  const btn = document.getElementById('keyword-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('keyword-status');
  statusEl.style.display = 'block';
  statusEl.className = 'status-bar running';
  statusEl.innerHTML = '<div class="spinner"></div><span>AI is building keyword strategy from competitor & SEO data...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/keyword-strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche, goals, budget_level }),
    });
    const data = await res.json();
    if (res.ok) {
      pollKeywordStrategy(data.strategy_id);
    } else {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Generate Strategy';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Generate Strategy';
    alert('Failed to start keyword strategy generation');
  }
}

async function pollKeywordStrategy(strategyId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/keyword-strategies/${strategyId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('keyword-status').style.display = 'none';
      document.getElementById('keyword-btn').disabled = false;
      document.getElementById('keyword-btn').textContent = 'Generate Strategy';
      await loadContainer();
      return;
    }
    setTimeout(() => pollKeywordStrategy(strategyId), 3000);
  } catch (e) {
    setTimeout(() => pollKeywordStrategy(strategyId), 5000);
  }
}

function viewKeywordStrategy(strategyId) {
  const strategies = container.keyword_strategies || [];
  const strategy = strategies.find(s => s.id === strategyId);
  if (!strategy || !strategy.result) { alert('Strategy not found'); return; }

  const r = strategy.result;
  const json = r.json_data;
  let html = `<h3 style="margin-bottom:4px;">Keyword Strategy</h3>`;
  html += `<div class="text-dim" style="font-size:12px;margin-bottom:16px;">${new Date(r.generated_at).toLocaleString()}</div>`;

  if (!json) {
    html += `<div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text)}</div>`;
  } else {
    // Summary
    if (json.summary) {
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;line-height:1.6;">${esc(json.summary)}</div>`;
    }

    // Keyword Clusters
    if (json.keyword_clusters && json.keyword_clusters.length > 0) {
      html += `<h4 style="font-size:14px;margin-bottom:10px;">Keyword Clusters</h4>`;
      for (const cluster of json.keyword_clusters) {
        html += `<div style="background:var(--surface2);border:1px solid var(--border);border-left:3px solid #7c3aed;border-radius:6px;padding:12px 16px;margin-bottom:10px;">
          <div style="font-size:14px;font-weight:600;margin-bottom:6px;">${esc(cluster.theme || cluster.name)}</div>
          ${cluster.intent ? `<span class="badge" style="background:#7c3aed15;color:#6d28d9;margin-bottom:6px;">${esc(cluster.intent)}</span>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
            ${(cluster.keywords || []).map(k => `<span class="badge" style="background:var(--surface);">${esc(typeof k === 'string' ? k : k.keyword || k)}</span>`).join('')}
          </div>
          ${cluster.estimated_volume ? `<div class="text-dim" style="font-size:12px;margin-top:6px;">Est. volume: ${esc(String(cluster.estimated_volume))}</div>` : ''}
        </div>`;
      }
    }

    // Quick Wins
    if (json.quick_wins && json.quick_wins.length > 0) {
      html += `<h4 style="font-size:14px;margin:16px 0 10px;">Quick Wins</h4>`;
      for (const qw of json.quick_wins) {
        html += `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;padding:8px 12px;background:#16a34a08;border:1px solid #16a34a20;border-radius:6px;font-size:13px;">
          <span style="color:var(--success);font-weight:700;flex-shrink:0;">&#10003;</span>
          <span>${esc(typeof qw === 'string' ? qw : qw.action || qw.keyword || JSON.stringify(qw))}</span>
        </div>`;
      }
    }

    // Competitor Gaps
    if (json.competitor_gaps && json.competitor_gaps.length > 0) {
      html += `<h4 style="font-size:14px;margin:16px 0 10px;">Competitor Gaps</h4>`;
      for (const gap of json.competitor_gaps) {
        html += `<div style="padding:8px 12px;background:#dc262608;border:1px solid #dc262620;border-radius:6px;margin-bottom:6px;font-size:13px;">
          ${esc(typeof gap === 'string' ? gap : gap.gap || gap.description || JSON.stringify(gap))}
        </div>`;
      }
    }

    // Auction-Ready Keywords
    const auctionKw = json.auction_keywords || [];
    if (auctionKw.length > 0) {
      html += `<h4 style="font-size:14px;margin:16px 0 10px;">Auction-Ready Keywords (${auctionKw.length})</h4>`;
      for (const ak of auctionKw) {
        const prColor = ak.priority === 'high' ? '#dc2626' : ak.priority === 'medium' ? '#d97706' : '#6b7085';
        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0891b208;border:1px solid #0891b220;border-radius:6px;margin-bottom:6px;font-size:13px;flex-wrap:wrap;">
          <span style="font-weight:600;">${esc(ak.keyword || '')}</span>
          <span class="badge" style="background:var(--surface);font-size:11px;">${esc((ak.match_type || '').toUpperCase())}</span>
          ${ak.estimated_cpc ? `<span class="text-dim" style="font-size:12px;">${esc(ak.estimated_cpc)}</span>` : ''}
          <span class="badge" style="background:${prColor}15;color:${prColor};font-size:11px;">${esc(ak.priority || '')}</span>
          ${ak.source ? `<span class="text-dim" style="font-size:11px;margin-left:auto;">${esc(ak.source)}</span>` : ''}
        </div>`;
      }
    }

  }

  const modal = document.getElementById('proposal-modal');
  document.getElementById('proposal-modal-body').innerHTML = html;
  document.getElementById('modal-generate-btn').style.display = 'none';
  modal.style.display = 'flex';
}

