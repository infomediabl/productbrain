/**
 * Proposal Report — STANDALONE PAGE
 * Page: proposal.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, proposalId, loadProposal(), renderProposal(),
 *   renderBriefCard(), renderPromptLog(), togglePromptLog(), toggleCollapsible(),
 *   copyText(), esc(), escAttr(), renderMarkdown()
 * API: GET /api/containers/:id/proposals/:proposalId, GET /api/containers/:id
 *
 * Displays a full Magic AI proposal report with creative briefs, evidence-based patterns,
 * fresh ideas, and a collapsible prompt log. Supports copy-to-clipboard and print.
 */
// Standalone proposal report page — follows competitor-analysis.js pattern
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const proposalId = params.get('pid');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('proposal-content');
const backLink = document.getElementById('back-link');
const printBtn = document.getElementById('print-btn');

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !proposalId) {
  statusText.textContent = 'Missing parameters (cid, pid).';
  statusBar.className = 'status-bar failed';
} else {
  loadProposal();
}

async function loadProposal() {
  try {
    const res = await fetch(`/api/containers/${containerId}/proposals/${proposalId}`);
    if (!res.ok) {
      statusText.textContent = 'Proposal not found.';
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      return;
    }
    const proposal = await res.json();

    if (proposal.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'Proposal is still generating...';
      setTimeout(loadProposal, 3000);
      return;
    }

    if (proposal.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Proposal failed: ${proposal.result?.error || 'Unknown error'}`;
      return;
    }

    // Completed — fetch container for product context
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    let container = null;
    try {
      const cRes = await fetch(`/api/containers/${containerId}`);
      if (cRes.ok) container = await cRes.json();
    } catch (e) {}

    const containerName = container?.name || 'Proposal';
    statusText.textContent = `Magic AI — ${containerName} — ${new Date(proposal.created_at).toLocaleString()}`;
    printBtn.style.display = '';

    renderProposal(proposal, container);
  } catch (e) {
    statusText.textContent = 'Error loading proposal.';
    statusBar.className = 'status-bar failed';
    statusBar.querySelector('.spinner').style.display = 'none';
  }
}

function renderProposal(proposal, container) {
  const json = proposal.result?.json_data;
  if (!json) {
    contentDiv.innerHTML = `<div class="card"><div class="proposal-content">${renderMarkdown(proposal.result?.full_text || 'No data')}</div></div>`;
    renderPromptLog(proposal.result?.prompt_log);
    return;
  }

  const product = container?.my_product || {};
  let html = '';

  // 1. Report Header
  html += `<div class="report-header">
    <div>
      <h2>Magic AI Report</h2>
      <div class="report-meta">${esc(container?.name || '')} — ${new Date(proposal.created_at).toLocaleDateString()}</div>
    </div>
  </div>`;

  // 2. Product Context
  if (product.name) {
    html += `<div class="report-section targeting">
      <div class="report-section-header"><span class="report-section-badge">Context</span><h3>Product Context</h3></div>
      <div class="proposal-content">
        <p><strong>Product:</strong> ${esc(product.name)}</p>
        ${product.website ? `<p><strong>Website:</strong> <a href="${esc(product.website)}" target="_blank">${esc(product.website)}</a></p>` : ''}
        ${product.site_type ? `<p><strong>Type:</strong> ${esc(product.site_type)}</p>` : ''}
        ${product.unique_angle ? `<p><strong>Unique Angle:</strong> ${esc(product.unique_angle)}</p>` : ''}
        ${product.target_audience ? `<p><strong>Target Audience:</strong> ${esc(product.target_audience)}</p>` : ''}
      </div>
    </div>`;
  }

  // 3. Creative Briefs
  const briefs = json.creative_briefs || [];
  if (briefs.length > 0) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Briefs</span><h3>Creative Briefs (${briefs.length})</h3></div>`;
    for (const b of briefs) {
      html += renderBriefCard(b);
    }
    html += `</div>`;
  }

  // 4. Evidence-Based Patterns
  const patterns = json.patterns?.evidence_based || [];
  if (patterns.length > 0) {
    html += `<div class="report-section hooks">
      <div class="report-section-header"><span class="report-section-badge">Patterns</span><h3>Evidence-Based Patterns</h3></div>
      <div class="patterns-grid">`;
    for (const p of patterns) {
      html += `<div class="pattern-card">
        <h5 class="pattern-card-title">${esc(p.title)}</h5>
        <div class="pattern-card-body"><p>${esc(p.description)}</p></div>
      </div>`;
    }
    html += `</div></div>`;
  }

  // 5. Fresh Ideas
  const freshIdeas = json.patterns?.fresh_ideas || [];
  if (freshIdeas.length > 0) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Ideas</span><h3>Fresh Ideas</h3></div>
      <div class="patterns-grid">`;
    for (const idea of freshIdeas) {
      html += `<div class="fresh-idea-card">
        <h5 class="fresh-idea-card-title">${esc(idea.title)}</h5>
        <div class="fresh-idea-card-body"><p>${esc(idea.what_to_do)}</p></div>
      </div>`;
    }
    html += `</div></div>`;
  }

  contentDiv.innerHTML = html;

  // 6. Prompt Log
  renderPromptLog(proposal.result?.prompt_log);
}

function renderBriefCard(b) {
  const priorityClass = (b.priority || '').toLowerCase();
  const priorityColors = { high: '#dc2626', medium: '#d97706', low: '#6b7085' };
  const priorityColor = priorityColors[priorityClass] || '#6b7085';

  // Demographics display
  let demoText = '';
  if (b.target_demographics) {
    if (typeof b.target_demographics === 'string') {
      demoText = b.target_demographics;
    } else {
      const parts = [];
      if (b.target_demographics.age_groups) parts.push(b.target_demographics.age_groups);
      if (b.target_demographics.gender) parts.push(b.target_demographics.gender);
      if (b.target_demographics.top_countries) parts.push(b.target_demographics.top_countries);
      demoText = parts.join(' · ');
    }
  }

  let html = `<div class="clone-card">
    <div class="clone-card-body">
      <div class="clone-card-badges">
        <span class="clone-card-badge brief-number">#${b.number || '?'}</span>
        ${b.priority ? `<span class="clone-card-badge" style="background:${priorityColor}15;color:${priorityColor};">${esc(b.priority)}</span>` : ''}
        <span class="clone-card-badge media-type">${esc(b.source_type || 'IMAGE')}</span>
        ${b.source_competitor ? `<span class="clone-card-badge competitor">${esc(b.source_competitor)}</span>` : ''}
        ${b.running_days ? `<span class="clone-card-badge long-running">${b.running_days} days</span>` : ''}
      </div>
      <h4 class="clone-card-title">${esc(b.title)}</h4>`;

  // Why this ad
  if (b.why_this_ad) {
    html += `<div class="clone-card-text"><strong>Why this ad:</strong> ${esc(b.why_this_ad)}</div>`;
  }

  // Original copy
  const oc = b.original_copy || {};
  if (oc.headline || oc.text || oc.cta) {
    html += `<div class="clone-card-original">
      <div class="clone-card-original-label">Original Ad Copy</div>
      <dl>
        ${oc.headline ? `<dt>Headline</dt><dd>${esc(oc.headline)}</dd>` : ''}
        ${oc.text ? `<dt>Text</dt><dd>${esc(oc.text)}</dd>` : ''}
        ${oc.cta ? `<dt>CTA</dt><dd>${esc(oc.cta)}</dd>` : ''}
      </dl>
    </div>`;
  }

  // Adapted version
  const av = b.adapted_version || {};
  if (av.headline || av.ad_text || av.cta) {
    html += `<div style="margin-top:12px;">
      <strong style="font-size:13px;color:var(--primary);">Our Adapted Version</strong>
      ${av.platform ? `<span class="clone-card-badge" style="margin-left:8px;background:var(--primary)10;color:var(--primary);">${esc(av.platform)}</span>` : ''}
      <dl style="margin-top:6px;">
        ${av.headline ? `<dt style="font-size:12px;color:var(--text-dim);margin-top:6px;">Headline</dt><dd style="font-size:14px;font-weight:600;">${esc(av.headline)}</dd>` : ''}
        ${av.ad_text ? `<dt style="font-size:12px;color:var(--text-dim);margin-top:6px;">Ad Text</dt><dd style="font-size:13px;">${esc(av.ad_text)}</dd>` : ''}
        ${av.cta ? `<dt style="font-size:12px;color:var(--text-dim);margin-top:6px;">CTA</dt><dd style="font-size:13px;font-weight:500;">${esc(av.cta)}</dd>` : ''}
      </dl>
    </div>`;
  }

  // Target demographics
  if (demoText) {
    html += `<div style="margin-top:10px;font-size:13px;"><strong>Target:</strong> ${esc(demoText)}</div>`;
  }

  // Ad format
  if (b.ad_format) {
    html += `<div style="margin-top:6px;font-size:13px;color:var(--text-dim);"><strong>Format:</strong> ${esc(b.ad_format)}</div>`;
  }

  // Image prompt (collapsible)
  if (b.image_prompt) {
    const promptId = `img-prompt-${b.number || Math.random().toString(36).slice(2)}`;
    html += `<div style="margin-top:10px;">
      <button class="btn btn-ghost btn-sm" onclick="toggleCollapsible('${promptId}')">Image Prompt</button>
      <div id="${promptId}" style="display:none;margin-top:6px;padding:10px;background:var(--surface2);border-radius:6px;font-size:13px;line-height:1.5;">${esc(b.image_prompt)}</div>
    </div>`;
  }

  // Source ad links
  const links = b.source_ad_links || [];
  if (links.length > 0) {
    html += `<div class="clone-card-source">${links.map((l, i) => `<a href="${esc(l)}" target="_blank">Source Ad${links.length > 1 ? ` ${i + 1}` : ''}</a>`).join(' ')}</div>`;
  }

  // Copy buttons
  html += `<div class="clone-prompt-buttons">`;
  if (av.headline) html += `<button class="clone-btn" onclick="copyText(this, ${escAttr(av.headline)})">Copy Headline</button>`;
  if (av.ad_text) html += `<button class="clone-btn" onclick="copyText(this, ${escAttr(av.ad_text)})">Copy Ad Text</button>`;
  if (b.image_prompt) html += `<button class="clone-btn" onclick="copyText(this, ${escAttr(b.image_prompt)})">Copy Image Prompt</button>`;
  html += `</div>`;

  html += `</div></div>`;
  return html;
}

// --- Prompt Log ---

function renderPromptLog(promptLog) {
  if (!promptLog) return;
  const section = document.getElementById('prompt-log-section');
  const content = document.getElementById('prompt-log-content');
  section.style.display = '';
  content.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-word;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;font-size:12px;max-height:600px;overflow:auto;">${esc(promptLog)}</pre>`;
}

function togglePromptLog() {
  const content = document.getElementById('prompt-log-content');
  const btn = document.getElementById('prompt-log-toggle');
  if (content.style.display === 'none') {
    content.style.display = '';
    btn.textContent = 'Hide Prompt Log';
  } else {
    content.style.display = 'none';
    btn.textContent = 'Show Prompt Log';
  }
}

function toggleCollapsible(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

// --- Copy ---

function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('copy-toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  });
}

// --- Utilities ---

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escAttr(str) {
  return JSON.stringify(String(str || ''));
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
