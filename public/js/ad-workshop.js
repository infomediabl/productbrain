/**
 * Ad Workshop UI
 * Page: ad-workshop.html (standalone)
 * Globals used: none (self-contained)
 * API: GET /api/containers/:id, POST /api/containers/:id/clone-ad,
 *      GET /api/containers/:id/clone-ad/models, POST /api/containers/:id/hooks,
 *      GET /api/containers/:id/hooks/:id
 *
 * Two tabs: Clone Existing Ad (table of scraped ads) and Make New Ad (hooks agent + clone).
 */

const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
let container = null;
let allAds = [];
let imageModels = [];
let currentCloneAd = null;
let currentHookText = null;

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// Init
(async function init() {
  if (!containerId) {
    document.getElementById('ads-table-container').innerHTML = '<div style="color:var(--error);padding:16px;">No container ID. Open this page from a container.</div>';
    return;
  }

  document.getElementById('back-link').href = '/container.html?id=' + containerId;

  try {
    const res = await fetch('/api/containers/' + containerId);
    if (!res.ok) throw new Error('Container not found');
    container = await res.json();
    document.getElementById('page-title').textContent = 'Ad Workshop — ' + (container.name || 'Container');
  } catch (err) {
    document.getElementById('ads-table-container').innerHTML = '<div style="color:var(--error);">Error: ' + esc(err.message) + '</div>';
    return;
  }

  // Load models
  loadModels();

  // Flatten all scraped ads
  flattenAds();
  renderAdsTable();
  loadExistingHooks();
})();

async function loadModels() {
  try {
    const res = await fetch('/api/containers/' + containerId + '/clone-ad/models');
    const data = await res.json();
    imageModels = data.models || [];
    const sel = document.getElementById('clone-model');
    sel.innerHTML = imageModels.map(m => '<option value="' + esc(m.id) + '">' + esc(m.label) + '</option>').join('');
  } catch (e) {}
}

function flattenAds() {
  allAds = [];
  for (const scrape of (container.scrape_results || [])) {
    if (scrape.status !== 'completed' || !scrape.scraped_data) continue;
    const sd = scrape.scraped_data;

    // My product
    for (const source of ['facebook', 'google']) {
      for (const ad of (sd.my_product?.[source] || [])) {
        allAds.push({
          ...ad,
          _competitor: container.my_product?.name || 'My Product',
          _source: source,
          _scrapeId: scrape.id,
        });
      }
    }

    // Competitors
    for (const [compId, compData] of Object.entries(sd.competitors || {})) {
      const comp = container.competitors?.find(c => c.id === compId || c.name === compId);
      const compName = comp?.name || compId;
      for (const source of ['facebook', 'google']) {
        for (const ad of (compData[source] || [])) {
          allAds.push({
            ...ad,
            _competitor: compName,
            _source: source,
            _scrapeId: scrape.id,
          });
        }
      }
    }
  }
}

