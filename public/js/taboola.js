/**
 * Taboola Campaign Cloner UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderTaboolaCampaigns(), renderTaboolaAdSelector()
 * API: POST /api/containers/:id/taboola-campaign, GET /api/containers/:id/taboola-campaigns/:id
 *
 * Dashboard section for cloning FB ads into Taboola campaigns.
 * 2-step flow: Preview Copy → Review AI rewrites → Confirm & Launch.
 */
// ========== Taboola Campaign Cloner ==========

function renderTaboolaCampaigns() {
  const listEl = document.getElementById('taboola-list');
  const campaigns = container.taboola_campaigns || [];

  if (campaigns.length === 0) {
    listEl.innerHTML = '<div class="text-dim" style="padding:8px 0;">No Taboola campaigns yet.</div>';
  } else {
    const sorted = [...campaigns].reverse();
    listEl.innerHTML = sorted.map(c => {
      const isGenerating = c.status === 'generating';
      const isLaunching = c.status === 'launching';
      const isPreview = c.status === 'preview';
      const isDone = c.status === 'completed';
      const isFailed = c.status === 'failed';
      const name = c.result?.campaign_name || c.result?.settings?.campaign_name || 'Campaign';
      const adCount = c.result?.source_ad_ids?.length || 0;
      const reportUrl = `/taboola-campaign.html?cid=${containerId}&campaignId=${c.id}`;

      let statusLabel = '';
      let statusColor = '';
      if (isPreview) { statusLabel = 'Preview Ready'; statusColor = 'color:#d97706;'; }
      else if (isGenerating) { statusLabel = 'Generating...'; statusColor = ''; }
      else if (isLaunching) { statusLabel = 'Launching...'; statusColor = ''; }
      else if (isDone) { statusLabel = 'Completed'; statusColor = 'color:var(--success);'; }
      else if (isFailed) { statusLabel = 'Failed'; statusColor = 'color:var(--danger);'; }
      else { statusLabel = c.status; }

      return `
        <div class="proposal-item">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="status-dot ${isGenerating || isLaunching ? 'running' : isPreview ? 'pending' : c.status}"></span>
            <strong style="font-size:13px;">${esc(name)}</strong>
            <span class="text-dim" style="font-size:12px;">${new Date(c.created_at).toLocaleString()}</span>
            <span style="font-size:12px;font-weight:500;${statusColor}">${statusLabel}</span>
            ${adCount ? `<span class="text-dim" style="font-size:12px;">${adCount} ad${adCount !== 1 ? 's' : ''}</span>` : ''}
            ${isGenerating || isLaunching ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>' : ''}

            ${isPreview ? `<a href="${reportUrl}" class="btn btn-primary btn-sm" style="margin-left:auto;">Review & Launch</a>` : ''}
            ${isDone ? `<a href="${reportUrl}" class="btn btn-primary btn-sm" style="margin-left:auto;">View Report</a>` : ''}
            ${isDone && c.result?.campaign_url ? `<a href="${esc(c.result.campaign_url)}" target="_blank" class="btn btn-ghost btn-sm">Open in Taboola</a>` : ''}
            ${isDone ? `<span class="text-dim" style="font-size:12px;">${c.result?.items_created || 0} items</span>` : ''}
          </div>
          ${isFailed ? `<div style="margin-top:6px;padding:6px 10px;background:var(--danger-bg, #dc262610);border:1px solid #dc262620;border-radius:6px;">
            <div style="font-size:12px;color:var(--danger);font-weight:500;">${esc(c.result?.error || 'Unknown error')}</div>
            ${c.result?.failed_step ? `<div class="text-dim" style="font-size:11px;margin-top:2px;">Failed at: ${esc(c.result.failed_step)}</div>` : ''}
          </div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Start polling for any generating/launching campaigns
  campaigns.filter(c => c.status === 'generating' || c.status === 'launching').forEach(c => {
    pollTaboolaCampaign(c.id);
  });

  // Render ad selector
  renderTaboolaAdSelector();
}

function renderTaboolaAdSelector() {
  const selectorEl = document.getElementById('taboola-ad-selector');
  if (!selectorEl) return;

  // Gather all ads from scrape_results (nested under scraped_data.competitors/my_product)
  // Ads may not have an id field, so we generate a composite key: scrapeId:group:source:index
  const allAds = [];
  const scrapes = container.scrape_results || [];
  for (const scrape of scrapes) {
    if (scrape.status !== 'completed' || !scrape.scraped_data) continue;
    const sd = scrape.scraped_data;

    // My product ads
    for (const source of ['facebook', 'google']) {
      const ads = sd.my_product?.[source] || [];
      for (let i = 0; i < ads.length; i++) {
        const ad = ads[i];
        allAds.push({
          id: ad.id || (scrape.id + ':my_product:' + source + ':' + i),
          competitor: container.my_product?.name || 'My Product',
          source,
          headline: ad.ocr_structured?.headline || ad.headline || ad.title || '(no headline)',
          description: ad.ocr_structured?.description || ad.ad_text || ad.description || '',
          image_url: ad.media_url || ad.image_url || '',
          screenshot_path: ad.local_media_path || ad.screenshot_path || '',
          is_new: ad.is_new,
        });
      }
    }

    // Competitor ads
    for (const [compId, compData] of Object.entries(sd.competitors || {})) {
      const comp = container.competitors?.find(c => c.id === compId || c.name === compId);
      const compName = comp?.name || compId;
      for (const source of ['facebook', 'google']) {
        const ads = compData[source] || [];
        for (let i = 0; i < ads.length; i++) {
          const ad = ads[i];
          allAds.push({
            id: ad.id || (scrape.id + ':' + compId + ':' + source + ':' + i),
            competitor: compName,
            source,
            headline: ad.ocr_structured?.headline || ad.headline || ad.title || '(no headline)',
            description: ad.ocr_structured?.description || ad.ad_text || ad.description || '',
            image_url: ad.media_url || ad.image_url || '',
            screenshot_path: ad.local_media_path || ad.screenshot_path || '',
            is_new: ad.is_new,
          });
        }
      }
    }
  }

  if (allAds.length === 0) {
    selectorEl.innerHTML = '<div class="text-dim" style="padding:8px 0;">No scraped ads available. Run the Ad Scraper first.</div>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const defaultName = `${container.name || 'Product'} Taboola Test - ${today}`;

  selectorEl.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <strong style="font-size:13px;">Select FB Ads to Clone</strong>
        <button class="btn btn-ghost btn-sm" onclick="taboolaSelectTopAds()" title="Select proven (non-new) ads">Select Top Ads</button>
        <span class="text-dim" style="font-size:12px;" id="taboola-selected-count">0 selected</span>
      </div>
      <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
        ${allAds.map(ad => {
          const thumb = ad.screenshot_path
            ? `<img src="/${ad.screenshot_path}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'">`
            : (ad.image_url ? `<img src="${esc(ad.image_url)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'">` : '');
          return `
            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
              <input type="checkbox" class="taboola-ad-cb" value="${esc(ad.id)}" onchange="taboolaUpdateCount()" style="accent-color:var(--primary);flex-shrink:0;">
              ${thumb}
              <div style="flex:1;min-width:0;">
                <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(ad.headline)}</div>
                <div class="text-dim" style="font-size:11px;">${esc(ad.competitor)}${ad.is_new === false ? ' &bull; proven' : ''}</div>
              </div>
            </label>
          `;
        }).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div class="form-group" style="margin-bottom:0;">
        <label style="font-size:13px;font-weight:600;">Campaign Name</label>
        <input type="text" id="taboola-campaign-name" value="${esc(defaultName)}" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label style="font-size:13px;font-weight:600;">Daily Budget ($)</label>
        <input type="number" id="taboola-daily-cap" value="20" min="1" step="1" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label style="font-size:13px;font-weight:600;">CPC Bid ($)</label>
        <input type="number" id="taboola-cpc-bid" value="0.50" min="0.01" step="0.01" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label style="font-size:13px;font-weight:600;">Country Targeting</label>
        <input type="text" id="taboola-countries" value="US" placeholder="US, CA, GB" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Platforms</label>
      <div style="display:flex;gap:16px;">
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="taboola-platform-cb" value="DESK" checked style="accent-color:var(--primary);"> Desktop
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="taboola-platform-cb" value="PHON" checked style="accent-color:var(--primary);"> Phone
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="taboola-platform-cb" value="TBLT" checked style="accent-color:var(--primary);"> Tablet
        </label>
      </div>
    </div>

    <button class="btn btn-primary" id="taboola-launch-btn" onclick="launchTaboolaCampaign()" disabled>
      Preview Copy
    </button>
    <span class="text-dim" style="font-size:12px;margin-left:8px;">AI generates Taboola-optimized copy for you to review before launching.</span>
  `;
}

function taboolaUpdateCount() {
  const checked = document.querySelectorAll('.taboola-ad-cb:checked').length;
  const countEl = document.getElementById('taboola-selected-count');
  if (countEl) countEl.textContent = `${checked} selected`;
  const btn = document.getElementById('taboola-launch-btn');
  if (btn) btn.disabled = checked === 0;
}

function taboolaSelectTopAds() {
  const checkboxes = document.querySelectorAll('.taboola-ad-cb');
  // Select all proven (non-new) ads, or all if none are marked
  let anyChecked = false;
  checkboxes.forEach(cb => {
    const label = cb.closest('label');
    const isProven = label && label.textContent.includes('proven');
    if (isProven) {
      cb.checked = true;
      anyChecked = true;
    }
  });
  // If no proven ads found, select all
  if (!anyChecked) {
    checkboxes.forEach(cb => { cb.checked = true; });
  }
  taboolaUpdateCount();
}

async function launchTaboolaCampaign() {
  const selectedIds = [...document.querySelectorAll('.taboola-ad-cb:checked')].map(cb => cb.value);
  if (selectedIds.length === 0) return;

  const campaignName = document.getElementById('taboola-campaign-name')?.value || '';
  const dailyCap = parseFloat(document.getElementById('taboola-daily-cap')?.value) || 20;
  const cpcBid = parseFloat(document.getElementById('taboola-cpc-bid')?.value) || 0.50;
  const countries = (document.getElementById('taboola-countries')?.value || 'US')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const platforms = [...document.querySelectorAll('.taboola-platform-cb:checked')].map(cb => cb.value);

  const btn = document.getElementById('taboola-launch-btn');
  btn.disabled = true;
  btn.textContent = 'Generating Preview...';

  try {
    const res = await fetch(`/api/containers/${containerId}/taboola-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_ids: selectedIds,
        campaign_name: campaignName,
        daily_cap: dailyCap,
        cpc_bid: cpcBid,
        country_targeting: countries,
        platform_targeting: platforms,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to generate preview');
      btn.disabled = false;
      btn.textContent = 'Preview Copy';
      return;
    }

    const data = await res.json();

    // Reload container and re-render, then start polling
    await loadContainer();
    pollTaboolaCampaign(data.taboola_campaign_id);
  } catch (e) {
    alert('Failed to generate preview');
    btn.disabled = false;
    btn.textContent = 'Preview Copy';
  }
}

async function pollTaboolaCampaign(campaignId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/taboola-campaign/${campaignId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed' || data.status === 'preview') {
      const btn = document.getElementById('taboola-launch-btn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Preview Copy';
      }
      await loadContainer();
      return;
    }
    setTimeout(() => pollTaboolaCampaign(campaignId), 3000);
  } catch (e) {
    setTimeout(() => pollTaboolaCampaign(campaignId), 5000);
  }
}
