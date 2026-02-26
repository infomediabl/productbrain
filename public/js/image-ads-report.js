/**
 * Image Ads Report + Workflow — STANDALONE PAGE (dual-mode)
 * Page: image-ads.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, adId, containerData, scrapedAdsFlat, selectedAdIndices,
 *   currentStep, loadImageAds(), loadWorkflow(), goToStep(),
 *   renderStep1(), renderStep2(), renderStep3(),
 *   renderImageAds(), renderOptionsUsed(), renderCuratedAds(), renderModelSummary(),
 *   renderAdConcepts(), scrollToCloneWithAd(), buildScrapedAdsList(),
 *   renderCloneSection(), previewSelectedAd(), cloneAd(), renderCloneResult(),
 *   pushItem(), registerPushItem(), pushRegisteredItem(),
 *   copyText(), esc(), escAttr()
 * API: GET /api/containers/:id/image-ads/:adId, GET /api/containers/:id,
 *   POST /api/containers/:id/image-ads, POST /api/containers/:id/clone-ad,
 *   POST /api/containers/:id/context
 *
 * Dual-mode page:
 *   - Workflow mode (?cid=X): multi-step curation workflow (browse ads → configure → report)
 *   - Report mode (?cid=X&adId=Y): view existing curation report (backward compat)
 */

const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const adId = params.get('adId');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('imgad-content');
const backLink = document.getElementById('back-link');
const printBtn = document.getElementById('print-btn');
const cloneSection = document.getElementById('clone-section');
const cloneResult = document.getElementById('clone-result');
const stepIndicator = document.getElementById('step-indicator');
const stepSelectDiv = document.getElementById('step-select');
const stepOptionsDiv = document.getElementById('step-options');

let containerData = null;
let scrapedAdsFlat = []; // flattened list of all scraped ads
let selectedAdIndices = new Set(); // indices into scrapedAdsFlat
let currentStep = 1;

// Push-to-context state
window._pushItems = [];

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId) {
  statusText.textContent = 'Missing container ID (cid).';
  statusBar.className = 'status-bar failed';
} else if (adId) {
  // Report mode — load existing record
  loadImageAds();
} else {
  // Workflow mode — show step-based UI
  loadWorkflow();
}

// ============================================================
// REPORT MODE (existing flow — backward compatible)
// ============================================================

