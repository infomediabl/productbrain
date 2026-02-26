/**
 * Sidebar Entries (My Product + Competitors)
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: getEntryAdStats(), renderEntries(), renderEntryStats(), renderScrapeInfo(),
 *   renderLinkIcon(), fbIcon, googleIcon, extLinkIcon, viewIcon
 * API: (none — reads from container object in memory)
 * Interacts with: container.js (uses container data), scraper.js (startSingleScrape onclick)
 *
 * Renders the sidebar list of the user's product and competitors with ad stats badges,
 * scrape date info, and per-entry scrape buttons. Called by loadContainer().
 */
// ========== Entries ==========

function getEntryAdStats(entryKey) {
  let fbCount = 0, googleCount = 0, lastScraped = null, lastScrapeId = null, newAdsCount = 0;

  // Check scrape_results first
  const scrapes = (container.scrape_results || []).filter(s => s.status === 'completed' || s.status === 'timed_out');
  for (const s of scrapes) {
    const sd = s.scraped_data;
    if (!sd) continue;
    let entryData = entryKey === 'my_product' ? sd.my_product : sd.competitors?.[entryKey];
    if (!entryData) continue;
    const fb = (entryData.facebook || []).length;
    const g = (entryData.google || []).length;
    if (fb > fbCount) fbCount = fb;
    if (g > googleCount) googleCount = g;
    const allAds = [...(entryData.facebook || []), ...(entryData.google || [])];
    for (const ad of allAds) {
      if (ad.scraped_at) {
        const d = new Date(ad.scraped_at);
        if (!lastScraped || d > lastScraped) { lastScraped = d; lastScrapeId = s.id; }
      }
    }
    // Track new ads from the latest auto-scrape
    if (s.trigger === 'auto') {
      const entryNew = allAds.filter(ad => ad.is_new).length;
      if (entryNew > newAdsCount) newAdsCount = entryNew;
    }
    // Also use scrape start time as fallback
    if (!lastScraped && s.started_at) {
      lastScraped = new Date(s.started_at);
      lastScrapeId = s.id;
    }
  }

  // Fallback: check legacy analyses
  const analyses = (container.analyses || []).filter(a => a.status === 'completed' || a.status === 'timed_out');
  for (const a of analyses) {
    const sd = a.scraped_data;
    if (!sd) continue;
    let entryData = entryKey === 'my_product' ? sd.my_product : sd.competitors?.[entryKey];
    if (!entryData) continue;
    const fb = (entryData.facebook || []).length;
    const g = (entryData.google || []).length;
    if (fb > fbCount) fbCount = fb;
    if (g > googleCount) googleCount = g;
    if (!lastScraped && a.started_at) {
      lastScraped = new Date(a.started_at);
      lastScrapeId = a.id;
    }
  }

  return { fbCount, googleCount, lastScraped, lastScrapeId, newAdsCount };
}

// Small external link SVG icon
const extLinkIcon = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M9 6.5v3a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H5.5"/><path d="M7.5 1.5h3v3"/><path d="M5 7 10.5 1.5"/></svg>`;

// Facebook "f" icon
const fbIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z"/></svg>`;

// Google "G" icon
const googleIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09a7.12 7.12 0 0 1 0-4.17V7.07H2.18A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.76.01-.55z"/><path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z"/></svg>`;

// Small eye/view icon for scrape details
const viewIcon = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><circle cx="6" cy="6" r="2"/><path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6z"/></svg>`;

function renderLinkIcon(url, label, icon) {
  if (!url) return '';
  const svg = icon || extLinkIcon;
  return `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}" class="entry-link-icon" aria-label="${esc(label)}">${svg}</a>`;
}

function renderEntryStats(entryKey) {
  const stats = getEntryAdStats(entryKey);
  if (stats.fbCount === 0 && stats.googleCount === 0) return '';
  const parts = [];
  if (stats.fbCount > 0) parts.push(`<span class="badge badge-fb" style="font-size:10px;">FB: ${stats.fbCount}</span>`);
  if (stats.googleCount > 0) parts.push(`<span class="badge badge-google" style="font-size:10px;">G: ${stats.googleCount}</span>`);
  if (stats.newAdsCount > 0) parts.push(`<span class="badge badge-new" style="font-size:10px;">+${stats.newAdsCount} new</span>`);
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:4px;">${parts.join('')}</div>`;
}

function renderScrapeInfo(entryKey) {
  const stats = getEntryAdStats(entryKey);
  if (!stats.lastScraped) return '';
  const dateStr = stats.lastScraped.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const scrapeUrl = stats.lastScrapeId ? `/scrape-details.html?cid=${containerId}&sid=${stats.lastScrapeId}` : '';
  return `<div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
    <span class="text-dim" style="font-size:11px;">Scraped: ${dateStr}</span>
    ${scrapeUrl ? `<a href="${scrapeUrl}" title="View scrape details" class="entry-link-icon">${viewIcon}</a>` : ''}
  </div>`;
}

function renderEntries() {
  const el = document.getElementById('entries-list');
  let html = '';

  const p = container.my_product;
  if (p) {
    const pHasUrls = p.fb_ads_url || p.google_ads_url;
    html += `
      <div class="entry-item my-product-entry">
        <div class="entry-header">
          <strong>${esc(p.name)}</strong>
          <span style="display:flex;gap:4px;margin-left:auto;">
            ${renderLinkIcon(p.website, 'Website', extLinkIcon)}
            ${renderLinkIcon(p.fb_ads_url, 'Facebook Ads', fbIcon)}
            ${renderLinkIcon(p.google_ads_url, 'Google Ads', googleIcon)}
          </span>
          ${p.ideated ? '<span class="badge" style="background:#9333ea15;color:#7e22ce;font-size:10px;">AI</span>' : ''}
        </div>
        ${renderEntryStats('my_product')}
        ${pHasUrls ? `<button class="btn btn-ghost btn-sm" id="scrape-btn-my_product" onclick="startSingleScrape('my_product', '${esc(p.name)}')" style="margin-top:6px;width:100%;justify-content:center;">Scrape</button>` : ''}
        ${renderScrapeInfo('my_product')}
        <div id="scrape-status-my_product" class="entry-analyze-status" style="display:none;"></div>
      </div>
    `;
  } else {
    html += `
      <div class="entry-item" style="background:#9333ea08;">
        <strong class="text-dim" style="font-size:13px;">No product — use Ideator</strong>
      </div>
    `;
  }

  for (const c of container.competitors) {
    const cHasUrls = c.fb_ads_url || c.google_ads_url;
    html += `
      <div class="entry-item competitor-entry">
        <div class="entry-header">
          <strong>${esc(c.name)}</strong>
          <span style="display:flex;gap:4px;margin-left:auto;">
            ${renderLinkIcon(c.website, 'Website', extLinkIcon)}
            ${renderLinkIcon(c.fb_ads_url, 'Facebook Ads', fbIcon)}
            ${renderLinkIcon(c.google_ads_url, 'Google Ads', googleIcon)}
          </span>
        </div>
        ${renderEntryStats(c.id)}
        ${cHasUrls ? `<button class="btn btn-ghost btn-sm" id="scrape-btn-${c.id}" onclick="startSingleScrape('${c.id}', '${esc(c.name).replace(/'/g, "\\'")}')" style="margin-top:6px;width:100%;justify-content:center;">Scrape</button>` : ''}
        ${renderScrapeInfo(c.id)}
        <div id="scrape-status-${c.id}" class="entry-analyze-status" style="display:none;"></div>
      </div>
    `;
  }

  el.innerHTML = html;
}
