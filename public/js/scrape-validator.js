/**
 * Scrape Validation UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: renderValidationBadge(), validateScrape(), pollValidation(),
 *   showValidationReport()
 * API: POST /api/containers/:id/validate-scrape/:scrapeId,
 *   GET /api/containers/:id/validate-scrape/:scrapeId
 * Interacts with: scraper.js (renderValidationBadge called from renderScrapes)
 *
 * Validates scrape data quality by checking coverage (images, text, headlines, etc.),
 * URL accessibility, and per-entry breakdowns. Shows score badge and detailed report modal.
 */
// ========== AGENT 1b: Scrape Validator ==========

function renderValidationBadge(v) {
  if (!v || !v.report) return '';
  const score = v.report.overall_score || 0;
  let color, bg, label;
  if (score >= 75) { color = '#15803d'; bg = '#16a34a15'; label = 'Good'; }
  else if (score >= 50) { color = '#b45309'; bg = '#d9770615'; label = 'Fair'; }
  else { color = '#b91c1c'; bg = '#dc262615'; label = 'Poor'; }
  const issueCount = (v.report.issues || []).length;
  return `<span class="badge" style="background:${bg};color:${color};font-size:11px;" title="${score}/100 — ${issueCount} issue(s)">${score}/100 ${label}</span>`;
}

async function validateScrape(scrapeId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/validate-scrape/${scrapeId}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      await loadContainer();
      pollValidation(scrapeId);
    } else {
      alert(data.error || 'Failed to start validation');
    }
  } catch (e) {
    alert('Failed to start validation');
  }
}

