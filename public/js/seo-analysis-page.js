/**
 * SEO Analysis Report — STANDALONE PAGE
 * Page: seo-analysis.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, storageKey, analysisId, loadAnalysis(), pushItem(),
 *   registerPushItem(), pushRegisteredItem(), itemPushBtn(), renderAnalysis(),
 *   renderOwnProductReport(), renderCompetitorIntelReport(), renderLegacyReport(),
 *   renderMarkdown(), esc()
 * API: GET /api/containers/:id/seo-analysis/:key/:analysisId,
 *   GET /api/containers/:id, POST /api/containers/:id/context
 *
 * Displays own-product SEO audit or competitor SEO intelligence report with per-item
 * Push buttons for sending sections to the container context collector.
 */
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const storageKey = params.get('key');
const analysisId = params.get('id');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('analysis-content');
const backLink = document.getElementById('back-link');

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !storageKey || !analysisId) {
  statusText.textContent = 'Missing parameters.';
  statusBar.className = 'status-bar failed';
} else {
  loadAnalysis();
}

async function loadAnalysis() {
  try {
    const res = await fetch(`/api/containers/${containerId}/seo-analysis/${storageKey}/${analysisId}`);
    if (!res.ok) {
      statusText.textContent = 'SEO analysis not found.';
      statusBar.className = 'status-bar failed';
      return;
    }
    const analysis = await res.json();

    if (analysis.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'SEO analysis is still generating...';
      setTimeout(loadAnalysis, 3000);
      return;
    }

    if (analysis.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `SEO analysis failed: ${analysis.result?.error || 'Unknown'}`;
      return;
    }

    // Completed
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    // Determine display name
    let displayName = storageKey;
    try {
      const cRes = await fetch(`/api/containers/${containerId}`);
      if (cRes.ok) {
        const container = await cRes.json();
        if (storageKey === '_own_product') {
          displayName = container.my_product?.name || 'My Product';
        } else {
          const comp = container.competitors.find(c => c.id === storageKey);
          if (comp) displayName = comp.name;
        }
        // Store container for rendering
        window._seoContainer = container;
      }
    } catch (e) {}

    const r = analysis.result;
    const analysisType = r.analysis_type || analysis.analysis_type || (storageKey === '_own_product' ? 'own_product' : 'competitor');
    const typeLabel = analysisType === 'own_product' ? 'SEO Audit' : 'SEO Intelligence';
    statusText.textContent = `${typeLabel}: ${displayName} — ${new Date(analysis.created_at).toLocaleString()}`;

    renderAnalysis(analysis, displayName);
  } catch (e) {
    statusText.textContent = 'Error loading SEO analysis.';
    statusBar.className = 'status-bar failed';
  }
}

// ========== Push to Container Context ==========

