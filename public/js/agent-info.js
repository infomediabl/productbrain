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

    if (agent.consumes && agent.consumes.length > 0) {
      const consumesList = agent.consumes.map(c => {
        const parts = [];
        if (c.agent) parts.push(c.agent);
        if (c.key) parts.push(c.key);
        return parts.join('.') || JSON.stringify(c);
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
