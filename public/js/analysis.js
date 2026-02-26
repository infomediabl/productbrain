/**
 * Legacy Analysis Page
 * Page: analysis.html (standalone — not loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, esc())
 * Globals defined: containerId, analysisId, viewType, pollTimer, pollAnalysis(),
 *   updateStatus(), countTotalAds(), renderGroupedResults(), renderSourceSection(),
 *   switchView(), renderAdsTable(), renderAdCard(), openLightbox(), formatNumber(), esc()
 * API: GET /api/containers/:id/scrapes/:analysisId,
 *   GET /api/containers/:id/analyses/:analysisId,
 *   GET /api/containers/:id
 *
 * Displays scraped ad results in table and card views, grouped by entry and source.
 * Supports both new scrape results and legacy analyses. Polls while running.
 */
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const resultsDiv = document.getElementById('results');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

const params = new URLSearchParams(window.location.search);
const containerId = params.get('cid');
const analysisId = params.get('aid');
const viewType = params.get('type'); // 'scrape' for new scrape results, null for legacy

// Set back link
const backLink = document.getElementById('back-link');
if (containerId) {
  backLink.href = `/container.html?id=${containerId}`;
}

if (!containerId || !analysisId) {
  statusText.textContent = 'Missing container or analysis ID.';
  statusBar.className = 'status-bar failed';
} else {
  pollAnalysis();
}

let pollTimer = null;

async function pollAnalysis() {
  try {
    const apiPath = viewType === 'scrape'
      ? `/api/containers/${containerId}/scrapes/${analysisId}`
      : `/api/containers/${containerId}/analyses/${analysisId}`;
    const res = await fetch(apiPath);
    if (!res.ok) {
      statusText.textContent = 'Analysis not found.';
      statusBar.className = 'status-bar failed';
      return;
    }
    const data = await res.json();
    updateStatus(data);
    renderGroupedResults(data);

    if (data.status === 'pending' || data.status === 'running') {
      pollTimer = setTimeout(pollAnalysis, 2000);
    }
  } catch (e) {
    statusText.textContent = 'Error fetching analysis.';
    statusBar.className = 'status-bar failed';
  }
}

function updateStatus(data) {
  statusBar.className = `status-bar ${data.status}`;
  const spinner = statusBar.querySelector('.spinner');

  const totalAds = countTotalAds(data.scraped_data);

  switch (data.status) {
    case 'pending':
      statusText.textContent = 'Analysis queued, waiting to start...';
      if (spinner) spinner.style.display = '';
      break;
    case 'running':
      statusText.textContent = `Scraping ads... ${totalAds} found so far. This may take several minutes.`;
      if (spinner) spinner.style.display = '';
      break;
    case 'completed':
      statusText.textContent = `Analysis completed. Found ${totalAds} total ads.` +
        (data.error_message ? ` (Partial: ${data.error_message})` : '');
      if (spinner) spinner.style.display = 'none';
      break;
    case 'timed_out':
      statusText.textContent = `Analysis timed out after 10 minutes. Found ${totalAds} ads before timeout.` +
        (data.error_message ? ` (${data.error_message})` : '');
      if (spinner) spinner.style.display = 'none';
      break;
    case 'failed':
      statusText.textContent = `Analysis failed: ${data.error_message || 'Unknown error'}`;
      if (spinner) spinner.style.display = 'none';
      break;
  }
}

function countTotalAds(scrapedData) {
  if (!scrapedData) return 0;
  let count = 0;
  if (scrapedData.my_product) {
    count += (scrapedData.my_product.facebook || []).length;
    count += (scrapedData.my_product.google || []).length;
  }
  if (scrapedData.competitors) {
    for (const compId of Object.keys(scrapedData.competitors)) {
      const c = scrapedData.competitors[compId];
      count += (c.facebook || []).length;
      count += (c.google || []).length;
    }
  }
  return count;
}

