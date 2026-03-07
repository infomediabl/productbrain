/**
 * Google Ads Campaign Analysis UI
 * Page: container.html (loaded after container.js and google-ads.js)
 * Globals used: container, containerId, esc() — from container.js;
 *   getSelectedGadsAccountId() — from google-ads.js
 * Globals defined: gadsCampaignsCache, analyzeSelectedCampaigns(), pollGadsAnalysis(),
 *   renderGadsAnalysis(), renderGadsAnalysisHistory(), renderGadsAnalysisSection()
 * API: POST /api/google-ads/analyze-campaigns,
 *   GET /api/google-ads/analysis/:analysisId
 * Interacts with: google-ads.js (shares account selection, campaign checkboxes)
 *
 * Sends selected Google Ads campaigns to AI for analysis. Renders findings with
 * status assessments, recommendations, and action items. Maintains analysis history.
 */
// ========== Google Ads Campaign Analysis ==========

let gadsCampaignsCache = [];

async function analyzeSelectedCampaigns() {
  const checked = document.querySelectorAll('.gads-campaign-chk:checked');
  if (checked.length === 0) { alert('Select at least one campaign to analyze'); return; }

  const campaignIds = Array.from(checked).map(chk => chk.value);
  const accountId = getSelectedGadsAccountId();

  const el = document.getElementById('gads-analysis-results');
  if (el) {
    el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px 0;"><div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Claude is analyzing selected campaigns...</span></div>';
  }

  try {
    const res = await fetch('/api/google-ads/analyze-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns: campaignIds, account_id: accountId, container_id: containerId }),
    });
    const data = await res.json();
    if (res.ok && data.analysis_id) {
      pollGadsAnalysis(data.analysis_id);
    } else if (res.ok) {
      renderGadsAnalysis(data);
    } else {
      if (el) el.innerHTML = `<div class="text-dim" style="color:var(--danger);font-size:13px;">Error: ${esc(data.error)}</div>`;
    }
  } catch (e) {
    if (el) el.innerHTML = '<div class="text-dim" style="color:var(--danger);font-size:13px;">Failed to start analysis</div>';
  }
}

async function pollGadsAnalysis(analysisId) {
  try {
    const res = await fetch(`/api/google-ads/analysis/${analysisId}?container_id=${containerId}`);
    const data = await res.json();

    if (data.status === 'completed') {
      renderGadsAnalysis(data.result, data.meta);
      await loadContainer();
      return;
    } else if (data.status === 'failed') {
      const el = document.getElementById('gads-analysis-results');
      if (el) el.innerHTML = `<div class="text-dim" style="color:var(--danger);font-size:13px;">Analysis failed: ${esc(data.result?.error || 'Unknown')}</div>`;
      return;
    }
    setTimeout(() => pollGadsAnalysis(analysisId), 3000);
  } catch (e) {
    setTimeout(() => pollGadsAnalysis(analysisId), 5000);
  }
}

