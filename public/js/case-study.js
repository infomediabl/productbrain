/**
 * Case Study Analyzer UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderCaseStudies(), openCaseStudyModal(), closeCaseStudyModal(),
 *   toggleCsSourceInput(), submitCaseStudy(), pollCaseStudy(), deleteCaseStudy()
 * API: POST /api/containers/:id/case-studies,
 *   GET /api/containers/:id/case-studies/:studyId,
 *   DELETE /api/containers/:id/case-studies/:studyId
 *
 * Uploads and analyzes competitor case studies from text, PDF, image, or URL sources.
 * Extracts key metrics, strategies, strengths/weaknesses, and lessons.
 * Links to standalone report page for full view with push-to-context.
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
    const isFailed = s.status === 'failed';
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
          <span style="margin-left:auto;display:flex;gap:6px;align-items:center;">
            ${isDone ? `<a href="/case-study.html?cid=${containerId}&studyId=${s.id}" class="btn btn-primary btn-sm">View Report</a>` : ''}
            ${isFailed ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(s.result?.error || 'Failed')}</span>` : ''}
            ${!isGenerating ? `<button class="btn btn-ghost btn-sm" onclick="deleteCaseStudy('${s.id}')" style="font-size:11px;padding:2px 8px;color:var(--danger);" title="Delete case study">Delete</button>` : ''}
          </span>
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

async function deleteCaseStudy(studyId) {
  if (!confirm('Delete this case study? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/containers/${containerId}/case-studies/${studyId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadContainer();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to delete');
    }
  } catch (e) {
    alert('Failed to delete case study');
  }
}