async function renderGroupedResults(analysis) {
  const sd = analysis.scraped_data;
  if (!sd) return;

  // Load container to get names
  let containerData = null;
  try {
    const res = await fetch(`/api/containers/${containerId}`);
    containerData = await res.json();
  } catch (e) {}

  let html = '';

  // My Product section
  const myFb = sd.my_product?.facebook || [];
  const myGoogle = sd.my_product?.google || [];
  if (myFb.length > 0 || myGoogle.length > 0) {
    const myName = containerData?.my_product?.name || 'My Product';
    html += `<div class="entry-results-section">
      <h2 class="entry-results-header"><span class="badge badge-primary">My Product</span> ${esc(myName)}</h2>`;
    if (myFb.length > 0) html += renderSourceSection('my-fb', 'Facebook', 'badge-fb', myFb, true);
    if (myGoogle.length > 0) html += renderSourceSection('my-google', 'Google', 'badge-google', myGoogle, false);
    html += '</div>';
  }

  // Competitor sections
  if (sd.competitors) {
    for (const compId of Object.keys(sd.competitors)) {
      const compData = sd.competitors[compId];
      const compFb = compData.facebook || [];
      const compGoogle = compData.google || [];
      if (compFb.length === 0 && compGoogle.length === 0) continue;

      const comp = containerData?.competitors?.find(c => c.id === compId);
      const compName = comp?.name || compId;
      const key = compId.substring(0, 8);

      html += `<div class="entry-results-section">
        <h2 class="entry-results-header"><span class="badge badge-competitor">Competitor</span> ${esc(compName)}</h2>`;
      if (compFb.length > 0) html += renderSourceSection(`${key}-fb`, 'Facebook', 'badge-fb', compFb, true);
      if (compGoogle.length > 0) html += renderSourceSection(`${key}-google`, 'Google', 'badge-google', compGoogle, false);
      html += '</div>';
    }
  }

  if (!html) {
    if (analysis.status === 'completed' || analysis.status === 'failed' || analysis.status === 'timed_out') {
      html = '<div class="empty-state"><h2>No ads found</h2><p>The scraper could not find any ads at the provided URLs.</p></div>';
    }
  }

  resultsDiv.innerHTML = html;

  // Activate table view buttons
  setTimeout(() => {
    document.querySelectorAll('.view-toggle').forEach(toggle => {
      const first = toggle.querySelector('.view-btn');
      if (first) first.classList.add('active');
    });
  }, 0);
}

function renderSourceSection(key, label, badgeClass, ads, isFb) {
  return `
    <div class="ads-section">
      <h3><span class="badge ${badgeClass}">${label}</span> ${ads.length} ad${ads.length !== 1 ? 's' : ''}</h3>
      <div class="view-toggle" style="margin-bottom:16px;">
        <button class="btn btn-ghost btn-sm view-btn" onclick="switchView('${key}', 'table', this)">Table</button>
        <button class="btn btn-ghost btn-sm view-btn" onclick="switchView('${key}', 'cards', this)">Cards</button>
      </div>
      <div id="${key}-table-view">${renderAdsTable(ads, isFb)}</div>
      <div id="${key}-cards-view" style="display:none;" class="ads-grid">${ads.map(renderAdCard).join('')}</div>
    </div>
  `;
}

