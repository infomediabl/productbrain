/**
 * Landing Page Generator UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderLandingPages(), openLandingModal(), closeLandingModal(),
 *   submitLandingModal(), pollLandingPage(), viewLandingPage(), previewLandingPage()
 * API: POST /api/containers/:id/landing-page,
 *   GET /api/containers/:id/landing-pages/:pageId
 *
 * Generates landing pages with SEO and conversion optimization. Supports page type,
 * keyword, goal, and tone configuration. View results in modal or preview full HTML.
 */
// ========== Landing Page Generator ==========

function renderLandingPages() {
  const el = document.getElementById('landing-list');
  const pages = container.landing_pages || [];

  if (pages.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No landing pages yet. Generate one based on keyword & SEO data.</div>';
    return;
  }

  const sorted = [...pages].reverse();
  el.innerHTML = sorted.map(p => {
    const isGenerating = p.status === 'generating';
    const isDone = p.status === 'completed';
    const pageType = p.result?.json_data?.page_type || p.result?.page_type || '';

    return `
      <div class="proposal-item">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="status-dot ${isGenerating ? 'running' : p.status}"></span>
          <span>${new Date(p.created_at).toLocaleString()}</span>
          <span class="text-dim">${p.status}</span>
          ${pageType ? `<span class="badge" style="background:#06b6d415;color:#0891b2;">${esc(pageType)}</span>` : ''}
          ${isGenerating ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Generating...</span>' : ''}
          ${isDone ? `
            ${promptSentLink(p.result)}
            <button class="btn btn-primary btn-sm" onclick="viewLandingPage('${p.id}')" style="margin-left:auto;">View</button>
            <button class="btn btn-ghost btn-sm" onclick="previewLandingPage('${p.id}')">Preview HTML</button>
          ` : ''}
          ${p.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(p.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openLandingModal() {
  document.getElementById('landing-page-type').value = 'landing_page';
  document.getElementById('landing-keyword').value = '';
  document.getElementById('landing-goal').value = '';
  document.getElementById('landing-tone').value = '';
  document.getElementById('landing-instructions').value = '';
  document.getElementById('landing-modal').style.display = 'flex';
}

function closeLandingModal() {
  document.getElementById('landing-modal').style.display = 'none';
}

async function submitLandingModal() {
  const page_type = document.getElementById('landing-page-type').value;
  const target_keyword = document.getElementById('landing-keyword').value.trim();
  const page_goal = document.getElementById('landing-goal').value.trim();
  const tone = document.getElementById('landing-tone').value;
  const custom_instructions = document.getElementById('landing-instructions').value.trim();
  closeLandingModal();

  const btn = document.getElementById('landing-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('landing-status');
  statusEl.style.display = 'block';
  statusEl.className = 'status-bar running';
  statusEl.innerHTML = '<div class="spinner"></div><span>AI is generating your landing page...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/landing-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_type, target_keyword, page_goal, tone, custom_instructions }),
    });
    const data = await res.json();
    if (res.ok) {
      pollLandingPage(data.page_id);
    } else {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Generate Page';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Generate Page';
    alert('Failed to start landing page generation');
  }
}

async function pollLandingPage(pageId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/landing-pages/${pageId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('landing-status').style.display = 'none';
      document.getElementById('landing-btn').disabled = false;
      document.getElementById('landing-btn').textContent = 'Generate Page';
      await loadContainer();
      return;
    }
    setTimeout(() => pollLandingPage(pageId), 3000);
  } catch (e) {
    setTimeout(() => pollLandingPage(pageId), 5000);
  }
}

function viewLandingPage(pageId) {
  const pages = container.landing_pages || [];
  const page = pages.find(p => p.id === pageId);
  if (!page || !page.result) { alert('Landing page not found'); return; }

  const r = page.result;
  const json = r.json_data;
  let html = `<h3 style="margin-bottom:4px;">Landing Page</h3>`;
  html += `<div class="text-dim" style="font-size:12px;margin-bottom:16px;">${new Date(r.generated_at).toLocaleString()}</div>`;

  if (!json) {
    html += `<div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text)}</div>`;
  } else {
    // Page info
    if (json.page_type) html += `<span class="badge" style="background:#06b6d415;color:#0891b2;margin-bottom:12px;display:inline-block;">${esc(json.page_type)}</span> `;
    if (json.target_keyword) html += `<span class="badge" style="background:var(--surface2);margin-bottom:12px;display:inline-block;">Target: ${esc(json.target_keyword)}</span>`;
    html += `<br>`;

    // Page structure
    if (json.page_structure) {
      html += `<h4 style="font-size:14px;margin:12px 0 10px;">Page Structure</h4>`;
      const sections = json.page_structure;
      const sectionNames = ['hero', 'features', 'social_proof', 'faq', 'cta', 'benefits', 'pricing', 'testimonials'];
      for (const name of sectionNames) {
        if (sections[name]) {
          const s = sections[name];
          html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px 16px;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">${esc(name)}</div>
            <div style="font-size:13px;line-height:1.6;">${esc(typeof s === 'string' ? s : JSON.stringify(s, null, 2))}</div>
          </div>`;
        }
      }
    }

    // Conversion notes
    if (json.conversion_notes) {
      html += `<h4 style="font-size:14px;margin:16px 0 10px;">Conversion Notes</h4>`;
      if (Array.isArray(json.conversion_notes)) {
        for (const note of json.conversion_notes) {
          html += `<div style="font-size:13px;padding:6px 10px;background:#16a34a08;border:1px solid #16a34a20;border-radius:4px;margin-bottom:4px;">${esc(typeof note === 'string' ? note : note.note || JSON.stringify(note))}</div>`;
        }
      } else {
        html += `<div style="font-size:13px;line-height:1.6;">${esc(String(json.conversion_notes))}</div>`;
      }
    }

    // SEO checklist
    if (json.seo_checklist && json.seo_checklist.length > 0) {
      html += `<h4 style="font-size:14px;margin:16px 0 10px;">SEO Checklist</h4>`;
      for (const item of json.seo_checklist) {
        html += `<div style="display:flex;align-items:flex-start;gap:6px;font-size:13px;margin-bottom:4px;">
          <span style="color:var(--success);">&#10003;</span>
          <span>${esc(typeof item === 'string' ? item : item.item || JSON.stringify(item))}</span>
        </div>`;
      }
    }

    // Preview HTML button note
    if (json.full_html) {
      html += `<div style="margin-top:16px;padding:12px 16px;background:#4f46e508;border:1px solid #4f46e520;border-radius:6px;">
        <strong style="font-size:13px;">Full HTML available</strong>
        <div class="text-dim" style="font-size:12px;">Click "Preview HTML" on the list to open in a new tab.</div>
      </div>`;
    }
  }

  const modal = document.getElementById('proposal-modal');
  document.getElementById('proposal-modal-body').innerHTML = html;
  document.getElementById('modal-generate-btn').style.display = 'none';
  modal.style.display = 'flex';
}

function previewLandingPage(pageId) {
  const pages = container.landing_pages || [];
  const page = pages.find(p => p.id === pageId);
  if (!page || !page.result) { alert('Landing page not found'); return; }

  const json = page.result.json_data;
  const htmlContent = json?.full_html || page.result.full_text || '<h1>No HTML content</h1>';

  const win = window.open('', '_blank');
  win.document.write(htmlContent);
  win.document.close();
}