function renderAdsTable() {
  const el = document.getElementById('ads-table-container');
  if (allAds.length === 0) {
    el.innerHTML = '<div class="text-dim" style="text-align:center;padding:32px;">No scraped ads found. Run a scrape from the container page first.</div>';
    return;
  }

  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<thead><tr style="border-bottom:2px solid var(--border);text-align:left;">';
  html += '<th style="padding:8px;">Image</th>';
  html += '<th style="padding:8px;">Competitor</th>';
  html += '<th style="padding:8px;">Source</th>';
  html += '<th style="padding:8px;">Headline</th>';
  html += '<th style="padding:8px;">Description</th>';
  html += '<th style="padding:8px;">CTA</th>';
  html += '<th style="padding:8px;"></th>';
  html += '</tr></thead><tbody>';

  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    const imgSrc = ad.local_media_path || ad.screenshot_path || ad.media_url || '';
    const imgTag = imgSrc
      ? '<img src="/' + esc(imgSrc.replace(/^\//, '')) + '" style="width:50px;height:50px;object-fit:cover;border-radius:4px;" onerror="this.style.display=\'none\'">'
      : '<div style="width:50px;height:50px;background:var(--surface2);border-radius:4px;"></div>';

    const sourceBadge = ad._source === 'facebook'
      ? '<span class="badge" style="background:#1877f220;color:#1877f2;font-size:10px;">FB</span>'
      : '<span class="badge" style="background:#34a85320;color:#34a853;font-size:10px;">Google</span>';

    const desc = (ad.ad_text || '').substring(0, 80) + ((ad.ad_text || '').length > 80 ? '...' : '');

    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:8px;">' + imgTag + '</td>';
    html += '<td style="padding:8px;">' + esc(ad._competitor) + '</td>';
    html += '<td style="padding:8px;">' + sourceBadge + '</td>';
    html += '<td style="padding:8px;">' + esc(ad.headline || '—') + '</td>';
    html += '<td style="padding:8px;max-width:250px;"><span class="text-dim">' + esc(desc || '—') + '</span></td>';
    html += '<td style="padding:8px;">' + esc(ad.cta_text || '—') + '</td>';
    html += '<td style="padding:8px;"><button class="btn btn-primary btn-sm" onclick="openCloneModal(' + i + ')">Clone</button></td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<div class="text-dim" style="font-size:12px;margin-top:8px;">' + allAds.length + ' ads total</div>';
  el.innerHTML = html;
}

// Tab switching
function switchTab(tab) {
  document.getElementById('panel-clone').style.display = tab === 'clone' ? '' : 'none';
  document.getElementById('panel-hooks').style.display = tab === 'hooks' ? '' : 'none';
  document.getElementById('tab-clone').style.borderBottomColor = tab === 'clone' ? 'var(--primary)' : 'transparent';
  document.getElementById('tab-hooks').style.borderBottomColor = tab === 'hooks' ? 'var(--primary)' : 'transparent';
}

// Clone modal
function openCloneModal(adIndex, hookText) {
  currentCloneAd = allAds[adIndex] || null;
  currentHookText = hookText || null;

  const infoEl = document.getElementById('clone-modal-info');
  if (currentCloneAd) {
    const ad = currentCloneAd;
    const imgSrc = ad.local_media_path || ad.screenshot_path || ad.media_url || '';
    const imgTag = imgSrc
      ? '<img src="/' + esc(imgSrc.replace(/^\//, '')) + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display=\'none\'">'
      : '<div style="width:80px;height:80px;background:var(--surface2);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:10px;">No image</div>';
    const sourceBadge = ad._source === 'facebook'
      ? '<span class="badge" style="background:#1877f220;color:#1877f2;font-size:10px;">FB</span>'
      : '<span class="badge" style="background:#34a85320;color:#34a853;font-size:10px;">Google</span>';

    infoEl.innerHTML = '<div style="display:flex;gap:12px;padding:12px;background:var(--surface);border-radius:8px;border:1px solid var(--border);">'
      + '<div style="flex-shrink:0;">' + imgTag + '</div>'
      + '<div style="flex:1;font-size:12px;overflow:hidden;">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><strong>' + esc(ad._competitor) + '</strong> ' + sourceBadge + '</div>'
      + (ad.headline ? '<div style="margin-bottom:2px;"><span class="text-dim">Headline:</span> ' + esc(ad.headline) + '</div>' : '')
      + (ad.ad_text ? '<div style="margin-bottom:2px;"><span class="text-dim">Text:</span> ' + esc(ad.ad_text.length > 120 ? ad.ad_text.substring(0, 120) + '...' : ad.ad_text) + '</div>' : '')
      + (ad.cta_text ? '<div><span class="text-dim">CTA:</span> ' + esc(ad.cta_text) + '</div>' : '')
      + '</div></div>';
  } else if (hookText) {
    infoEl.innerHTML = '<div style="padding:12px;background:var(--surface);border-radius:8px;border:1px solid var(--border);font-size:13px;"><strong>Hook:</strong> ' + esc(hookText) + '</div>';
  }

  if (hookText) {
    document.getElementById('clone-instructions').value = 'Use this hook as the headline: ' + hookText;
  } else {
    document.getElementById('clone-instructions').value = '';
  }

  document.getElementById('clone-result-area').style.display = 'none';
  document.getElementById('clone-submit-btn').disabled = false;
  document.getElementById('clone-submit-btn').textContent = 'Generate Image';
  document.getElementById('clone-modal').style.display = 'flex';
  updatePromptPreview();
}

function openCloneModalForHook(hookText) {
  // Pick first ad as base if available, otherwise create a minimal ad
  currentCloneAd = allAds[0] || null;
  currentHookText = hookText;

  const infoEl = document.getElementById('clone-modal-info');
  infoEl.innerHTML = '<div style="padding:12px;background:var(--surface);border-radius:8px;border:1px solid var(--border);font-size:13px;"><strong>Hook:</strong> ' + esc(hookText) + '</div>';
  document.getElementById('clone-instructions').value = 'Use this hook as the headline: ' + hookText;

  document.getElementById('clone-result-area').style.display = 'none';
  document.getElementById('clone-submit-btn').disabled = false;
  document.getElementById('clone-submit-btn').textContent = 'Generate Image';
  document.getElementById('clone-modal').style.display = 'flex';
  updatePromptPreview();
}

function closeCloneModal() {
  document.getElementById('clone-modal').style.display = 'none';
}

async function submitClone() {
  const btn = document.getElementById('clone-submit-btn');
  const resultArea = document.getElementById('clone-result-area');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  resultArea.style.display = 'block';
  resultArea.innerHTML = '<div class="text-dim" style="text-align:center;padding:16px;">Generating image... this may take 5-30 seconds.</div>';

  const model = document.getElementById('clone-model').value;
  const format = document.getElementById('clone-format').value;
  const customInstructions = document.getElementById('clone-instructions').value;

  const body = {
    model,
    format,
    custom_instructions: customInstructions,
    headline: currentHookText || currentCloneAd?.headline || '',
    ad_text: currentCloneAd?.ad_text || '',
    cta: currentCloneAd?.cta_text || '',
    source_competitor: currentCloneAd?._competitor || '',
    product_context: container?.my_product ? (container.my_product.name + ' — ' + (container.my_product.description || '')) : '',
  };

  try {
    const res = await fetch('/api/containers/' + containerId + '/clone-ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Clone failed');

    let html = '';

    // Image display — handle local paths and HTTP URLs
    if (data.image_path) {
      const imgSrc = data.image_path.startsWith('http') ? data.image_path : '/' + data.image_path.replace(/^\//, '');
      html += '<div style="text-align:center;margin-bottom:12px;">'
        + '<img src="' + esc(imgSrc) + '" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid var(--border);" alt="Generated ad" onerror="this.parentElement.innerHTML=\'<div class=text-dim>Image failed to load</div>\'">'
        + (data.image_path.startsWith('http') ? '' : '<div class="text-dim" style="font-size:11px;margin-top:4px;">Saved: ' + esc(data.image_path) + '</div>')
        + '</div>';
    } else {
      html += '<div class="text-dim" style="text-align:center;margin-bottom:12px;">No image in response.</div>';
    }

    // Adapted copy
    if (data.adapted_copy && (data.adapted_copy.headline || data.adapted_copy.ad_text || data.adapted_copy.cta)) {
      html += '<div style="background:var(--surface);border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:12px;">'
        + '<div style="font-weight:600;margin-bottom:4px;">Adapted Copy</div>';
      if (data.adapted_copy.headline) html += '<div><span class="text-dim">Headline:</span> ' + esc(data.adapted_copy.headline) + '</div>';
      if (data.adapted_copy.ad_text) html += '<div><span class="text-dim">Text:</span> ' + esc(data.adapted_copy.ad_text) + '</div>';
      if (data.adapted_copy.cta) html += '<div><span class="text-dim">CTA:</span> ' + esc(data.adapted_copy.cta) + '</div>';
      html += '</div>';
    }

    // AI text response
    if (data.ai_text) {
      html += '<details style="margin-bottom:8px;font-size:12px;"><summary style="cursor:pointer;color:var(--text-dim);">AI Response Text</summary>'
        + '<pre style="white-space:pre-wrap;background:var(--surface);border-radius:6px;padding:8px;margin-top:4px;font-size:11px;max-height:200px;overflow-y:auto;">' + esc(data.ai_text) + '</pre></details>';
    }

    // Prompt sent
    if (data.prompt_sent) {
      html += '<details style="font-size:12px;"><summary style="cursor:pointer;color:var(--text-dim);">Prompt Sent to AI</summary>'
        + '<pre style="white-space:pre-wrap;background:var(--surface);border-radius:6px;padding:8px;margin-top:4px;font-size:11px;max-height:200px;overflow-y:auto;">' + esc(data.prompt_sent) + '</pre></details>';
    }

    // Model used
    html += '<div class="text-dim" style="font-size:11px;margin-top:8px;">Model: ' + esc(data.model_used || model) + '</div>';

    resultArea.innerHTML = html;
  } catch (err) {
    resultArea.innerHTML = '<div style="color:var(--error);padding:8px;">Error: ' + esc(err.message) + '</div>';
  }

  btn.disabled = false;
  btn.textContent = 'Generate Another';
}

// Build prompt preview from current modal state
function updatePromptPreview() {
  const previewEl = document.getElementById('prompt-preview');
  if (!previewEl) return;

  const format = document.getElementById('clone-format').value;
  const formatMap = { '1:1': '1080x1080 square feed', '9:16': '1080x1920 vertical story', '16:9': '1200x628 horizontal banner' };
  const formatDesc = formatMap[format] || format || '1:1 square';
  const customInstructions = document.getElementById('clone-instructions').value;

  const headline = currentHookText || currentCloneAd?.headline || '';
  const adText = currentCloneAd?.ad_text || '';
  const cta = currentCloneAd?.cta_text || '';
  const comp = currentCloneAd?._competitor || 'competitor';
  const productCtx = container?.my_product ? (container.my_product.name + ' — ' + (container.my_product.description || '')) : 'No product context provided';

  let prompt = 'You are an expert ad creative director. Clone and adapt this competitor ad for a different product.\n\n'
    + 'ORIGINAL AD (from ' + comp + '):\n'
    + '- Headline: ' + (headline || 'N/A') + '\n'
    + '- Ad Text: ' + (adText || 'N/A') + '\n'
    + '- CTA: ' + (cta || 'N/A') + '\n\n'
    + 'OUR PRODUCT:\n' + productCtx + '\n\n'
    + 'TARGET:\n- Network: facebook\n- Image Format: ' + formatDesc + '\n\n';
  if (customInstructions) prompt += 'ADDITIONAL CONTEXT:\n' + customInstructions + '\n\n';
  prompt += 'INSTRUCTIONS:\n1. Generate a visually compelling ad image adapted for our product in ' + formatDesc + ' format.\n'
    + '2. Capture the same creative strategy and visual appeal as the original ad but be completely original.\n'
    + '3. Include any text overlays (headline, CTA).\n4. Also provide adapted ad copy as text.';

  previewEl.textContent = prompt;
}

// Hooks tab
async function generateHooks() {
  const btn = document.getElementById('generate-hooks-btn');
  const statusEl = document.getElementById('hooks-status');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  statusEl.innerHTML = '<div class="text-dim" style="padding:8px;">Generating hooks from scraped ads...</div>';

  try {
    const res = await fetch('/api/containers/' + containerId + '/hooks', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start hook generation');

    pollHooksResult(data.hook_id);
  } catch (err) {
    statusEl.innerHTML = '<div style="color:var(--error);padding:8px;">Error: ' + esc(err.message) + '</div>';
    btn.disabled = false;
    btn.textContent = 'Generate Hooks';
  }
}

function pollHooksResult(hookId) {
  const statusEl = document.getElementById('hooks-status');
  const checkResult = async () => {
    try {
      const res = await fetch('/api/containers/' + containerId + '/hooks/' + hookId);
      const data = await res.json();

      if (data.status === 'completed') {
        statusEl.innerHTML = '';
        renderHooksTable(data.result);
        document.getElementById('generate-hooks-btn').disabled = false;
        document.getElementById('generate-hooks-btn').textContent = 'Regenerate Hooks';
        return;
      }
      if (data.status === 'failed') {
        statusEl.innerHTML = '<div style="color:var(--error);padding:8px;">Failed: ' + esc(data.result?.error || 'Unknown error') + '</div>';
        document.getElementById('generate-hooks-btn').disabled = false;
        document.getElementById('generate-hooks-btn').textContent = 'Retry';
        return;
      }

      setTimeout(checkResult, 3000);
    } catch (err) {
      setTimeout(checkResult, 3000);
    }
  };
  setTimeout(checkResult, 3000);
}

function renderHooksTable(result) {
  const section = document.getElementById('hooks-table-section');
  const hooksContainer = document.getElementById('hooks-table-container');
  if (!result || !result.hooks || result.hooks.length === 0) {
    hooksContainer.innerHTML = '<div class="text-dim" style="padding:16px;text-align:center;">No hooks generated.</div>';
    section.style.display = '';
    return;
  }

  // Show input/output meta info
  let statusHtml = '';
  if (result.angle_summary) {
    statusHtml += '<div style="background:var(--surface);border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;"><strong>Strategy:</strong> ' + esc(result.angle_summary) + '</div>';
  }

  const meta = result._meta;
  if (meta) {
    statusHtml += '<div style="background:var(--surface);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;border:1px solid var(--border);">';
    statusHtml += '<div style="font-weight:600;margin-bottom:6px;">Generation Details</div>';
    statusHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">';
    statusHtml += '<div><span class="text-dim">Ads scanned:</span> ' + (meta.total_ads_scanned || 0) + '</div>';
    statusHtml += '<div><span class="text-dim">Ads in prompt:</span> ' + (meta.ads_in_prompt || 0) + '</div>';
    statusHtml += '<div><span class="text-dim">Context items:</span> ' + (meta.context_items_used || 0) + (meta.uses_container_context ? ' (yes)' : ' (none)') + '</div>';
    statusHtml += '</div>';
    statusHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
    if (meta.product_name) statusHtml += '<div><span class="text-dim">Product:</span> ' + esc(meta.product_name) + '</div>';
    if (meta.model_used) statusHtml += '<div><span class="text-dim">Model:</span> ' + esc(meta.model_used) + '</div>';
    statusHtml += '<div><span class="text-dim">Hooks output:</span> ' + (result.hooks?.length || 0) + '</div>';
    statusHtml += '</div>';
    if (meta.prompt_sent) {
      statusHtml += '<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--text-dim);font-size:12px;">Prompt Sent to AI</summary>';
      statusHtml += '<pre style="white-space:pre-wrap;background:var(--bg);border-radius:6px;padding:8px;margin-top:4px;font-size:11px;max-height:250px;overflow-y:auto;border:1px solid var(--border);">' + esc(meta.prompt_sent) + '</pre></details>';
    }
    statusHtml += '</div>';
  }

  document.getElementById('hooks-status').innerHTML = statusHtml;

  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<thead><tr style="border-bottom:2px solid var(--border);text-align:left;">';
  html += '<th style="padding:8px;width:30px;"><input type="checkbox" onchange="toggleAllHooks(this)"></th>';
  html += '<th style="padding:8px;">Angle</th>';
  html += '<th style="padding:8px;">Hook Text</th>';
  html += '<th style="padding:8px;">Emotion</th>';
  html += '<th style="padding:8px;">Target</th>';
  html += '<th style="padding:8px;"></th>';
  html += '</tr></thead><tbody>';

  for (const hook of result.hooks) {
    const emotionColors = {
      curiosity: '#f59e0b', fear: '#ef4444', desire: '#ec4899', urgency: '#f97316',
      trust: '#22c55e', authority: '#6366f1', surprise: '#8b5cf6',
    };
    const color = emotionColors[hook.emotion?.toLowerCase()] || 'var(--text-dim)';

    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:8px;"><input type="checkbox" class="hook-cb" value="' + esc(hook.hook_text) + '" onchange="updateCloneButton()"></td>';
    html += '<td style="padding:8px;font-weight:600;">' + esc(hook.angle_name) + '</td>';
    html += '<td style="padding:8px;">' + esc(hook.hook_text) + '</td>';
    html += '<td style="padding:8px;"><span style="color:' + color + ';font-size:11px;font-weight:600;text-transform:uppercase;">' + esc(hook.emotion) + '</span></td>';
    html += '<td style="padding:8px;"><span class="text-dim">' + esc(hook.target_segment) + '</span></td>';
    html += '<td style="padding:8px;"><button class="btn btn-ghost btn-sm" onclick="openCloneModalForHook(\'' + esc(hook.hook_text).replace(/'/g, "\\'") + '\')">Clone</button></td>';
    html += '</tr>';
    html += '<tr style="border-bottom:1px solid var(--border);"><td></td><td colspan="5" style="padding:4px 8px 8px;font-size:11px;"><span class="text-dim">' + esc(hook.rationale) + '</span>';
    if (hook.suggested_visuals) html += '<br><span class="text-dim" style="font-style:italic;">Visual: ' + esc(hook.suggested_visuals) + '</span>';
    html += '</td></tr>';
  }

  html += '</tbody></table></div>';
  hooksContainer.innerHTML = html;
  section.style.display = '';
}

function toggleAllHooks(masterCb) {
  document.querySelectorAll('.hook-cb').forEach(cb => { cb.checked = masterCb.checked; });
  updateCloneButton();
}

function updateCloneButton() {
  const checked = document.querySelectorAll('.hook-cb:checked').length;
  const btn = document.getElementById('clone-selected-btn');
  btn.disabled = checked === 0;
  btn.textContent = checked > 0 ? 'Clone ' + checked + ' Selected' : 'Clone Selected';
}

async function cloneSelectedHooks() {
  const checked = Array.from(document.querySelectorAll('.hook-cb:checked'));
  if (checked.length === 0) return;

  const resultsContainer = document.getElementById('clone-results-container');
  const resultsSection = document.getElementById('clone-results');
  resultsSection.style.display = '';
  resultsContainer.innerHTML = '';

  for (const cb of checked) {
    const hookText = cb.value;
    const div = document.createElement('div');
    div.className = 'card';
    div.style.marginBottom = '16px';
    div.innerHTML = '<div style="padding:16px;"><strong>' + esc(hookText) + '</strong><div class="text-dim" style="margin-top:4px;">Generating...</div></div>';
    resultsContainer.appendChild(div);

    try {
      const model = imageModels[0]?.id || 'google/gemini-2.5-flash-image';
      const body = {
        model,
        format: '1:1',
        custom_instructions: 'Use this hook as the headline: ' + hookText,
        headline: hookText,
        ad_text: '',
        cta: '',
        source_competitor: '',
        product_context: container?.my_product ? (container.my_product.name + ' — ' + (container.my_product.description || '')) : '',
      };

      const res = await fetch('/api/containers/' + containerId + '/clone-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.image_path) {
        const imgSrc = data.image_path.startsWith('http') ? data.image_path : '/' + data.image_path.replace(/^\//, '');
        let resultHtml = '<div style="padding:16px;"><strong>' + esc(hookText) + '</strong><div style="margin-top:8px;"><img src="' + esc(imgSrc) + '" style="max-width:300px;border-radius:8px;" alt="Generated ad" onerror="this.style.display=\'none\'"></div>';
        if (data.adapted_copy?.headline) resultHtml += '<div style="font-size:12px;margin-top:6px;"><span class="text-dim">Headline:</span> ' + esc(data.adapted_copy.headline) + '</div>';
        if (data.adapted_copy?.ad_text) resultHtml += '<div style="font-size:12px;"><span class="text-dim">Text:</span> ' + esc(data.adapted_copy.ad_text) + '</div>';
        resultHtml += '</div>';
        div.innerHTML = resultHtml;
      } else {
        div.innerHTML = '<div style="padding:16px;"><strong>' + esc(hookText) + '</strong><div style="color:var(--error);margin-top:4px;">Failed: ' + esc(data.error || 'No image generated') + '</div></div>';
      }
    } catch (err) {
      div.innerHTML = '<div style="padding:16px;"><strong>' + esc(hookText) + '</strong><div style="color:var(--error);margin-top:4px;">Error: ' + esc(err.message) + '</div></div>';
    }
  }
}

async function loadExistingHooks() {
  try {
    const res = await fetch('/api/containers/' + containerId + '/hooks');
    const hooks = await res.json();
    if (hooks.length > 0) {
      const listEl = document.getElementById('hooks-list');
      let html = '<div style="margin-top:8px;">';
      for (const h of hooks.slice(-3).reverse()) {
        const statusColor = h.status === 'completed' ? 'var(--success)' : h.status === 'failed' ? 'var(--error)' : 'var(--text-dim)';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;">';
        html += '<span style="color:' + statusColor + ';">' + esc(h.status) + '</span>';
        html += '<span class="text-dim">' + new Date(h.created_at).toLocaleString() + '</span>';
        if (h.status === 'completed') {
          html += '<span class="text-dim">' + h.hooks_count + ' hooks</span>';
          html += '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px;" onclick="loadHooksResult(\'' + h.id + '\')">Load</button>';
        }
        html += '</div>';
      }
      html += '</div>';
      listEl.innerHTML = html;
    }
  } catch (e) {}
}

async function loadHooksResult(hookId) {
  try {
    const res = await fetch('/api/containers/' + containerId + '/hooks/' + hookId);
    const data = await res.json();
    if (data.result) renderHooksTable(data.result);
  } catch (e) {}
}
