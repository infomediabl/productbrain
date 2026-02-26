/**
 * Google Ads Connector UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: checkGadsStatus(), loadGadsAccounts(), getSelectedGadsAccountId(),
 *   openGadsKeywordModal(), closeGadsKeywordModal(), submitGadsKeywordModal(),
 *   renderGadsKeywordResults(), loadGadsCampaigns()
 * API: GET /api/google-ads/status, GET /api/google-ads/accounts,
 *   POST /api/google-ads/keyword-ideas, GET /api/google-ads/campaigns
 * Interacts with: gads-analysis.js (renderGadsAnalysisSection, analyzeSelectedCampaigns)
 *
 * Connects to Google Ads API to fetch keyword ideas and campaign data. Renders
 * keyword results table and campaign list with checkboxes for analysis selection.
 */
// ========== Google Ads Connector ==========

async function checkGadsStatus() {
  try {
    const res = await fetch('/api/google-ads/status');
    const data = await res.json();
    const statusText = document.getElementById('gads-status-text');
    const kwBtn = document.getElementById('gads-keyword-btn');
    const campBtn = document.getElementById('gads-campaigns-btn');

    // Always render analysis history if available
    if (typeof renderGadsAnalysisSection === 'function') renderGadsAnalysisSection();

    if (data.configured) {
      statusText.textContent = 'Connected';
      statusText.style.color = 'var(--success)';
      kwBtn.disabled = false;
      campBtn.disabled = false;
      loadGadsAccounts();
    } else {
      statusText.textContent = 'Not configured — add credentials to .env';
      statusText.style.color = 'var(--danger)';
      document.getElementById('gads-keyword-results').innerHTML = '<div class="text-dim" style="font-size:13px;">Set GOOGLE_ADS_REFRESH_TOKEN and other credentials in .env to enable.</div>';
    }
  } catch (e) {
    document.getElementById('gads-status-text').textContent = 'Connection error';
  }
}

async function loadGadsAccounts() {
  const select = document.getElementById('gads-account-select');
  try {
    const res = await fetch('/api/google-ads/accounts');
    const data = await res.json();
    if (!res.ok) {
      select.innerHTML = `<option value="">Error: ${esc(data.error || 'Unknown')}</option>`;
      return;
    }
    const accounts = data.accounts || [];
    if (accounts.length === 0) {
      select.innerHTML = '<option value="">No client accounts found</option>';
      return;
    }
    select.innerHTML = accounts.map(a =>
      `<option value="${esc(a.id)}">${esc(a.name || 'Unnamed')} (${esc(a.id)})</option>`
    ).join('');
    select.disabled = false;
  } catch (e) {
    select.innerHTML = '<option value="">Failed to load accounts</option>';
  }
}

function getSelectedGadsAccountId() {
  const select = document.getElementById('gads-account-select');
  return select ? select.value : '';
}

function openGadsKeywordModal() {
  document.getElementById('gads-seed-keywords').value = '';
  document.getElementById('gads-page-url').value = container.my_product?.website || '';
  document.getElementById('gads-keyword-modal').style.display = 'flex';
}

function closeGadsKeywordModal() {
  document.getElementById('gads-keyword-modal').style.display = 'none';
}

