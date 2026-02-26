/**
 * Keyword Strategy — Standalone Page
 * Page: keyword-strategy.html (standalone, no container.html globals)
 * Globals used: (none — self-contained; defines own esc(), selectedContainerId)
 * Globals defined: loadContainers(), onContainerSelected(), autoPopulateNiche(),
 *   loadPastStrategies(), submitKeywordForm(), pollKeywordStrategy(),
 *   renderKeywordResults(), viewPastStrategy(), esc()
 * API: GET /api/containers, GET /api/containers/:id,
 *   POST /api/containers/:id/keyword-strategy,
 *   GET /api/containers/:id/keyword-strategies/:id
 *
 * Standalone page for generating and viewing keyword strategies.
 * Supports ?cid= to pre-select a container and ?strategyId= to jump to a specific result.
 */

let selectedContainerId = null;
let currentContainer = null;

// ========== Init ==========
loadContainers();

// ========== Container Selection ==========

async function loadContainers() {
  try {
    const res = await fetch('/api/containers');
    const containers = await res.json();
    const select = document.getElementById('ks-container-select');

    if (containers.length === 0) {
      select.innerHTML = '<option value="">No containers found</option>';
      return;
    }

    select.innerHTML = '<option value="">Select a container...</option>' +
      containers.map(c => `<option value="${esc(c.id)}">${esc(c.my_product?.name || c.name || c.id)}</option>`).join('');

    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('cid');
    if (cid && containers.find(c => c.id === cid)) {
      select.value = cid;
      onContainerSelected();
    }
  } catch (e) {
    document.getElementById('ks-container-select').innerHTML = '<option value="">Failed to load</option>';
  }
}

async function onContainerSelected() {
  const select = document.getElementById('ks-container-select');
  selectedContainerId = select.value || null;
  const mainArea = document.getElementById('ks-main');
  const placeholder = document.getElementById('ks-placeholder');
  const resultsDiv = document.getElementById('ks-results');

  if (!selectedContainerId) {
    mainArea.style.display = 'none';
    placeholder.style.display = 'block';
    currentContainer = null;
    return;
  }

  placeholder.style.display = 'none';
  mainArea.style.display = 'block';
  resultsDiv.style.display = 'none';
  resultsDiv.innerHTML = '';

  // Fetch full container data
  try {
    const res = await fetch(`/api/containers/${selectedContainerId}`);
    if (!res.ok) throw new Error('Not found');
    currentContainer = await res.json();
    autoPopulateNiche(currentContainer);
    loadPastStrategies(currentContainer);

    // Check if strategyId param present — jump to view
    const params = new URLSearchParams(window.location.search);
    const strategyId = params.get('strategyId');
    if (strategyId) {
      viewPastStrategy(strategyId);
    }
  } catch (e) {
    currentContainer = null;
    document.getElementById('ks-niche').value = '';
    document.getElementById('ks-past-list').innerHTML = '<div class="text-dim" style="font-size:13px;">Failed to load container data.</div>';
  }
}

// ========== Auto-populate Niche ==========

function autoPopulateNiche(container) {
  const nicheInput = document.getElementById('ks-niche');
  if (!container) return;

  const mp = container.my_product;
  if (mp && mp.name) {
    if (mp.site_type) {
      nicheInput.value = mp.name + ' \u2014 ' + mp.site_type;
    } else {
      nicheInput.value = mp.name;
    }
  } else if (container.competitors && container.competitors.length > 0) {
    const names = container.competitors.slice(0, 3).map(c => c.name).filter(Boolean);
    if (names.length > 0) {
      nicheInput.value = names.join(', ') + ' market';
    }
  } else {
    nicheInput.value = '';
  }
}

// ========== Past Strategies ==========