function renderGadsAnalysis(result, meta) {
  const el = document.getElementById('gads-analysis-results');
  if (!el) return;

  const json = result?.json_data;
  if (!json) {
    el.innerHTML = `<div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(result?.full_text || 'No analysis data')}</div>`;
    return;
  }

  let html = '';

  // Metadata banner — show what data was pulled for analysis
  if (meta && (meta.campaigns_meta || meta.account_id)) {
    html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;">`;
    // Header row: account + date
    html += `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px;">`;
    if (meta.account_id) {
      html += `<div><strong>Account:</strong> <span class="text-dim">${esc(meta.account_id)}</span></div>`;
    }
    if (result?.analyzed_at || meta.analyzed_at) {
      html += `<div class="text-dim" style="font-size:12px;">${new Date(result.analyzed_at || meta.analyzed_at).toLocaleString()}</div>`;
    }
    html += `</div>`;
    // Campaign data table
    if (meta.campaigns_meta && meta.campaigns_meta.length > 0) {
      html += `<div style="font-weight:600;margin-bottom:6px;">Data pulled for analysis:</div>`;
      html += `<div class="table-wrapper"><table class="ads-table" style="font-size:12px;margin-bottom:0;">
        <thead><tr><th>Campaign</th><th>Status</th><th>Type</th><th>Budget</th><th>Impressions</th><th>Clicks</th><th>Cost</th><th>Keywords</th></tr></thead><tbody>`;
      for (const c of meta.campaigns_meta) {
        const statusColor = c.status === 'ENABLED' ? 'var(--success)' : 'var(--text-dim)';
        const budget = c.budget_micros ? '$' + (parseInt(c.budget_micros) / 1000000).toFixed(2) : '-';
        const cost = c.cost_micros ? '$' + (parseInt(c.cost_micros) / 1000000).toFixed(2) : '$0';
        html += `<tr>
          <td><strong>${esc(c.name)}</strong></td>
          <td style="color:${statusColor};">${esc(c.status || '-')}</td>
          <td>${esc(c.channel_type || '-')}</td>
          <td>${budget}</td>
          <td>${c.impressions ?? 0}</td>
          <td>${c.clicks ?? 0}</td>
          <td>${cost}</td>
          <td>${c.keyword_count ?? '-'}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    }
    // Data columns badges
    if (meta.data_columns && meta.data_columns.length > 0) {
      html += `<div style="margin-top:8px;"><span class="text-dim" style="font-size:11px;">Metrics analyzed:</span> `;
      html += meta.data_columns.map(col => `<span class="badge" style="background:var(--primary-bg,#4f46e510);color:var(--primary);margin:2px 4px 2px 0;font-size:10px;">${esc(col)}</span>`).join('');
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Summary
  html += `<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
    <div>
      <div style="font-size:15px;font-weight:600;">${json.campaigns_analyzed || 0} campaigns analyzed</div>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.5;">${esc(json.summary || '')}</div>
    </div>
  </div>`;

  // Per-campaign findings
  if (json.findings && json.findings.length > 0) {
    for (const f of json.findings) {
      const statusColors = { good: 'var(--success)', needs_attention: 'var(--warning)', critical: 'var(--danger)' };
      const statusColor = statusColors[f.status_assessment] || 'var(--text-dim)';
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-left:3px solid ${statusColor};border-radius:6px;padding:12px 16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <strong>${esc(f.campaign_name)}</strong>
          <span class="badge" style="background:${statusColor}15;color:${statusColor};">${esc((f.status_assessment || '').replace(/_/g, ' '))}</span>
        </div>
        ${f.recommendations?.length > 0 ? `<div style="font-size:12px;margin-top:6px;">${f.recommendations.map(r => `<div style="padding:4px 0;">- ${esc(r)}</div>`).join('')}</div>` : ''}
      </div>`;
    }
  }

  // Action items
  if (json.action_items && json.action_items.length > 0) {
    html += `<h4 style="font-size:14px;margin:12px 0 8px;">Action Items</h4>`;
    for (const item of json.action_items) {
      const prioColor = item.priority === 'high' ? 'var(--danger)' : item.priority === 'medium' ? 'var(--warning)' : 'var(--text-dim)';
      html += `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;padding:8px 12px;background:var(--surface2);border-radius:6px;font-size:13px;">
        <span class="badge" style="background:${prioColor}15;color:${prioColor};font-size:10px;flex-shrink:0;">${esc(item.priority)}</span>
        <strong>${esc(item.action)}</strong>
      </div>`;
    }
  }

  el.innerHTML = html;
}

function renderGadsAnalysisHistory() {
  const analyses = container.gads_analyses || [];
  if (analyses.length === 0) return '';
  const sorted = [...analyses].reverse().slice(0, 10);
  return sorted.map(a => {
    const campaignNames = (a.meta?.campaigns_meta || []).map(c => c.name).filter(Boolean);
    const campaignLabel = campaignNames.length > 0
      ? campaignNames.slice(0, 3).map(n => `<span class="badge" style="font-size:10px;margin:0 2px;">${esc(n)}</span>`).join('') + (campaignNames.length > 3 ? `<span class="text-dim" style="font-size:10px;">+${campaignNames.length - 3} more</span>` : '')
      : '';
    return `
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;flex-wrap:wrap;">
      <span class="status-dot ${a.status === 'completed' ? 'completed' : a.status === 'failed' ? 'failed' : 'running'}"></span>
      <span>${new Date(a.created_at).toLocaleString()}</span>
      <span class="text-dim">${a.status}</span>
      ${campaignLabel}
      ${a.status === 'completed' && a.result?.json_data ? `${promptSentLink(a.result)}<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;" onclick="renderGadsAnalysis(container.gads_analyses.find(x=>x.id==='${a.id}')?.result, container.gads_analyses.find(x=>x.id==='${a.id}')?.meta)">View</button>` : ''}
    </div>`;
  }).join('');
}

function renderGadsAnalysisSection() {
  const el = document.getElementById('gads-analysis-history');
  if (!el) return;
  const analyses = container.gads_analyses || [];
  if (analyses.length === 0) {
    el.innerHTML = '';
    return;
  }
  const history = renderGadsAnalysisHistory();
  el.innerHTML = `<div style="margin-top:12px;"><h4 style="font-size:13px;margin-bottom:6px;">Analysis History</h4>${history}</div>`;
}

