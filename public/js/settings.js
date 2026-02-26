/**
 * Project Settings Modal
 * Page: container.html (loaded after container.js)
 * Globals used: containerId — from container.js
 * Globals defined: loadSettings(), openSettingsModal(), closeSettingsModal(), saveSettings()
 * API: GET /api/containers/:id/settings, PUT /api/containers/:id/settings
 *
 * Manages project-level settings including Facebook Pixel ID, Google Analytics ID,
 * and custom head/body code injection for generated pages.
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

