/**
 * DesireSpring UI
 * Page: desire-spring.html (standalone)
 * Globals used: none (self-contained)
 * Globals defined: showNewForm, selectIdea, saveInstructions, deleteCurrentIdea
 * API: POST /api/desire-spring, GET /api/desire-spring, GET /api/desire-spring/:id,
 *      POST /api/desire-spring/:id/save, DELETE /api/desire-spring/:id
 *
 * Two-column layout: idea list sidebar + detail/form panel.
 */

const API = '/api/desire-spring';
let allIdeas = [];
let currentIdeaId = null;

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ========== Load & Render ==========

async function loadIdeas() {
  try {
    const res = await fetch(API);
    allIdeas = await res.json();
  } catch {
    allIdeas = [];
  }
  renderIdeaList();

  // Check URL param
  const params = new URLSearchParams(window.location.search);
  const urlIdea = params.get('ideaId');
  if (urlIdea && allIdeas.find(i => i.id === urlIdea)) {
    selectIdea(urlIdea);
  }
}

function renderIdeaList() {
  const el = document.getElementById('idea-list');
  if (allIdeas.length === 0) {
    el.innerHTML = '<div class="ds-empty-list">No ideas yet. Click "+ New Idea" to get started.</div>';
    return;
  }

  el.innerHTML = allIdeas.map(idea => {
    const active = idea.id === currentIdeaId ? ' active' : '';
    const title = esc(idea.title || idea.idea_text.slice(0, 50));
    const date = new Date(idea.created_at).toLocaleDateString();
    const badge = statusBadge(idea.status, idea.saved_as);
    return `<div class="ds-idea-item${active}" onclick="selectIdea('${idea.id}')">
      <div class="ds-idea-title">${title}</div>
      <div class="ds-idea-meta"><span>${date}</span>${badge}</div>
    </div>`;
  }).join('');
}

function statusBadge(status, savedAs) {
  if (savedAs) return '<span class="ds-badge saved">Saved</span>';
  if (status === 'generating') return '<span class="ds-badge generating">Generating</span>';
  if (status === 'completed') return '<span class="ds-badge completed">Ready</span>';
  if (status === 'failed') return '<span class="ds-badge failed">Failed</span>';
  return '';
}

// ========== New Idea Form ==========

function showNewForm() {
  currentIdeaId = null;
  renderIdeaList();
  const panel = document.getElementById('main-panel');
  panel.innerHTML = `<div class="ds-form">
    <h3>New Feature Idea</h3>
    <textarea id="idea-input" placeholder="Describe the feature you want to add to ProductBrain...&#10;&#10;Example: Add a Semrush integration that pulls organic keyword rankings for competitor domains and stores them alongside existing scrape data."></textarea>
    <div class="ds-form-actions">
      <button class="btn-sm" onclick="cancelForm()">Cancel</button>
      <button class="btn-sm btn-primary" onclick="submitIdea()">Generate Instructions</button>
    </div>
  </div>`;
  document.getElementById('idea-input').focus();
}

function cancelForm() {
  currentIdeaId = null;
  showPlaceholder();
}

function showPlaceholder() {
  document.getElementById('main-panel').innerHTML = `<div class="ds-placeholder">
    <h3>No idea selected</h3>
    <p>Click "+ New Idea" to submit a feature idea, or select one from the list.</p>
  </div>`;
}

// ========== Submit & Poll ==========

async function submitIdea() {
  const input = document.getElementById('idea-input');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const panel = document.getElementById('main-panel');
  panel.innerHTML = `<div class="ds-status">
    <div class="ds-spinner"></div>
    <span>Submitting idea...</span>
  </div>`;

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_text: text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submit failed');

    currentIdeaId = data.idea_id;
    panel.innerHTML = `<div class="ds-status">
      <div class="ds-spinner"></div>
      <span>Generating implementation instructions... This may take 30-60 seconds.</span>
    </div>`;

    await loadIdeas();
    pollIdea(data.idea_id);
  } catch (err) {
    panel.innerHTML = `<div class="ds-error">Error: ${esc(err.message)}</div>`;
  }
}

function pollIdea(ideaId) {
  setTimeout(async () => {
    try {
      const res = await fetch(`${API}/${ideaId}`);
      const idea = await res.json();

      if (idea.status === 'generating') {
        if (currentIdeaId === ideaId) {
          pollIdea(ideaId);
        }
        return;
      }

      // Refresh list
      await loadIdeas();

      // If still viewing this idea, show detail
      if (currentIdeaId === ideaId) {
        renderDetail(idea);
      }
    } catch {
      // Retry on network error
      if (currentIdeaId === ideaId) pollIdea(ideaId);
    }
  }, 3000);
}

