/**
 * Container Chat UI
 * Page: container.html (loaded after container.js)
 * Globals used: containerId, esc() — from container.js
 * Globals defined: sendChatMessage(), appendChatMessage(), appendTypingIndicator(),
 *   removeTypingIndicator(), renderChatMarkdown()
 * API: POST /api/containers/:id/chat
 *
 * Provides chat interface for asking questions about container data.
 * Session-only history (not persisted). Renders basic markdown in assistant replies.
 */
// ========== Container Chat ==========

const chatHistory = [];

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const sendBtn = document.getElementById('chat-send-btn');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  // Render user message
  appendChatMessage('user', message);
  chatHistory.push({ role: 'user', content: message });

  // Show typing indicator
  const typingId = appendTypingIndicator();

  try {
    const res = await fetch(`/api/containers/${containerId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chatHistory.slice(0, -1) }),
    });

    removeTypingIndicator(typingId);

    if (!res.ok) {
      const err = await res.json();
      appendChatMessage('assistant', `Error: ${err.error || 'Failed to get response'}`);
    } else {
      const data = await res.json();
      appendChatMessage('assistant', data.response);
      chatHistory.push({ role: 'assistant', content: data.response });
    }
  } catch (e) {
    removeTypingIndicator(typingId);
    appendChatMessage('assistant', 'Error: Could not reach the server.');
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    input.focus();
  }
}

function appendChatMessage(role, content) {
  const messagesDiv = document.getElementById('chat-messages');
  const isUser = role === 'user';

  const bubble = document.createElement('div');
  bubble.style.cssText = `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:8px;`;

  const inner = document.createElement('div');
  inner.style.cssText = `max-width:85%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.6;${
    isUser
      ? 'background:var(--primary);color:white;border-bottom-right-radius:4px;'
      : 'background:var(--surface2);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:4px;'
  }`;

  if (!isUser) {
    inner.innerHTML = renderChatMarkdown(content);
  } else {
    inner.textContent = content;
  }

  bubble.appendChild(inner);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendTypingIndicator() {
  const messagesDiv = document.getElementById('chat-messages');
  const id = 'typing-' + Date.now();
  const bubble = document.createElement('div');
  bubble.id = id;
  bubble.style.cssText = 'display:flex;justify-content:flex-start;margin-bottom:8px;';
  bubble.innerHTML = `<div style="padding:8px 16px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px;font-size:13px;color:var(--text-dim);">
    <span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span>Thinking...
  </div>`;
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function renderChatMarkdown(text) {
  if (!text) return '';
  let html = esc(text);
  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h5 style="margin:8px 0 4px;font-size:13px;">$1</h5>');
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 6px;font-size:15px;">$1</h3>');
  // Bold/italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>');
  // List items
  html = html.replace(/^- (.+)$/gm, '<li style="margin-bottom:2px;">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul style="margin:4px 0;padding-left:20px;">$1</ul>');
  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:2px;">$1</li>');
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p style="margin:6px 0;">');
  html = html.replace(/\n/g, '<br>');
  return '<p style="margin:4px 0;">' + html + '</p>';
}
