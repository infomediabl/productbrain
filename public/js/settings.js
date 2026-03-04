/**
 * Project Settings Modal
 * Page: container.html (loaded after container.js)
 * Globals used: containerId — from container.js
 * Globals defined: loadSettings(), openSettingsModal(), closeSettingsModal(), saveSettings(), testTaboolaConnection()
 * API: GET /api/containers/:id/settings, PUT /api/containers/:id/settings
 *
 * Manages project-level settings including Facebook Pixel ID, Google Analytics ID,
 * custom head/body code injection, and Taboola API credentials.
 */
// ========== Project Settings ==========

async function loadSettings() {
  try {
    const res = await fetch(`/api/containers/${containerId}/settings`);
    if (res.ok) return await res.json();
  } catch (e) {}
  return {};
}

async function openSettingsModal() {
  const settings = await loadSettings();
  document.getElementById('settings-fb-pixel').value = settings.facebook_pixel_id || '';
  document.getElementById('settings-ga-id').value = settings.google_analytics_id || '';
  document.getElementById('settings-auto-scrape').checked = !!settings.auto_scrape_enabled;
  document.getElementById('settings-custom-head').value = settings.custom_head_code || '';
  document.getElementById('settings-custom-body').value = settings.custom_body_code || '';
  // Taboola credentials
  const taboola = settings.taboola || {};
  document.getElementById('settings-taboola-client-id').value = taboola.client_id || '';
  document.getElementById('settings-taboola-client-secret').value = taboola.client_secret || '';
  document.getElementById('settings-taboola-account-id').value = taboola.account_id || '';
  const testResult = document.getElementById('taboola-test-result');
  if (testResult) testResult.textContent = '';
  document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

async function saveSettings() {
  const data = {
    facebook_pixel_id: document.getElementById('settings-fb-pixel').value.trim(),
    google_analytics_id: document.getElementById('settings-ga-id').value.trim(),
    auto_scrape_enabled: document.getElementById('settings-auto-scrape').checked,
    custom_head_code: document.getElementById('settings-custom-head').value,
    custom_body_code: document.getElementById('settings-custom-body').value,
    taboola: {
      client_id: document.getElementById('settings-taboola-client-id').value.trim(),
      client_secret: document.getElementById('settings-taboola-client-secret').value.trim(),
      account_id: document.getElementById('settings-taboola-account-id').value.trim(),
    },
  };
  try {
    const res = await fetch(`/api/containers/${containerId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      closeSettingsModal();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to save settings');
    }
  } catch (e) {
    alert('Failed to save settings');
  }
}

async function testTaboolaConnection() {
  const btn = document.getElementById('taboola-test-btn');
  const resultEl = document.getElementById('taboola-test-result');
  btn.disabled = true;
  btn.textContent = 'Testing...';
  resultEl.textContent = '';

  // Save credentials first so the server can read them
  await saveSettings();
  // Re-open modal since saveSettings closes it
  document.getElementById('settings-modal').style.display = 'flex';

  try {
    const res = await fetch(`/api/containers/${containerId}/taboola-campaign/test-auth`);
    const data = await res.json();
    if (data.success) {
      resultEl.textContent = 'Connected successfully!';
      resultEl.style.color = 'var(--success)';
    } else {
      resultEl.textContent = data.error || 'Connection failed';
      resultEl.style.color = 'var(--danger)';
    }
  } catch (e) {
    resultEl.textContent = 'Connection test failed';
    resultEl.style.color = 'var(--danger)';
  }

  btn.disabled = false;
  btn.textContent = 'Test Connection';
}