function loadPastStrategies(container) {
  const listEl = document.getElementById('ks-past-list');
  const strategies = container.keyword_strategies || [];

  if (strategies.length === 0) {
    listEl.innerHTML = '<div class="text-dim" style="font-size:13px;">No strategies yet.</div>';
    return;
  }

  const sorted = [...strategies].reverse();
  listEl.innerHTML = sorted.map(s => {
    const isGenerating = s.status === 'generating';
    const isDone = s.status === 'completed';
    const clusters = s.result?.json_data?.keyword_clusters || [];
    const totalKw = s.result?.json_data?.total_keywords || '';

    return `<div class="ks-past-item">
      <span class="status-dot ${isGenerating ? 'running' : s.status}"></span>
      <span>${new Date(s.created_at).toLocaleString()}</span>
      <span class="text-dim">${esc(s.status)}</span>
      ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>' : ''}
      ${isDone && clusters.length > 0 ? `<span class="text-dim" style="font-size:12px;">${clusters.length} clusters${totalKw ? ', ' + totalKw + ' keywords' : ''}</span>` : ''}
      ${isDone ? `<button class="btn btn-primary btn-sm" onclick="viewPastStrategy('${esc(s.id)}')" style="margin-left:auto;">View</button>` : ''}
      ${s.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(s.result?.error || 'Failed')}</span>` : ''}
    </div>`;
  }).join('');
}

// ========== Generate ==========

async function submitKeywordForm() {
  if (!selectedContainerId) return;

  const niche = document.getElementById('ks-niche').value.trim();
  const goals = document.getElementById('ks-goals').value.trim();
  const budget_level = document.getElementById('ks-budget').value;
  const use_context = document.getElementById('ks-use-context').checked;

  const btn = document.getElementById('ks-generate-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  const statusEl = document.getElementById('ks-status');
  statusEl.style.display = 'flex';
  statusEl.className = 'status-bar running';
  document.getElementById('ks-status-text').textContent = 'AI is building keyword strategy from competitor & SEO data...';

  // Hide previous results
  document.getElementById('ks-results').style.display = 'none';

  try {
    const res = await fetch(`/api/containers/${selectedContainerId}/keyword-strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche, goals, budget_level, use_context }),
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
    const res = await fetch(`/api/containers/${selectedContainerId}/keyword-strategies/${strategyId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('ks-status').style.display = 'none';
      document.getElementById('ks-generate-btn').disabled = false;
      document.getElementById('ks-generate-btn').textContent = 'Generate Strategy';

      if (data.status === 'completed') {
        renderKeywordResults(data);
      } else {
        alert('Strategy generation failed: ' + (data.result?.error || 'Unknown error'));
      }

      // Refresh container to update past strategies list
      try {
        const cRes = await fetch(`/api/containers/${selectedContainerId}`);
        if (cRes.ok) {
          currentContainer = await cRes.json();
          loadPastStrategies(currentContainer);
        }
      } catch (e) {}
      return;
    }
    setTimeout(() => pollKeywordStrategy(strategyId), 3000);
  } catch (e) {
    setTimeout(() => pollKeywordStrategy(strategyId), 5000);
  }
}

// ========== View Past Strategy ==========

async function viewPastStrategy(strategyId) {
  // Try from local data first
  if (currentContainer) {
    const strategies = currentContainer.keyword_strategies || [];
    const s = strategies.find(x => x.id === strategyId);
    if (s && s.status === 'completed') {
      renderKeywordResults(s);
      return;
    }
    if (s && s.status === 'generating') {
      document.getElementById('ks-status').style.display = 'flex';
      document.getElementById('ks-status').className = 'status-bar running';
      document.getElementById('ks-status-text').textContent = 'Strategy is still generating...';
      pollKeywordStrategy(strategyId);
      return;
    }
  }

  // Fetch from API
  try {
    const res = await fetch(`/api/containers/${selectedContainerId}/keyword-strategies/${strategyId}`);
    if (!res.ok) { alert('Strategy not found'); return; }
    const data = await res.json();

    if (data.status === 'generating') {
      document.getElementById('ks-status').style.display = 'flex';
      document.getElementById('ks-status').className = 'status-bar running';
      document.getElementById('ks-status-text').textContent = 'Strategy is still generating...';
      pollKeywordStrategy(strategyId);
      return;
    }
    if (data.status === 'completed') {
      renderKeywordResults(data);
    } else {
      alert('Strategy failed: ' + (data.result?.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Failed to load strategy');
  }
}

// ========== Render Results ==========

function renderKeywordResults(strategy) {
  const resultsDiv = document.getElementById('ks-results');
  const r = strategy.result;
  if (!r) {
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div class="card"><div class="text-dim">No result data.</div></div>';
    return;
  }

  // Store strategy ID for push context
  window._currentStrategyId = strategy.id || null;
  window._pushItems = [];

  const json = r.json_data;

  // Push button helper
  const pushBtn = (sectionKey, label, content) => {
    const idx = registerPushItem(sectionKey, label, content);
    return `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${idx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;" title="Push to Container Context">Push</button>`;
  };

  let html = '';

  // Header
  html += `<div class="report-header">
    <div>
      <h2>Keyword Strategy</h2>
      <div class="report-meta">${new Date(r.generated_at || strategy.created_at).toLocaleString()}</div>
    </div>
  </div>`;

  if (!json) {
    html += `<div class="card" style="margin-top:16px;"><div style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text || 'No data')}</div></div>`;
    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // Strategy Summary
  const summary = json.strategy_summary || json.summary || '';
  if (summary) {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-top:16px;font-size:14px;line-height:1.6;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          ${esc(summary)}
          ${json.total_keywords ? `<div class="text-dim" style="font-size:12px;margin-top:6px;">Total keywords: ${esc(String(json.total_keywords))}</div>` : ''}
        </div>
        ${pushBtn('summary', 'Strategy Summary', { strategy_summary: summary, total_keywords: json.total_keywords })}
      </div>
    </div>`;
  }

  // Keyword Clusters
  const clusters = json.keyword_clusters || [];
  if (clusters.length > 0) {
    html += `<div class="report-section hooks" style="margin-top:16px;">
      <div class="report-section-header"><span class="report-section-badge">Clusters</span><h3>Keyword Clusters (${clusters.length})</h3></div>`;

    for (const cluster of clusters) {
      const name = cluster.cluster_name || cluster.theme || cluster.name || 'Unnamed';
      const intent = cluster.intent || '';
      const funnel = cluster.funnel_stage || '';
      const priority = cluster.priority || '';
      const score = cluster.opportunity_score;
      const rationale = cluster.rationale || '';
      const primaryKw = cluster.primary_keyword || '';
      const keywords = cluster.keywords || [];

      // Priority color
      const prColor = priority === 'high' ? '#dc2626' : priority === 'medium' ? '#d97706' : '#6b7085';

      html += `<div class="ks-cluster">
        <div class="ks-cluster-header">
          <span class="ks-cluster-name">${esc(name)}</span>
          ${intent ? `<span class="badge" style="background:#7c3aed15;color:#6d28d9;">${esc(intent)}</span>` : ''}
          ${funnel ? `<span class="badge" style="background:#2563eb15;color:#1d4ed8;">${esc(funnel)}</span>` : ''}
          ${priority ? `<span class="badge" style="background:${prColor}15;color:${prColor};">${esc(priority)}</span>` : ''}
          ${score != null ? `<span class="text-dim" style="font-size:11px;">${esc(String(score))}/100</span>` : ''}
          <span style="margin-left:auto;">${pushBtn('cluster', name.substring(0, 50), cluster)}</span>
        </div>
        ${primaryKw ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Primary:</strong> ${esc(primaryKw)}</div>` : ''}
        ${rationale ? `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;">${esc(rationale)}</div>` : ''}
        <div class="ks-keywords">
          ${keywords.map(k => {
            const kw = typeof k === 'string' ? k : (k.keyword || k);
            const kIntent = typeof k === 'object' ? k.intent : '';
            const kComp = typeof k === 'object' ? k.competition : '';
            let tooltip = '';
            if (kIntent || kComp) tooltip = [kIntent, kComp ? 'comp: ' + kComp : ''].filter(Boolean).join(', ');
            return `<span class="badge" style="background:var(--surface);" ${tooltip ? 'title="' + esc(tooltip) + '"' : ''}>${esc(typeof kw === 'string' ? kw : String(kw))}</span>`;
          }).join('')}
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  // Quick Wins
  const quickWins = json.quick_wins || [];
  if (quickWins.length > 0) {
    html += `<div class="report-section actions" style="margin-top:16px;">
      <div class="report-section-header"><span class="report-section-badge">Quick Wins</span><h3>Quick Wins (${quickWins.length})</h3></div>`;

    for (const qw of quickWins) {
      const keyword = typeof qw === 'string' ? qw : (qw.keyword || '');
      const why = typeof qw === 'object' ? (qw.why || '') : '';
      const action = typeof qw === 'object' ? (qw.action || '') : '';
      const pushLabel = keyword || (typeof qw === 'string' ? qw : 'Quick win');

      html += `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;padding:10px 14px;background:#16a34a08;border:1px solid #16a34a20;border-radius:6px;font-size:13px;">
        <span style="color:var(--success);font-weight:700;flex-shrink:0;font-size:16px;">&#10003;</span>
        <div style="flex:1;">
          ${keyword ? `<div style="font-weight:600;">${esc(keyword)}</div>` : ''}
          ${why ? `<div style="color:var(--text-dim);font-size:12px;margin-top:2px;">${esc(why)}</div>` : ''}
          ${action ? `<div style="margin-top:4px;">${esc(action)}</div>` : ''}
          ${typeof qw === 'string' ? `<div>${esc(qw)}</div>` : ''}
        </div>
        ${pushBtn('quick_win', pushLabel.substring(0, 50), typeof qw === 'string' ? { keyword: qw } : qw)}
      </div>`;
    }
    html += `</div>`;
  }

  // Competitor Gaps
  const gaps = json.competitor_gaps || [];
  if (gaps.length > 0) {
    html += `<div class="report-section gaps" style="margin-top:16px;">
      <div class="report-section-header"><span class="report-section-badge">Gaps</span><h3>Competitor Gaps (${gaps.length})</h3></div>`;

    for (const gap of gaps) {
      const gapText = typeof gap === 'string' ? gap : (gap.gap || gap.description || '');
      const gapKeywords = typeof gap === 'object' ? (gap.keywords || []) : [];
      const oppSize = typeof gap === 'object' ? (gap.opportunity_size || '') : '';

      const oppColor = oppSize === 'high' ? '#dc2626' : oppSize === 'medium' ? '#d97706' : '#6b7085';

      html += `<div style="padding:10px 14px;background:#dc262608;border:1px solid #dc262620;border-radius:6px;margin-bottom:8px;font-size:13px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="flex:1;">${esc(gapText)}</span>
          ${oppSize ? `<span class="badge" style="background:${oppColor}15;color:${oppColor};font-size:11px;">${esc(oppSize)}</span>` : ''}
          ${pushBtn('competitor_gap', gapText.substring(0, 50), typeof gap === 'string' ? { gap: gap } : gap)}
        </div>
        ${gapKeywords.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${gapKeywords.map(k => `<span class="badge" style="background:var(--surface);">${esc(k)}</span>`).join('')}</div>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  // Ad Keyword Recommendations
  const adRecs = json.ad_keyword_recommendations || [];
  if (adRecs.length > 0) {
    html += `<div class="report-section targeting" style="margin-top:16px;">
      <div class="report-section-header"><span class="report-section-badge">Ads</span><h3>Ad Keyword Recommendations (${adRecs.length})</h3></div>`;

    for (const rec of adRecs) {
      const theme = rec.theme || '';
      const keywords = rec.keywords || [];

      html += `<div style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;font-size:13px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          ${theme ? `<div style="font-weight:600;">${esc(theme)}</div>` : ''}
          ${pushBtn('ad_recommendation', (theme || 'Ad keywords').substring(0, 50), rec)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${keywords.map(k => `<span class="badge" style="background:var(--surface);">${esc(k)}</span>`).join('')}
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  // Auction Keywords
  const auctionKw = json.auction_keywords || [];
  if (auctionKw.length > 0) {
    html += `<div class="report-section auction" style="margin-top:16px;">
      <div class="report-section-header"><span class="report-section-badge" style="background:#0891b215;color:#0e7490;">Auction</span><h3>Auction-Ready Keywords (${auctionKw.length})</h3></div>`;

    html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="border-bottom:2px solid var(--border);text-align:left;">
        <th style="padding:8px 10px;">Keyword</th>
        <th style="padding:8px 10px;">Match</th>
        <th style="padding:8px 10px;">Est. CPC</th>
        <th style="padding:8px 10px;">Priority</th>
        <th style="padding:8px 10px;">Source</th>
        <th style="padding:8px 10px;">Rationale</th>
        <th style="padding:8px 10px;width:50px;"></th>
      </tr></thead><tbody>`;

    for (const ak of auctionKw) {
      const prColor = ak.priority === 'high' ? '#dc2626' : ak.priority === 'medium' ? '#d97706' : '#6b7085';
      html += `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 10px;font-weight:600;">${esc(ak.keyword || '')}</td>
        <td style="padding:8px 10px;"><span class="badge" style="background:var(--surface);font-size:11px;">${esc((ak.match_type || '').toUpperCase())}</span></td>
        <td style="padding:8px 10px;">${esc(ak.estimated_cpc || 'N/A')}</td>
        <td style="padding:8px 10px;"><span class="badge" style="background:${prColor}15;color:${prColor};font-size:11px;">${esc(ak.priority || '')}</span></td>
        <td style="padding:8px 10px;color:var(--text-dim);font-size:12px;">${esc(ak.source || '')}</td>
        <td style="padding:8px 10px;color:var(--text-dim);font-size:12px;">${esc(ak.rationale || '')}</td>
        <td style="padding:8px 10px;">${pushBtn('auction_keyword', (ak.keyword || 'keyword').substring(0, 50), ak)}</td>
      </tr>`;
    }

    html += `</tbody></table></div></div>`;
  }

  resultsDiv.innerHTML = html;
  resultsDiv.style.display = 'block';
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========== Push to Container Context ==========

window._pushItems = [];

function registerPushItem(sectionKey, label, content) {
  const idx = window._pushItems.length;
  window._pushItems.push({ sectionKey, label, content });
  return idx;
}

async function pushRegisteredItem(idx, btn) {
  const item = window._pushItems[idx];
  if (!item || !selectedContainerId) return;

  btn.disabled = true;
  btn.textContent = 'Pushed!';
  btn.style.color = 'var(--success)';

  try {
    await fetch(`/api/containers/${selectedContainerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'keyword_strategy',
        source_id: window._currentStrategyId || null,
        section_name: item.label,
        content: item.content,
      }),
    });
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Push'; btn.style.color = ''; }, 2000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Push';
    btn.style.color = '';
  }
}

// ========== Utilities ==========

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