// ========== Select & Render Detail ==========

async function selectIdea(ideaId) {
  currentIdeaId = ideaId;
  renderIdeaList();

  const panel = document.getElementById('main-panel');
  panel.innerHTML = `<div class="ds-status">
    <div class="ds-spinner"></div>
    <span>Loading...</span>
  </div>`;

  try {
    const res = await fetch(`${API}/${ideaId}`);
    if (!res.ok) throw new Error('Idea not found');
    const idea = await res.json();

    if (idea.status === 'generating') {
      panel.innerHTML = `<div class="ds-status">
        <div class="ds-spinner"></div>
        <span>Generating implementation instructions... This may take 30-60 seconds.</span>
      </div>`;
      pollIdea(ideaId);
      return;
    }

    renderDetail(idea);
  } catch (err) {
    panel.innerHTML = `<div class="ds-error">Error: ${esc(err.message)}</div>`;
  }
}

function renderDetail(idea) {
  const panel = document.getElementById('main-panel');

  if (idea.status === 'failed') {
    const errMsg = idea.result?.error || 'Unknown error';
    panel.innerHTML = `<div class="ds-detail">
      <div class="ds-detail-header">
        <h3>${esc(idea.title || 'Failed')}</h3>
        <div class="ds-detail-actions">
          <button class="btn-sm btn-danger" onclick="deleteCurrentIdea()">Delete</button>
        </div>
      </div>
      <div class="ds-idea-text-preview">${esc(idea.idea_text)}</div>
      <div class="ds-error">Generation failed: ${esc(errMsg)}</div>
    </div>`;
    return;
  }

  const jsonData = idea.result?.json_data;
  const rawInstructions = jsonData?.instructions_md || idea.result?.full_text || '';
  const instructions = rawInstructions.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  const suggestedFilename = jsonData?.filename_suggestion || '010.txt';
  const savedAs = idea.saved_as;

  panel.innerHTML = `<div class="ds-detail">
    <div class="ds-detail-header">
      <h3>${esc(idea.title || 'Untitled')}</h3>
      <div class="ds-detail-actions">
        ${savedAs
          ? `<span class="ds-badge saved" style="font-size:13px;">Saved as ${esc(savedAs)}</span>`
          : `<button class="btn-sm btn-primary" onclick="saveInstructions()">Save to File</button>`
        }
        <button class="btn-sm btn-danger" onclick="deleteCurrentIdea()">Delete</button>
      </div>
    </div>
    <div class="ds-idea-text-preview">${esc(idea.idea_text)}</div>
    <div class="ds-filename-row">
      <label>Filename:</label>
      <input type="text" id="ds-filename" value="${esc(savedAs || suggestedFilename)}" ${savedAs ? 'disabled' : ''}>
    </div>
    <textarea class="ds-editor" id="ds-editor" ${savedAs ? 'readonly' : ''}>${esc(instructions)}</textarea>
    <div id="ds-save-msg"></div>
  </div>`;
}

// ========== Save & Delete ==========

async function saveInstructions() {
  const filename = document.getElementById('ds-filename')?.value.trim();
  const content = document.getElementById('ds-editor')?.value.trim();
  const msgEl = document.getElementById('ds-save-msg');

  if (!filename) {
    msgEl.innerHTML = '<div class="ds-error" style="margin-top:10px">Please enter a filename.</div>';
    return;
  }
  if (!content) {
    msgEl.innerHTML = '<div class="ds-error" style="margin-top:10px">No content to save.</div>';
    return;
  }

  try {
    const res = await fetch(`${API}/${currentIdeaId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');

    msgEl.innerHTML = `<div class="ds-save-success">Saved to instructions/${esc(data.saved_as)}</div>`;

    // Refresh to update UI state
    await loadIdeas();
    selectIdea(currentIdeaId);
  } catch (err) {
    msgEl.innerHTML = `<div class="ds-error" style="margin-top:10px">Error: ${esc(err.message)}</div>`;
  }
}

async function deleteCurrentIdea() {
  if (!currentIdeaId) return;
  if (!confirm('Delete this idea? This cannot be undone.')) return;

  try {
    await fetch(`${API}/${currentIdeaId}`, { method: 'DELETE' });
    currentIdeaId = null;
    showPlaceholder();
    await loadIdeas();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ========== Init ==========
loadIdeas();