async function pushItem(sectionKey, label, content, btn) {
  btn.disabled = true;
  btn.textContent = 'Pushed!';
  btn.style.color = 'var(--success)';

  try {
    await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'seo_analysis',
        source_id: storageKey,
        section_name: `${window._seoDisplayName || storageKey} - ${label}`,
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

const itemPushBtn = (sectionKey, label, content) => {
  const idx = registerPushItem(sectionKey, label, content);
  return `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${idx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;" title="Push to Container Context">Push</button>`;
};

// ========== Rendering ==========

function renderAnalysis(analysis, displayName) {
  window._seoDisplayName = displayName;
  window._pushItems = [];

  const r = analysis.result;
  const json = r.json_data;

  if (!json) {
    contentDiv.innerHTML = `<div class="card"><div class="proposal-content">${renderMarkdown(r.full_text || 'No data')}</div></div>`;
    return;
  }

  const analysisType = r.analysis_type || analysis.analysis_type || (storageKey === '_own_product' ? 'own_product' : 'competitor');
  const isNewCompetitor = analysisType === 'competitor' && json.overall_effectiveness !== undefined;
  const isOwnProduct = analysisType === 'own_product';

  let html = '';
  if (isOwnProduct) {
    html = renderOwnProductReport(r, json);
  } else if (isNewCompetitor) {
    html = renderCompetitorIntelReport(r, json);
  } else {
    html = renderLegacyReport(r, json);
  }

  contentDiv.innerHTML = html;
}

// ========== Own Product SEO Audit ==========

function renderOwnProductReport(r, json) {
  const productName = json.product_name || window._seoDisplayName || 'My Product';

  let html = '';

  // Header
  html += `<div class="report-header">
    <div><h2>SEO Audit: ${esc(productName)}</h2>
    <div class="report-meta">${esc(r.website)} — ${new Date(r.analyzed_at).toLocaleString()}</div></div>
  </div>`;

  if (r.focus_instructions) {
    html += `<div class="report-section" style="background:#7c3aed08;border:1px solid #7c3aed20;">
      <div class="proposal-content"><strong>Focus:</strong> ${esc(r.focus_instructions)}</div>
    </div>`;
  }

  // Overall Score + Summary
  const score = json.overall_score || 0;
  html += `<div class="report-section clone">
    <div class="report-section-header"><span class="report-section-badge">Score</span><h3>Overall: ${score}/100</h3>${itemPushBtn('summary', 'summary', { summary: json.summary, overall_score: score })}</div>
    <div class="proposal-content"><p>${esc(json.summary || '')}</p></div>
  </div>`;

  // Sub-scores
  const subScores = [
    { label: 'On-Page SEO', score: json.on_page_seo?.score, data: json.on_page_seo },
    { label: 'Technical SEO', score: json.technical_seo?.score, data: json.technical_seo },
    { label: 'Keyword Strategy', score: json.keyword_strategy?.score, data: json.keyword_strategy },
  ];

  html += `<div class="report-section targeting">
    <div class="report-section-header"><span class="report-section-badge">Scores</span><h3>Section Scores</h3></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">`;
  for (const s of subScores) {
    const sc = s.score || 0;
    const c = sc >= 70 ? 'var(--success)' : sc >= 40 ? 'var(--warning)' : 'var(--danger)';
    html += `<div style="flex:1;min-width:140px;text-align:center;padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:24px;font-weight:800;color:${c};">${sc}</div>
      <div style="font-size:12px;color:var(--text-dim);">${s.label}</div>
    </div>`;
  }
  html += `</div></div>`;

  // On-Page SEO items
  if (json.on_page_seo) {
    const op = json.on_page_seo;
    html += `<div class="report-section hooks">
      <div class="report-section-header"><span class="report-section-badge">On-Page</span><h3>On-Page SEO</h3></div>
      <div class="patterns-grid">`;
    if (op.findings && op.findings.length > 0) {
      for (const f of op.findings) {
        const text = typeof f === 'string' ? f : f.finding || f.issue || JSON.stringify(f);
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <h5 class="pattern-card-title" style="flex:1;">${esc(text)}</h5>
            ${itemPushBtn('on_page_seo', text.substring(0, 40), typeof f === 'string' ? { finding: f } : f)}
          </div></div>`;
      }
    }
    if (op.issues && op.issues.length > 0) {
      for (const issue of op.issues) {
        const text = typeof issue === 'string' ? issue : issue.issue || issue.finding || JSON.stringify(issue);
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <h5 class="pattern-card-title" style="flex:1;">${esc(text)}</h5>
            ${itemPushBtn('on_page_seo', text.substring(0, 40), typeof issue === 'string' ? { issue } : issue)}
          </div></div>`;
      }
    }
    html += `</div></div>`;
  }

  // Technical SEO items
  if (json.technical_seo) {
    const ts = json.technical_seo;
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Technical</span><h3>Technical SEO</h3></div>
      <div class="patterns-grid">`;
    if (ts.findings && ts.findings.length > 0) {
      for (const f of ts.findings) {
        const text = typeof f === 'string' ? f : f.finding || f.issue || JSON.stringify(f);
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <h5 class="pattern-card-title" style="flex:1;">${esc(text)}</h5>
            ${itemPushBtn('technical_seo', text.substring(0, 40), typeof f === 'string' ? { finding: f } : f)}
          </div></div>`;
      }
    }
    if (ts.issues && ts.issues.length > 0) {
      for (const issue of ts.issues) {
        const text = typeof issue === 'string' ? issue : issue.issue || issue.finding || JSON.stringify(issue);
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <h5 class="pattern-card-title" style="flex:1;">${esc(text)}</h5>
            ${itemPushBtn('technical_seo', text.substring(0, 40), typeof issue === 'string' ? { issue } : issue)}
          </div></div>`;
      }
    }
    html += `</div></div>`;
  }

  // Priority Actions — per item
  if (json.priority_actions && json.priority_actions.length > 0) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Actions</span><h3>Priority Actions</h3></div>
      <div class="patterns-grid">`;
    for (const action of json.priority_actions) {
      const impactColor = action.impact === 'high' ? 'var(--danger)' : action.impact === 'medium' ? 'var(--warning)' : 'var(--text-dim)';
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <div style="flex:1;">
            <span class="badge" style="background:${impactColor}15;color:${impactColor};font-size:10px;">${esc(action.impact)} impact</span>
            ${action.category ? `<span class="badge" style="font-size:10px;">${esc(action.category)}</span>` : ''}
            <p style="margin-top:4px;">${esc(action.action)}</p>
          </div>
          ${itemPushBtn('priority_action', (action.action || '').substring(0, 40), action)}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Keyword Strategy
  if (json.keyword_strategy) {
    const ks = json.keyword_strategy;
    html += `<div class="report-section targeting">
      <div class="report-section-header"><span class="report-section-badge">Keywords</span><h3>Keyword Strategy</h3></div>`;

    // Primary keywords — per keyword
    if (ks.primary_keywords && ks.primary_keywords.length > 0) {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:12px;">Primary Keywords:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">`;
      for (const k of ks.primary_keywords) {
        html += `<div style="display:flex;align-items:center;gap:4px;">
          <span class="badge" style="background:var(--surface2);">${esc(k)}</span>
          ${itemPushBtn('primary_keyword', k, { keyword: k, type: 'primary' })}
        </div>`;
      }
      html += `</div></div>`;
    }

    // Keyword Gaps — per gap
    if (ks.keyword_gaps && ks.keyword_gaps.length > 0) {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:12px;">Keyword Gaps:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">`;
      for (const k of ks.keyword_gaps) {
        html += `<div style="display:flex;align-items:center;gap:4px;">
          <span class="badge" style="background:#dc262610;color:#b91c1c;">${esc(k)}</span>
          ${itemPushBtn('keyword_gap', k, { keyword: k, type: 'gap' })}
        </div>`;
      }
      html += `</div></div>`;
    }

    // Content Opportunities — per opportunity
    if (ks.content_opportunities && ks.content_opportunities.length > 0) {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:12px;">Content Opportunities:</strong>
        <div class="patterns-grid" style="margin-top:4px;">`;
      for (const opp of ks.content_opportunities) {
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <div style="flex:1;">
              <h5 class="pattern-card-title">${esc(opp.topic)}</h5>
              <span class="badge" style="font-size:10px;">${esc(opp.priority)}</span>
              <p class="text-dim" style="font-size:12px;margin-top:2px;">${esc(opp.rationale)}</p>
            </div>
            ${itemPushBtn('content_opportunity', (opp.topic || '').substring(0, 40), opp)}
          </div></div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`;
  }

  return html;
}

// ========== Competitor Intelligence Report ==========

function renderCompetitorIntelReport(r, json) {
  const compName = json.competitor_name || window._seoDisplayName || 'Competitor';

  let html = '';

  // Header
  html += `<div class="report-header">
    <div><h2>SEO Intelligence: ${esc(compName)}</h2>
    <div class="report-meta">${esc(r.website)} — ${new Date(r.analyzed_at).toLocaleString()}</div></div>
  </div>`;

  if (r.focus_instructions) {
    html += `<div class="report-section" style="background:#0891b208;border:1px solid #0891b220;">
      <div class="proposal-content"><strong>Focus:</strong> ${esc(r.focus_instructions)}</div>
    </div>`;
  }

  // Overall Effectiveness + Summary
  const score = json.overall_effectiveness || 0;
  html += `<div class="report-section clone">
    <div class="report-section-header"><span class="report-section-badge">Score</span><h3>Overall Effectiveness: ${score}/100</h3>${itemPushBtn('summary', 'summary', { summary: json.summary, overall_effectiveness: score })}</div>
    <div class="proposal-content"><p>${esc(json.summary || '')}</p></div>
  </div>`;

  // Sub-scores
  const subScores = [
    { label: 'Keyword Targeting', score: json.keyword_targeting?.effectiveness },
    { label: 'Content Strategy', score: json.content_strategy?.effectiveness },
    { label: 'Technical SEO', score: json.technical_seo_practices?.effectiveness },
    { label: 'On-Page Patterns', score: json.on_page_patterns?.effectiveness },
  ];

  html += `<div class="report-section targeting">
    <div class="report-section-header"><span class="report-section-badge">Scores</span><h3>Effectiveness Scores</h3></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">`;
  for (const s of subScores) {
    const sc = s.score || 0;
    const c = sc >= 70 ? 'var(--success)' : sc >= 40 ? 'var(--warning)' : 'var(--danger)';
    html += `<div style="flex:1;min-width:120px;text-align:center;padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:24px;font-weight:800;color:${c};">${sc}</div>
      <div style="font-size:11px;color:var(--text-dim);">${s.label}</div>
    </div>`;
  }
  html += `</div></div>`;

  // Section Takeaways — per takeaway
  const takeawaySections = [
    { label: 'Keyword Targeting', data: json.keyword_targeting },
    { label: 'Content Strategy', data: json.content_strategy },
    { label: 'Technical SEO Practices', data: json.technical_seo_practices },
    { label: 'On-Page Patterns', data: json.on_page_patterns },
  ];

  const hasTakeaways = takeawaySections.some(s => s.data?.takeaway_for_us);
  if (hasTakeaways) {
    html += `<div class="report-section hooks">
      <div class="report-section-header"><span class="report-section-badge">Takeaways</span><h3>Section Takeaways</h3></div>
      <div class="patterns-grid">`;
    for (const sec of takeawaySections) {
      if (!sec.data?.takeaway_for_us) continue;
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <div style="flex:1;">
            <h5 class="pattern-card-title" style="color:var(--primary);">${sec.label}</h5>
            <p style="margin-top:4px;">${esc(sec.data.takeaway_for_us)}</p>
          </div>
          ${itemPushBtn('takeaway', sec.label, { section: sec.label, takeaway: sec.data.takeaway_for_us })}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Content Strengths — per strength
  if (json.content_strategy?.content_strengths && json.content_strategy.content_strengths.length > 0) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Content</span><h3>Their Content Strengths</h3></div>
      <div class="patterns-grid">`;
    for (const s of json.content_strategy.content_strengths) {
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <h5 class="pattern-card-title" style="flex:1;">${esc(s)}</h5>
          ${itemPushBtn('content_strength', s.substring(0, 40), { strength: s })}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Quick Wins — per win
  if (json.competitive_advantages?.quick_wins_for_us && json.competitive_advantages.quick_wins_for_us.length > 0) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge" style="background:#16a34a20;color:#15803d;">Quick Wins</span><h3>Quick Wins for Us</h3></div>
      <div class="patterns-grid">`;
    for (const win of json.competitive_advantages.quick_wins_for_us) {
      const impactColor = win.impact === 'high' ? 'var(--danger)' : win.impact === 'medium' ? 'var(--warning)' : 'var(--text-dim)';
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <div style="flex:1;">
            <span class="badge" style="background:${impactColor}15;color:${impactColor};font-size:10px;">${esc(win.impact)} impact</span>
            <h5 class="pattern-card-title" style="margin-top:4px;">${esc(win.action)}</h5>
            ${win.details ? `<p class="text-dim" style="font-size:12px;margin-top:2px;">${esc(win.details)}</p>` : ''}
          </div>
          ${itemPushBtn('quick_win', (win.action || '').substring(0, 40), win)}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Priority Learnings — per learning
  if (json.priority_learnings && json.priority_learnings.length > 0) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Learnings</span><h3>Priority Learnings</h3></div>
      <div class="patterns-grid">`;
    for (const learning of json.priority_learnings) {
      const impactColor = learning.impact === 'high' ? 'var(--danger)' : learning.impact === 'medium' ? 'var(--warning)' : 'var(--text-dim)';
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <div style="flex:1;">
            <div style="display:flex;gap:6px;margin-bottom:4px;">
              <span class="badge" style="background:${impactColor}15;color:${impactColor};font-size:10px;">${esc(learning.impact)} impact</span>
              ${learning.category ? `<span class="badge" style="font-size:10px;">${esc(learning.category)}</span>` : ''}
            </div>
            <h5 class="pattern-card-title">${esc(learning.learning)}</h5>
            ${learning.how_to_apply ? `<p class="text-dim" style="font-size:12px;margin-top:2px;">${esc(learning.how_to_apply)}</p>` : ''}
          </div>
          ${itemPushBtn('priority_learning', (learning.learning || '').substring(0, 40), learning)}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  return html;
}

// ========== Legacy Report (old competitor schema) ==========

function renderLegacyReport(r, json) {
  const container = window._seoContainer;
  const comp = container?.competitors?.find(c => c.id === storageKey);
  const compName = comp?.name || window._seoDisplayName || 'Unknown';

  let html = '';

  // Header
  html += `<div class="report-header">
    <div><h2>SEO Analysis: ${esc(compName)}</h2>
    <div class="report-meta">${esc(r.website)} — ${new Date(r.analyzed_at).toLocaleString()}</div></div>
  </div>`;

  if (r.focus_instructions) {
    html += `<div class="report-section" style="background:#0891b208;border:1px solid #0891b220;">
      <div class="proposal-content"><strong>Focus:</strong> ${esc(r.focus_instructions)}</div>
    </div>`;
  }

  // Overall Score + Summary
  const score = json.overall_score || 0;
  html += `<div class="report-section clone">
    <div class="report-section-header"><span class="report-section-badge">Score</span><h3>Overall: ${score}/100</h3>${itemPushBtn('summary', 'summary', { summary: json.summary, overall_score: score })}</div>
    <div class="proposal-content"><p>${esc(json.summary || '')}</p></div>
  </div>`;

  // Sub-scores
  const subScores = [
    { label: 'On-Page SEO', score: json.on_page_seo?.score },
    { label: 'Technical SEO', score: json.technical_seo?.score },
    { label: 'Keyword Strategy', score: json.keyword_strategy?.score },
  ];

  html += `<div class="report-section targeting">
    <div class="report-section-header"><span class="report-section-badge">Scores</span><h3>Section Scores</h3></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">`;
  for (const s of subScores) {
    const sc = s.score || 0;
    const c = sc >= 70 ? 'var(--success)' : sc >= 40 ? 'var(--warning)' : 'var(--danger)';
    html += `<div style="flex:1;min-width:140px;text-align:center;padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:24px;font-weight:800;color:${c};">${sc}</div>
      <div style="font-size:12px;color:var(--text-dim);">${s.label}</div>
    </div>`;
  }
  html += `</div></div>`;

  // Priority Actions — per item
  if (json.priority_actions && json.priority_actions.length > 0) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Actions</span><h3>Priority Actions</h3></div>
      <div class="patterns-grid">`;
    for (const action of json.priority_actions) {
      const impactColor = action.impact === 'high' ? 'var(--danger)' : action.impact === 'medium' ? 'var(--warning)' : 'var(--text-dim)';
      html += `<div class="pattern-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <div style="flex:1;">
            <span class="badge" style="background:${impactColor}15;color:${impactColor};font-size:10px;">${esc(action.impact)} impact</span>
            ${action.category ? `<span class="badge" style="font-size:10px;">${esc(action.category)}</span>` : ''}
            <p style="margin-top:4px;">${esc(action.action)}</p>
          </div>
          ${itemPushBtn('priority_action', (action.action || '').substring(0, 40), action)}
        </div></div>`;
    }
    html += `</div></div>`;
  }

  // Keyword Strategy
  if (json.keyword_strategy) {
    const ks = json.keyword_strategy;
    html += `<div class="report-section targeting">
      <div class="report-section-header"><span class="report-section-badge">Keywords</span><h3>Keyword Strategy</h3></div>`;

    if (ks.primary_keywords && ks.primary_keywords.length > 0) {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:12px;">Primary Keywords:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">`;
      for (const k of ks.primary_keywords) {
        html += `<div style="display:flex;align-items:center;gap:4px;">
          <span class="badge" style="background:var(--surface2);">${esc(k)}</span>
          ${itemPushBtn('primary_keyword', k, { keyword: k, type: 'primary' })}
        </div>`;
      }
      html += `</div></div>`;
    }

    if (ks.keyword_gaps && ks.keyword_gaps.length > 0) {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:12px;">Keyword Gaps:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">`;
      for (const k of ks.keyword_gaps) {
        html += `<div style="display:flex;align-items:center;gap:4px;">
          <span class="badge" style="background:#dc262610;color:#b91c1c;">${esc(k)}</span>
          ${itemPushBtn('keyword_gap', k, { keyword: k, type: 'gap' })}
        </div>`;
      }
      html += `</div></div>`;
    }

    if (ks.content_opportunities && ks.content_opportunities.length > 0) {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:12px;">Content Opportunities:</strong>
        <div class="patterns-grid" style="margin-top:4px;">`;
      for (const opp of ks.content_opportunities) {
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <div style="flex:1;">
              <h5 class="pattern-card-title">${esc(opp.topic)}</h5>
              <span class="badge" style="font-size:10px;">${esc(opp.priority)}</span>
              <p class="text-dim" style="font-size:12px;margin-top:2px;">${esc(opp.rationale)}</p>
            </div>
            ${itemPushBtn('content_opportunity', (opp.topic || '').substring(0, 40), opp)}
          </div></div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`;
  }

  // Competitive SEO Insights (legacy schema)
  if (json.competitive_seo_insights) {
    const ci = json.competitive_seo_insights;

    // Strengths — per item
    if (ci.strengths && ci.strengths.length > 0) {
      html += `<div class="report-section hooks">
        <div class="report-section-header"><span class="report-section-badge" style="background:#16a34a20;color:#15803d;">Strengths</span><h3>Competitor Strengths</h3></div>
        <div class="patterns-grid">`;
      for (const s of ci.strengths) {
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <h5 class="pattern-card-title" style="flex:1;">${esc(s)}</h5>
            ${itemPushBtn('seo_strength', s.substring(0, 40), { strength: s })}
          </div></div>`;
      }
      html += `</div></div>`;
    }

    // Weaknesses — per item
    if (ci.weaknesses && ci.weaknesses.length > 0) {
      html += `<div class="report-section" style="border-left:3px solid var(--danger);">
        <div class="report-section-header"><span class="report-section-badge" style="background:#dc262615;color:#b91c1c;">Weaknesses</span><h3>Competitor Weaknesses</h3></div>
        <div class="patterns-grid">`;
      for (const w of ci.weaknesses) {
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <h5 class="pattern-card-title" style="flex:1;">${esc(w)}</h5>
            ${itemPushBtn('seo_weakness', w.substring(0, 40), { weakness: w })}
          </div></div>`;
      }
      html += `</div></div>`;
    }

    // Opportunities — per item
    if (ci.opportunities_for_us && ci.opportunities_for_us.length > 0) {
      html += `<div class="report-section actions">
        <div class="report-section-header"><span class="report-section-badge">Opportunities</span><h3>Opportunities for Us</h3></div>
        <div class="patterns-grid">`;
      for (const opp of ci.opportunities_for_us) {
        html += `<div class="pattern-card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
            <div style="flex:1;">
              <h5 class="pattern-card-title">${esc(opp.opportunity)}</h5>
              <div style="display:flex;gap:4px;margin-top:4px;">
                <span class="badge" style="font-size:10px;">Impact: ${esc(opp.impact)}</span>
                <span class="badge" style="font-size:10px;">Effort: ${esc(opp.effort)}</span>
              </div>
              ${opp.details ? `<p class="text-dim" style="font-size:12px;margin-top:2px;">${esc(opp.details)}</p>` : ''}
            </div>
            ${itemPushBtn('seo_opportunity', (opp.opportunity || '').substring(0, 40), opp)}
          </div></div>`;
      }
      html += `</div></div>`;
    }
  }

  return html;
}

// ========== Utilities ==========

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
