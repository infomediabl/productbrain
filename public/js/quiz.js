/**
 * Quiz Generator UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderQuizzes(), openQuizModal(), closeQuizModal(), submitQuizModal(),
 *   pollQuizGeneration(), previewQuiz(), viewQuizData()
 * API: POST /api/containers/:id/quiz, GET /api/containers/:id/quizzes/:quizId
 *
 * Creates interactive quiz pages (text-only or with media). Supports topic, difficulty,
 * question count, and redirect URL config. View data in modal or preview full HTML.
 */
// ========== Quiz Generator ==========

function renderQuizzes() {
  const el = document.getElementById('quiz-list');
  if (!el) return;
  const quizzes = container.quizzes || [];

  if (quizzes.length === 0) {
    el.innerHTML = '<div class="text-dim" style="padding:8px 0;">No quizzes yet. Generate one to create an interactive quiz page.</div>';
    return;
  }

  const sorted = [...quizzes].reverse();
  el.innerHTML = sorted.map(q => {
    const isGenerating = q.status === 'generating' || q.status === 'quality_check';
    const isDone = q.status === 'completed';
    const quizType = q.result?.quiz_type || '';
    const topic = q.result?.json_data?.title || q.result?.topic || '';

    return `
      <div class="proposal-item">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="status-dot ${isGenerating ? 'running' : q.status}"></span>
          <span>${new Date(q.created_at).toLocaleString()}</span>
          <span class="text-dim">${q.status}</span>
          ${quizType ? `<span class="badge" style="background:#ec489915;color:#db2777;">${esc(quizType.replace(/_/g, ' '))}</span>` : ''}
          ${topic ? `<span class="text-dim" style="font-size:12px;">${esc(topic)}</span>` : ''}
          ${isGenerating ? `<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="text-dim">${q.status === 'quality_check' ? 'Checking quality...' : 'Generating...'}</span>` : ''}
          ${isDone ? `
            <button class="btn btn-primary btn-sm" onclick="viewQuizData('${q.id}')" style="margin-left:auto;">View</button>
            <button class="btn btn-ghost btn-sm" onclick="previewQuiz('${q.id}')">Preview HTML</button>
          ` : ''}
          ${q.status === 'failed' ? `<span class="text-dim" style="font-size:12px;color:var(--danger);">${esc(q.result?.error || 'Failed')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openQuizModal() {
  document.getElementById('quiz-topic').value = '';
  document.querySelector('input[name="quiz-type"][value="text_only"]').checked = true;
  document.getElementById('quiz-num-questions').value = '5';
  document.getElementById('quiz-difficulty').value = 'medium';
  document.getElementById('quiz-instructions').value = '';
  document.getElementById('quiz-redirect-url').value = '';
  document.getElementById('quiz-redirect-text').value = 'Continue';
  document.getElementById('quiz-modal').style.display = 'flex';
}

function closeQuizModal() {
  document.getElementById('quiz-modal').style.display = 'none';
}

async function submitQuizModal() {
  const topic = document.getElementById('quiz-topic').value.trim();
  if (!topic) { alert('Please enter a quiz topic'); return; }

  const quiz_type = document.querySelector('input[name="quiz-type"]:checked').value;
  const num_questions = parseInt(document.getElementById('quiz-num-questions').value) || 5;
  const difficulty = document.getElementById('quiz-difficulty').value;
  const custom_instructions = document.getElementById('quiz-instructions').value.trim();
  const redirect_url = document.getElementById('quiz-redirect-url').value.trim();
  const redirect_button_text = document.getElementById('quiz-redirect-text').value.trim() || 'Continue';
  closeQuizModal();

  const btn = document.getElementById('quiz-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const statusEl = document.getElementById('quiz-status');
  statusEl.style.display = 'block';
  statusEl.className = 'status-bar running';
  statusEl.innerHTML = '<div class="spinner"></div><span>AI is generating your quiz...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz_type, num_questions, difficulty, topic, custom_instructions, redirect_url, redirect_button_text }),
    });
    const data = await res.json();
    if (res.ok) {
      pollQuizGeneration(data.quiz_id);
    } else {
      statusEl.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Generate Quiz';
      alert(data.error || 'Failed to start');
    }
  } catch (e) {
    statusEl.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Generate Quiz';
    alert('Failed to start quiz generation');
  }
}

async function pollQuizGeneration(quizId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/quizzes/${quizId}`);
    const data = await res.json();

    if (data.status === 'completed' || data.status === 'failed') {
      document.getElementById('quiz-status').style.display = 'none';
      document.getElementById('quiz-btn').disabled = false;
      document.getElementById('quiz-btn').textContent = 'Generate Quiz';
      await loadContainer();
      return;
    }
    const statusEl = document.getElementById('quiz-status');
    if (data.status === 'quality_check') {
      statusEl.innerHTML = '<div class="spinner"></div><span>Checking quiz quality...</span>';
    }
    setTimeout(() => pollQuizGeneration(quizId), 3000);
  } catch (e) {
    setTimeout(() => pollQuizGeneration(quizId), 5000);
  }
}

function previewQuiz(quizId) {
  const quizzes = container.quizzes || [];
  const quiz = quizzes.find(q => q.id === quizId);
  if (!quiz || !quiz.result) { alert('Quiz not found'); return; }

  const json = quiz.result.json_data;
  const htmlContent = json?.full_html || quiz.result.full_text || '<h1>No HTML content</h1>';

  const win = window.open('', '_blank');
  win.document.write(htmlContent);
  win.document.close();
}

function viewQuizData(quizId) {
  const quizzes = container.quizzes || [];
  const quiz = quizzes.find(q => q.id === quizId);
  if (!quiz || !quiz.result) { alert('Quiz not found'); return; }

  const r = quiz.result;
  const json = r.json_data;
  let html = `<h3 style="margin-bottom:4px;">Quiz: ${esc(json?.title || 'Untitled')}</h3>`;
  html += `<div class="text-dim" style="font-size:12px;margin-bottom:16px;">${new Date(r.generated_at).toLocaleString()} — ${esc(r.quiz_type?.replace(/_/g, ' ') || '')} — ${r.num_questions} questions — ${esc(r.difficulty || '')}</div>`;

  if (!json) {
    html += `<div class="proposal-content" style="white-space:pre-wrap;font-size:13px;">${esc(r.full_text)}</div>`;
  } else {
    if (json.description) {
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;">${esc(json.description)}</div>`;
    }

    // Questions
    const questions = json.questions || [];
    for (const q of questions) {
      const correctOpt = (q.options || []).find(o => o.id === q.correct_answer);
      html += `<div style="background:var(--surface2);border:1px solid var(--border);border-left:3px solid #ec4899;border-radius:6px;padding:12px 16px;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Q${q.id}: ${esc(q.question)}</div>
        ${q.image_prompt ? `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;"><strong>Image:</strong> ${esc(q.image_description || q.image_prompt)}</div>` : ''}
        ${q.video_description ? `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;"><strong>Video:</strong> ${esc(q.video_description)}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
          ${(q.options || []).map(o => `<div style="font-size:13px;padding:4px 8px;border-radius:4px;${o.id === q.correct_answer ? 'background:#16a34a15;border:1px solid #16a34a30;' : 'background:var(--surface);border:1px solid var(--border);'}">
            <strong>${esc(o.id)}.</strong> ${esc(o.text)} ${o.id === q.correct_answer ? '<span style="color:var(--success);font-weight:600;">&#10003; Correct</span>' : ''}
          </div>`).join('')}
        </div>
        ${q.explanation ? `<div style="font-size:12px;color:var(--text-dim);font-style:italic;">${esc(q.explanation)}</div>` : ''}
      </div>`;
    }

    // End page info
    if (json.end_page) {
      html += `<div style="margin-top:16px;padding:12px 16px;background:#ec489908;border:1px solid #ec489920;border-radius:6px;">
        <strong style="font-size:13px;">End Page:</strong> ${esc(json.end_page.title || 'Quiz Complete!')}
        ${json.end_page.redirect_url ? `<br><span class="text-dim" style="font-size:12px;">Redirect: ${esc(json.end_page.redirect_url)} — Button: "${esc(json.end_page.redirect_button_text || 'Continue')}"</span>` : ''}
      </div>`;
    }

    // HTML available note
    if (json.full_html) {
      html += `<div style="margin-top:12px;padding:12px 16px;background:#4f46e508;border:1px solid #4f46e520;border-radius:6px;">
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