async function pollValidation(scrapeId) {
  try {
    const res = await fetch(`/api/containers/${containerId}/validate-scrape/${scrapeId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'completed' || data.status === 'failed') {
      await loadContainer();
      return;
    }
    setTimeout(() => pollValidation(scrapeId), 2000);
  } catch (e) {
    setTimeout(() => pollValidation(scrapeId), 3000);
  }
}

function showValidationReport(scrapeId) {
  // Find the scrape/analysis with this ID
  const allItems = [...(container.scrape_results || []), ...(container.analyses || [])];
  const item = allItems.find(a => a.id === scrapeId);
  if (!item || !item.validation || !item.validation.report) {
    alert('No validation report found');
    return;
  }
  const r = item.validation.report;
  const s = r.summary || {};

  let html = `<h3 style="margin-bottom:16px;">Scrape Validation Report</h3>`;

  // Score
  let scoreColor;
  if (r.overall_score >= 75) scoreColor = 'var(--success)';
  else if (r.overall_score >= 50) scoreColor = 'var(--warning)';
  else scoreColor = 'var(--danger)';

  html += `<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
    <div class="validation-score-ring" style="--score-color:${scoreColor};">
      <span class="validation-score-value">${r.overall_score}</span>
      <span class="validation-score-label">/ 100</span>
    </div>
    <div>
      <div style="font-size:15px;font-weight:600;">Total: ${r.total_ads} ads</div>
      <div class="text-dim" style="font-size:13px;">FB: ${s.facebook_ads || 0} | Google: ${s.google_ads || 0}</div>
      <div class="text-dim" style="font-size:12px;">Validated: ${r.validated_at ? new Date(r.validated_at).toLocaleString() : '?'}</div>
    </div>
  </div>`;

  // Historical comparison
  const cmp = r.comparison;
  if (cmp && cmp.deltas) {
    const d = cmp.deltas;
    const fmtDelta = (val, inverted) => {
      if (val === 0) return '<span class="text-dim">—</span>';
      const improved = inverted ? val < 0 : val > 0;
      const color = improved ? 'var(--success)' : 'var(--danger)';
      const arrow = val > 0 ? '&#9650;' : '&#9660;';
      const sign = val > 0 ? '+' : '';
      return `<span style="color:${color};font-weight:600;">${arrow} ${sign}${val}</span>`;
    };
    const fmtPctDelta = (val, inverted) => {
      if (val === 0) return '<span class="text-dim">—</span>';
      const improved = inverted ? val < 0 : val > 0;
      const color = improved ? 'var(--success)' : 'var(--danger)';
      const arrow = val > 0 ? '&#9650;' : '&#9660;';
      const sign = val > 0 ? '+' : '';
      return `<span style="color:${color};font-weight:600;">${arrow} ${sign}${val}%</span>`;
    };

    const prevDate = cmp.previous_validated_at ? new Date(cmp.previous_validated_at).toLocaleDateString() : '?';
    html += `<div style="margin-bottom:20px;padding:12px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border);">
      <h4 style="font-size:14px;margin-bottom:10px;">Compared to Previous Validation <span class="text-dim" style="font-size:12px;font-weight:400;">(${prevDate})</span></h4>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:13px;">
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Score</div>${fmtDelta(d.overall_score)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Total Ads</div>${fmtDelta(d.total_ads)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Images%</div>${fmtPctDelta(d.image_pct)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Text%</div>${fmtPctDelta(d.text_pct)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Headlines%</div>${fmtPctDelta(d.headline_pct)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Screenshots%</div>${fmtPctDelta(d.screenshot_pct)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">EU%</div>${fmtPctDelta(d.eu_pct)}</div>
        <div style="text-align:center;"><div class="text-dim" style="font-size:11px;margin-bottom:2px;">Broken URLs</div>${fmtDelta(d.broken_urls, true)}</div>
      </div>`;

    // New/resolved issues summary
    if ((cmp.new_issues && cmp.new_issues.length > 0) || (cmp.resolved_issues && cmp.resolved_issues.length > 0)) {
      html += `<div style="margin-top:10px;font-size:12px;border-top:1px solid var(--border);padding-top:8px;">`;
      if (cmp.resolved_issues && cmp.resolved_issues.length > 0) {
        html += `<div style="color:var(--success);margin-bottom:4px;">&#10003; ${cmp.resolved_issues.length} issue(s) resolved</div>`;
      }
      if (cmp.new_issues && cmp.new_issues.length > 0) {
        html += `<div style="color:var(--danger);">&#9888; ${cmp.new_issues.length} new issue(s)</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Coverage bars
  const bars = [
    { label: 'Images', pct: s.image_pct || 0, count: `${s.with_image || 0}/${r.total_ads}`, deltaKey: 'image_pct' },
    { label: 'Ad Text', pct: s.text_pct || 0, count: `${s.with_text || 0}/${r.total_ads}`, deltaKey: 'text_pct' },
    { label: 'Headlines', pct: s.headline_pct || 0, count: `${s.with_headline || 0}/${r.total_ads}`, deltaKey: 'headline_pct' },
    { label: 'Screenshots', pct: s.screenshot_pct || 0, count: `${s.with_screenshot || 0}/${r.total_ads}`, deltaKey: 'screenshot_pct' },
    { label: 'EU Data (FB)', pct: s.eu_pct || 0, count: `${s.with_eu_data || 0}/${s.facebook_ads || 0}`, deltaKey: 'eu_pct' },
    { label: 'CTA', pct: r.total_ads > 0 ? Math.round(((s.with_cta || 0) / r.total_ads) * 100) : 0, count: `${s.with_cta || 0}/${r.total_ads}`, deltaKey: null },
  ];

  html += `<div style="margin-bottom:20px;">
    <h4 style="font-size:14px;margin-bottom:10px;">Data Coverage</h4>`;
  for (const bar of bars) {
    let barColor;
    if (bar.pct >= 75) barColor = 'var(--success)';
    else if (bar.pct >= 40) barColor = 'var(--warning)';
    else barColor = 'var(--danger)';
    html += `<div class="validation-bar-row">
      <span class="validation-bar-label">${bar.label}</span>
      <div class="validation-bar-track">
        <div class="validation-bar-fill" style="width:${bar.pct}%;background:${barColor};"></div>
      </div>
      <span class="validation-bar-value">${bar.pct}% ${cmp && cmp.deltas && bar.deltaKey && cmp.deltas[bar.deltaKey] !== 0 ? (() => { const dv = cmp.deltas[bar.deltaKey]; const clr = dv > 0 ? 'var(--success)' : 'var(--danger)'; return `<span style="color:${clr};font-size:11px;font-weight:600;">${dv > 0 ? '&#9650;+' : '&#9660;'}${dv}%</span>`; })() : ''} <span class="text-dim">(${bar.count})</span></span>
    </div>`;
  }
  html += `</div>`;

  // URL checks
  const u = r.url_checks || {};
  if (u.total > 0 || u.skipped > 0) {
    html += `<div style="margin-bottom:20px;">
      <h4 style="font-size:14px;margin-bottom:8px;">URL Accessibility</h4>
      <div style="display:flex;gap:12px;font-size:13px;">
        <span style="color:var(--success);">OK: ${u.ok || 0}</span>
        <span style="color:var(--danger);">Failed: ${u.failed || 0}</span>
        <span class="text-dim">Skipped: ${u.skipped || 0}</span>
        <span class="text-dim">Total checked: ${u.total}</span>
      </div>
    </div>`;
  }

  // Issues
  if (r.issues && r.issues.length > 0) {
    html += `<div style="margin-bottom:20px;">
      <h4 style="font-size:14px;margin-bottom:8px;">Issues</h4>`;
    for (const issue of r.issues) {
      const iColor = issue.severity === 'error' ? 'var(--danger)' : issue.severity === 'warning' ? 'var(--warning)' : 'var(--text-dim)';
      html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:${issue.fix_action ? '2' : '6'}px;font-size:13px;">
        <span style="color:${iColor};font-weight:600;text-transform:uppercase;font-size:11px;flex-shrink:0;margin-top:1px;">${esc(issue.severity)}</span>
        <span>${esc(issue.message)}</span>
      </div>`;
      if (issue.fix_action) {
        html += `<div style="margin-left:52px;margin-bottom:6px;font-size:12px;color:var(--text-dim);font-style:italic;">Fix: ${esc(issue.fix_action)}</div>`;
      }
    }
    html += `</div>`;
  }

  // Per-entry breakdown
  if (r.entries && r.entries.length > 0) {
    html += `<div>
      <h4 style="font-size:14px;margin-bottom:8px;">Per-Entry Breakdown</h4>
      <div class="table-wrapper"><table class="ads-table" style="font-size:12px;">
        <thead><tr>
          <th>Entry</th><th>Type</th><th>Ads</th><th>FB</th><th>Google</th>
          <th>Images</th><th>Videos</th><th>Text</th><th>Headlines</th><th>CTA</th>
          <th>EU Data</th><th>Screenshots</th><th>OCR</th><th>Issues</th>
        </tr></thead><tbody>`;
    for (const e of r.entries) {
      const allEntryIssues = [...(e.issues || [])];
      if ((e.broken_images || []).length > 0) allEntryIssues.push({ message: `${e.broken_images.length} broken image URL(s)`, fix_action: 'Re-scrape to capture fresh media URLs.' });
      if ((e.broken_videos || []).length > 0) allEntryIssues.push({ message: `${e.broken_videos.length} broken video URL(s)`, fix_action: 'Re-scrape to capture fresh media URLs.' });
      const rowIssues = allEntryIssues.length;
      const issueTooltip = allEntryIssues.map(i => i.fix_action ? `${i.message} — Fix: ${i.fix_action}` : i.message).join('\n');
      html += `<tr>
        <td><strong>${esc(e.entry_name)}</strong></td>
        <td><span class="badge ${e.entry_type === 'product' ? 'badge-primary' : 'badge-competitor'}">${e.entry_type}</span></td>
        <td>${e.ad_count}</td><td>${e.facebook_count}</td><td>${e.google_count}</td>
        <td>${e.with_image}</td><td>${e.with_video}</td><td>${e.with_text}</td>
        <td>${e.with_headline}</td><td>${e.with_cta}</td><td>${e.with_eu_data}</td>
        <td>${e.with_screenshot}</td><td>${e.with_ocr}</td>
        <td>${rowIssues > 0 ? `<span style="color:var(--warning);cursor:help;" title="${esc(issueTooltip)}">${rowIssues}</span>` : '<span style="color:var(--success);">0</span>'}</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  }

  // Show in modal
  const modal = document.getElementById('proposal-modal');
  const body = document.getElementById('proposal-modal-body');
  body.innerHTML = html;
  document.getElementById('modal-generate-btn').style.display = 'none';
  modal.style.display = 'flex';
}