async function submitGadsKeywordModal() {
  const keywords = document.getElementById('gads-seed-keywords').value.trim();
  const pageUrl = document.getElementById('gads-page-url').value.trim();
  if (!keywords && !pageUrl) { alert('Enter seed keywords or a page URL'); return; }

  const geoTarget = document.getElementById('gads-geo-target').value;
  const language = document.getElementById('gads-language').value;
  closeGadsKeywordModal();

  const resultsEl = document.getElementById('gads-keyword-results');
  resultsEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;"><div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Fetching keyword ideas...</span></div>';

  try {
    const res = await fetch('/api/google-ads/keyword-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
        page_url: pageUrl || undefined,
        geo_targets: [`geoTargetConstants/${geoTarget}`],
        language: `languageConstants/${language}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      resultsEl.innerHTML = `<div class="text-dim" style="color:var(--danger);font-size:13px;">Error: ${esc(data.error)}</div>`;
      return;
    }
    renderGadsKeywordResults(data);
  } catch (e) {
    resultsEl.innerHTML = '<div class="text-dim" style="color:var(--danger);font-size:13px;">Failed to fetch keyword ideas</div>';
  }
}

function renderGadsKeywordResults(data) {
  const el = document.getElementById('gads-keyword-results');
  const ideas = data.results || [];
  if (ideas.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No keyword ideas returned.</div>';
    return;
  }
  let html = `<div class="table-wrapper"><table class="ads-table" style="font-size:12px;">
    <thead><tr><th>Keyword</th><th>Avg. Monthly Searches</th><th>Competition</th><th>Low CPC</th><th>High CPC</th></tr></thead><tbody>`;
  for (const idea of ideas) {
    html += `<tr>
      <td><strong>${esc(idea.keyword || idea.text)}</strong></td>
      <td>${idea.avg_monthly_searches ?? '-'}</td>
      <td>${esc(idea.competition || '-')}</td>
      <td>${idea.low_top_of_page_bid != null ? '$' + idea.low_top_of_page_bid : '-'}</td>
      <td>${idea.high_top_of_page_bid != null ? '$' + idea.high_top_of_page_bid : '-'}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

async function loadGadsCampaigns() {
  const el = document.getElementById('gads-campaigns-list');
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;"><div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Loading campaigns...</span></div>';

  try {
    const accountId = getSelectedGadsAccountId();
    const qs = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
    const res = await fetch(`/api/google-ads/campaigns${qs}`);
    const data = await res.json();
    if (!res.ok) {
      el.innerHTML = `<div class="text-dim" style="color:var(--danger);font-size:13px;">Error: ${esc(data.error)}</div>`;
      return;
    }
    const campaigns = data.campaigns || [];
    gadsCampaignsCache = campaigns;
    if (campaigns.length === 0) {
      el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No campaigns found in this account.</div>';
      return;
    }
    let html = `<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
      <button class="btn btn-primary btn-sm" onclick="analyzeSelectedCampaigns()">Analyze Selected</button>
      <span class="text-dim" style="font-size:12px;">${campaigns.length} campaigns</span>
    </div>`;
    html += `<div class="table-wrapper"><table class="ads-table" style="font-size:12px;">
      <thead><tr><th style="width:30px;"></th><th>Campaign</th><th>Status</th><th>Budget</th><th>Type</th><th>Impressions</th><th>Clicks</th><th>Cost</th></tr></thead><tbody>`;
    for (const c of campaigns) {
      const statusColor = c.status === 'ENABLED' ? 'var(--success)' : 'var(--text-dim)';
      const budget = c.budget_micros ? '$' + (parseInt(c.budget_micros) / 1000000).toFixed(2) : '-';
      const cost = c.cost_micros ? '$' + (parseInt(c.cost_micros) / 1000000).toFixed(2) : '$0';
      html += `<tr>
        <td><input type="checkbox" class="gads-campaign-chk" value="${esc(c.id)}" style="accent-color:var(--primary);"></td>
        <td><strong>${esc(c.name)}</strong></td>
        <td style="color:${statusColor};">${esc(c.status)}</td>
        <td>${budget}</td>
        <td>${esc(c.channel_type || '-')}</td>
        <td>${c.impressions || 0}</td>
        <td>${c.clicks || 0}</td>
        <td>${cost}</td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    html += '<div id="gads-analysis-results" style="margin-top:12px;"></div>';
    el.innerHTML = html;
    // Refresh analysis history section
    if (typeof renderGadsAnalysisSection === 'function') renderGadsAnalysisSection();
  } catch (e) {
    el.innerHTML = '<div class="text-dim" style="color:var(--danger);font-size:13px;">Failed to load campaigns</div>';
  }
}

