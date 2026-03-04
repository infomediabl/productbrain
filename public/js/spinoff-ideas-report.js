/**
 * SpinOff Ideas Report — STANDALONE PAGE
 * Page: spinoff-ideas.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, ideaId, loadIdea(), pushItem(),
 *   registerPushItem(), pushRegisteredItem(), pushAllIdeas(), renderReport(), esc()
 * API: GET /api/containers/:id/spinoff-ideas/:ideaId,
 *   GET /api/containers/:id, POST /api/containers/:id/context
 *
 * Displays a full spin-off ideas report with per-idea Push buttons
 * that send ideas to the container context collector.
 */
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const ideaId = params.get('ideaId');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('report-content');
const backLink = document.getElementById('back-link');

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !ideaId) {
  statusText.textContent = 'Missing parameters.';
  statusBar.className = 'status-bar failed';
} else {
  loadIdea();
}

async function loadIdea() {
  try {
    const res = await fetch(`/api/containers/${containerId}/spinoff-ideas/${ideaId}`);
    if (!res.ok) {
      statusText.textContent = 'Spin-off ideas not found.';
      statusBar.className = 'status-bar failed';
      return;
    }
    const idea = await res.json();

    if (idea.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'AI is generating spin-off ideas...';
      setTimeout(loadIdea, 3000);
      return;
    }

    if (idea.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Generation failed: ${idea.result?.error || 'Unknown'}`;
      return;
    }

    // Completed
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    const ideaCount = idea.result?.json_data?.spinoff_ideas?.length || 0;
    statusText.textContent = `SpinOff Ideas — ${ideaCount} idea${ideaCount !== 1 ? 's' : ''} — ${new Date(idea.created_at).toLocaleString()}`;
    renderReport(idea);
  } catch (e) {
    statusText.textContent = 'Error loading spin-off ideas.';
    statusBar.className = 'status-bar failed';
  }
}

// ========== Push to Context ==========

async function pushItem(sectionKey, label, content, btn) {
  btn.disabled = true;
  btn.textContent = 'Pushed!';
  btn.style.color = 'var(--success)';

  try {
    await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'spinoff_ideas',
        source_id: ideaId,
        section_name: `SpinOff Ideas - ${label}`,
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

function itemPushBtn(sectionKey, label, content) {
  const idx = registerPushItem(sectionKey, label, content);
  return `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${idx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;" title="Push to Container Context">Push</button>`;
}

async function pushAllIdeas(btn) {
  btn.disabled = true;
  btn.textContent = 'Pushing...';
  const json = window._ideaJson;
  if (!json) { btn.textContent = 'Push All Ideas'; btn.disabled = false; return; }

  const sections = [];

  // Landscape summary
  if (json.landscape_summary) {
    sections.push({ key: 'landscape', label: 'Landscape Summary', content: { landscape_summary: json.landscape_summary } });
  }

  // Each idea
  for (const si of (json.spinoff_ideas || [])) {
    sections.push({
      key: `idea_${si.idea_name}`,
      label: si.idea_name,
      content: {
        idea_name: si.idea_name,
        description: si.description,
        why_it_could_work: si.why_it_could_work,
        target_audience: si.target_audience,
        revenue_model: si.revenue_model,
        effort_estimate: si.effort_estimate,
        synergy_with_current: si.synergy_with_current,
        key_differentiators: si.key_differentiators,
        next_steps: si.next_steps,
      },
    });
  }

  try {
    for (const s of sections) {
      await fetch(`/api/containers/${containerId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'spinoff_ideas',
          source_id: ideaId,
          section_name: `SpinOff Ideas - ${s.label}`,
          content: s.content,
        }),
      });
    }
    btn.textContent = `Pushed ${sections.length} sections!`;
    btn.style.color = 'var(--success)';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Push All Ideas'; btn.style.color = ''; }, 2500);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Push All Ideas';
    btn.style.color = '';
  }
}

// ========== Render ==========

function renderReport(idea) {
  const json = idea.result?.json_data;
  if (!json) {
    contentDiv.innerHTML = `<div class="card"><div class="proposal-content">${renderMarkdown(idea.result?.full_text || 'No data')}</div></div>`;
    return;
  }

  window._ideaJson = json;
  window._pushItems = [];

  let html = '';

  // Header + Push All
  html += `<div class="report-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
    <div>
      <h2>SpinOff Ideas</h2>
      <div class="report-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span>${new Date(idea.created_at).toLocaleString()}</span>
        <span class="badge" style="background:#7c3aed15;color:#7c3aed;">${(json.spinoff_ideas || []).length} ideas</span>
      </div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="pushAllIdeas(this)">Push All Ideas</button>
  </div>`;

  // Landscape Summary
  if (json.landscape_summary) {
    const ls = json.landscape_summary;
    html += `<div class="report-section clone">
      <div class="report-section-header">
        <span class="report-section-badge">Landscape</span>
        <h3>Market Landscape</h3>
        ${itemPushBtn('landscape', 'Landscape Summary', { landscape_summary: ls })}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:8px 0;">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:2px;">Market</div>
          <div style="font-size:14px;">${esc(ls.market_type || 'N/A')}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:2px;">Current Product</div>
          <div style="font-size:14px;">${esc(ls.current_product || 'N/A')}</div>
        </div>
      </div>`;

    if (ls.transferable_assets && ls.transferable_assets.length > 0) {
      html += `<div style="margin-top:8px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">Transferable Assets</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${ls.transferable_assets.map(a => `<span class="badge" style="background:#16a34a15;color:#15803d;">${esc(a)}</span>`).join('')}
        </div>
      </div>`;
    }

    if (ls.adjacent_opportunities && ls.adjacent_opportunities.length > 0) {
      html += `<div style="margin-top:8px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">Adjacent Opportunities</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${ls.adjacent_opportunities.map(o => `<span class="badge" style="background:#6366f115;color:#6366f1;">${esc(o)}</span>`).join('')}
        </div>
      </div>`;
    }

    html += `</div>`;
  }

  // Spin-off Idea Cards
  const spinoffs = json.spinoff_ideas || [];
  for (let i = 0; i < spinoffs.length; i++) {
    const si = spinoffs[i];
    const effortColor = si.effort_estimate === 'low' ? '#16a34a' : si.effort_estimate === 'high' ? '#dc2626' : '#d97706';
    const effortBg = si.effort_estimate === 'low' ? '#16a34a15' : si.effort_estimate === 'high' ? '#dc262615' : '#d9770615';

    const ideaContent = {
      idea_name: si.idea_name,
      description: si.description,
      why_it_could_work: si.why_it_could_work,
      target_audience: si.target_audience,
      revenue_model: si.revenue_model,
      effort_estimate: si.effort_estimate,
      synergy_with_current: si.synergy_with_current,
      key_differentiators: si.key_differentiators,
      next_steps: si.next_steps,
    };

    html += `<div class="report-section" style="border-left:3px solid ${effortColor};">
      <div class="report-section-header" style="align-items:flex-start;">
        <span class="report-section-badge" style="background:${effortBg};color:${effortColor};">${esc(si.effort_estimate || '?')} effort</span>
        <h3 style="flex:1;">${esc(si.idea_name)}</h3>
        ${itemPushBtn(`idea_${i}`, si.idea_name, ideaContent)}
      </div>`;

    if (si.description) {
      html += `<div style="font-size:14px;color:var(--text-dim);margin-bottom:12px;font-style:italic;">${esc(si.description)}</div>`;
    }

    // Info grid
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">`;

    if (si.why_it_could_work) {
      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;">Why It Could Work</div>
        <div style="font-size:13px;">${esc(si.why_it_could_work)}</div>
      </div>`;
    }

    if (si.target_audience) {
      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;">Target Audience</div>
        <div style="font-size:13px;">${esc(si.target_audience)}</div>
      </div>`;
    }

    if (si.revenue_model) {
      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;">Revenue Model</div>
        <div style="font-size:13px;">${esc(si.revenue_model)}</div>
      </div>`;
    }

    if (si.synergy_with_current) {
      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px;">Synergy</div>
        <div style="font-size:13px;">${esc(si.synergy_with_current)}</div>
      </div>`;
    }

    html += `</div>`;

    if (si.effort_details) {
      html += `<div style="font-size:13px;margin-bottom:12px;padding:8px 12px;background:${effortBg};border-radius:6px;">
        <strong>Effort Details:</strong> ${esc(si.effort_details)}
      </div>`;
    }

    if (si.key_differentiators && si.key_differentiators.length > 0) {
      html += `<div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Key Differentiators</div>
        <ul style="margin:0;padding-left:20px;">
          ${si.key_differentiators.map(d => `<li style="font-size:13px;margin-bottom:4px;">${esc(d)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (si.next_steps && si.next_steps.length > 0) {
      html += `<div style="margin-bottom:8px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Next Steps</div>
        <ol style="margin:0;padding-left:20px;">
          ${si.next_steps.map(s => `<li style="font-size:13px;margin-bottom:4px;">${esc(s)}</li>`).join('')}
        </ol>
      </div>`;
    }

    html += `</div>`;
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
