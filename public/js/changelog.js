/**
 * Changelog Page JS
 * Page: changelog.html (standalone)
 * API: GET /api/changelog
 *
 * Fetches changelog entries and renders them grouped by app-start sessions.
 */

let allSessions = [];

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatCommitDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadChangelog() {
  try {
    const res = await fetch('/api/changelog');
    if (!res.ok) throw new Error('Failed to fetch changelog');
    const data = await res.json();
    groupEntries(data.entries || []);
    render();
  } catch (err) {
    document.getElementById('entries').innerHTML =
      '<div class="changelog-empty">Failed to load changelog.</div>';
  }
}

function groupEntries(entries) {
  // Group entries into sessions: each app_start begins a new group
  allSessions = [];
  let current = null;

  for (const entry of entries) {
    if (entry.type === 'app_start') {
      current = { start: entry, commits: [] };
      allSessions.push(current);
    } else if (entry.type === 'commit') {
      if (!current) {
        current = { start: null, commits: [] };
        allSessions.push(current);
      }
      current.commits.push(entry);
    }
  }
}

function render() {
  const showCommits = document.getElementById('filter-commits').checked;
  const showStarts = document.getElementById('filter-starts').checked;
  const el = document.getElementById('entries');

  // Stats
  const totalCommits = allSessions.reduce((n, s) => n + s.commits.length, 0);
  const totalStarts = allSessions.filter(s => s.start).length;
  document.getElementById('stats').textContent =
    `${totalCommits} commit${totalCommits !== 1 ? 's' : ''} across ${totalStarts} server start${totalStarts !== 1 ? 's' : ''}`;

  if (allSessions.length === 0) {
    el.innerHTML = '<div class="changelog-empty">No changelog entries yet. Start the server to begin tracking.</div>';
    return;
  }

  let html = '';
  for (const session of allSessions) {
    const hasVisibleStart = showStarts && session.start;
    const hasVisibleCommits = showCommits && session.commits.length > 0;
    if (!hasVisibleStart && !hasVisibleCommits) continue;

    html += '<div class="changelog-session">';

    if (hasVisibleStart) {
      const s = session.start;
      html += `<div class="session-header">
        <span class="session-badge">START</span>
        <span>Server started &mdash; ${formatDate(s.timestamp)}</span>
        <span style="margin-left:auto;">${s.new_commits} new commit${s.new_commits !== 1 ? 's' : ''}</span>
      </div>`;
    }

    if (hasVisibleCommits) {
      for (const c of session.commits) {
        html += `<div class="commit-entry">
          <span class="commit-hash">${esc(c.hash ? c.hash.substring(0, 7) : '')}</span>
          <span class="commit-message">${esc(c.message)}</span>
          <span class="commit-meta">${esc(c.author)} &middot; ${formatCommitDate(c.date)}</span>
        </div>`;
      }
    }

    html += '</div>';
  }

  if (!html) {
    el.innerHTML = '<div class="changelog-empty">No entries match the current filters.</div>';
  } else {
    el.innerHTML = html;
  }
}

function applyFilters() {
  render();
}

loadChangelog();
