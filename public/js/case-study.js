/**
 * Case Study Analyzer UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderCaseStudies(), openCaseStudyModal(), closeCaseStudyModal(),
 *   toggleCsSourceInput(), submitCaseStudy(), pollCaseStudy(), viewCaseStudy()
 * API: POST /api/containers/:id/case-studies,
 *   GET /api/containers/:id/case-studies/:studyId
 *
 * Uploads and analyzes competitor case studies from text, PDF, image, or URL sources.
 * Extracts key metrics, strategies, strengths/weaknesses, and lessons. View in modal.
 */
// ========== Case Study Analyzer ==========

function renderCaseStudies() {
  const el = document.getElementById('casestudy-list');
  if (!el) return;
  const studies = container.case_studies || [];

  if (studies.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No case studies yet. Upload a competitor case study to extract insights.</div>';
    return;
  }

  const sorted = [...studies].reverse();
  el.innerHTML = sorted.map(s => {
    const isGenerating = s.status === 'generating';
    const isDone = s.status === 'completed';
    const compName = s.result?.json_data?.competitor_name || '';
    const sourceLabel = (s.meta?.source_type || '').toUpperCase();
    const sourceName = s.meta?.source_name || '';

    return `
      <div class="proposal-item">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="status-dot ${isGenerating ? 'running' : s.status}"></span>
          <span>${new Date(s.created_at).toLocaleString()}</span>
          <span class="text-dim">${s.status}</span>
          ${sourceLabel ? `<span class="badge" style="background:#6366f115;color:#6366f1;">${esc(sourceLabel)}</span>` : ''}
          ${sourceName ? `<span class="text-dim" style="font-size:12px;">${esc(sourceName)}</span>` : ''}
          ${compName ? `<span style="font-size:12px;font-weight:600;">${esc(compName)}</span>` : ''}
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Analyzing...</span>' : ''}
          ${isDone ? `<button class="btn btn-primary btn-sm" onclick="viewCaseStudy('${s.id}')" style="margin-left:auto;">View Insights</button>` : ''}
          ${s.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(s.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openCaseStudyModal() {
  document.getElementById('cs-source-type').value = 'txt';
  document.getElementById('cs-file-input').value = '';
  document.getElementById('cs-url-input').value = '';
  document.getElementById('cs-competitor-select').value = '';
  toggleCsSourceInput();

  // Populate competitor dropdown
  const select = document.getElementById('cs-competitor-select');
  select.innerHTML = '<option value="">None (general)</option>';
  (container.competitors || []).forEach(c => {
    select.innerHTML += `<option value="${c.id}">${esc(c.name)}</option>`;
  });

  document.getElementById('casestudy-modal').style.display = 'flex';
}

function closeCaseStudyModal() {
  document.getElementById('casestudy-modal').style.display = 'none';
}

function toggleCsSourceInput() {
  const type = document.getElementById('cs-source-type').value;
  const fileGroup = document.getElementById('cs-file-group');
  const urlGroup = document.getElementById('cs-url-group');
  if (type === 'url') {
    fileGroup.style.display = 'none';
    urlGroup.style.display = 'block';
  } else {
    fileGroup.style.display = 'block';
    urlGroup.style.display = 'none';
  }
  // Update accepted file types
  const fileInput = document.getElementById('cs-file-input');
  if (type === 'pdf') fileInput.accept = '.pdf';
  else if (type === 'txt') fileInput.accept = '.txt,.text,.md,.csv';
  else if (type === 'image') fileInput.accept = 'image/*';
}

async function submitCaseStudy() {
  const source_type = document.getElementById('cs-source-type').value;
  const competitor_id = document.getElementById('cs-competitor-select').value || null;
  let content = '';
  let source_name = '';

  if (source_type === 'url') {
    const url = document.getElementById('cs-url-input').value.trim();
    if (!url) { alert('Please enter a URL'); return; }
    content = url;
    source_name = url;
  } else {
    const fileInput = document.getElementById('cs-file-input');
    if (!fileInput.files.length) { alert('Please select a file'); return; }
    const file = fileInput.files[0];
    source_name = file.name;

    // Read file as base64
    content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Strip the data:xxx;base64, prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  closeCaseStudyModal();

  const btn = document.getElementById('casestudy-btn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  const statusEl = document.getElementById('casestudy-status');
  statusEl.style.display = 'block';
  statusEl.className = 'status-bar running';
  statusEl.innerHTML = '<div class="spinner"></div><span>AI is analyzing the case study...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/case-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type, source_name, content, competitor_id }),
    });
    const data = await res.json();
    if (res.ok) {
      pollCaseStudy(data.study_id);
    } else {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Upload Case Study';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Upload Case Study';
    alert('Failed to start case study analysis');
  }
}

async function pollCaseStudy(studyId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/case-studies/${studyId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('casestudy-status').style.display = 'none';
      document.getElementById('casestudy-btn').disabled = false;
      document.getElementById('casestudy-btn').textContent = 'Upload Case Study';
      await loadContainer();
      return;
    }
    setTimeout(() => pollCaseStudy(studyId), 3000);
  } catch (e) {
    setTimeout(() => pollCaseStudy(studyId), 5000);
  }
}

function viewCaseStudy(studyId) {
  const studies = container.case_studies || [];
  const study = studies.find(s => s.id === studyId);
  if (!study || !study.result) { alert('Case study not found'); return; }

  const r = study.result;
  const json = r.json_data;
  let html = `<h3 style="margin-bottom:4px;">Case Study: ${esc(json?.competitor_name || r.source_name || 'Untitled')}</h3>`;
  html += `<div class="text-dim" style="font-size:12px;margin-bottom:16px;">${new Date(r.analyzed_at).toLocaleString()} — ${esc(r.source_type?.toUpperCase() || '')} — ${esc(r.source_name || '')}</div>`;

  if (!json) {
    html += `<div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text)}</div>`;
  } else {
    // Summary
    if (json.summary) {
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;">${esc(json.summary)}</div>`;
    }

    // Key Metrics
    if (json.key_metrics && json.key_metrics.length) {
      html += `<h4 style="margin-bottom:8px;">Key Metrics</h4>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">`;
      for (const m of json.key_metrics) {
        html += `<div style="background:#16a34a10;border:1px solid #16a34a25;border-radius:6px;padding:8px 12px;min-width:140px;">
          <div style="font-size:18px;font-weight:700;color:var(--success);">${esc(m.value)}</div>
          <div style="font-size:12px;font-weight:600;">${esc(m.metric)}</div>
          ${m.context ? `<div class="text-dim" style="font-size:11px;">${esc(m.context)}</div>` : ''}
        </div>`;
      }
      html += `</div>`;
    }

    // Strategies Used
    if (json.strategies_used && json.strategies_used.length) {
      html += `<h4 style="margin-bottom:8px;">Strategies Used</h4>`;
      for (const s of json.strategies_used) {
        const effectColor = s.effectiveness === 'high' ? '#16a34a' : s.effectiveness === 'medium' ? '#d97706' : s.effectiveness === 'low' ? '#dc2626' : '#6b7280';
        html += `<div style="background:var(--surface2);border:1px solid var(--border);border-left:3px solid ${effectColor};border-radius:6px;padding:8px 12px;margin-bottom:6px;">
          <div style="font-size:13px;font-weight:600;">${esc(s.strategy)} <span style="font-size:11px;color:${effectColor};font-weight:400;">${esc(s.effectiveness || '')}</span></div>
          <div class="text-dim" style="font-size:12px;">${esc(s.description)}</div>
        </div>`;
      }
      html += `<div style="margin-bottom:16px;"></div>`;
    }

    // Channels
    if (json.channels_used && json.channels_used.length) {
      html += `<h4 style="margin-bottom:8px;">Channels Used</h4>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">`;
      for (const ch of json.channels_used) {
        html += `<span class="badge" style="background:#6366f115;color:#6366f1;">${esc(ch)}</span>`;
      }
      html += `</div>`;
    }

    // Target Audience
    if (json.target_audience) {
      html += `<h4 style="margin-bottom:8px;">Target Audience</h4>`;
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:13px;">${esc(json.target_audience)}</div>`;
    }

    // Timeline
    if (json.timeline) {
      html += `<h4 style="margin-bottom:8px;">Timeline</h4>`;
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:13px;">${esc(json.timeline)}</div>`;
    }

    // Strengths & Weaknesses side by side
    if ((json.strengths && json.strengths.length) || (json.weaknesses && json.weaknesses.length)) {
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">`;
      // Strengths
      html += `<div><h4 style="margin-bottom:8px;color:var(--success);">Strengths</h4>`;
      for (const s of (json.strengths || [])) {
        html += `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);">+ ${esc(s)}</div>`;
      }
      html += `</div>`;
      // Weaknesses
      html += `<div><h4 style="margin-bottom:8px;color:var(--danger);">Weaknesses</h4>`;
      for (const w of (json.weaknesses || [])) {
        html += `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);">- ${esc(w)}</div>`;
      }
      html += `</div></div>`;
    }

    // Lessons for Us
    if (json.lessons_for_us && json.lessons_for_us.length) {
      html += `<h4 style="margin-bottom:8px;">Lessons & Takeaways</h4>`;
      html += `<div style="background:#4f46e508;border:1px solid #4f46e520;border-radius:6px;padding:12px 16px;margin-bottom:16px;">`;
      for (const lesson of json.lessons_for_us) {
        html += `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border);">${esc(lesson)}</div>`;
      }
      html += `</div>`;
    }

    // Quotes
    if (json.quotes && json.quotes.length) {
      html += `<h4 style="margin-bottom:8px;">Notable Quotes</h4>`;
      for (const q of json.quotes) {
        html += `<blockquote style="border-left:3px solid var(--primary);padding-left:12px;margin:0 0 8px 0;font-size:13px;font-style:italic;color:var(--text-dim);">"${esc(q)}"</blockquote>`;
      }
    }
  }

  const modal = document.getElementById('proposal-modal');
  document.getElementById('proposal-modal-body').innerHTML = html;
  document.getElementById('modal-generate-btn').style.display = 'none';
  modal.style.display = 'flex';
}
