/**
 * Image Ad Curator UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderImageAds(), pollImageAds()
 * API: GET /api/containers/:id/image-ads/:adId
 * Interacts with: Links to image-ads.html for workflow and report views
 *
 * Dashboard section showing curation history. "Curate Ads" button navigates
 * to the standalone workflow page (image-ads.html?cid=X).
 */
// ========== Image Ad Curator ==========

function renderImageAds() {
  const el = document.getElementById('imgad-list');
  const ads = container.image_ads || [];

  if (ads.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No ad curation yet. Analyze competitor ads and get clone recommendations.</div>';
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
          ${isDone ? `<a href="/image-ads.html?cid=${containerId}&adId=${a.id}" class="btn btn-primary btn-sm" style="margin-left:auto;">View Report</a>` : ''}
          ${isDone && adCount > 0 ? `<span class="text-dim" style="font-size:12px;">${adCount} concepts</span>` : ''}
          ${a.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(a.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function pollImageAds(adId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/image-ads/${adId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('imgad-status').style.display = 'none';
      document.getElementById('imgad-btn').disabled = false;
      document.getElementById('imgad-btn').textContent = 'Curate Ads';
      await loadContainer();
      return;
    }
    setTimeout(() => pollImageAds(adId), 3000);
  } catch (e) {
    setTimeout(() => pollImageAds(adId), 5000);
  }
}
