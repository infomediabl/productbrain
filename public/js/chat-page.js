/**
 * Container Chat — Standalone Page
 * Page: chat.html (standalone, no container.html globals)
 * API: GET /api/containers, POST /api/containers/:id/chat
 *
 * Lets user select a container, then chat with AI about that container's data.
 * Session-only history (not persisted). Renders basic markdown in assistant replies.
 */

let selectedContainerId = null;
const chatHistory = [];

// Load containers for selector
async function loadContainers() {
  try {
    const res = await fetch('/api/containers');
    const containers = await res.json();
    const select = document.getElementById('container-select');

    if (containers.length === 0) {
      select.innerHTML = '<option value="">No containers found</option>';
      return;
    }

    select.innerHTML = '<option value="">Select a container...</option>' +
      containers.map(c => `<option value="${esc(c.id)}">${esc(c.my_product?.name || c.name || c.id)}</option>`).join('');

    // Check URL param
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('cid');
    if (cid && containers.find(c => c.id === cid)) {
      select.value = cid;
      onContainerSelected();
    }
  } catch (e) {
    document.getElementById('container-select').innerHTML = '<option value="">Failed to load</option>';
  }
}

function onContainerSelected() {
  const select = document.getElementById('container-select');
  selectedContainerId = select.value || null;
  const chatArea = document.getElementById('chat-area');
  const placeholder = document.getElementById('chat-placeholder');

  if (selectedContainerId) {
    chatArea.style.display = 'flex';
    placeholder.style.display = 'none';
    // Clear previous chat
    chatHistory.length = 0;
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').focus();
  } else {
    chatArea.style.display = 'none';
    placeholder.style.display = 'block';
  }
}

async function sendChatMessage() {
  if (!selectedContainerId) return;
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const sendBtn = document.getElementById('chat-send-btn');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  appendChatMessage('user', message);
  chatHistory.push({ role: 'user', content: message });

  const typingId = appendTypingIndicator();

  try {
    const res = await fetch(`/api/containers/${selectedContainerId}/chat`, {
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
      appendChatMessage('assistant', data.response, data.prompt_sent);
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

function appendChatMessage(role, content, promptSent) {
  const messagesDiv = document.getElementById('chat-messages');
  const isUser = role === 'user';

  const bubble = document.createElement('div');
  bubble.style.cssText = `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:10px;`;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'max-width:80%;';

  const inner = document.createElement('div');
  inner.style.cssText = `padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6;${
    isUser
      ? 'background:var(--primary);color:white;border-bottom-right-radius:4px;'
      : 'background:var(--surface2);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:4px;'
  }`;

  if (!isUser) {
    inner.innerHTML = renderChatMarkdown(content);
  } else {
    inner.textContent = content;
  }

  wrapper.appendChild(inner);

  // Add "View Prompt" link for assistant messages with prompt data
  if (!isUser && promptSent && typeof showPromptSent === 'function') {
    const linkDiv = document.createElement('div');
    linkDiv.style.cssText = 'margin-top:4px;padding-left:4px;';
    const link = document.createElement('a');
    link.href = '#';
    link.style.cssText = 'font-size:11px;color:var(--primary);opacity:0.7;text-decoration:none;';
    link.title = 'View the system prompt sent to AI';
    link.textContent = 'View Prompt';
    link.onclick = (e) => { e.preventDefault(); showPromptSent(promptSent); };
    linkDiv.appendChild(link);
    wrapper.appendChild(linkDiv);
  }

  bubble.appendChild(wrapper);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendTypingIndicator() {
  const messagesDiv = document.getElementById('chat-messages');
  const id = 'typing-' + Date.now();
  const bubble = document.createElement('div');
  bubble.id = id;
  bubble.style.cssText = 'display:flex;justify-content:flex-start;margin-bottom:10px;';
  bubble.innerHTML = `<div style="padding:10px 16px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px;font-size:14px;color:var(--text-dim);">
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
  html = html.replace(/^#### (.+)$/gm, '<h5 style="margin:8px 0 4px;font-size:13px;">$1</h5>');
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:14px;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:15px;">$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>');
  html = html.replace(/^- (.+)$/gm, '<li style="margin-bottom:2px;">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul style="margin:4px 0;padding-left:20px;">$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:2px;">$1</li>');
  html = html.replace(/\n\n/g, '</p><p style="margin:6px 0;">');
  html = html.replace(/\n/g, '<br>');
  return '<p style="margin:4px 0;">' + html + '</p>';
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Init
loadContainers();
