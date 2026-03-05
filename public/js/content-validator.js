/**
 * Content Validator UI — Dual-mode standalone page
 * Page: content-validator.html
 * Globals used: none (standalone page)
 * API: POST /api/containers/:id/content-validator, GET /api/containers/:id/content-validator/:id,
 *   GET /api/containers/:id/content-validator, DELETE /api/containers/:id/content-validator/:id,
 *   GET /api/containers/:id/context, POST /api/containers/:id/context, GET /api/containers/:id
 *
 * URL scheme:
 *   ?cid=X       → form mode (validate + history)
 *   ?cid=X&vid=Y → report mode (view result + push-to-context)
 */

const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const validationId = params.get('vid');

if (!containerId) {
  document.querySelector('main .container').innerHTML = '<div class="card" style="text-align:center;padding:32px;"><h3>No container selected</h3><p class="text-dim">Open this page from a container dashboard.</p><a href="/" class="btn btn-primary" style="margin-top:16px;">Go to Dashboard</a></div>';
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Init ──
if (containerId) {
  document.getElementById('back-link').href = validationId
    ? `/content-validator.html?cid=${containerId}`
    : `/container.html?id=${containerId}`;
  document.getElementById('back-link').textContent = validationId
    ? '\u2190 Back to Validator'
    : '\u2190 Back to Container';

  fetch(`/api/containers/${containerId}`)
    .then(r => r.json())
    .then(c => {
      if (c.name) document.getElementById('page-title').textContent = `Content Validator \u2014 ${c.name}`;
    })
    .catch(() => {});

  if (validationId) {
    // Report mode
    document.getElementById('form-mode').style.display = 'none';
    document.getElementById('report-mode').style.display = 'block';
    loadReport();
  } else {
    // Form mode
    loadContext();
    loadHistory();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM MODE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Context Panel ──
let contextOpen = false;

function toggleContext() {
  contextOpen = !contextOpen;
  document.getElementById('context-panel').style.display = contextOpen ? 'block' : 'none';
  document.getElementById('context-toggle').style.transform = contextOpen ? 'rotate(180deg)' : '';
}

function loadContext() {
  fetch(`/api/containers/${containerId}/context`)
    .then(r => r.json())
    .then(items => {
      document.getElementById('context-count').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
      if (items.length === 0) {
        document.getElementById('context-list').innerHTML = '<div class="text-dim" style="text-align:center;padding:16px;font-size:13px;">No context items. Push data from analysis pages first.</div>';
        return;
      }
      const badgeColors = {
        competitor_analysis: '#f59e0b',
        seo_analysis: '#3b82f6',
        gads_analysis: '#10b981',
        keyword_strategy: '#8b5cf6',
        manual: '#6b7280',
        case_study: '#ef4444',
        content_validation: '#ec4899',
      };
      document.getElementById('context-list').innerHTML = items.map(item => {
        const color = badgeColors[item.source_type] || '#6b7280';
        const brief = esc(item.text_brief || '').substring(0, 200);
        return `<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="background:${color}20;color:${color};padding:1px 6px;border-radius:4px;font-size:11px;">${esc(item.source_type)}</span>
            <span style="font-weight:600;">${esc(item.section_name)}</span>
          </div>
          <div class="text-dim">${brief}${(item.text_brief || '').length > 200 ? '...' : ''}</div>
        </div>`;
      }).join('');
    })
    .catch(() => {
      document.getElementById('context-list').innerHTML = '<div class="text-dim" style="text-align:center;padding:16px;">Failed to load context.</div>';
    });
}

// ── Validation ──
let polling = null;

function runValidation() {
  const validate_type = document.querySelector('input[name="validate_type"]:checked')?.value;
  const content = document.getElementById('content-input').value.trim();
  const comment = document.getElementById('comment-input').value.trim();

  if (!content) {
    document.getElementById('validate-status').textContent = 'Please enter content to validate.';
    return;
  }

  const btn = document.getElementById('validate-btn');
  btn.disabled = true;
  btn.textContent = 'Validating...';
  document.getElementById('validate-status').textContent = 'Sending to AI...';

  fetch(`/api/containers/${containerId}/content-validator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ validate_type, content, comment }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        document.getElementById('validate-status').textContent = 'Error: ' + data.error;
        btn.disabled = false;
        btn.textContent = 'Validate';
        return;
      }
      document.getElementById('validate-status').textContent = 'Processing... polling for result.';
      pollForResult(data.validation_id);
    })
    .catch(err => {
      document.getElementById('validate-status').textContent = 'Request failed: ' + err.message;
      btn.disabled = false;
      btn.textContent = 'Validate';
    });
}

function pollForResult(vid) {
  if (polling) clearTimeout(polling);

  function check() {
    fetch(`/api/containers/${containerId}/content-validator/${vid}`)
      .then(r => r.json())
      .then(item => {
        if (item.status === 'completed' || item.status === 'failed') {
          document.getElementById('validate-btn').disabled = false;
          document.getElementById('validate-btn').textContent = 'Validate';
          document.getElementById('validate-status').textContent = item.status === 'completed' ? 'Done!' : 'Failed: ' + (item.result?.error || 'Unknown error');
          loadHistory();
          if (item.status === 'completed') {
            // Navigate to report
            window.location.href = `/content-validator.html?cid=${containerId}&vid=${vid}`;
          }
          return;
        }
        polling = setTimeout(check, 3000);
      })
      .catch(() => {
        polling = setTimeout(check, 3000);
      });
  }
  check();
}

// ── History ──
function loadHistory() {
  fetch(`/api/containers/${containerId}/content-validator`)
    .then(r => r.json())
    .then(items => {
      if (!items.length) {
        document.getElementById('results-list').innerHTML = '<div class="text-dim" style="text-align:center;padding:16px;font-size:13px;">No validations yet.</div>';
        return;
      }
      const verdictColors = { pass: '#10b981', needs_work: '#f59e0b', fail: '#ef4444' };
      document.getElementById('results-list').innerHTML = items.slice().reverse().map(v => {
        const color = verdictColors[v.verdict] || '#6b7280';
        const typeLabel = (v.validate_type || '').replace(/_/g, ' ');
        const date = new Date(v.created_at).toLocaleString();
        const verdictBadge = v.verdict
          ? `<span style="background:${color}20;color:${color};padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${esc(v.verdict.toUpperCase())}</span>`
          : '';
        const scoreBadge = v.score != null ? `<span style="font-weight:600;margin-left:8px;">${v.score}/10</span>` : '';
        const statusBadge = v.status === 'generating'
          ? '<span style="background:#3b82f620;color:#3b82f6;padding:2px 8px;border-radius:4px;font-size:12px;">generating...</span>'
          : v.status === 'failed'
            ? '<span style="background:#ef444420;color:#ef4444;padding:2px 8px;border-radius:4px;font-size:12px;">failed</span>'
            : '';

        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
            <span class="text-dim" style="font-size:12px;white-space:nowrap;">${esc(date)}</span>
            <span style="background:var(--surface2);padding:2px 8px;border-radius:4px;font-size:12px;">${esc(typeLabel)}</span>
            ${verdictBadge || statusBadge}
            ${scoreBadge}
          </div>
          <div style="display:flex;gap:6px;">
            ${v.status === 'completed' ? `<a href="/content-validator.html?cid=${containerId}&vid=${v.id}" class="btn btn-ghost btn-sm">View Report</a>` : ''}
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="deleteValidation('${v.id}')">Delete</button>
          </div>
        </div>`;
      }).join('');
    })
    .catch(() => {});
}

function deleteValidation(vid) {
  if (!confirm('Delete this validation?')) return;
  fetch(`/api/containers/${containerId}/content-validator/${vid}`, { method: 'DELETE' })
    .then(() => loadHistory())
    .catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT MODE
// ═══════════════════════════════════════════════════════════════════════════════

window._pushItems = [];

async function pushItem(sectionKey, label, content, btn) {
  btn.disabled = true;
  btn.textContent = 'Pushed!';
  btn.style.color = 'var(--success)';

  try {
    await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'content_validation',
        source_id: validationId,
        section_name: `Validation - ${label}`,
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

function sectionPushBtn(sectionKey, label, content) {
  const idx = registerPushItem(sectionKey, label, content);
  return `<button class="btn btn-ghost btn-sm" onclick="pushRegisteredItem(${idx}, this)" style="font-size:10px;padding:2px 6px;flex-shrink:0;" title="Push to Container Context">Push</button>`;
}

async function pushAllSections(btn) {
  btn.disabled = true;
  btn.textContent = 'Pushing...';
  const r = window._reportResult;
  if (!r) { btn.textContent = 'Push All'; btn.disabled = false; return; }

  const sections = [];
  if (r.summary) sections.push({ key: 'summary', label: 'Summary', content: { summary: r.summary } });
  if (r.strengths?.length) sections.push({ key: 'strengths', label: 'Strengths', content: { strengths: r.strengths } });
  if (r.weaknesses?.length) sections.push({ key: 'weaknesses', label: 'Weaknesses', content: { weaknesses: r.weaknesses } });
  if (r.recommendations?.length) sections.push({ key: 'recommendations', label: 'Recommendations', content: { recommendations: r.recommendations } });
  if (r.user_perspective_notes) sections.push({ key: 'user_perspective', label: 'User Perspective', content: { user_perspective_notes: r.user_perspective_notes } });

  try {
    for (const s of sections) {
      await fetch(`/api/containers/${containerId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'content_validation',
          source_id: validationId,
          section_name: `Validation - ${s.label}`,
          content: s.content,
        }),
      });
    }
    btn.textContent = 'All Pushed!';
    btn.style.color = 'var(--success)';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Push All'; btn.style.color = ''; }, 3000);
  } catch (e) {
    btn.textContent = 'Push All';
    btn.disabled = false;
  }
}

