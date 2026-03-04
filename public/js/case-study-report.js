/**
 * Case Study Report — STANDALONE PAGE
 * Page: case-study.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, studyId, loadStudy(), pushItem(),
 *   registerPushItem(), pushRegisteredItem(), renderReport(), renderMarkdown(), esc()
 * API: GET /api/containers/:id/case-studies/:studyId,
 *   GET /api/containers/:id, POST /api/containers/:id/context
 *
 * Displays a full case study analysis report with per-section Push buttons
 * that send sections to the container context collector.
 */
const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const studyId = params.get('studyId');

const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const contentDiv = document.getElementById('report-content');
const backLink = document.getElementById('back-link');

if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !studyId) {
  statusText.textContent = 'Missing parameters.';
  statusBar.className = 'status-bar failed';
} else {
  loadStudy();
}

async function loadStudy() {
  try {
    const res = await fetch(`/api/containers/${containerId}/case-studies/${studyId}`);
    if (!res.ok) {
      statusText.textContent = 'Case study not found.';
      statusBar.className = 'status-bar failed';
      return;
    }
    const study = await res.json();

    if (study.status === 'generating') {
      statusBar.className = 'status-bar running';
      statusText.textContent = 'Analysis is still generating...';
      setTimeout(loadStudy, 3000);
      return;
    }

    if (study.status === 'failed') {
      statusBar.className = 'status-bar failed';
      statusBar.querySelector('.spinner').style.display = 'none';
      statusText.textContent = `Analysis failed: ${study.result?.error || 'Unknown'}`;
      return;
    }

    // Completed
    statusBar.className = 'status-bar completed';
    statusBar.querySelector('.spinner').style.display = 'none';

    const sourceName = study.result?.source_name || study.meta?.source_name || '';
    const compName = study.result?.json_data?.competitor_name || sourceName || 'Untitled';
    statusText.textContent = `Case Study: ${compName} — ${new Date(study.created_at).toLocaleString()}`;
    renderReport(study);
  } catch (e) {
    statusText.textContent = 'Error loading case study.';
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
        source_type: 'case_study',
        source_id: studyId,
        section_name: `Case Study - ${label}`,
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

async function pushAllSections(btn) {
  btn.disabled = true;
  btn.textContent = 'Pushing...';
  const json = window._studyJson;
  if (!json) { btn.textContent = 'Push All'; btn.disabled = false; return; }

  const sections = [];
  if (json.summary) sections.push({ key: 'summary', label: 'Summary', content: { summary: json.summary } });
  if (json.strategies_used?.length) sections.push({ key: 'strategies', label: 'Strategies', content: { strategies_used: json.strategies_used } });
  if (json.lessons_for_us?.length) sections.push({ key: 'lessons', label: 'Lessons', content: { lessons_for_us: json.lessons_for_us } });
  if (json.strengths?.length) sections.push({ key: 'strengths', label: 'Strengths', content: { strengths: json.strengths } });
  if (json.weaknesses?.length) sections.push({ key: 'weaknesses', label: 'Weaknesses', content: { weaknesses: json.weaknesses } });
  if (json.key_metrics?.length) sections.push({ key: 'metrics', label: 'Key Metrics', content: { key_metrics: json.key_metrics } });

  try {
    for (const s of sections) {
      await fetch(`/api/containers/${containerId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'case_study',
          source_id: studyId,
          section_name: `Case Study - ${s.label}`,
          content: s.content,
        }),
      });
    }
    btn.textContent = `Pushed ${sections.length} sections!`;
    btn.style.color = 'var(--success)';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Push All Key Sections'; btn.style.color = ''; }, 2500);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Push All Key Sections';
    btn.style.color = '';
  }
}

// ========== Render ==========

function tryParseFullText(text) {
  if (!text) return null;
  const trimmed = text.trim();
  // Try fence extraction + repair (handles unescaped quotes)
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const candidates = [];
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  const fb = trimmed.indexOf('{'), lb = trimmed.lastIndexOf('}');
  if (fb >= 0 && lb > fb) candidates.push(trimmed.substring(fb, lb + 1));
  for (const raw of candidates) {
    try { return JSON.parse(raw); } catch (e) { /* try repair */ }
    // Repair: trailing commas + unescaped quotes
    let fixed = raw.replace(/,(\s*[}\]])/g, '$1');
    const chars = [...fixed], out = [];
    let inStr = false;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i], prev = i > 0 ? chars[i - 1] : '';
      if (ch === '"' && prev !== '\\') {
        if (!inStr) { inStr = true; out.push(ch); }
        else {
          let j = i + 1;
          while (j < chars.length && ' \t\n\r'.includes(chars[j])) j++;
          const nx = j < chars.length ? chars[j] : '';
          if (':,}]'.includes(nx) || nx === '') { inStr = false; out.push(ch); }
          else { out.push('\\', '"'); }
        }
      } else { out.push(ch); }
    }
    try { return JSON.parse(out.join('')); } catch (e) { /* next candidate */ }
  }
  return null;
}

function renderReport(study) {
  let json = study.result?.json_data;
  if (!json && study.result?.full_text) {
    json = tryParseFullText(study.result.full_text);
  }
  if (!json) {
    // Strip code fences for cleaner display
    let text = study.result?.full_text || 'No data';
    text = text.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g, '$1');

    const sourceName = study.result?.source_name || study.meta?.source_name || '';
    contentDiv.innerHTML = `
      <div class="report-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
        <div>
          <h2>Case Study${sourceName ? ': ' + esc(sourceName) : ''}</h2>
          <div class="report-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span>${new Date(study.created_at).toLocaleString()}</span>
            <span class="badge" style="background:#d9770615;color:#d97706;">Text only (no structured data)</span>
          </div>
        </div>
      </div>
      <div class="card"><div class="proposal-content" style="line-height:1.7;font-size:14px;">${renderMarkdown(text)}</div></div>`;
    return;
  }

  window._studyJson = json;
  window._pushItems = [];

  const r = study.result;
  const sourceType = (r.source_type || study.meta?.source_type || '').toUpperCase();
  const sourceName = r.source_name || study.meta?.source_name || '';
  const compName = json.competitor_name || sourceName || 'Untitled';

  let html = '';

  // Header + Push All
  html += `<div class="report-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
    <div>
      <h2>Case Study: ${esc(compName)}</h2>
      <div class="report-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span>${new Date(study.created_at).toLocaleString()}</span>
        ${sourceType ? `<span class="badge" style="background:#6366f115;color:#6366f1;">${esc(sourceType)}</span>` : ''}
        ${sourceName ? `<span class="text-dim" style="font-size:12px;">${esc(sourceName)}</span>` : ''}
      </div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="pushAllSections(this)">Push All Key Sections</button>
  </div>`;

  // Summary
  if (json.summary) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Summary</span><h3>Summary</h3>${itemPushBtn('summary', 'Summary', { summary: json.summary })}</div>
      <div class="proposal-content"><p>${esc(json.summary)}</p></div>
    </div>`;
  }

  // Key Metrics
  if (json.key_metrics && json.key_metrics.length) {
    html += `<div class="report-section hooks">
      <div class="report-section-header"><span class="report-section-badge">Metrics</span><h3>Key Metrics</h3></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;padding:8px 0;">`;
    for (const m of json.key_metrics) {
      html += `<div style="background:#16a34a10;border:1px solid #16a34a25;border-radius:8px;padding:10px 14px;min-width:150px;flex:1;max-width:250px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px;">
          <div style="font-size:20px;font-weight:700;color:var(--success);">${esc(m.value)}</div>
          ${itemPushBtn('metric', m.metric, { metric: m.metric, value: m.value, context: m.context })}
        </div>
        <div style="font-size:12px;font-weight:600;margin-top:2px;">${esc(m.metric)}</div>
        ${m.context ? `<div class="text-dim" style="font-size:11px;margin-top:2px;">${esc(m.context)}</div>` : ''}
      </div>`;
    }
    html += `</div></div>`;
  }

  // Strategies Used
  if (json.strategies_used && json.strategies_used.length) {
    html += `<div class="report-section targeting">
      <div class="report-section-header"><span class="report-section-badge">Strategies</span><h3>Strategies Used</h3></div>
      <div class="patterns-grid">`;
    for (const s of json.strategies_used) {
      const effectColor = s.effectiveness === 'high' ? '#16a34a' : s.effectiveness === 'medium' ? '#d97706' : s.effectiveness === 'low' ? '#dc2626' : '#6b7280';
      html += `<div class="pattern-card" style="border-left:3px solid ${effectColor};">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
          <h5 class="pattern-card-title" style="flex:1;">${esc(s.strategy)}
            <span style="font-size:11px;color:${effectColor};font-weight:400;margin-left:6px;">${esc(s.effectiveness || '')}</span>
          </h5>
          ${itemPushBtn('strategy', s.strategy, { strategy: s.strategy, description: s.description, effectiveness: s.effectiveness })}
        </div>
        <div class="pattern-card-body"><p>${esc(s.description || '')}</p></div>
      </div>`;
    }
    html += `</div></div>`;
  }

  // Channels Used
  if (json.channels_used && json.channels_used.length) {
    html += `<div class="report-section actions">
      <div class="report-section-header"><span class="report-section-badge">Channels</span><h3>Channels Used</h3>${itemPushBtn('channels', 'Channels', { channels_used: json.channels_used })}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;">`;
    for (const ch of json.channels_used) {
      html += `<span class="badge" style="background:#6366f115;color:#6366f1;">${esc(ch)}</span>`;
    }
    html += `</div></div>`;
  }

  // Target Audience
  if (json.target_audience) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Audience</span><h3>Target Audience</h3>${itemPushBtn('audience', 'Target Audience', { target_audience: json.target_audience })}</div>
      <div class="proposal-content"><p>${esc(json.target_audience)}</p></div>
    </div>`;
  }

  // Timeline
  if (json.timeline) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Timeline</span><h3>Timeline</h3>${itemPushBtn('timeline', 'Timeline', { timeline: json.timeline })}</div>
      <div class="proposal-content"><p>${esc(json.timeline)}</p></div>
    </div>`;
  }

  // Strengths & Weaknesses
  if ((json.strengths && json.strengths.length) || (json.weaknesses && json.weaknesses.length)) {
    html += `<div class="report-section hooks">
      <div class="report-section-header"><span class="report-section-badge">SWOT</span><h3>Strengths & Weaknesses</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:8px 0;">`;

    // Strengths column
    html += `<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="color:var(--success);margin:0;">Strengths</h4>
        ${json.strengths?.length ? itemPushBtn('strengths', 'Strengths', { strengths: json.strengths }) : ''}
      </div>`;
    for (const s of (json.strengths || [])) {
      html += `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border);">+ ${esc(s)}</div>`;
    }
    html += `</div>`;

    // Weaknesses column
    html += `<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="color:var(--danger);margin:0;">Weaknesses</h4>
        ${json.weaknesses?.length ? itemPushBtn('weaknesses', 'Weaknesses', { weaknesses: json.weaknesses }) : ''}
      </div>`;
    for (const w of (json.weaknesses || [])) {
      html += `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border);">- ${esc(w)}</div>`;
    }
    html += `</div>`;

    html += `</div></div>`;
  }

  // Lessons & Takeaways
  if (json.lessons_for_us && json.lessons_for_us.length) {
    html += `<div class="report-section" style="border-left:3px solid #7c3aed;">
      <div class="report-section-header"><span class="report-section-badge" style="background:#7c3aed20;color:#7c3aed;">Lessons</span><h3>Lessons & Takeaways</h3>${itemPushBtn('lessons', 'Lessons', { lessons_for_us: json.lessons_for_us })}</div>
      <div style="background:#7c3aed08;border:1px solid #7c3aed20;border-radius:8px;padding:12px 16px;">`;
    for (const lesson of json.lessons_for_us) {
      html += `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border);">${esc(lesson)}</div>`;
    }
    html += `</div></div>`;
  }

  // Notable Quotes
  if (json.quotes && json.quotes.length) {
    html += `<div class="report-section clone">
      <div class="report-section-header"><span class="report-section-badge">Quotes</span><h3>Notable Quotes</h3>${itemPushBtn('quotes', 'Quotes', { quotes: json.quotes })}</div>
      <div style="padding:8px 0;">`;
    for (const q of json.quotes) {
      html += `<blockquote style="border-left:3px solid var(--primary);padding-left:12px;margin:0 0 10px 0;font-size:13px;font-style:italic;color:var(--text-dim);">"${esc(q)}"</blockquote>`;
    }
    html += `</div></div>`;
  }

  contentDiv.innerHTML = html;
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = esc(text);

  // Headings (largest to smallest)
  html = html.replace(/^#### (.+)$/gm, '<h5 style="margin:16px 0 8px;">$1</h5>');
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:18px 0 8px;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:20px 0 10px;">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin:24px 0 12px;">$1</h2>');

  // Horizontal rules
  html = html.replace(/^-{3,}$/gm, '<hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<uli>$1</uli>');
  html = html.replace(/((?:<uli>.*<\/uli>\n?)+)/g, (m) =>
    '<ul style="margin:8px 0;padding-left:20px;">' + m.replace(/<uli>/g, '<li>').replace(/<\/uli>/g, '</li>') + '</ul>');

  // Numbered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<nli>$1</nli>');
  html = html.replace(/((?:<nli>.*<\/nli>\n?)+)/g, (m) =>
    '<ol style="margin:8px 0;padding-left:20px;">' + m.replace(/<nli>/g, '<li>').replace(/<\/nli>/g, '</li>') + '</ol>');

  // Paragraphs and line breaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  return '<p>' + html + '</p>';
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
