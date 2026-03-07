/**
 * Quick Questions UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderQuestions()
 * API: POST /api/containers/:id/questions, GET /api/containers/:id/questions/:id
 *
 * Shows a textarea to ask questions about the project, with AI answers below.
 */

let questionPollTimer = null;

function renderQuestions() {
  const list = document.getElementById('questions-list');
  if (!list) return;

  const questions = container.questions || [];
  if (questions.length === 0) {
    list.innerHTML = '';
    return;
  }

  const sorted = [...questions].reverse();
  list.innerHTML = sorted.map(q => {
    const date = new Date(q.created_at).toLocaleString();
    const isGenerating = q.status === 'generating';
    const isDone = q.status === 'completed';
    const isFailed = q.status === 'failed';

    let answerHtml = '';
    if (isGenerating) {
      answerHtml = '<div style="padding:8px 0;"><span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> <span class="text-dim">Thinking...</span></div>';
      setTimeout(() => pollQuestion(q.id), 2000);
    } else if (isDone && q.result?.answer) {
      const confidence = q.result.confidence || '';
      const confColor = confidence === 'high' ? 'var(--success)' : confidence === 'low' ? 'var(--danger)' : 'var(--warning)';
      answerHtml = `
        <div style="padding:8px 0 4px;font-size:14px;line-height:1.6;color:var(--text);">${esc(q.result.answer)}</div>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;">
          ${confidence ? `<span style="color:${confColor};">Confidence: ${confidence}</span>` : ''}
          ${promptSentLink(q.result)}
        </div>`;
    } else if (isFailed) {
      answerHtml = `<div style="padding:4px 0;font-size:12px;color:var(--danger);">Failed: ${esc(q.result?.error || 'Unknown')}</div>`;
    }

    return `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <strong style="font-size:13px;color:var(--primary);">Q:</strong>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:500;">${esc(q.question)}</div>
            <span class="text-dim" style="font-size:11px;">${date}</span>
          </div>
        </div>
        ${answerHtml}
      </div>`;
  }).join('');
}

async function submitQuestion() {
  const textarea = document.getElementById('question-input');
  const question = textarea.value.trim();
  if (!question) return;

  textarea.value = '';
  textarea.disabled = true;
  document.getElementById('question-submit-btn').disabled = true;

  try {
    const res = await fetch(`/api/containers/${containerId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (res.ok) {
      // Add placeholder to container data and re-render
      if (!container.questions) container.questions = [];
      container.questions.push({ id: data.question_id, created_at: new Date().toISOString(), status: 'generating', question, result: null });
      renderQuestions();
    }
  } catch (err) {
    // ignore
  }

  textarea.disabled = false;
  document.getElementById('question-submit-btn').disabled = false;
}

async function pollQuestion(questionId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/questions/${questionId}`);
    if (!res.ok) return;
    const q = await res.json();
    if (q.status !== 'generating') {
      // Update in container data
      const idx = (container.questions || []).findIndex(x => x.id === questionId);
      if (idx >= 0) container.questions[idx] = q;
      renderQuestions();
    } else {
      setTimeout(() => pollQuestion(questionId), 3000);
    }
  } catch { /* ignore */ }
}