function switchView(source, view, btn) {
  const tableView = document.getElementById(`${source}-table-view`);
  const cardsView = document.getElementById(`${source}-cards-view`);
  if (!tableView || !cardsView) return;

  tableView.style.display = view === 'table' ? '' : 'none';
  cardsView.style.display = view === 'cards' ? '' : 'none';

  const toggle = btn.parentElement;
  toggle.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function renderAdsTable(ads, isFb) {
  const rows = ads.map((ad, i) => {
    const extra = ad.extra_data || {};
    const allMedia = extra.all_media || [];
    const eu = extra.eu_audience;

    // Media links
    let mediaHtml = '-';
    if (allMedia.length > 0) {
      mediaHtml = allMedia.map((url, j) => {
        const isYt = url.includes('youtube.com/watch');
        const isVideo = isYt || url.includes('video') || url.endsWith('.mp4');
        const label = isYt ? 'YouTube' : isVideo ? 'Video' : 'Image';
        return `<a href="${esc(url)}" target="_blank" class="media-link media-${isYt ? 'yt' : isVideo ? 'vid' : 'img'}">${label} ${j + 1}</a>`;
      }).join(' ');
    } else if (ad.media_url) {
      const isYt = ad.media_url.includes('youtube.com/watch');
      mediaHtml = `<a href="${esc(ad.media_url)}" target="_blank" class="media-link">${isYt ? 'YouTube' : (ad.media_type || 'link')}</a>`;
    }

    // Preview
    let previewSrc = '';
    if (ad.media_url && !ad.media_url.includes('youtube.com/watch')) {
      previewSrc = ad.media_url;
    } else if (allMedia.length > 0) {
      previewSrc = allMedia.find(u => !u.includes('youtube.com/watch') && (u.includes('googlesyndication') || u.includes('ytimg') || u.includes('fbcdn') || u.includes('scontent'))) || '';
    }
    if (!previewSrc && ad.screenshot_path) {
      previewSrc = '/' + ad.screenshot_path;
    }

    const previewHtml = previewSrc
      ? `<img src="${esc(previewSrc)}" class="table-thumb" onclick="openLightbox('${esc(previewSrc)}')" loading="lazy">`
      : (ad.screenshot_path ? `<img src="/${esc(ad.screenshot_path)}" class="table-thumb" onclick="openLightbox('/${esc(ad.screenshot_path)}')" loading="lazy">` : '-');

    // Ad link
    let adLinkHtml = '-';
    if (extra.ad_link) {
      adLinkHtml = `<a href="${esc(extra.ad_link)}" target="_blank">View</a>`;
    } else if (extra.fb_ad_id) {
      adLinkHtml = esc(extra.fb_ad_id);
    } else if (extra.creative_id) {
      adLinkHtml = esc(extra.creative_id);
    }

    // EU audience columns (Facebook only)
    let euCols = '';
    if (isFb) {
      // Show top countries (up to 3) or top_country fallback
      let countryHtml = '-';
      if (eu?.countries && eu.countries.length > 0) {
        countryHtml = eu.countries.slice(0, 3).map(c => `${esc(c.name)} (${formatNumber(c.reach)})`).join('<br>');
      } else if (eu?.top_country) {
        countryHtml = `${esc(eu.top_country.name)} (${formatNumber(eu.top_country.reach)})`;
      }

      // Show all genders or top_gender fallback
      let genderHtml = '-';
      if (eu?.genders && eu.genders.length > 0) {
        genderHtml = eu.genders.map(g => `${esc(g.name)} (${formatNumber(g.reach)})`).join('<br>');
      } else if (eu?.top_gender) {
        genderHtml = `${esc(eu.top_gender.name)} (${formatNumber(eu.top_gender.reach)})`;
      }

      // Show top age groups (up to 3)
      let ageHtml = '-';
      if (eu?.age_groups && eu.age_groups.length > 0) {
        ageHtml = eu.age_groups.slice(0, 3).map(a => `${esc(a.name)} (${formatNumber(a.reach)})`).join('<br>');
      } else if (eu?.top_age_group) {
        ageHtml = `${esc(eu.top_age_group.name)} (${formatNumber(eu.top_age_group.reach)})`;
      }

      euCols = `
        <td>${eu ? formatNumber(eu.total_reach) : '-'}</td>
        <td>${countryHtml}</td>
        <td>${genderHtml}</td>
        <td>${ageHtml}</td>
        <td>${eu?.status || '-'}</td>
      `;
    }

    return `<tr>
      <td>${i + 1}</td>
      <td>${previewHtml}</td>
      <td class="table-cell-headline">${esc(ad.headline || '-')}</td>
      <td class="table-cell-text">${esc((ad.ad_text || '').substring(0, 200))}${ad.ad_text && ad.ad_text.length > 200 ? '...' : ''}</td>
      <td>${esc(ad.cta_text || '-')}</td>
      <td>${mediaHtml}</td>
      <td>${esc(ad.media_type || '-')}</td>
      ${isFb ? `<td>${esc(extra.impressions || '-')}</td>` : ''}
      <td>${esc(ad.started_running || '-')}</td>
      ${!isFb ? `<td>${esc(extra.last_shown || '-')}</td>` : ''}
      <td>${esc(ad.platform || '-')}</td>
      <td>${ad.destination_url ? `<a href="${esc(ad.destination_url)}" target="_blank">Link</a>` : '-'}</td>
      <td>${adLinkHtml}</td>
      ${euCols}
    </tr>`;
  }).join('');

  let euHeaders = '';
  if (isFb) {
    euHeaders = `
      <th>EU Reach</th>
      <th>Top Country</th>
      <th>Top Gender</th>
      <th>Top Age</th>
      <th>Status</th>
    `;
  }

  return `
    <div class="table-wrapper">
      <table class="ads-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Preview</th>
            <th>Headline</th>
            <th>Description</th>
            <th>CTA</th>
            <th>Media</th>
            <th>Type</th>
            ${isFb ? '<th>Impressions</th>' : ''}
            <th>Started</th>
            ${!isFb ? '<th>Last Shown</th>' : ''}
            <th>Platform</th>
            <th>Dest. URL</th>
            <th>Ad Link</th>
            ${euHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAdCard(ad) {
  const extra = ad.extra_data || {};
  const allMedia = extra.all_media || [];
  const eu = extra.eu_audience;

  // Use actual creative image instead of screenshot clip
  let cardImageSrc = '';
  const nonVideoMedia = allMedia.filter(u => !u.includes('youtube.com/watch') && !u.includes('youtu.be'));
  if (ad.media_url && !ad.media_url.includes('youtube.com/watch') && !ad.media_url.includes('youtu.be')) {
    cardImageSrc = ad.media_url;
  } else if (nonVideoMedia.length > 0) {
    cardImageSrc = nonVideoMedia[0];
  } else if (ad.screenshot_path) {
    cardImageSrc = '/' + ad.screenshot_path;
  }

  return `
    <div class="card ad-card">
      ${cardImageSrc ? `<img class="ad-screenshot" src="${esc(cardImageSrc)}" alt="Ad creative" onclick="openLightbox(this.src)" loading="lazy">` : ''}
      ${ad.headline ? `<div class="ad-headline">${esc(ad.headline)}</div>` : ''}
      ${ad.ad_text ? `<div class="ad-text">${esc(ad.ad_text).substring(0, 300)}${ad.ad_text.length > 300 ? '...' : ''}</div>` : ''}
      ${ad.cta_text ? `<span class="ad-cta">${esc(ad.cta_text)}</span>` : ''}
      <div class="ad-meta">
        ${ad.advertiser_name ? `<span>Advertiser: ${esc(ad.advertiser_name)}</span>` : ''}
        ${extra.impressions ? `<span>Impressions: ${esc(extra.impressions)}</span>` : ''}
        ${ad.started_running ? `<span>Started: ${esc(ad.started_running)}</span>` : ''}
        ${ad.platform ? `<span>Platform: ${esc(ad.platform)}</span>` : ''}
        ${ad.destination_url ? `<span>URL: <a href="${esc(ad.destination_url)}" target="_blank">${esc(ad.destination_url).substring(0, 60)}</a></span>` : ''}
        ${extra.ad_link ? `<span>Ad: <a href="${esc(extra.ad_link)}" target="_blank">View Original</a></span>` : ''}
      </div>
      ${eu ? `
        <div class="eu-audience-badge">
          <span class="badge badge-eu">EU Audience</span>
          ${eu.total_reach ? `<span>Reach: ${formatNumber(eu.total_reach)}</span>` : ''}
          ${eu.countries && eu.countries.length > 0 ? eu.countries.slice(0, 5).map(c => `<span>${esc(c.name)}: ${formatNumber(c.reach)}</span>`).join('') : (eu.top_country ? `<span>${esc(eu.top_country.name)}: ${formatNumber(eu.top_country.reach)}</span>` : '')}
          ${eu.genders && eu.genders.length > 0 ? eu.genders.map(g => `<span>${esc(g.name)}: ${formatNumber(g.reach)}</span>`).join('') : (eu.top_gender ? `<span>${esc(eu.top_gender.name)}: ${formatNumber(eu.top_gender.reach)}</span>` : '')}
          ${eu.age_groups && eu.age_groups.length > 0 ? eu.age_groups.slice(0, 3).map(a => `<span>${esc(a.name)}: ${formatNumber(a.reach)}</span>`).join('') : (eu.top_age_group ? `<span>${esc(eu.top_age_group.name)}: ${formatNumber(eu.top_age_group.reach)}</span>` : '')}
          ${eu.status ? `<span>Status: ${esc(eu.status)}</span>` : ''}
        </div>
      ` : ''}
      ${allMedia.length > 0 ? `
        <div class="ad-media-links">
          <span style="font-size:12px;color:var(--text-dim);">Media (${allMedia.length}):</span>
          ${allMedia.map((url, i) => {
            const isVideo = url.includes('video') || url.endsWith('.mp4') || url.includes('youtube.com');
            return `<a href="${esc(url)}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:11px;">${isVideo ? 'Video' : 'Image'} ${i + 1}</a>`;
          }).join(' ')}
        </div>
      ` : ''}
    </div>
  `;
}

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.add('active');
}

lightbox.addEventListener('click', () => {
  lightbox.classList.remove('active');
  lightboxImg.src = '';
});

function formatNumber(n) {
  if (!n) return '0';
  return Number(n).toLocaleString();
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