async function loadImageAds() {
  try {
    const res = await fetch(`/api/containers/${containerId}/image-ads/${adId}`);
    if (!res.ok) {
      statusText.textContent = 'Image ads not found.';
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      return;
    }
    const ad = await res.json();

    if (ad.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'AI is curating best ads to clone...';
      setTimeout(loadImageAds, 3000);
      return;
    }

    if (ad.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Ad curation failed: ${ad.result?.error || 'Unknown error'}`;
      return;
    }

    // Completed — fetch container
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    try {
      const cRes = await fetch(`/api/containers/${containerId}`);
      if (cRes.ok) containerData = await cRes.json();
    } catch (e) {}

    const containerName = containerData?.name || '';
    statusText.textContent = `Ad Curation — ${containerName} — ${new Date(ad.created_at).toLocaleString()}`;
    printBtn.style.display = '';

    renderImageAds(ad);
    buildScrapedAdsList();
    renderCloneSection();
  } catch (e) {
    statusText.textContent = 'Error loading image ads.';
    statusBar.className = 'status-bar failed';
    statusBar.querySelector('.spinner').style.display = 'none';
  }
}

// ============================================================
// WORKFLOW MODE
// ============================================================

async function loadWorkflow() {
  statusBar.className = 'status-bar running';
  statusText.textContent = 'Loading container data...';

  try {
    const cRes = await fetch(`/api/containers/${containerId}`);
    if (!cRes.ok) {
      statusText.textContent = 'Container not found.';
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      return;
    }
    containerData = await cRes.json();

    statusBar.style.display = 'none';
    stepIndicator.style.display = '';

    buildScrapedAdsList();
    renderStep1();
  } catch (e) {
    statusText.textContent = 'Error loading container.';
    statusBar.className = 'status-bar failed';
    statusBar.querySelector('.spinner').style.display = 'none';
  }
}

function goToStep(step) {
  if (step === 3) return; // step 3 only via generation
  if (step === 2 && selectedAdIndices.size === 0) return;
  currentStep = step;
  updateStepUI();
}

function updateStepUI() {
  stepSelectDiv.style.display = currentStep === 1 ? '' : 'none';
  stepOptionsDiv.style.display = currentStep === 2 ? '' : 'none';
  contentDiv.style.display = currentStep === 3 ? '' : 'none';
  cloneSection.style.display = currentStep === 3 && scrapedAdsFlat.length > 0 ? '' : 'none';

  const dots = [
    document.getElementById('step-dot-1'),
    document.getElementById('step-dot-2'),
    document.getElementById('step-dot-3'),
  ];
  dots.forEach((dot, i) => {
    const stepNum = i + 1;
    if (stepNum === currentStep) {
      dot.style.background = 'var(--primary)';
      dot.style.color = '#fff';
      dot.style.border = 'none';
    } else if (stepNum < currentStep) {
      dot.style.background = 'var(--success)';
      dot.style.color = '#fff';
      dot.style.border = 'none';
    } else {
      dot.style.background = 'var(--surface)';
      dot.style.color = 'var(--text-dim)';
      dot.style.border = '1px solid var(--border)';
    }
  });
}

// ============================================================
// STEP 1: BROWSE & SELECT ADS
// ============================================================

function renderStep1() {
  currentStep = 1;
  updateStepUI();

  let html = '';

  // Container info header
  const name = containerData?.name || containerData?.my_product?.name || 'Container';
  html += `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--primary);">
    <h2 style="margin-bottom:4px;">${esc(name)}</h2>
    <div class="text-dim" style="font-size:13px;">Select competitor ads to curate, then configure options.</div>
  </div>`;

  // Scraped ads with checkboxes
  if (scrapedAdsFlat.length === 0) {
    html += `<div class="card" style="margin-bottom:16px;">
      <div class="text-dim" style="padding:8px 0;">No scraped ads found. <a href="/container.html?id=${containerId}">Go back</a> and run the scraper first.</div>
    </div>`;
  } else {
    html += `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin:0;">Scraped Ads</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <span id="select-count" class="text-dim" style="font-size:12px;">${selectedAdIndices.size} selected</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleAllAds(true)">Select All</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleAllAds(false)">Deselect All</button>
        </div>
      </div>`;

    // Group by competitor
    const groups = {};
    for (let i = 0; i < scrapedAdsFlat.length; i++) {
      const ad = scrapedAdsFlat[i];
      if (!groups[ad._compName]) groups[ad._compName] = [];
      groups[ad._compName].push({ idx: i, ad });
    }

    for (const [compName, ads] of Object.entries(groups)) {
      html += `<div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <strong style="font-size:14px;">${esc(compName)}</strong>
          <span class="badge" style="font-size:10px;">${ads.length} ads</span>
          <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px;" onclick="toggleCompetitorAds('${esc(compName)}', true)">All</button>
          <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px;" onclick="toggleCompetitorAds('${esc(compName)}', false)">None</button>
        </div>`;

      for (const { idx, ad } of ads) {
        const checked = selectedAdIndices.has(idx) ? 'checked' : '';
        const headline = ad.headline || ad.ad_text || ad.ocr_text || 'No text';
        const platform = ad._source || '';

        // Pick best image
        let imgSrc = ad.local_media_path || ad.screenshot_path || ad.media_url || '';
        if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('/')) imgSrc = '/' + imgSrc;

        html += `<label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;background:${selectedAdIndices.has(idx) ? 'var(--surface2)' : 'transparent'};" data-comp="${esc(compName)}" data-idx="${idx}">
          <input type="checkbox" ${checked} onchange="toggleAd(${idx}, this.checked)" style="margin-top:3px;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
              <span class="badge" style="font-size:10px;">${esc(platform)}</span>
              ${ad.is_new ? '<span class="badge" style="font-size:9px;background:#dcfce7;color:#166534;">NEW</span>' : ''}
              ${ad.is_sponsored ? '<span class="badge" style="font-size:9px;background:#fef3c7;color:#92400e;">Sponsored</span>' : ''}
            </div>
            <div style="font-size:13px;font-weight:500;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(headline.substring(0, 80))}</div>
            ${ad.ad_text && ad.ad_text !== headline ? `<div class="text-dim" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ad.ad_text.substring(0, 100))}</div>` : ''}
            ${ad.cta_text ? `<span class="badge" style="font-size:10px;margin-top:2px;">${esc(ad.cta_text)}</span>` : ''}
          </div>
          ${imgSrc ? `<img src="${esc(imgSrc)}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;" onerror="this.style.display='none'">` : ''}
        </label>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
  }

  // Container Context (read-only reference)
  const contextItems = containerData?.container_context || [];
  if (contextItems.length > 0) {
    html += `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:8px;">Container Context <span class="text-dim" style="font-size:12px;font-weight:400;">(${contextItems.length} items — read-only reference)</span></h3>`;
    for (const item of contextItems) {
      html += `<div style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;background:var(--surface);">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge" style="font-size:9px;">${esc(item.source_type || '')}</span>
          <span style="font-size:13px;font-weight:500;">${esc(item.section_name || '')}</span>
        </div>
        ${item.text_brief ? `<div class="text-dim" style="font-size:12px;margin-top:2px;max-height:40px;overflow:hidden;">${esc(item.text_brief.substring(0, 150))}</div>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  // Metadata (read-only reference)
  const metadata = containerData?.metadata || [];
  if (metadata.length > 0) {
    html += `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:8px;">Metadata <span class="text-dim" style="font-size:12px;font-weight:400;">(${metadata.length} entries — read-only reference)</span></h3>`;
    for (const m of metadata.slice(0, 10)) {
      html += `<div style="padding:4px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:13px;">
        <strong>${esc(m.label || m.key || '')}</strong>
        ${m.value ? `<span class="text-dim"> — ${esc(String(m.value).substring(0, 100))}</span>` : ''}
      </div>`;
    }
    if (metadata.length > 10) {
      html += `<div class="text-dim" style="font-size:12px;">...and ${metadata.length - 10} more</div>`;
    }
    html += `</div>`;
  }

  // Next button
  html += `<div style="display:flex;justify-content:flex-end;margin-top:8px;">
    <button id="step1-next" class="btn btn-primary" onclick="goToStep(2)" ${selectedAdIndices.size === 0 ? 'disabled' : ''}>
      Next: Configure Options (${selectedAdIndices.size} ads selected) &rarr;
    </button>
  </div>`;

  stepSelectDiv.innerHTML = html;
  stepSelectDiv.style.display = '';
}

function toggleAd(idx, checked) {
  if (checked) {
    selectedAdIndices.add(idx);
  } else {
    selectedAdIndices.delete(idx);
  }
  updateSelectCount();
}

function toggleAllAds(selected) {
  if (selected) {
    for (let i = 0; i < scrapedAdsFlat.length; i++) selectedAdIndices.add(i);
  } else {
    selectedAdIndices.clear();
  }
  renderStep1();
}

function toggleCompetitorAds(compName, selected) {
  for (let i = 0; i < scrapedAdsFlat.length; i++) {
    if (scrapedAdsFlat[i]._compName === compName) {
      if (selected) selectedAdIndices.add(i);
      else selectedAdIndices.delete(i);
    }
  }
  renderStep1();
}

function updateSelectCount() {
  const countEl = document.getElementById('select-count');
  if (countEl) countEl.textContent = `${selectedAdIndices.size} selected`;
  const nextBtn = document.getElementById('step1-next');
  if (nextBtn) {
    nextBtn.disabled = selectedAdIndices.size === 0;
    nextBtn.textContent = `Next: Configure Options (${selectedAdIndices.size} ads selected) \u2192`;
  }
  // Update checkbox visual backgrounds
  const labels = stepSelectDiv.querySelectorAll('label[data-idx]');
  labels.forEach(label => {
    const idx = parseInt(label.dataset.idx);
    label.style.background = selectedAdIndices.has(idx) ? 'var(--surface2)' : 'transparent';
    const chk = label.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = selectedAdIndices.has(idx);
  });
}

// ============================================================
// STEP 2: CONFIGURE OPTIONS
// ============================================================

function renderStep2() {
  currentStep = 2;
  updateStepUI();

  let html = `<div class="card" style="margin-bottom:16px;">
    <h3 style="margin-bottom:4px;">Curation Options</h3>
    <div class="text-dim" style="font-size:13px;margin-bottom:16px;">${selectedAdIndices.size} ads selected for curation. Configure targeting and model preferences.</div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="font-size:13px;font-weight:600;">Platform</label>
      <select id="wf-platform" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
        <option value="">All Platforms</option>
        <option value="facebook">Facebook / Instagram</option>
        <option value="google">Google Display Network</option>
        <option value="linkedin">LinkedIn</option>
        <option value="tiktok">TikTok</option>
      </select>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="font-size:13px;font-weight:600;">Objective</label>
      <select id="wf-objective" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
        <option value="">General Awareness</option>
        <option value="conversions">Conversions / Sales</option>
        <option value="traffic">Website Traffic</option>
        <option value="leads">Lead Generation</option>
        <option value="engagement">Engagement</option>
        <option value="app_installs">App Installs</option>
      </select>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="font-size:13px;font-weight:600;">Target Audience <span class="text-dim" style="font-weight:400;">(optional)</span></label>
      <input type="text" id="wf-audience" placeholder="e.g. Women 25-45 interested in fitness" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
    </div>

    <div style="display:flex;gap:12px;margin-bottom:12px;">
      <div class="form-group" style="flex:1;margin-bottom:0;">
        <label style="font-size:13px;font-weight:600;">Tone</label>
        <select id="wf-tone" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
          <option value="">Auto</option>
          <option value="bold">Bold & Attention-grabbing</option>
          <option value="minimal">Minimal & Clean</option>
          <option value="playful">Playful & Colorful</option>
          <option value="luxury">Premium / Luxury</option>
        </select>
      </div>
      <div class="form-group" style="flex:1;margin-bottom:0;">
        <label style="font-size:13px;font-weight:600;">Ad Count</label>
        <input type="number" id="wf-count" min="1" max="10" value="5" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
      </div>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="font-size:13px;font-weight:600;">AI Image Models</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="nano_banana" checked> Nano Banana
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="dalle" checked> ChatGPT / DALL-E
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="midjourney" checked> Midjourney
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="nanogpt"> NanoGPT
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="stable_diffusion"> Stable Diffusion
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="ideogram"> Ideogram
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);">
          <input type="checkbox" class="wf-model-chk" value="flux"> Flux
        </label>
      </div>
      <div class="hint">Select which AI image tools to generate prompts for</div>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="font-size:13px;font-weight:600;">Color Scheme <span class="text-dim" style="font-weight:400;">(optional)</span></label>
      <input type="text" id="wf-colors" placeholder="e.g. blue and white, brand colors #4f46e5" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;">
    </div>

    <div class="form-group" style="margin-bottom:16px;">
      <label style="font-size:13px;font-weight:600;">Custom Instructions <span class="text-dim" style="font-weight:400;">(optional)</span></label>
      <textarea id="wf-instructions" rows="3" placeholder="e.g. Include product screenshots, use lifestyle photography style..." style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;"></textarea>
    </div>

    <div style="display:flex;gap:8px;justify-content:space-between;">
      <button class="btn btn-ghost" onclick="goToStep(1)">&larr; Back to Ad Selection</button>
      <button class="btn btn-primary" id="wf-curate-btn" onclick="submitWorkflow()">Curate Selected Ads</button>
    </div>
  </div>`;

  stepOptionsDiv.innerHTML = html;
  stepOptionsDiv.style.display = '';
}

async function submitWorkflow() {
  const image_models = [];
  document.querySelectorAll('.wf-model-chk:checked').forEach(chk => image_models.push(chk.value));
  if (image_models.length === 0) { alert('Select at least one AI image model'); return; }

  // Build selected_ads array from checked indices
  const selected_ads = [];
  for (const idx of selectedAdIndices) {
    const ad = scrapedAdsFlat[idx];
    selected_ads.push({
      competitor: ad._compName || '',
      platform: ad._source || '',
      headline: ad.headline || '',
      ad_text: ad.ad_text || '',
      cta: ad.cta_text || '',
      media_type: ad.media_type || '',
      ocr_text: ad.ocr_text || '',
      destination_url: ad.destination_url || '',
      extra_data: ad.extra_data || null,
    });
  }

  const platform = document.getElementById('wf-platform').value;
  const objective = document.getElementById('wf-objective').value;
  const target_audience = document.getElementById('wf-audience').value.trim();
  const tone = document.getElementById('wf-tone').value;
  const ad_count = parseInt(document.getElementById('wf-count').value) || 5;
  const color_scheme = document.getElementById('wf-colors').value.trim();
  const custom_instructions = document.getElementById('wf-instructions').value.trim();

  const btn = document.getElementById('wf-curate-btn');
  btn.disabled = true;
  btn.textContent = 'Curating...';

  try {
    const res = await fetch(`/api/containers/${containerId}/image-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform, objective, target_audience, tone, ad_count,
        color_scheme, image_models, custom_instructions, selected_ads,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      // Move to step 3 — poll for completion
      currentStep = 3;
      updateStepUI();
      stepOptionsDiv.style.display = 'none';
      statusBar.style.display = '';
      statusBar.className = 'status-bar running';
      statusText.textContent = 'AI is curating best ads to clone...';
      pollWorkflowResult(data.ad_id);
    } else {
      btn.disabled = false;
      btn.textContent = 'Curate Selected Ads';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Curate Selected Ads';
    alert('Failed to start ad curation');
  }
}

async function pollWorkflowResult(pollAdId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/image-ads/${pollAdId}`);
    const data = await res.json();

    if (data.status === 'completed') {
      statusBar.className = 'status-bar completed';
      statusBar.querySelector('.spinner').style.display = 'none';
      const containerName = containerData?.name || '';
      statusText.textContent = `Ad Curation — ${containerName} — ${new Date(data.created_at).toLocaleString()}`;
      printBtn.style.display = '';
      renderImageAds(data);
      renderCloneSection();
      return;
    }

    if (data.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Ad curation failed: ${data.result?.error || 'Unknown error'}`;
      return;
    }

    setTimeout(() => pollWorkflowResult(pollAdId), 3000);
  } catch (e) {
    setTimeout(() => pollWorkflowResult(pollAdId), 5000);
  }
}

// ============================================================
// PUSH TO CONTEXT
// ============================================================

async function pushItem(sectionKey, label, content, btn) {
  btn.disabled = true;
  btn.textContent = 'Pushed!';
  btn.style.color = 'var(--success)';

  try {
    await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'image_ad_curation',
        source_id: adId || 'workflow',
        section_name: `Ad Curation - ${label}`,
        content,
      }),
    });
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Push'; btn.style.color = ''; }, 2000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Push';
    btn.style.color = '';
  }
}

function registerPushItem(sectionKey, label, content) {
  const idx = window._pushItems.length;
  window._pushItems.push({ sectionKey, label, content });
  return idx;
}

function pushRegisteredItem(idx, btn) {
  const item = window._pushItems[idx];
  if (item) pushItem(item.sectionKey, item.label, item.content, btn);
}

// ============================================================
// REPORT RENDERING (shared by both modes)
// ============================================================

function renderImageAds(ad) {
  const r = ad.result;
  if (!r) { contentDiv.innerHTML = '<div class="card">No data</div>'; return; }

  window._pushItems = [];

  const json = r.json_data;
  let html = '';

  // Push button helper
  const itemPushBtn = (sectionKey, label, content) => {
    const idx = registerPushItem(sectionKey, label, content);
    return `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${idx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;" title="Push to Container Context">Push</button>`;
  };

  // Report Header
  html += `<div class="report-header">
    <div>
      <h2>Ad Curation Report</h2>
      <div class="report-meta">${new Date(r.generated_at || ad.created_at).toLocaleString()}</div>
    </div>
  </div>`;

  if (!json) {
    html += `<div class="card"><div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text || 'No data')}</div></div>`;
    contentDiv.innerHTML = html;
    return;
  }

  // Options Used badges
  html += renderOptionsUsed(r.options_used);

  // Curation Summary
  if (json.curation_summary) {
    html += `<div class="card" style="margin-bottom:16px;border-left:3px solid #0ea5e9;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#0ea5e9;">Curation Summary</div>
        ${itemPushBtn('curation_summary', 'curation summary', { curation_summary: json.curation_summary })}
      </div>
      <div style="font-size:14px;line-height:1.6;">${esc(json.curation_summary)}</div>
    </div>`;
  }

  // Curated Ads (primary section)
  if (json.curated_ads && json.curated_ads.length > 0) {
    html += renderCuratedAds(json.curated_ads, itemPushBtn);
  }

  // Model Recommendation Summary
  if (json.model_recommendation_summary) {
    html += renderModelSummary(json.model_recommendation_summary, itemPushBtn);
  }

  // Ad Concepts
  const concepts = json.ad_concepts || [];
  if (concepts.length > 0) {
    html += renderAdConcepts(concepts);
  }

  // Creative Guidelines
  if (json.creative_guidelines) {
    html += `<div class="report-section actions" style="border-left-color:var(--success);">
      <div class="report-section-header">
        <span class="report-section-badge" style="background:var(--success);">Guidelines</span>
        <h3>Creative Guidelines</h3>
        ${itemPushBtn('creative_guidelines', 'creative guidelines', json.creative_guidelines)}
      </div>`;
    const cg = json.creative_guidelines;
    if (cg.brand_consistency) {
      html += `<div style="margin-bottom:10px;font-size:13px;line-height:1.6;"><strong>Brand Consistency:</strong> ${esc(cg.brand_consistency)}</div>`;
    }
    if (cg.do_nots && cg.do_nots.length > 0) {
      html += `<div style="margin-bottom:10px;"><strong style="font-size:12px;color:var(--danger);">Do NOT:</strong>`;
      html += `<ul style="margin:4px 0 0 16px;font-size:13px;">`;
      cg.do_nots.forEach(d => { html += `<li>${esc(d)}</li>`; });
      html += `</ul></div>`;
    }
    if (cg.performance_tips && cg.performance_tips.length > 0) {
      html += `<div><strong style="font-size:12px;color:var(--success);">Performance Tips:</strong>`;
      html += `<ul style="margin:4px 0 0 16px;font-size:13px;">`;
      cg.performance_tips.forEach(t => { html += `<li>${esc(t)}</li>`; });
      html += `</ul></div>`;
    }
    html += `</div>`;
  }

  // General Recommendations (backward compat for old records)
  if (json.general_recommendations) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Tips</span><h3>Recommendations</h3></div>`;
    if (Array.isArray(json.general_recommendations)) {
      for (const rec of json.general_recommendations) {
        html += `<div style="font-size:13px;padding:6px 10px;background:var(--surface2);border-radius:4px;margin-bottom:4px;">${esc(typeof rec === 'string' ? rec : rec.recommendation || JSON.stringify(rec))}</div>`;
      }
    } else {
      html += `<div style="font-size:13px;line-height:1.6;">${esc(String(json.general_recommendations))}</div>`;
    }
    html += `</div>`;
  }

  contentDiv.innerHTML = html;
}

// ============================================================
// OPTIONS USED BADGES
// ============================================================

function renderOptionsUsed(opts) {
  if (!opts || Object.keys(opts).length === 0) return '';

  const badges = [];
  if (opts.platform) badges.push({ label: 'Platform', value: opts.platform });
  if (opts.objective) badges.push({ label: 'Objective', value: opts.objective });
  if (opts.target_audience) badges.push({ label: 'Audience', value: opts.target_audience });
  if (opts.tone) badges.push({ label: 'Tone', value: opts.tone });
  if (opts.ad_count) badges.push({ label: 'Ad Count', value: opts.ad_count });
  if (opts.color_scheme) badges.push({ label: 'Colors', value: opts.color_scheme });
  if (opts.image_models && opts.image_models.length > 0) {
    badges.push({ label: 'Models', value: opts.image_models.map(m => m.replace(/_/g, ' ')).join(', ') });
  }
  if (opts.selected_ads) {
    badges.push({ label: 'Selected Ads', value: `${opts.selected_ads.length} ads` });
  }

  if (badges.length === 0) return '';

  let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">`;
  for (const b of badges) {
    html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:20px;font-size:12px;">
      <strong style="color:var(--text-dim);">${esc(b.label)}:</strong> ${esc(String(b.value))}
    </span>`;
  }
  html += `</div>`;
  return html;
}

// ============================================================
// CURATED ADS RENDERING
// ============================================================

function renderCuratedAds(curatedAds, itemPushBtn) {
  let html = `<div style="margin-bottom:24px;">
    <h3 style="font-size:18px;margin-bottom:12px;">Curated Ads to Clone</h3>`;

  for (const ca of curatedAds) {
    const rankColor = ca.rank === 1 ? '#f59e0b' : ca.rank === 2 ? '#94a3b8' : ca.rank === 3 ? '#cd7f32' : '#6b7085';

    html += `<div class="report-section clone" style="border-left-color:${rankColor};margin-bottom:16px;">`;

    // Header: rank + competitor + platform + push button
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <span class="badge" style="background:${rankColor};color:#fff;font-weight:700;font-size:13px;">#${ca.rank}</span>
      <strong style="font-size:15px;">${esc(ca.source_competitor || '')}</strong>
      <span class="badge" style="font-size:10px;">${esc(ca.source_platform || '')}</span>
      ${ca.source_ad_ref ? `<span class="text-dim" style="font-size:12px;">${esc(ca.source_ad_ref)}</span>` : ''}
      <span style="margin-left:auto;">
        ${itemPushBtn('curated_ad', `#${ca.rank} ${(ca.source_competitor || '').substring(0, 20)}`, {
          rank: ca.rank,
          source_competitor: ca.source_competitor,
          why_clone: ca.why_clone,
          effectiveness_signals: ca.effectiveness_signals,
          adaptation_strategy: ca.adaptation_strategy,
          recommended_model: ca.recommended_model,
        })}
      </span>
    </div>`;

    // Original ad info
    html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Original Ad</div>`;
    if (ca.original_headline) html += `<div style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(ca.original_headline)}</div>`;
    if (ca.original_ad_text) html += `<div style="font-size:13px;line-height:1.5;margin-bottom:4px;max-height:80px;overflow:auto;">${esc(ca.original_ad_text)}</div>`;
    if (ca.original_cta) html += `<span class="badge" style="background:var(--surface);font-size:11px;">${esc(ca.original_cta)}</span>`;
    html += `</div>`;

    // Why clone + effectiveness signals
    if (ca.why_clone) {
      html += `<div style="margin-bottom:8px;font-size:13px;line-height:1.5;"><strong style="color:#0ea5e9;">Why Clone:</strong> ${esc(ca.why_clone)}</div>`;
    }
    if (ca.effectiveness_signals && ca.effectiveness_signals.length > 0) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">`;
      for (const sig of ca.effectiveness_signals) {
        html += `<span style="display:inline-block;padding:2px 8px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;font-size:11px;color:#065f46;">${esc(sig)}</span>`;
      }
      html += `</div>`;
    }

    // Adaptation strategy
    if (ca.adaptation_strategy) {
      const as = ca.adaptation_strategy;
      html += `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin-bottom:10px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:6px;">Adaptation Strategy</div>`;
      if (as.angle) html += `<div style="font-size:13px;margin-bottom:4px;"><strong>Angle:</strong> ${esc(as.angle)}</div>`;
      if (as.key_changes && as.key_changes.length > 0) {
        html += `<div style="font-size:13px;margin-bottom:6px;"><strong>Key Changes:</strong></div>
          <ul style="margin:0 0 6px 16px;font-size:13px;">`;
        as.key_changes.forEach(c => { html += `<li>${esc(c)}</li>`; });
        html += `</ul>`;
      }
      if (as.adapted_headline) {
        html += `<div style="margin-bottom:4px;font-size:14px;font-weight:600;">${esc(as.adapted_headline)}
          <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;margin-left:6px;" onclick="copyText(this, ${escAttr(as.adapted_headline)})">Copy</button>
        </div>`;
      }
      if (as.adapted_ad_text) {
        html += `<div style="margin-bottom:4px;font-size:13px;line-height:1.5;">${esc(as.adapted_ad_text)}
          <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;margin-left:6px;" onclick="copyText(this, ${escAttr(as.adapted_ad_text)})">Copy</button>
        </div>`;
      }
      if (as.adapted_cta) {
        html += `<span class="badge" style="background:var(--primary);color:#fff;">${esc(as.adapted_cta)}</span>`;
      }
      html += `</div>`;
    }

    // Model recommendation + format
    html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">`;
    if (ca.recommended_model) {
      const modelColors = {
        midjourney: '#5865F2', dalle: '#10a37f', nano_banana: '#d97706', nanogpt: '#8b5cf6',
        stable_diffusion: '#a855f7', ideogram: '#ec4899', flux: '#0ea5e9',
      };
      const mColor = modelColors[ca.recommended_model] || '#6b7085';
      const mLabel = ca.recommended_model.replace(/_/g, ' ').toUpperCase();
      html += `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:${mColor}15;border:1px solid ${mColor}40;border-radius:12px;font-size:12px;font-weight:600;color:${mColor};">
        <span style="width:8px;height:8px;border-radius:50%;background:${mColor};"></span> ${esc(mLabel)}
      </span>`;
    }
    if (ca.recommended_format) {
      html += `<span class="badge" style="font-size:11px;">${esc(ca.recommended_format)}</span>`;
    }
    html += `</div>`;

    if (ca.model_reasoning) {
      html += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;"><strong>Model Reasoning:</strong> ${esc(ca.model_reasoning)}</div>`;
    }

    // Visual Direction
    const vd = ca.visual_direction;
    if (vd && typeof vd === 'object') {
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Visual Direction</div>
        <div style="font-size:13px;line-height:1.5;">`;
      if (vd.style) html += `<div><strong>Style:</strong> ${esc(vd.style)}</div>`;
      if (vd.layout) html += `<div><strong>Layout:</strong> ${esc(vd.layout)}</div>`;
      if (vd.mood) html += `<div><strong>Mood:</strong> ${esc(vd.mood)}</div>`;
      if (vd.text_overlay) html += `<div><strong>Text Overlay:</strong> ${esc(vd.text_overlay)}</div>`;
      html += `</div>`;
      // Color palette
      const palette = vd.color_palette || [];
      if (palette.length > 0) {
        html += `<div style="display:flex;gap:4px;margin-top:6px;align-items:center;">
          <span style="font-size:11px;color:var(--text-dim);">Colors:</span>
          ${palette.map(color => `<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${esc(color)};border:1px solid var(--border);" title="${esc(color)}"></span>`).join('')}
        </div>`;
      }
      html += `</div>`;
    }

    // AI Prompt for recommended model
    const aiPrompts = ca.ai_prompts || {};
    if (Object.keys(aiPrompts).length > 0) {
      const modelColors = {
        midjourney: '#5865F2', dalle: '#10a37f', nano_banana: '#d97706', nanogpt: '#8b5cf6',
        stable_diffusion: '#a855f7', ideogram: '#ec4899', flux: '#0ea5e9',
      };
      html += `<div style="background:#f5920608;border:1px solid #f5920620;border-radius:6px;padding:10px 14px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#ea580c;margin-bottom:6px;">AI Image Prompt</div>`;
      for (const [tool, prompt] of Object.entries(aiPrompts)) {
        const color = modelColors[tool] || '#6b7085';
        const label = tool.replace(/_/g, ' ').toUpperCase();
        const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
        html += `<div style="margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
            <span style="font-size:11px;font-weight:700;color:${color};">${esc(label)}</span>
            <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;margin-left:auto;" onclick="copyText(this, ${escAttr(promptText)})">Copy</button>
          </div>
          <div style="font-size:12px;font-family:Consolas,Monaco,monospace;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:6px 10px;line-height:1.5;">${esc(promptText)}</div>
        </div>`;
      }
      html += `</div>`;
    }

    // Clone This Ad button
    html += `<div style="margin-top:10px;">
      <button class="btn btn-primary btn-sm" onclick="scrollToCloneWithAd(${escAttr(ca.source_competitor || '')}, ${escAttr(ca.original_headline || '')}, ${escAttr(ca.recommended_model || '')}, ${escAttr(ca.recommended_format || '')})">Clone This Ad</button>
    </div>`;

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ============================================================
// MODEL RECOMMENDATION SUMMARY
// ============================================================

function renderModelSummary(summary, itemPushBtn) {
  if (!summary) return '';

  const modelColors = {
    midjourney: '#5865F2', dalle: '#10a37f', nano_banana: '#d97706', nanogpt: '#8b5cf6',
    stable_diffusion: '#a855f7', ideogram: '#ec4899', flux: '#0ea5e9',
  };

  let html = `<div class="report-section" style="border-left-color:#8b5cf6;margin-bottom:16px;">
    <div class="report-section-header">
      <span class="report-section-badge" style="background:#8b5cf6;">Models</span>
      <h3>Model Recommendations</h3>
      ${itemPushBtn('model_summary', 'model recommendations', summary)}
    </div>`;

  if (summary.best_for_this_campaign) {
    const bestColor = modelColors[summary.best_for_this_campaign] || '#6b7085';
    const bestLabel = summary.best_for_this_campaign.replace(/_/g, ' ').toUpperCase();
    html += `<div style="margin-bottom:10px;font-size:14px;">
      <strong>Best for this campaign:</strong>
      <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:${bestColor}15;border:1px solid ${bestColor}40;border-radius:12px;font-size:12px;font-weight:600;color:${bestColor};margin-left:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${bestColor};"></span> ${esc(bestLabel)}
      </span>
    </div>`;
  }
  if (summary.reasoning) {
    html += `<div style="font-size:13px;line-height:1.6;margin-bottom:10px;">${esc(summary.reasoning)}</div>`;
  }
  if (summary.model_notes && typeof summary.model_notes === 'object') {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;">`;
    for (const [model, note] of Object.entries(summary.model_notes)) {
      const color = modelColors[model] || '#6b7085';
      const label = model.replace(/_/g, ' ').toUpperCase();
      html += `<div style="background:var(--surface2);border-radius:6px;padding:8px 12px;border-left:3px solid ${color};">
        <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:2px;">${esc(label)}</div>
        <div style="font-size:12px;color:var(--text-dim);line-height:1.4;">${esc(note)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ============================================================
// AD CONCEPTS (backward compat + new linked concepts)
// ============================================================

function renderAdConcepts(concepts) {
  let html = `<div style="margin-bottom:24px;">
    <h3 style="font-size:18px;margin-bottom:12px;">Ad Concepts</h3>`;

  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    html += `<div class="report-section clone" style="border-left-color:#ea580c;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span class="badge" style="background:#ea580c;color:#fff;font-weight:700;">Ad ${i + 1}</span>
        <strong style="font-size:15px;">${esc(c.concept_name || c.name || 'Concept ' + (i + 1))}</strong>
        ${c.based_on_curated_ad ? `<span class="badge" style="font-size:10px;background:var(--surface);">Based on #${c.based_on_curated_ad}</span>` : ''}
      </div>`;

    // Generated Images (backward compat for old records with Pollinations images)
    const imgs = c.generated_images || {};
    if (imgs.feed_1x1 || imgs.story_9x16 || imgs.banner_16x9) {
      html += `<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">`;
      if (imgs.feed_1x1) {
        html += `<div style="text-align:center;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:3px;">Feed 1:1</div>
          <img src="${esc(imgs.feed_1x1)}" style="width:180px;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open('${esc(imgs.feed_1x1)}','_blank')">
        </div>`;
      }
      if (imgs.story_9x16) {
        html += `<div style="text-align:center;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:3px;">Story 9:16</div>
          <img src="${esc(imgs.story_9x16)}" style="width:101px;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open('${esc(imgs.story_9x16)}','_blank')">
        </div>`;
      }
      if (imgs.banner_16x9) {
        html += `<div style="text-align:center;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:3px;">Banner 16:9</div>
          <img src="${esc(imgs.banner_16x9)}" style="width:280px;height:146px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open('${esc(imgs.banner_16x9)}','_blank')">
        </div>`;
      }
      html += `</div>`;
      if (imgs.error) {
        html += `<div class="text-dim" style="font-size:12px;color:var(--warning);margin-bottom:8px;">Some images failed: ${esc(imgs.error)}</div>`;
      }
    }

    // Copy
    const copy = c.copy || {};
    if (copy.headline || c.headline) html += `<div style="margin-bottom:6px;"><strong style="font-size:12px;color:var(--text-dim);">Headline:</strong> <span style="font-size:14px;font-weight:600;">${esc(copy.headline || c.headline)}</span></div>`;
    if (copy.primary_text || c.primary_text || c.body_text) html += `<div style="margin-bottom:6px;font-size:13px;line-height:1.5;">${esc(copy.primary_text || c.primary_text || c.body_text)}</div>`;
    if (copy.cta_button || c.cta) html += `<div style="margin-bottom:8px;"><span class="badge" style="background:var(--primary);color:#fff;">${esc(copy.cta_button || c.cta)}</span></div>`;

    // Visual Direction
    const vd = c.visual_direction;
    if (vd && typeof vd === 'object') {
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Visual Direction</div>
        <div style="font-size:13px;line-height:1.5;">`;
      if (vd.layout) html += `<div><strong>Layout:</strong> ${esc(vd.layout)}</div>`;
      if (vd.focal_point) html += `<div><strong>Focal Point:</strong> ${esc(vd.focal_point)}</div>`;
      if (vd.background) html += `<div><strong>Background:</strong> ${esc(vd.background)}</div>`;
      if (vd.text_overlay) html += `<div><strong>Text Overlay:</strong> ${esc(vd.text_overlay)}</div>`;
      if (vd.style) html += `<div><strong>Style:</strong> ${esc(vd.style)}</div>`;
      if (vd.mood) html += `<div><strong>Mood:</strong> ${esc(vd.mood)}</div>`;
      html += `</div></div>`;
    } else if (c.visual_direction || c.visual_description) {
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Visual Direction</div>
        <div style="font-size:13px;line-height:1.5;">${esc(c.visual_direction || c.visual_description)}</div>
      </div>`;
    }

    // Color Palette
    const palette = vd?.color_palette || c.color_palette || [];
    if (palette.length > 0) {
      html += `<div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);">Colors:</span>
        ${palette.map(color => `<span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${esc(color)};border:1px solid var(--border);" title="${esc(color)}"></span>`).join('')}
      </div>`;
    }

    // Size Variants (backward compat)
    if (c.size_variants) {
      const variantKeys = Object.keys(c.size_variants);
      if (variantKeys.length > 0) {
        html += `<div style="margin-bottom:8px;"><span style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);">Sizes:</span> `;
        html += variantKeys.map(k => `<span class="badge" style="background:var(--surface);">${esc(k)}: ${esc(String(c.size_variants[k]))}</span>`).join(' ');
        html += `</div>`;
      }
    }

    // AI Prompts
    const allPrompts = { ...(c.ai_prompts || c.ai_image_prompts || {}) };
    if (c.midjourney_prompt) allPrompts.midjourney = c.midjourney_prompt;
    if (c.dalle_prompt) allPrompts.dalle = c.dalle_prompt;
    if (c.nano_banana_prompt) allPrompts.nano_banana = c.nano_banana_prompt;
    if (c.nanogpt_prompt) allPrompts.nanogpt = c.nanogpt_prompt;
    if (c.stable_diffusion_prompt) allPrompts.stable_diffusion = c.stable_diffusion_prompt;
    if (c.ideogram_prompt) allPrompts.ideogram = c.ideogram_prompt;
    if (c.flux_prompt) allPrompts.flux = c.flux_prompt;
    if (Object.keys(allPrompts).length > 0) {
      const modelColors = {
        midjourney: '#5865F2', dalle: '#10a37f', nano_banana: '#d97706', nanogpt: '#8b5cf6',
        stable_diffusion: '#a855f7', ideogram: '#ec4899', flux: '#0ea5e9',
      };
      html += `<div style="background:#f5920608;border:1px solid #f5920620;border-radius:6px;padding:10px 14px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#ea580c;margin-bottom:6px;">AI Image Prompts</div>`;
      for (const [tool, prompt] of Object.entries(allPrompts)) {
        const color = modelColors[tool] || '#6b7085';
        const label = tool.replace(/_/g, ' ').toUpperCase();
        const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
        html += `<div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
            <span style="font-size:11px;font-weight:700;color:${color};">${esc(label)}</span>
            <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;margin-left:auto;" onclick="copyText(this, ${escAttr(promptText)})">Copy</button>
          </div>
          <div style="font-size:12px;font-family:Consolas,Monaco,monospace;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:6px 10px;line-height:1.5;">${esc(promptText)}</div>
        </div>`;
      }
      html += `</div>`;
    }

    // Psychology Hook
    const hooks = c.psychology_hooks || (c.psychology_hook ? [c.psychology_hook] : []);
    if (hooks.length > 0) {
      html += `<div style="font-size:12px;color:var(--text-dim);font-style:italic;margin-bottom:4px;"><strong>Psychology:</strong> ${hooks.map(h => esc(h)).join('; ')}</div>`;
    }

    // A/B Test
    const abTest = c.a_b_test_suggestion || c.ab_test_suggestion;
    if (abTest) {
      html += `<div style="font-size:12px;color:var(--text-dim);"><strong>A/B Test:</strong> ${esc(abTest)}</div>`;
    }

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ============================================================
// SCROLL TO CLONE WITH PRE-SELECTED AD
// ============================================================

function scrollToCloneWithAd(sourceCompetitor, originalHeadline, recommendedModel, recommendedFormat) {
  // Ensure clone section is visible
  if (cloneSection.style.display === 'none') return;

  // Scroll to clone section
  cloneSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Try to find and select the matching scraped ad
  const select = document.getElementById('clone-ad-select');
  if (select && scrapedAdsFlat.length > 0) {
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < scrapedAdsFlat.length; i++) {
      const ad = scrapedAdsFlat[i];
      let score = 0;
      if (sourceCompetitor && ad._compName && ad._compName.toLowerCase() === sourceCompetitor.toLowerCase()) score += 10;
      if (originalHeadline && ad.headline) {
        const normOrig = originalHeadline.toLowerCase().trim();
        const normAd = ad.headline.toLowerCase().trim();
        if (normAd === normOrig) score += 20;
        else if (normAd.includes(normOrig.substring(0, 30)) || normOrig.includes(normAd.substring(0, 30))) score += 8;
      }
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    if (bestIdx >= 0) {
      select.value = bestIdx;
      previewSelectedAd();
    }
  }

  // Pre-select recommended model
  if (recommendedModel) {
    const modelSelect = document.getElementById('clone-model');
    if (modelSelect) {
      const modelMap = {
        'nano_banana': 'google/gemini-2.5-flash-image',
        'dalle': 'openai/gpt-5-image',
        'midjourney': 'openrouter/auto',
        'flux': 'openrouter/auto',
        'stable_diffusion': 'openrouter/auto',
        'ideogram': 'openrouter/auto',
        'nanogpt': 'openai/gpt-5-image-mini',
      };
      const mappedModel = modelMap[recommendedModel];
      if (mappedModel) {
        for (const opt of modelSelect.options) {
          if (opt.value === mappedModel) { modelSelect.value = mappedModel; break; }
        }
      }
    }
  }

  // Pre-select recommended format
  if (recommendedFormat) {
    const formatSelect = document.getElementById('clone-format');
    if (formatSelect) {
      const formatMap = { '1:1': '1:1', '9:16': '9:16', '16:9': '16:9' };
      const mapped = formatMap[recommendedFormat];
      if (mapped) formatSelect.value = mapped;
    }
  }
}

// ============================================================
// CLONE FROM SCRAPED ADS (OpenRouter)
// ============================================================

function buildScrapedAdsList() {
  scrapedAdsFlat = [];
  if (!containerData) return;
  const competitors = containerData.competitors || [];

  // Aggregate ads from ALL completed scrapes (both new and legacy)
  const allScrapes = [
    ...(containerData.scrape_results || []),
    ...(containerData.analyses || []),
  ];
  const completedScrapes = allScrapes.filter(s => s.status === 'completed' && s.scraped_data);

  // Deduplicate: track seen ads by a key to avoid duplicates across scrapes
  const seen = new Set();

  for (const scrape of completedScrapes) {
    const data = scrape.scraped_data;

    // Competitor ads
    for (const [compId, sources] of Object.entries(data.competitors || {})) {
      const comp = competitors.find(c => c.id === compId);
      const compName = comp?.name || compId;
      for (const source of ['facebook', 'google']) {
        for (const ad of (sources[source] || [])) {
          const text = ad.headline || ad.ad_text || ad.ocr_text || '';
          if (!text) continue;
          const key = `${compId}-${source}-${(ad.headline || '').substring(0, 40)}-${(ad.ad_text || '').substring(0, 40)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          scrapedAdsFlat.push({
            ...ad,
            _compName: compName,
            _source: source,
            _label: `${compName} — ${(ad.headline || ad.ad_text || ad.ocr_text || '').substring(0, 60)} [${source}]`,
          });
        }
      }
    }

    // My product ads
    const mp = data.my_product || {};
    const myName = containerData.my_product?.name || 'My Product';
    for (const source of ['facebook', 'google']) {
      for (const ad of (mp[source] || [])) {
        const text = ad.headline || ad.ad_text || ad.ocr_text || '';
        if (!text) continue;
        const key = `myproduct-${source}-${(ad.headline || '').substring(0, 40)}-${(ad.ad_text || '').substring(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        scrapedAdsFlat.push({
          ...ad,
          _compName: myName,
          _source: source,
          _label: `${myName} — ${(ad.headline || ad.ad_text || ad.ocr_text || '').substring(0, 60)} [${source}]`,
        });
      }
    }
  }
}

function renderCloneSection() {
  if (scrapedAdsFlat.length === 0) {
    cloneSection.style.display = 'none';
    return;
  }

  cloneSection.style.display = '';
  let html = `<div class="card" style="border-left:3px solid #ea580c;">
    <h3 style="margin-bottom:12px;font-size:16px;">Clone from Scraped Ads via OpenRouter</h3>
    <p class="text-dim" style="font-size:13px;margin-bottom:14px;">Select a competitor ad, choose format, network, and AI model, then clone it adapted for your product.</p>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Select Scraped Ad</label>
      <select id="clone-ad-select" style="width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;" onchange="previewSelectedAd()">
        <option value="">— Choose an ad —</option>`;

  // Group by competitor
  const groups = {};
  for (let i = 0; i < scrapedAdsFlat.length; i++) {
    const a = scrapedAdsFlat[i];
    if (!groups[a._compName]) groups[a._compName] = [];
    groups[a._compName].push({ idx: i, ad: a });
  }
  for (const [compName, ads] of Object.entries(groups)) {
    html += `<optgroup label="${esc(compName)}">`;
    for (const { idx, ad } of ads) {
      const label = `${(ad.headline || ad.ad_text || '').substring(0, 50) || 'No text'} [${ad._source}]`;
      html += `<option value="${idx}">${esc(label)}</option>`;
    }
    html += `</optgroup>`;
  }

  html += `</select>
    </div>

    <div id="clone-ad-preview" style="display:none;margin-bottom:14px;padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
      <!-- filled by previewSelectedAd() -->
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Image Format</label>
        <select id="clone-format" style="width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;">
          <option value="1:1">Feed 1:1 (1080x1080)</option>
          <option value="9:16">Story 9:16 (1080x1920)</option>
          <option value="16:9">Banner 16:9 (1200x628)</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Target Network</label>
        <select id="clone-network" style="width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;">
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="google">Google Display</option>
          <option value="tiktok">TikTok</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">OpenRouter Model</label>
        <select id="clone-model" style="width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;">
          <option value="google/gemini-2.5-flash-image">Nano Banana — cheapest</option>
          <option value="google/gemini-3-pro-image-preview">Nano Banana Pro — best quality</option>
          <option value="openai/gpt-5-image">GPT-5 Image</option>
          <option value="openai/gpt-5-image-mini">GPT-5 Image Mini</option>
          <option value="openrouter/auto">Auto (best available)</option>
        </select>
      </div>
    </div>

    <button class="btn btn-primary" id="clone-btn" onclick="cloneAd()">Clone This Ad</button>
    <span id="clone-status" class="text-dim" style="margin-left:12px;font-size:13px;"></span>
  </div>`;

  cloneSection.innerHTML = html;
}

function previewSelectedAd() {
  const select = document.getElementById('clone-ad-select');
  const preview = document.getElementById('clone-ad-preview');
  const idx = parseInt(select.value);
  if (isNaN(idx) || !scrapedAdsFlat[idx]) {
    preview.style.display = 'none';
    return;
  }
  preview.style.display = '';
  const ad = scrapedAdsFlat[idx];

  let imgSrc = ad.local_media_path || ad.screenshot_path || ad.media_url || '';
  if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('/')) {
    imgSrc = '/' + imgSrc;
  }

  let html = `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">`;

  if (imgSrc) {
    html += `<div style="flex-shrink:0;">
      <img src="${esc(imgSrc)}" style="max-width:320px;max-height:320px;border-radius:8px;border:1px solid var(--border);cursor:pointer;display:block;" onclick="window.open('${escAttr(imgSrc)}','_blank')" onerror="this.style.display='none'">
    </div>`;
  }

  html += `<div style="flex:1;min-width:200px;">`;
  html += `<div style="margin-bottom:8px;"><strong style="font-size:15px;">${esc(ad._compName)}</strong> <span class="badge" style="font-size:10px;">${esc(ad._source)}</span></div>`;
  if (ad.headline) html += `<div style="margin-bottom:6px;font-size:14px;"><strong>Headline:</strong> ${esc(ad.headline)}</div>`;
  if (ad.ad_text) html += `<div style="margin-bottom:6px;font-size:13px;line-height:1.5;max-height:120px;overflow:auto;">${esc(ad.ad_text)}</div>`;
  if (ad.cta_text) html += `<div style="margin-bottom:6px;"><strong>CTA:</strong> <span class="badge" style="background:var(--primary);color:#fff;">${esc(ad.cta_text)}</span></div>`;
  if (ad.destination_url) html += `<div style="font-size:12px;color:var(--text-dim);word-break:break-all;"><strong>URL:</strong> ${esc(ad.destination_url)}</div>`;
  html += `</div></div>`;

  preview.innerHTML = html;
}

async function cloneAd() {
  const select = document.getElementById('clone-ad-select');
  const idx = parseInt(select.value);
  if (isNaN(idx) || !scrapedAdsFlat[idx]) { alert('Select an ad first.'); return; }

  const ad = scrapedAdsFlat[idx];
  const format = document.getElementById('clone-format').value;
  const network = document.getElementById('clone-network').value;
  const model = document.getElementById('clone-model').value;

  const product = containerData?.my_product || {};
  const productContext = [
    product.name || '',
    product.website ? `Website: ${product.website}` : '',
    product.site_type ? `Type: ${product.site_type}` : '',
    product.unique_angle ? `Angle: ${product.unique_angle}` : '',
    product.target_audience ? `Audience: ${product.target_audience}` : '',
  ].filter(Boolean).join('\n');

  const btn = document.getElementById('clone-btn');
  const statusEl = document.getElementById('clone-status');
  btn.disabled = true;
  statusEl.textContent = 'Generating via OpenRouter...';

  try {
    const res = await fetch(`/api/containers/${containerId}/clone-ad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headline: ad.headline || '',
        ad_text: ad.ad_text || '',
        cta: ad.cta_text || '',
        image_url: ad.media_url || '',
        screenshot_path: ad.screenshot_path || '',
        source_competitor: ad._compName,
        product_context: productContext,
        format,
        network,
        model,
      }),
    });
    const data = await res.json();
    btn.disabled = false;

    if (!res.ok) {
      statusEl.textContent = '';
      alert(data.error || 'Clone failed');
      return;
    }

    statusEl.textContent = 'Done!';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
    renderCloneResult(data);
  } catch (e) {
    btn.disabled = false;
    statusEl.textContent = '';
    alert('Failed to clone ad: ' + e.message);
  }
}

function renderCloneResult(data) {
  cloneResult.style.display = '';
  let html = `<div class="card" style="border-left:3px solid var(--success);">
    <h4 style="margin-bottom:10px;">Cloned Ad Result</h4>`;

  if (data.image_path) {
    html += `<div style="margin-bottom:12px;">
      <img src="${esc(data.image_path)}" style="max-width:400px;max-height:400px;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open('${esc(data.image_path)}','_blank')">
    </div>`;
  }

  const copy = data.adapted_copy || {};
  if (copy.headline) html += `<div style="margin-bottom:6px;"><strong>Headline:</strong> <span style="font-size:14px;font-weight:600;">${esc(copy.headline)}</span>
    <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;margin-left:6px;" onclick="copyText(this, ${escAttr(copy.headline)})">Copy</button></div>`;
  if (copy.ad_text) html += `<div style="margin-bottom:6px;font-size:13px;">${esc(copy.ad_text)}
    <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 6px;margin-left:6px;" onclick="copyText(this, ${escAttr(copy.ad_text)})">Copy</button></div>`;
  if (copy.cta) html += `<div style="margin-bottom:6px;"><span class="badge" style="background:var(--primary);color:#fff;">${esc(copy.cta)}</span></div>`;

  if (data.ai_text) {
    html += `<div style="margin-top:10px;font-size:12px;color:var(--text-dim);"><strong>AI Notes:</strong> ${esc(data.ai_text)}</div>`;
  }

  html += `</div>`;
  cloneResult.innerHTML = html;
  cloneResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================
// UTILITIES
// ============================================================

function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('copy-toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  });
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escAttr(str) {
  return JSON.stringify(String(str || ''));
}
