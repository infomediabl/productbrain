/**
 * Image Ads Creator UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderImageAds(), openImageAdModal(), closeImageAdModal(),
 *   submitImageAdModal(), pollImageAds()
 * API: POST /api/containers/:id/image-ads, GET /api/containers/:id/image-ads/:adId
 * Interacts with: Links to image-ads.html for full report view
 *
 * Creates AI image ad concepts with copy, visual direction, and AI image prompts.
 * Supports platform, objective, audience, tone, and AI model selection.
 */
// ========== Image Ad Creator ==========

function renderImageAds() {
  const el = document.getElementById('imgad-list');
  const ads = container.image_ads || [];

  if (ads.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No image ads yet. Create ad concepts with copy, visuals & AI prompts.</div>';
    return;
  }

  const sorted = [...ads].reverse();
  el.innerHTML = sorted.map(a => {
    const isGenerating = a.status === 'generating';
    const isDone = a.status === 'completed';
    const adCount = a.result?.json_data?.ad_concepts?.length || 0;

    return `
      <div class="proposal-item">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="status-dot ${isGenerating ? 'running' : a.status}"></span>
          <span>${new Date(a.created_at).toLocaleString()}</span>
          <span class="text-dim">${a.status}</span>
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Generating...</span>' : ''}
          ${isDone ? `<a href="/image-ads.html?cid=${containerId}&adId=${a.id}" class="btn btn-primary btn-sm" style="margin-left:auto;">View Ads</a>` : ''}
          ${isDone && adCount > 0 ? `<span class="text-dim" style="font-size:12px;">${adCount} concepts</span>` : ''}
          ${a.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(a.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openImageAdModal() {
  document.getElementById('imgad-platform').value = '';
  document.getElementById('imgad-objective').value = '';
  document.getElementById('imgad-audience').value = '';
  document.getElementById('imgad-tone').value = '';
  document.getElementById('imgad-count').value = '3';
  document.getElementById('imgad-colors').value = '';
  document.getElementById('imgad-instructions').value = '';
  document.getElementById('imgad-modal').style.display = 'flex';
}

function closeImageAdModal() {
  document.getElementById('imgad-modal').style.display = 'none';
}

async function submitImageAdModal() {
  const platform = document.getElementById('imgad-platform').value;
  const objective = document.getElementById('imgad-objective').value;
  const target_audience = document.getElementById('imgad-audience').value.trim();
  const tone = document.getElementById('imgad-tone').value;
  const ad_count = parseInt(document.getElementById('imgad-count').value) || 3;
  const color_scheme = document.getElementById('imgad-colors').value.trim();
  const custom_instructions = document.getElementById('imgad-instructions').value.trim();
  const image_models = [];
  document.querySelectorAll('.imgad-model-chk:checked').forEach(chk => image_models.push(chk.value));
  if (image_models.length === 0) { alert('Select at least one AI image model'); return; }
  closeImageAdModal();

  const btn = document.getElementById('imgad-btn');
  btn.disabled = true;
  btn.textContent = 'Creating...';
  const statusEl = document.getElementById('imgad-status');
  statusEl.style.display = 'block';
  statusEl.className = 'status-bar running';
  statusEl.innerHTML = '<div class="spinner"></div><span>AI is creating image ad concepts...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/image-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, objective, target_audience, tone, ad_count, color_scheme, image_models, custom_instructions }),
    });
    const data = await res.json();
    if (res.ok) {
      pollImageAds(data.ad_id);
    } else {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Create Ads';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Create Ads';
    alert('Failed to start image ad generation');
  }
}

async function pollImageAds(adId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/image-ads/${adId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('imgad-status').style.display = 'none';
      document.getElementById('imgad-btn').disabled = false;
      document.getElementById('imgad-btn').textContent = 'Create Ads';
      await loadContainer();
      return;
    }
    setTimeout(() => pollImageAds(adId), 3000);
  } catch (e) {
    setTimeout(() => pollImageAds(adId), 5000);
  }
}


