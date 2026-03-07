/**
 * Product Ideation UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js;
 *   getEntryAdStats() — from entries.js
 * Globals defined: renderIdeatorSection(), startIdeation(), pollIdeation(), acceptProductIdea()
 * API: POST /api/containers/:id/ideate-product,
 *   GET /api/containers/:id/product-ideas/:ideaId,
 *   POST /api/containers/:id/product-ideas/:ideaId/accept
 *
 * When no product is set, shows the ideator section to generate AI product ideas
 * based on competitor data. Allows accepting an idea to set the container's product.
 */
// ========== NewProductIdeator ==========

function renderIdeatorSection() {
  const section = document.getElementById('ideator-section');
  if (container.my_product) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const el = document.getElementById('ideator-results');
  const ideas = container.product_ideas || [];
  const hasCompData = container.competitors.some(c => getEntryAdStats(c.id).fbCount > 0 || getEntryAdStats(c.id).googleCount > 0);
  const hasAnalyses = Object.values(container.competitor_analyses || {}).some(arr => arr.some(a => a.status === 'completed'));

  document.getElementById('ideate-btn').disabled = !hasCompData && !hasAnalyses;

  if (ideas.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No product ideas yet. Scrape competitor ads first, then click "Ideate Product".</div>';
    return;
  }

  const sorted = [...ideas].reverse();
  let html = '';
  for (const idea of sorted) {
    if (idea.status === 'generating') {
      html += `<div class="analysis-item"><div style="display:flex;align-items:center;gap:8px;">
        <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
        <span class="text-dim">Generating product ideas...</span>
      </div></div>`;
      continue;
    }
    if (idea.status === 'failed') {
      html += `<div class="analysis-item"><span class="status-dot failed"></span><span class="text-dim">Failed: ${esc(idea.result?.error || 'Unknown')}</span></div>`;
      continue;
    }
    if (idea.status === 'completed' && idea.result?.json_data) {
      const json = idea.result.json_data;

      // Market analysis summary
      if (json.market_analysis) {
        const ma = json.market_analysis;
        html += `<div class="ideator-market-summary" style="margin-bottom:16px;">
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:4px;"><strong>Market:</strong> ${esc(ma.market_type || '')}${promptSentLink(idea.result)}</div>
          ${ma.underserved_segments ? `<div style="font-size:12px;color:var(--text-dim);">Underserved: ${ma.underserved_segments.map(s => esc(s)).join(', ')}</div>` : ''}
        </div>`;
      }

      // Product ideas
      const productIdeas = json.product_ideas || [];
      for (let i = 0; i < productIdeas.length; i++) {
        const pi = productIdeas[i];
        const isAccepted = idea.accepted && idea.accepted_index === i;
        html += `<div class="idea-card ${isAccepted ? 'idea-card-accepted' : ''}">
          <div class="idea-card-header">
            <div>
              <h4 class="idea-card-name">${esc(pi.project_name)}</h4>
              ${pi.tagline ? `<div class="idea-card-tagline">${esc(pi.tagline)}</div>` : ''}
            </div>
            ${isAccepted
              ? '<span class="badge" style="background:#16a34a15;color:#15803d;">Accepted</span>'
              : (!idea.accepted ? `<button class="btn btn-primary btn-sm" onclick="acceptProductIdea('${idea.id}', ${i})">Accept</button>` : '')
            }
          </div>
          <div class="idea-card-body">
            ${pi.site_type ? `<div class="idea-card-field"><strong>Site Type:</strong> ${esc(pi.site_type)}</div>` : ''}
            ${pi.domain_suggestions ? `<div class="idea-card-field"><strong>Domains:</strong> ${pi.domain_suggestions.map(d => `<code>${esc(d)}</code>`).join(' ')}</div>` : ''}
            ${pi.target_audience ? `<div class="idea-card-field"><strong>Target:</strong> ${esc(pi.target_audience)}</div>` : ''}
            ${pi.unique_angle ? `<div class="idea-card-field"><strong>Unique Angle:</strong> ${esc(pi.unique_angle)}</div>` : ''}
            ${pi.competitive_advantages ? `<div class="idea-card-field"><strong>Advantages:</strong><ul>${pi.competitive_advantages.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
          </div>
        </div>`;
      }
    }
  }
  el.innerHTML = html;
}

async function startIdeation() {
  const btn = document.getElementById('ideate-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('ideator-status');

  try {
    const res = await fetch(`/api/containers/${containerId}/ideate-product`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.display = 'block';
      statusEl.className = 'status-bar running';
      statusEl.innerHTML = '<div class="spinner"></div><span>AI is analyzing competitors to propose product concepts...</span>';
      await loadContainer();
      pollIdeation(data.idea_id);
    } else {
      alert(data.error || 'Failed to start');
      btn.disabled = false;
      btn.textContent = 'Ideate Product';
    }
  } catch (e) {
    alert('Failed to start ideation');
    btn.disabled = false;
    btn.textContent = 'Ideate Product';
  }
}

async function pollIdeation(ideaId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/product-ideas/${ideaId}`);
    const data = await res.json();
    const statusEl = document.getElementById('ideator-status');
    const btn = document.getElementById('ideate-btn');

    if (data.status === 'completed' || data.status === 'failed') {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Ideate Product';
      await loadContainer();
      return;
    }
    setTimeout(() => pollIdeation(ideaId), 3000);
  } catch (e) {
    setTimeout(() => pollIdeation(ideaId), 5000);
  }
}

async function acceptProductIdea(ideaId, ideaIndex) {
  if (!confirm('Accept this product idea? It will set your product name and details.')) return;
  try {
    const res = await fetch(`/api/containers/${containerId}/product-ideas/${ideaId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_index: ideaIndex }),
    });
    const data = await res.json();
    if (res.ok) {
      await loadContainer();
    } else {
      alert(data.error || 'Failed to accept');
    }
  } catch (e) {
    alert('Failed to accept product idea');
  }
}
