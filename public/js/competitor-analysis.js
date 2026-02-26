/**
 * Competitor Analysis Report — STANDALONE PAGE
 * Page: competitor-analysis.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, competitorId, analysisId, loadAnalysis(), pushItem(),
 *   registerPushItem(), pushRegisteredItem(), renderAnalysis(), renderMarkdown(), esc()
 * API: GET /api/containers/:id/competitor-analysis/:compId/:analysisId,
 *   GET /api/containers/:id, POST /api/containers/:id/context
 *
 * Displays a full competitor ad analysis report with per-item Push buttons
 * that send sections to the container context collector.
 */
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const competitorId = params.get('compId');
const analysisId = params.get('aId');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('analysis-content');
const backLink = document.getElementById('back-link');

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !competitorId || !analysisId) {
  statusText.textContent = 'Missing parameters.';
  statusBar.className = 'status-bar failed';
} else {
  loadAnalysis();
}

async function loadAnalysis() {
  try {
    const res = await fetch(`/api/containers/${containerId}/competitor-analysis/${competitorId}/${analysisId}`);
    if (!res.ok) {
      statusText.textContent = 'Analysis not found.';
      statusBar.className = 'status-bar failed';
      return;
    }
    const analysis = await res.json();

    if (analysis.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'Analysis is still generating...';
      setTimeout(loadAnalysis, 3000);
      return;
    }

    if (analysis.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Analysis failed: ${analysis.result?.error || 'Unknown'}`;
      return;
    }

    // Completed
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    // Get competitor name
    let compName = competitorId;
    try {
      const cRes = await fetch(`/api/containers/${containerId}`);
      if (cRes.ok) {
        const container = await cRes.json();
        const comp = container.competitors.find(c => c.id === competitorId);
        if (comp) compName = comp.name;
      }
    } catch (e) {}

    statusText.textContent = `Scraped Ads Analysis: ${compName} — ${new Date(analysis.created_at).toLocaleString()}`;
    renderAnalysis(analysis, compName);
  } catch (e) {
    statusText.textContent = 'Error loading analysis.';
    statusBar.className = 'status-bar failed';
  }
}

// Push a single item to container context
async function pushItem(sectionKey, label, content, btn) {
  const compId = window._analysisCompId;
  const compName = window._analysisCompName;

  btn.disabled = true;
  btn.textContent = 'Pushed!';
  btn.style.color = 'var(--success)';

  try {
    await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'competitor_analysis',
        source_id: compId,
        section_name: `${compName} - ${label}`,
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

// Store items indexed so push buttons can reference them
window._pushItems = [];
function registerPushItem(sectionKey, label, content) {
  const idx = window._pushItems.length;
  window._pushItems.push({ sectionKey, label, content });
  return idx;
}
function pushRegisteredItem(idx, btn) {
  const item = window._pushItems[idx];
  if (item) pushItem(item.sectionKey, item.label, item.content, btn);
}

function renderAnalysis(analysis, compName) {
  const json = analysis.result?.json_data;
  if (!json) {
    contentDiv.innerHTML = `<div class="card"><div class="proposal-content">${renderMarkdown(analysis.result?.full_text || 'No data')}</div></div>`;
    return;
  }

  // Store for push buttons
  window._analysisJson = json;
  window._analysisCompId = competitorId;
  window._analysisCompName = compName;
  window._pushItems = [];

  // Per-item push button helper — registers item data and returns button HTML
  const itemPushBtn = (sectionKey, label, content) => {
    const idx = registerPushItem(sectionKey, label, content);
    return `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${idx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;" title="Push to Container Context">Push</button>`;
  };

  let html = '';

  // Header
  html += `<div class="report-header">
    <div><h2>Scraped Ads Analysis: ${esc(json.competitor_name || compName)}</h2>
    <div class="report-meta">Ads: FB ${json.total_ads_analyzed?.facebook || 0} / Google ${json.total_ads_analyzed?.google || 0}</div></div>
  </div>`;

  // Summary
  if (json.summary) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Summary</span><h3>Executive Summary</h3>${itemPushBtn('summary', 'summary', { summary: json.summary })}</div>
      <div class="proposal-content"><p>${esc(json.summary)}</p></div>
    </div>`;
  }

  // Key Findings — push per finding
  if (json.key_findings && json.key_findings.length > 0) {
    html += `<div class="report-section hooks">
      <div class="report-section-header"><span class="report-section-badge">Findings</span><h3>Key Findings</h3></div>
      <div class="patterns-grid">`;
    for (const f of json.key_findings) {
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <h5 class="pattern-card-title" style="flex:1;">${esc(f.finding)}</h5>
          ${itemPushBtn('finding', f.finding.substring(0, 40), { finding: f.finding, evidence: f.evidence, ad_links: f.ad_links })}
        </div>
        <div class="pattern-card-body"><p>${esc(f.evidence || '')}</p>
        ${f.ad_links && f.ad_links.length > 0 ? `<div class="pattern-card-links">${f.ad_links.map(l => `<a href="${esc(l)}" target="_blank" class="pattern-ad-link">Ad Link</a>`).join(' ')}</div>` : ''}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Messaging Patterns — push per pattern
  if (json.messaging_patterns && json.messaging_patterns.length > 0) {
    html += `<div class="report-section targeting">
      <div class="report-section-header"><span class="report-section-badge">Messaging</span><h3>Messaging Patterns</h3></div>
      <div class="patterns-grid">`;
    for (const p of json.messaging_patterns) {
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <h5 class="pattern-card-title" style="flex:1;">${esc(p.pattern)}</h5>
          ${itemPushBtn('messaging', p.pattern.substring(0, 40), { pattern: p.pattern, examples: p.examples, frequency: p.frequency })}
        </div>
        <div class="pattern-card-body">
          ${p.examples ? `<p>Examples: ${p.examples.map(e => `"${esc(e)}"`).join(', ')}</p>` : ''}
          ${p.frequency ? `<p class="text-dim">Frequency: ${esc(p.frequency)}</p>` : ''}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Creative Formats — single card, single push
  if (json.creative_formats) {
    const cf = json.creative_formats;
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Formats</span><h3>Creative Formats</h3>${itemPushBtn('creative_formats', 'creative formats', json.creative_formats)}</div>
      <div class="proposal-content">
        <p><strong>Dominant Format:</strong> ${esc(cf.dominant_format || 'N/A')}</p>
        ${cf.format_breakdown ? `<p><strong>Breakdown:</strong> Image: ${cf.format_breakdown.image || 0}, Video: ${cf.format_breakdown.video || 0}, Text: ${cf.format_breakdown.text || 0}</p>` : ''}
        ${cf.notable_creative_approaches ? `<ul>${cf.notable_creative_approaches.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      </div></div>`;
  }

  // Targeting Insights — single card, single push
  if (json.targeting_insights) {
    const ti = json.targeting_insights;
    html += `<div class="report-section targeting">
      <div class="report-section-header"><span class="report-section-badge">Targeting</span><h3>Targeting Insights</h3>${itemPushBtn('targeting_insights', 'targeting insights', json.targeting_insights)}</div>
      <div class="proposal-content">
        ${ti.platforms_used ? `<p><strong>Platforms:</strong> ${ti.platforms_used.join(', ')}</p>` : ''}
        ${ti.eu_demographics ? `
          <p><strong>EU Demographics:</strong></p>
          <ul>
            ${ti.eu_demographics.primary_age_groups ? `<li>Age: ${ti.eu_demographics.primary_age_groups.join(', ')}</li>` : ''}
            ${ti.eu_demographics.gender_split ? `<li>Gender: ${esc(ti.eu_demographics.gender_split)}</li>` : ''}
            ${ti.eu_demographics.top_countries ? `<li>Countries: ${ti.eu_demographics.top_countries.join(', ')}</li>` : ''}
          </ul>
        ` : ''}
        ${ti.estimated_spend_level ? `<p><strong>Estimated Spend:</strong> ${esc(ti.estimated_spend_level)}</p>` : ''}
      </div></div>`;
  }

  // Long Running Ads — push per ad
  if (json.long_running_ads && json.long_running_ads.length > 0) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Proven</span><h3>Long-Running Ads</h3></div>`;
    for (const ad of json.long_running_ads) {
      html += `<div class="clone-card">
        <div class="clone-card-body">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
            <div class="clone-card-badges">
              <span class="clone-card-badge long-running">${ad.days_running || '?'} days</span>
            </div>
            ${itemPushBtn('long_running_ad', (ad.headline || 'ad').substring(0, 40), ad)}
          </div>
          <h4 class="clone-card-title">${esc(ad.headline || 'Untitled')}</h4>
          <div class="clone-card-text">${esc(ad.why_its_working || '')}</div>
          ${ad.ad_link ? `<div class="clone-card-source"><a href="${esc(ad.ad_link)}" target="_blank">View Ad</a></div>` : ''}
        </div></div>`;
    }
    html += `</div>`;
  }

  // Opportunities — push per opportunity
  if (json.opportunities_for_us && json.opportunities_for_us.length > 0) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Opportunities</span><h3>Opportunities for Us</h3></div>
      <div class="patterns-grid">`;
    for (const o of json.opportunities_for_us) {
      const text = typeof o === 'string' ? o : o.opportunity || '';
      const detail = typeof o === 'object' && o.based_on ? o.based_on : '';
      html += `<div class="fresh-idea-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <h5 class="fresh-idea-card-title" style="flex:1;">${esc(text)}</h5>
          ${itemPushBtn('opportunity', text.substring(0, 40), typeof o === 'string' ? { opportunity: o } : o)}
        </div>
        ${detail ? `<div class="fresh-idea-card-body">${esc(detail)}</div>` : ''}
      </div>`;
    }
    html += `</div></div>`;
  }

  contentDiv.innerHTML = html;
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = esc(text);
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  return '<p>' + html + '</p>';
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