function loadReport() {
  const content = document.getElementById('report-content');
  content.innerHTML = '<div class="text-dim" style="text-align:center;padding:32px;">Loading report...</div>';

  fetch(`/api/containers/${containerId}/content-validator/${validationId}`)
    .then(res => {
      if (!res.ok) throw new Error('Not found');
      return res.json();
    })
    .then(item => {
      if (item.status === 'generating') {
        content.innerHTML = '<div class="card" style="text-align:center;padding:32px;"><h3>Still generating...</h3><p class="text-dim">This validation is still being processed. Refresh in a few seconds.</p></div>';
        return;
      }
      if (item.status === 'failed') {
        content.innerHTML = `<div class="card" style="text-align:center;padding:32px;"><h3 style="color:var(--danger);">Validation Failed</h3><p class="text-dim">${esc(item.result?.error || 'Unknown error')}</p></div>`;
        return;
      }
      renderReport(item);
    })
    .catch(() => {
      content.innerHTML = '<div class="card" style="text-align:center;padding:32px;"><h3>Validation not found</h3><p class="text-dim">This validation may have been deleted.</p><a href="/content-validator.html?cid=' + containerId + '" class="btn btn-primary" style="margin-top:12px;">Back to Validator</a></div>';
    });
}

function renderReport(item) {
  const r = item.result;
  if (!r) return;

  window._reportResult = r;
  window._pushItems = [];

  const verdictColors = { pass: '#10b981', needs_work: '#f59e0b', fail: '#ef4444' };
  const color = verdictColors[r.verdict] || '#6b7280';
  const typeLabel = (item.meta?.validate_type || r._meta?.validate_type || '').replace(/_/g, ' ');
  const date = new Date(item.created_at).toLocaleString();

  let html = '';

  // Header: verdict + score + push all
  html += `<div class="card" style="margin-bottom:24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:64px;height:64px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:24px;font-weight:700;color:${color};">${r.score || '?'}</span>
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
            <span style="background:${color}20;color:${color};padding:4px 12px;border-radius:6px;font-weight:700;font-size:14px;">${esc((r.verdict || '').toUpperCase())}</span>
            <span style="background:var(--surface2);padding:4px 10px;border-radius:6px;font-size:13px;">${esc(typeLabel)}</span>
          </div>
          <span class="text-dim" style="font-size:12px;">${esc(date)}</span>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="pushAllSections(this)">Push All to Context</button>
    </div>
  </div>`;

  // Summary
  html += `<div class="card" style="margin-bottom:16px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <h4>Summary</h4>
      ${sectionPushBtn('summary', 'Summary', { summary: r.summary })}
    </div>
    <p style="font-size:14px;line-height:1.6;">${esc(r.summary)}</p>
  </div>`;

  // Strengths
  if (r.strengths?.length) {
    html += `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="color:#10b981;">Strengths</h4>
        ${sectionPushBtn('strengths', 'Strengths', { strengths: r.strengths })}
      </div>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;">
        ${r.strengths.map(s => `<li>${esc(s)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Weaknesses
  if (r.weaknesses?.length) {
    html += `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="color:#ef4444;">Weaknesses</h4>
        ${sectionPushBtn('weaknesses', 'Weaknesses', { weaknesses: r.weaknesses })}
      </div>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;">
        ${r.weaknesses.map(w => `<li>${esc(w)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Recommendations
  if (r.recommendations?.length) {
    html += `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="color:#3b82f6;">Recommendations</h4>
        ${sectionPushBtn('recommendations', 'Recommendations', { recommendations: r.recommendations })}
      </div>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;">
        ${r.recommendations.map(rec => `<li>${esc(rec)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // User Perspective
  if (r.user_perspective_notes) {
    html += `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4>User Perspective</h4>
        ${sectionPushBtn('user_perspective', 'User Perspective', { user_perspective_notes: r.user_perspective_notes })}
      </div>
      <p style="font-size:14px;line-height:1.6;font-style:italic;color:var(--text-dim);">${esc(r.user_perspective_notes)}</p>
    </div>`;
  }

  // Prompt Log
  if (r._meta) {
    html += `<details style="margin-top:16px;">
      <summary style="cursor:pointer;font-size:13px;color:var(--text-dim);">Prompt Log</summary>
      <div class="card" style="margin-top:8px;">
        <pre style="margin:0;padding:12px;background:var(--surface2);border-radius:8px;font-size:12px;white-space:pre-wrap;max-height:400px;overflow-y:auto;">${esc(r._meta.prompt_sent || '')}</pre>
        <div class="text-dim" style="font-size:12px;margin-top:6px;">Model: ${esc(r._meta.model_used || 'unknown')} | Context items: ${r._meta.context_items_used || 0} | Notes: ${r._meta.notes_used || 0} | Product: ${esc(r._meta.product_name || 'N/A')}</div>
      </div>
    </details>`;
  }

  document.getElementById('report-content').innerHTML = html;
}
