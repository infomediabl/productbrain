/**
 * Taboola Campaign Report
 * Page: taboola-campaign.html (standalone)
 * API: GET /api/containers/:cid/taboola-campaign/:campaignId,
 *      POST /api/containers/:cid/taboola-campaign/:campaignId/launch
 *
 * Renders campaign preview (side-by-side comparison) and completed reports.
 * Preview mode: shows original FB ad vs Taboola rewrite with editable fields + Confirm & Launch.
 * Completed mode: shows comparison + Taboola campaign details.
 */
(function() {
  const params = new URLSearchParams(window.location.search);
  const cid = params.get('cid');
  const campaignId = params.get('campaignId');

  const backLink = document.getElementById('back-link');
  if (cid) backLink.href = `/container.html?id=${cid}`;

  if (!cid || !campaignId) {
    document.getElementById('status-bar').className = 'status-bar failed';
    document.getElementById('status-text').textContent = 'Missing cid or campaignId parameter';
    return;
  }

  async function loadCampaign() {
    try {
      const res = await fetch(`/api/containers/${cid}/taboola-campaign/${campaignId}`);
      if (!res.ok) {
        document.getElementById('status-bar').className = 'status-bar failed';
        document.getElementById('status-text').textContent = 'Campaign not found';
        return;
      }

      const campaign = await res.json();

      if (campaign.status === 'generating') {
        document.getElementById('status-text').textContent = 'AI is generating Taboola-optimized copy...';
        setTimeout(loadCampaign, 3000);
        return;
      }

      if (campaign.status === 'launching') {
        document.getElementById('status-bar').className = 'status-bar running';
        document.getElementById('status-text').textContent = 'Launching campaign on Taboola...';
        setTimeout(loadCampaign, 3000);
        return;
      }

      const statusBar = document.getElementById('status-bar');
      statusBar.querySelector('.spinner').style.display = 'none';

      if (campaign.status === 'failed') {
        statusBar.className = 'status-bar failed';
        document.getElementById('status-text').textContent = 'Campaign failed';
        renderFailed(campaign);
        return;
      }

      if (campaign.status === 'preview') {
        statusBar.className = 'status-bar completed';
        document.getElementById('status-text').textContent = 'Preview Ready — Review AI rewrites below, then Confirm & Launch';
        renderPreview(campaign);
        return;
      }

      // Completed
      statusBar.className = 'status-bar completed';
      document.getElementById('status-text').textContent = 'Campaign created successfully';
      document.getElementById('print-btn').style.display = '';
      renderCompleted(campaign);
    } catch (err) {
      document.getElementById('status-bar').className = 'status-bar failed';
      document.getElementById('status-text').textContent = 'Failed to load campaign';
    }
  }

  function renderFailed(campaign) {
    const r = campaign.result || {};
    document.getElementById('campaign-content').innerHTML = `
      <div class="card" style="margin-top:16px;">
        <h3 style="color:var(--danger);margin-bottom:12px;">Campaign Failed</h3>
        <div style="padding:12px 16px;background:#dc262608;border:1px solid #dc262620;border-radius:8px;margin-bottom:16px;">
          <div style="font-size:14px;color:var(--danger);font-weight:500;margin-bottom:4px;">${esc(r.error || 'Unknown error')}</div>
          ${r.failed_step ? `<div class="text-dim" style="font-size:12px;">Failed at step: <strong>${esc(r.failed_step)}</strong></div>` : ''}
        </div>
        ${r.source_ads?.length ? renderComparison(r.source_ads, r.taboola_copy || [], false) : ''}
        <div class="text-dim" style="margin-top:16px;font-size:12px;">Created: ${new Date(campaign.created_at).toLocaleString()}</div>
      </div>
    `;
  }

  function renderPreview(campaign) {
    const r = campaign.result || {};
    const sourceAds = r.source_ads || [];
    const taboolaCopy = r.taboola_copy || [];
    const settings = r.settings || {};

    document.getElementById('campaign-content').innerHTML = `
      <div class="card" style="margin-top:16px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <h3 style="margin:0;">Preview: ${esc(settings.campaign_name || 'Campaign')}</h3>
          <span class="badge" style="background:#d9770615;color:#d97706;">Preview</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
          <div>
            <div class="text-dim" style="font-size:11px;text-transform:uppercase;">Daily Budget</div>
            <div style="font-weight:600;font-size:14px;">$${settings.daily_cap || 0}</div>
          </div>
          <div>
            <div class="text-dim" style="font-size:11px;text-transform:uppercase;">CPC Bid</div>
            <div style="font-weight:600;font-size:14px;">$${settings.cpc_bid || 0}</div>
          </div>
          <div>
            <div class="text-dim" style="font-size:11px;text-transform:uppercase;">Countries</div>
            <div style="font-weight:600;font-size:14px;">${esc((settings.country_targeting || []).join(', '))}</div>
          </div>
          <div>
            <div class="text-dim" style="font-size:11px;text-transform:uppercase;">Platforms</div>
            <div style="font-weight:600;font-size:14px;">${esc((settings.platform_targeting || []).join(', '))}</div>
          </div>
        </div>

        <h4 style="margin-bottom:12px;">Side-by-Side Comparison</h4>
        <p class="text-dim" style="font-size:13px;margin-bottom:16px;">Review the AI-generated Taboola copy below. You can edit the title and description before launching.</p>

        ${renderComparison(sourceAds, taboolaCopy, true)}

        <div style="display:flex;align-items:center;gap:12px;margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">
          <button id="confirm-launch-btn" class="btn btn-primary" onclick="window._confirmLaunch()">
            Confirm & Launch on Taboola
          </button>
          <span class="text-dim" style="font-size:12px;">This will create a live campaign on Taboola with the copy shown above.</span>
        </div>

        <div class="text-dim" style="margin-top:16px;font-size:12px;">Created: ${new Date(campaign.created_at).toLocaleString()}</div>
      </div>
    `;
  }

  function renderCompleted(campaign) {
    const r = campaign.result || {};
    const items = r.items || [];
    const sourceAds = r.source_ads || [];
    const taboolaCopy = r.taboola_copy || [];

    document.getElementById('campaign-content').innerHTML = `
      <div class="card" style="margin-top:16px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <h3 style="margin:0;">${esc(r.campaign_name || 'Campaign')}</h3>
          <span class="status-dot completed"></span>
          <span class="text-dim">Completed</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div>
            <div class="text-dim" style="font-size:12px;">Taboola Campaign ID</div>
            <div style="font-weight:600;">${esc(String(r.taboola_campaign_id || '-'))}</div>
          </div>
          <div>
            <div class="text-dim" style="font-size:12px;">Daily Budget</div>
            <div style="font-weight:600;">$${r.daily_cap || 0}</div>
          </div>
          <div>
            <div class="text-dim" style="font-size:12px;">CPC Bid</div>
            <div style="font-weight:600;">$${r.cpc_bid || 0}</div>
          </div>
          <div>
            <div class="text-dim" style="font-size:12px;">Targeting</div>
            <div style="font-weight:600;">${esc((r.country_targeting || []).join(', '))} | ${esc((r.platform_targeting || []).join(', '))}</div>
          </div>
        </div>

        ${r.campaign_url ? `<div style="margin-bottom:20px;"><a href="${esc(r.campaign_url)}" target="_blank" class="btn btn-primary">Open in Taboola Ads Manager</a></div>` : ''}

        ${sourceAds.length ? `
          <h4 style="margin-bottom:12px;">Ad Comparison (Original vs Taboola)</h4>
          ${renderComparison(sourceAds, taboolaCopy, false)}
        ` : ''}

        <h4 style="margin:20px 0 12px;">Campaign Items (${r.items_created || 0} created, ${r.items_failed || 0} failed)</h4>

        <div style="overflow-x:auto;">
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid var(--border);text-align:left;">
                <th style="padding:8px 12px;">Taboola Title</th>
                <th style="padding:8px 12px;">Description</th>
                <th style="padding:8px 12px;">Item ID</th>
                <th style="padding:8px 12px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:8px 12px;font-weight:500;">${esc(item.taboola_title || '-')}</td>
                  <td style="padding:8px 12px;">${esc(item.taboola_description || '-')}</td>
                  <td style="padding:8px 12px;">${esc(String(item.taboola_item_id || '-'))}</td>
                  <td style="padding:8px 12px;">
                    <span style="color:${item.status === 'created' ? 'var(--success)' : 'var(--danger)'};">${esc(item.status)}</span>
                    ${item.error ? `<div class="text-dim" style="font-size:11px;">${esc(item.error)}</div>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="text-dim" style="margin-top:16px;font-size:12px;">
          Created: ${new Date(campaign.created_at).toLocaleString()}
        </div>
      </div>
    `;
  }

  function renderComparison(sourceAds, taboolaCopy, editable) {
    if (!sourceAds.length && !taboolaCopy.length) return '';

    let html = '<div style="display:flex;flex-direction:column;gap:12px;">';

    for (let i = 0; i < taboolaCopy.length; i++) {
      const copy = taboolaCopy[i];
      const source = sourceAds.find(a => a.id === copy.source_ad_id) || {};
      const titleLen = (copy.taboola_title || '').length;
      const descLen = (copy.taboola_description || '').length;

      const imgSrc = source.screenshot_path || source.image_url || '';
      const imgTag = imgSrc
        ? `<img src="/${esc(imgSrc.replace(/^\//, ''))}" style="width:100%;max-height:120px;object-fit:contain;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none'">`
        : '';

      html += `
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          <div style="display:grid;grid-template-columns:1fr 1fr;min-height:0;">
            <!-- Original FB Ad -->
            <div style="padding:14px 16px;background:var(--surface);border-right:1px solid var(--border);">
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#1877f2;margin-bottom:10px;">Original FB Ad</div>
              ${imgTag ? `<div style="margin-bottom:10px;">${imgTag}</div>` : ''}
              <div style="margin-bottom:8px;">
                <div class="text-dim" style="font-size:11px;">Headline</div>
                <div style="font-size:14px;font-weight:500;">${esc(source.headline || '(none)')}</div>
              </div>
              <div style="margin-bottom:8px;">
                <div class="text-dim" style="font-size:11px;">Description</div>
                <div style="font-size:13px;">${esc(source.description || '(none)')}</div>
              </div>
              ${source.cta ? `<div style="margin-bottom:8px;">
                <div class="text-dim" style="font-size:11px;">CTA</div>
                <div style="font-size:13px;">${esc(source.cta)}</div>
              </div>` : ''}
              ${source.url ? `<div>
                <div class="text-dim" style="font-size:11px;">URL</div>
                <div style="font-size:12px;word-break:break-all;color:var(--primary);">${esc(source.url)}</div>
              </div>` : ''}
            </div>

            <!-- Taboola Rewrite -->
            <div style="padding:14px 16px;">
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#0066ff;margin-bottom:10px;">Taboola Rewrite</div>
              ${imgTag ? `<div style="margin-bottom:10px;">${imgTag}</div>` : ''}
              <div style="margin-bottom:8px;">
                <div class="text-dim" style="font-size:11px;">Title <span style="font-weight:400;">(${titleLen}/60 chars)</span></div>
                ${editable
                  ? `<input type="text" class="taboola-edit-title" data-idx="${i}" value="${esc(copy.taboola_title || '')}" maxlength="60" style="width:100%;font-size:14px;font-weight:500;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:6px 8px;color:var(--text);">`
                  : `<div style="font-size:14px;font-weight:500;">${esc(copy.taboola_title || '(none)')}</div>`}
              </div>
              <div style="margin-bottom:8px;">
                <div class="text-dim" style="font-size:11px;">Description <span style="font-weight:400;">(${descLen}/150 chars)</span></div>
                ${editable
                  ? `<textarea class="taboola-edit-desc" data-idx="${i}" maxlength="150" rows="2" style="width:100%;font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:6px 8px;color:var(--text);resize:vertical;font-family:inherit;">${esc(copy.taboola_description || '')}</textarea>`
                  : `<div style="font-size:13px;">${esc(copy.taboola_description || '(none)')}</div>`}
              </div>
              <div>
                <div class="text-dim" style="font-size:11px;">Destination URL</div>
                <div style="font-size:12px;word-break:break-all;color:var(--primary);">${esc(copy.destination_url || '#')}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  // Confirm & Launch handler
  window._confirmLaunch = async function() {
    const btn = document.getElementById('confirm-launch-btn');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Launching...';

    // Collect edited items
    const titleInputs = document.querySelectorAll('.taboola-edit-title');
    const descInputs = document.querySelectorAll('.taboola-edit-desc');

    let editedItems = null;
    if (titleInputs.length > 0) {
      // Re-fetch to get the original taboola_copy
      const campRes = await fetch(`/api/containers/${cid}/taboola-campaign/${campaignId}`);
      const campData = await campRes.json();
      const originalCopy = campData.result?.taboola_copy || [];

      editedItems = originalCopy.map((item, idx) => {
        const titleInput = document.querySelector(`.taboola-edit-title[data-idx="${idx}"]`);
        const descInput = document.querySelector(`.taboola-edit-desc[data-idx="${idx}"]`);
        return {
          ...item,
          taboola_title: titleInput ? titleInput.value : item.taboola_title,
          taboola_description: descInput ? descInput.value : item.taboola_description,
        };
      });
    }

    try {
      const res = await fetch(`/api/containers/${cid}/taboola-campaign/${campaignId}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_items: editedItems }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to launch');
        btn.disabled = false;
        btn.textContent = 'Confirm & Launch on Taboola';
        return;
      }

      // Switch to launching state and poll
      document.getElementById('status-bar').className = 'status-bar running';
      document.getElementById('status-bar').querySelector('.spinner').style.display = '';
      document.getElementById('status-text').textContent = 'Launching campaign on Taboola...';
      document.getElementById('campaign-content').innerHTML = '';
      setTimeout(loadCampaign, 2000);
    } catch (e) {
      alert('Failed to launch campaign');
      btn.disabled = false;
      btn.textContent = 'Confirm & Launch on Taboola';
    }
  };

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  loadCampaign();
})();
