/**
 * Folder Ad Importer UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: checkFolderStatus(), startFolderImport()
 * API: GET /api/containers/:id/folder-scrape/status, POST /api/containers/:id/folder-scrape
 *
 * Checks for local upload folder and imports ads from images + optional CSV.
 */

async function checkFolderStatus() {
  const statusEl = document.getElementById('folder-status');
  const importBtn = document.getElementById('folder-import-btn');
  if (!statusEl) return;

  statusEl.innerHTML = '<span class="text-dim">Checking folder...</span>';

  try {
    const res = await fetch(`/api/containers/${containerId}/folder-scrape/status`);
    const data = await res.json();

    if (!data.exists) {
      statusEl.innerHTML = '<span class="text-dim">No upload folder found. Create <code>data/uploads/' + esc(containerId) + '/</code> with image files to use this feature.</span>';
      if (importBtn) importBtn.disabled = true;
      return;
    }

    let html = '<div style="font-size:13px;">';
    html += '<strong>' + data.file_count + '</strong> image file' + (data.file_count !== 1 ? 's' : '') + ' found';
    if (data.has_csv) {
      html += ' &middot; <span style="color:var(--success);">ads.csv detected</span>';
    } else {
      html += ' &middot; <span class="text-dim">no ads.csv (ads will use product name)</span>';
    }
    html += '</div>';

    if (data.file_count > 0 && data.files.length <= 10) {
      html += '<div class="text-dim" style="font-size:11px;margin-top:4px;">' + data.files.map(f => esc(f)).join(', ') + '</div>';
    }

    statusEl.innerHTML = html;
    if (importBtn) importBtn.disabled = data.file_count === 0;
  } catch (err) {
    statusEl.innerHTML = '<span style="color:var(--error);">Error: ' + esc(err.message) + '</span>';
  }
}

async function startFolderImport() {
  const importBtn = document.getElementById('folder-import-btn');
  const statusEl = document.getElementById('folder-status');
  if (importBtn) { importBtn.disabled = true; importBtn.textContent = 'Importing...'; }

  try {
    const res = await fetch(`/api/containers/${containerId}/folder-scrape`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Import failed');

    statusEl.innerHTML = '<div style="color:var(--success);font-size:13px;">Imported ' + data.total_ads + ' ads successfully. Reload to see them in scrape history.</div>';

    // Reload container to show new scrape result
    setTimeout(() => loadContainer(), 1000);
  } catch (err) {
    statusEl.innerHTML = '<span style="color:var(--error);">Error: ' + esc(err.message) + '</span>';
  } finally {
    if (importBtn) { importBtn.disabled = false; importBtn.textContent = 'Import Ads'; }
  }
}
