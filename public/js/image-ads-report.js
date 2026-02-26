/**
 * Image Ads Report + Clone from Scraped Ads — STANDALONE PAGE
 * Page: image-ads.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, adId, containerData, scrapedAdsFlat, loadImageAds(),
 *   renderImageAds(), renderOptionsUsed(), renderCuratedAds(), renderModelSummary(),
 *   renderAdConcepts(), scrollToCloneWithAd(), buildScrapedAdsList(),
 *   renderCloneSection(), previewSelectedAd(), cloneAd(), renderCloneResult(),
 *   copyText(), esc(), escAttr()
 * API: GET /api/containers/:id/image-ads/:adId, GET /api/containers/:id,
 *   POST /api/containers/:id/clone-ad
 *
 * Displays AI-curated competitor ads with clone recommendations, adaptation
 * strategies, and model suggestions. Also provides a "Clone from Scraped Ads"
 * feature that adapts competitor ads via OpenRouter image generation.
 */
// Standalone image ads report page + Clone from Scraped Ads via OpenRouter
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

let containerData = null;
let scrapedAdsFlat = []; // flattened list of all scraped ads

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !adId) {
  statusText.textContent = 'Missing parameters (cid, adId).';
  statusBar.className = 'status-bar failed';
} else {
  loadImageAds();
}

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
// REPORT RENDERING
// ============================================================

function renderImageAds(ad) {
  const r = ad.result;
  if (!r) { contentDiv.innerHTML = '<div class="card">No data</div>'; return; }

  const json = r.json_data;
  let html = '';

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
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#0ea5e9;margin-bottom:6px;">Curation Summary</div>
      <div style="font-size:14px;line-height:1.6;">${esc(json.curation_summary)}</div>
    </div>`;
  }

  // Curated Ads (primary new section)
  if (json.curated_ads && json.curated_ads.length > 0) {
    html += renderCuratedAds(json.curated_ads);
  }

  // Model Recommendation Summary
  if (json.model_recommendation_summary) {
    html += renderModelSummary(json.model_recommendation_summary);
  }

  // Ad Concepts (backward compat + new linked concepts)
  const concepts = json.ad_concepts || [];
  if (concepts.length > 0) {
    html += renderAdConcepts(concepts);
  }

  // Creative Guidelines
  if (json.creative_guidelines) {
    html += `<div class="report-section actions" style="border-left-color:var(--success);">
      <div class="report-section-header"><span class="report-section-badge" style="background:var(--success);">Guidelines</span><h3>Creative Guidelines</h3></div>`;
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

function renderCuratedAds(curatedAds) {
  let html = `<div style="margin-bottom:24px;">
    <h3 style="font-size:18px;margin-bottom:12px;">Curated Ads to Clone</h3>`;

  for (const ca of curatedAds) {
    const rankColor = ca.rank === 1 ? '#f59e0b' : ca.rank === 2 ? '#94a3b8' : ca.rank === 3 ? '#cd7f32' : '#6b7085';

    html += `<div class="report-section clone" style="border-left-color:${rankColor};margin-bottom:16px;">`;

    // Header: rank + competitor + platform
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <span class="badge" style="background:${rankColor};color:#fff;font-weight:700;font-size:13px;">#${ca.rank}</span>
      <strong style="font-size:15px;">${esc(ca.source_competitor || '')}</strong>
      <span class="badge" style="font-size:10px;">${esc(ca.source_platform || '')}</span>
      ${ca.source_ad_ref ? `<span class="text-dim" style="font-size:12px;">${esc(ca.source_ad_ref)}</span>` : ''}
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

function renderModelSummary(summary) {
  if (!summary) return '';

  const modelColors = {
    midjourney: '#5865F2', dalle: '#10a37f', nano_banana: '#d97706', nanogpt: '#8b5cf6',
    stable_diffusion: '#a855f7', ideogram: '#ec4899', flux: '#0ea5e9',
  };

  let html = `<div class="report-section" style="border-left-color:#8b5cf6;margin-bottom:16px;">
    <div class="report-section-header"><span class="report-section-badge" style="background:#8b5cf6;">Models</span><h3>Model Recommendations</h3></div>`;

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
      // Match by competitor name
      if (sourceCompetitor && ad._compName && ad._compName.toLowerCase() === sourceCompetitor.toLowerCase()) score += 10;
      // Match by headline
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
          // Only include ads that have some text content
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

  // Pick best image: screenshot_path (local) or media_url (CDN)
  let imgSrc = ad.local_media_path || ad.screenshot_path || ad.media_url || '';
  // Ensure local paths have leading slash
  if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('/')) {
    imgSrc = '/' + imgSrc;
  }

  let html = `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">`;

  // Large image on the left
  if (imgSrc) {
    html += `<div style="flex-shrink:0;">
      <img src="${esc(imgSrc)}" style="max-width:320px;max-height:320px;border-radius:8px;border:1px solid var(--border);cursor:pointer;display:block;" onclick="window.open('${escAttr(imgSrc)}','_blank')" onerror="this.style.display='none'">
    </div>`;
  }

  // Ad details on the right
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
