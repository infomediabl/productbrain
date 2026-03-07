/**
 * Agent Info UI
 * Page: container.html (loaded after settings.js)
 * Globals used: none (self-contained modal)
 * Globals defined: showAgentInfo(agentId)
 * API: GET /api/agent-info
 *
 * Shows a modal with agent metadata (code, category, model, consumes, outputs, prompt summary)
 * when the user clicks the info icon on any agent header.
 */

let _agentInfoCache = null;

async function showAgentInfo(agentId) {
  const modal = document.getElementById('agent-info-modal');
  const body = document.getElementById('agent-info-body');
  if (!modal || !body) return;

  body.innerHTML = '<div class="text-dim" style="text-align:center;padding:24px;">Loading...</div>';
  modal.style.display = 'flex';

  try {
    if (!_agentInfoCache) {
      const res = await fetch('/api/agent-info');
      if (!res.ok) throw new Error('Failed to fetch agent info');
      _agentInfoCache = await res.json();
    }

    const agent = _agentInfoCache.find(a => a.id === agentId);
    if (!agent) {
      body.innerHTML = '<div class="text-dim" style="text-align:center;padding:24px;">Agent not found</div>';
      return;
    }

    const code = (agent.code || '').toUpperCase().replace(/^AG/, 'AG-').replace(/AG-0*/, 'AG-0');
    const formattedCode = agent.code ? 'AG-' + agent.code.replace(/^ag/, '').replace(/^0+/, match => match) : '—';

    let html = '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
    html += row('Code', formattedCode);
    html += row('Name', agent.name || '—');
    html += row('Category', agent.category || '—');
    html += row('Model', agent.model || '—');

    // Inputs
    if (agent.inputs && agent.inputs.length > 0) {
      const inputsList = agent.inputs.map(inp => {
        let s = '<code style="font-size:12px;background:var(--surface2);padding:1px 5px;border-radius:3px;">' + (inp.name || '?') + '</code>';
        if (inp.type) s += ' <span class="text-dim">(' + inp.type + ')</span>';
        if (inp.required) s += ' <span style="color:var(--danger);font-size:11px;">required</span>';
        return s;
      }).join(', ');
      html += row('Inputs', inputsList);
    }

    if (agent.consumes && agent.consumes.length > 0) {
      const consumesList = agent.consumes.map(c => {
        const parts = [];
        if (c.agent) parts.push(c.agent);
        if (c.dataKey) parts.push(c.dataKey);
        else if (c.key) parts.push(c.key);
        return parts.join(' → ') || JSON.stringify(c);
      }).join(', ');
      html += row('Consumes', consumesList);
    } else {
      html += row('Consumes', '<span class="text-dim">None</span>');
    }

    if (agent.outputs) {
      const outParts = [];
      if (agent.outputs.storageKey) outParts.push('storage: ' + agent.outputs.storageKey);
      if (agent.outputs.dataType) outParts.push('type: ' + agent.outputs.dataType);
      html += row('Outputs', outParts.join(', ') || '—');
    } else {
      html += row('Outputs', '<span class="text-dim">None</span>');
    }

    if (agent.prompt_summary) {
      html += row('Prompt Summary', agent.prompt_summary);
    }

    if (agent.prompt_template) {
      html += '<tr><td colspan="2" style="padding:8px 0 0;">'
        + '<details><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--primary);">Show Full Prompt Template</summary>'
        + '<pre style="white-space:pre-wrap;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:6px;font-size:11px;max-height:400px;overflow-y:auto;">'
        + esc(agent.prompt_template)
        + '</pre></details></td></tr>';
    }

    html += '</table>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div style="color:var(--error);padding:16px;">Error: ' + err.message + '</div>';
  }
}

function row(label, value) {
  return '<tr><td style="padding:6px 12px 6px 0;font-weight:600;white-space:nowrap;vertical-align:top;color:var(--text-dim);">' + label + '</td><td style="padding:6px 0;">' + value + '</td></tr>';
}

function closeAgentInfoModal() {
  const modal = document.getElementById('agent-info-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Show the actual prompt sent to AI for a specific run.
 * Call with the prompt text string.
 */
function showPromptSent(promptText) {
  const modal = document.getElementById('prompt-sent-modal');
  const body = document.getElementById('prompt-sent-body');
  if (!modal || !body) return;
  body.textContent = promptText || 'No prompt data available.';
  modal.style.display = 'flex';
}

function closePromptSentModal() {
  const modal = document.getElementById('prompt-sent-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Returns HTML for a small "View Prompt" link if result has prompt_sent.
 * Stores prompts in a global cache and references by index.
 * Usage in render functions: html += promptSentLink(result);
 */
const _promptSentCache = [];

function promptSentLink(result) {
  if (!result) return '';
  const prompt = result.prompt_sent || result.prompt_log || (result._meta && result._meta.prompt_sent);
  if (!prompt) return '';
  const idx = _promptSentCache.length;
  _promptSentCache.push(prompt);
  return ` <a href="#" onclick="_showCachedPrompt(${idx});return false" style="font-size:11px;color:var(--primary);opacity:0.7;text-decoration:none;" title="View the exact prompt sent to AI">View Prompt</a>`;
}

function _showCachedPrompt(idx) {
  showPromptSent(_promptSentCache[idx]);
}

/**
 * Show the prompt template for an agent directly (P icon click).
 * Fetches agent info if not cached, then displays prompt_template in the prompt-sent modal.
 */
async function showPromptTemplate(agentId) {
  try {
    if (!_agentInfoCache) {
      const res = await fetch('/api/agent-info');
      if (!res.ok) throw new Error('Failed to fetch agent info');
      _agentInfoCache = await res.json();
    }
    const agent = _agentInfoCache.find(a => a.id === agentId);
    if (!agent || !agent.prompt_template) {
      showPromptSent('No prompt template available for this agent.');
      return;
    }
    showPromptSent(agent.prompt_template);
  } catch (err) {
    showPromptSent('Error loading prompt template: ' + err.message);
  }
}
