/**
 * Prompt Generator UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderPrompts(), generatePromptsFromProposal(), pollPromptStatus()
 * API: POST /api/containers/:id/generate-prompts, GET /api/containers/:id/prompts/:promptId
 * Interacts with: proposal.js (generatePromptsFromProposal triggered from proposal list)
 *
 * Generates ad copy prompts from a completed proposal. Lists generated prompt sets
 * and links to prompts.html for viewing individual prompts.
 */
// ========== AGENT 4: Prompt Generator ==========

function renderPrompts() {
  const el = document.getElementById('prompts-list');
  const prompts = container.generated_prompts || [];

  if (prompts.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No generated prompts yet. Generate a proposal first, then click "Generate Prompts".</div>';
    return;
  }

  const sorted = [...prompts].reverse();
  el.innerHTML = sorted.map(p => `
    <div class="proposal-item">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="status-dot ${p.status === 'generating' ? 'running' : p.status}"></span>
        <span>${new Date(p.created_at).toLocaleString()}</span>
        <span class="text-dim">${p.status}</span>
        ${p.status === 'completed' ? `${promptSentLink(p.result)}<a href="/prompts.html?cid=${containerId}&promptId=${p.id}" class="btn btn-primary btn-sm" style="margin-left:auto;">View Prompts</a>` : ''}
        ${p.status === 'generating' ? '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">Generating...</span>' : ''}
        ${p.status === 'failed' ? `<span class="text-dim" style="font-size:12px;">${esc(p.result?.error || 'Failed')}</span>` : ''}
      </div>
    </div>
  `).join('');
}

async function generatePromptsFromProposal(proposalId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/generate-prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposalId }),
    });
    const data = await res.json();
    if (res.ok) {
      await loadContainer();
      pollPromptStatus(data.prompt_id);
    } else {
      alert(data.error || 'Failed');
    }
  } catch (e) {
    alert('Failed to start prompt generation');
  }
}

async function pollPromptStatus(promptId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/prompts/${promptId}`);
    const data = await res.json();
    if (data.status === 'completed' || data.status === 'failed') {
      await loadContainer();
      return;
    }
    setTimeout(() => pollPromptStatus(promptId), 3000);
  } catch (e) {
    setTimeout(() => pollPromptStatus(promptId), 5000);
  }
}

