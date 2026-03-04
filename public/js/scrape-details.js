/**
 * Scrape Details — STANDALONE PAGE
 * Page: scrape-details.html (NOT loaded by container.html)
 * Globals used: (none — self-contained; defines own containerId, container, esc())
 * Globals defined: containerId, scrapeId, container, scrape, esc(), formatDate(),
 *   openLightbox(), resolveImageSrc(), getAllLocalImages(), getEntryName(), getEntryUrls(),
 *   renderStatusBadge(), renderAdImages(), renderAdLinks(), renderEuAudience(), renderAd(),
 *   renderSourceSection(), renderEntrySection(), render(), init(),
 *   pushAdToContext(), openCloneModal(), closeCloneModal(), submitClone(), fetchCloneModels()
 * API: GET /api/containers/:id, GET /api/containers/:id/scrapes/:scrapeId,
 *      POST /api/containers/:id/context, GET /api/containers/:id/clone-ad/models,
 *      POST /api/containers/:id/clone-ad
 *
 * Displays detailed scrape results grouped by entry (product/competitor) and source
 * (Facebook/Google). Shows ad cards with images, text, metadata, EU audience data,
 * and a lightbox for full-size image viewing. Polls for updates if scrape is in progress.
 */
// ========== Scrape Details Page ==========

const params = new URLSearchParams(location.search);
const containerId = params.get('cid');
const scrapeId = params.get('sid');

let container = null;
let scrape = null;

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Lightbox
document.getElementById('lightbox').addEventListener('click', () => {
  document.getElementById('lightbox').classList.remove('active');
});
function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.classList.add('active');
}

// Resolve image source: prefer local path, fallback to remote
function resolveImageSrc(ad) {
  if (ad.local_media_path) return '/' + ad.local_media_path;
  if (ad.media_url && ad.media_url.startsWith('http')) return ad.media_url;
  if (ad.extra_data?.all_media?.length) {
    const first = ad.extra_data.all_media.find(u => u && !u.includes('youtube'));
    if (first) return first;
  }
  if (ad.screenshot_path) return '/' + ad.screenshot_path;
  return null;
}

// Get all local images for an ad (primary + extras)
function getAllLocalImages(ad) {
  const images = [];
  if (ad.local_media_path) images.push('/' + ad.local_media_path);
  if (ad.extra_data?.local_media) {
    for (const p of ad.extra_data.local_media) {
      if (p) images.push('/' + p);
    }
  }
  // Fallback to screenshot
  if (images.length === 0 && ad.screenshot_path) {
    images.push('/' + ad.screenshot_path);
  }
  return images;
}

// Get entry name from container data
function getEntryName(entryKey) {
  if (entryKey === 'my_product') {
    return container?.my_product?.name || 'My Product';
  }
  const comp = (container?.competitors || []).find(c => c.id === entryKey);
  return comp?.name || entryKey;
}

// Get entry URL info
function getEntryUrls(entryKey) {
  if (entryKey === 'my_product') {
    return {
      website: container?.my_product?.website,
      fb_ads_url: container?.my_product?.fb_ads_url,
      google_ads_url: container?.my_product?.google_ads_url
    };
  }
  const comp = (container?.competitors || []).find(c => c.id === entryKey);
  return {
    website: comp?.website,
    fb_ads_url: comp?.fb_ads_url,
    google_ads_url: comp?.google_ads_url
  };
}

function renderStatusBadge(status) {
  const colors = {
    completed: { bg: '#16a34a15', color: '#15803d', label: 'Completed' },
    failed: { bg: '#dc262615', color: '#b91c1c', label: 'Failed' },
    running: { bg: '#4f46e515', color: '#4338ca', label: 'Running' },
    pending: { bg: '#d9770615', color: '#b45309', label: 'Pending' },
    timed_out: { bg: '#d9770615', color: '#b45309', label: 'Timed Out' },
  };
  const c = colors[status] || colors.pending;
  return `<span class="badge" style="background:${c.bg};color:${c.color};font-size:12px;">${c.label}</span>`;
}

function renderAdImages(ad) {
  const images = getAllLocalImages(ad);
  if (images.length === 0) {
    // Try remote images
    const remoteSrc = resolveImageSrc(ad);
    if (remoteSrc) {
      return `<div class="scrape-thumb-grid">
        <img src="${esc(remoteSrc)}" class="scrape-thumb" onclick="openLightbox('${esc(remoteSrc)}')" alt="Ad image" loading="lazy">
      </div>`;
    }
    return '<span class="text-dim" style="font-size:12px;">No images</span>';
  }
  return `<div class="scrape-thumb-grid">
    ${images.map(src => `<img src="${esc(src)}" class="scrape-thumb" onclick="openLightbox('${esc(src)}')" alt="Ad image" loading="lazy">`).join('')}
  </div>`;
}

function renderAdLinks(ad) {
  const links = [];
  if (ad.destination_url) {
    links.push({ label: 'Destination', url: ad.destination_url });
  }
  if (ad.extra_data?.ad_link) {
    links.push({ label: 'Ad Library', url: ad.extra_data.ad_link });
  }
  // Remote media URLs
  if (ad.media_url && ad.media_url.startsWith('http')) {
    links.push({ label: 'Media URL', url: ad.media_url });
  }
  if (ad.extra_data?.all_media) {
    ad.extra_data.all_media.forEach((u, i) => {
      if (u && u.startsWith('http') && u !== ad.media_url) {
        links.push({ label: `Media ${i + 1}`, url: u });
      }
    });
  }
  if (links.length === 0) return '';
  return `<div class="scrape-ad-links">
    ${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="scrape-link-badge" title="${esc(l.url)}">${esc(l.label)}</a>`).join('')}
  </div>`;
}

function renderEuAudience(ad) {
  const eu = ad.extra_data?.eu_audience;
  if (!eu || !eu.total_reach) return '';
  const parts = [];
  if (eu.total_reach) parts.push(`Reach: ${eu.total_reach.toLocaleString()}`);
  if (eu.top_country?.name) parts.push(`Top: ${eu.top_country.name}`);
  if (eu.top_gender?.name) parts.push(eu.top_gender.name);
  if (eu.top_age_group?.name) parts.push(eu.top_age_group.name);
  return `<div class="eu-audience-badge" style="margin-top:8px;">
    <span class="badge badge-eu" style="font-size:10px;">EU</span>
    <span style="font-size:11px;">${parts.join(' &middot; ')}</span>
  </div>`;
}

function renderAd(ad, index, entryKey, source) {
  const imgSrc = resolveImageSrc(ad);
  return `
    <div class="scrape-ad-card card">
      <div class="scrape-ad-card-header">
        <span class="scrape-ad-num">${index + 1}</span>
        ${ad.is_new ? '<span class="badge badge-new" style="font-size:10px;">NEW</span>' : ''}
        <div style="flex:1;min-width:0;">
          ${ad.headline ? `<div class="scrape-ad-headline">${esc(ad.headline)}</div>` : ''}
          ${ad.advertiser_name ? `<div class="text-dim" style="font-size:11px;">${esc(ad.advertiser_name)}</div>` : ''}
        </div>
        ${ad.cta_text ? `<span class="ad-cta">${esc(ad.cta_text)}</span>` : ''}
      </div>

      ${renderAdImages(ad)}

      ${ad.ad_text ? `<div class="scrape-ad-text">${esc(ad.ad_text)}</div>` : ''}

      <div class="scrape-ad-meta">
        ${ad.extra_data?.impressions ? `<span><strong>Impressions:</strong> ${esc(ad.extra_data.impressions)}</span>` : ''}
        ${ad.started_running ? `<span><strong>Started:</strong> ${esc(ad.started_running)}</span>` : ''}
        ${ad.extra_data?.last_shown ? `<span><strong>Last shown:</strong> ${esc(ad.extra_data.last_shown)}</span>` : ''}
        ${ad.media_type ? `<span><strong>Media:</strong> ${esc(ad.media_type)}</span>` : ''}
        ${ad.platform ? `<span><strong>Platform:</strong> ${esc(ad.platform)}</span>` : ''}
      </div>

      ${renderAdLinks(ad)}
      ${renderEuAudience(ad)}

      ${ad.ocr_text ? `<details class="scrape-ocr-details">
        <summary class="text-dim" style="font-size:11px;cursor:pointer;">OCR Text</summary>
        <pre class="scrape-ocr-text">${esc(ad.ocr_text)}</pre>
      </details>` : ''}

      ${ad.ocr_structured ? `<div class="scrape-ocr-structured" style="margin-top:8px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;font-size:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);">Parsed Ad Fields</span>
          ${ad.ocr_structured.sponsored ? '<span class="badge" style="background:#f59e0b15;color:#d97706;font-size:10px;">Sponsored</span>' : ''}
        </div>
        ${ad.ocr_structured.headline ? `<div style="margin-bottom:4px;"><strong>Headline:</strong> ${esc(ad.ocr_structured.headline)}</div>` : ''}
        ${ad.ocr_structured.description ? `<div style="margin-bottom:4px;"><strong>Description:</strong> ${esc(ad.ocr_structured.description)}</div>` : ''}
        ${ad.ocr_structured.cta ? `<div style="margin-bottom:4px;"><strong>CTA:</strong> ${esc(ad.ocr_structured.cta)}</div>` : ''}
        ${ad.ocr_structured.url ? `<div><strong>URL:</strong> <a href="${esc(ad.ocr_structured.url)}" target="_blank" rel="noopener" style="font-size:12px;">${esc(ad.ocr_structured.url)}</a></div>` : ''}
      </div>` : ''}

      <div class="ad-action-buttons">
        <button class="btn-ad-push" onclick="pushAdToContext('${esc(entryKey)}','${esc(source)}',${index},this)">Push</button>
        <button class="btn-ad-clone" onclick="openCloneModal('${esc(entryKey)}','${esc(source)}',${index})">Clone</button>
      </div>
    </div>
  `;
}

function renderSourceSection(entryKey, source, ads) {
  const label = source === 'facebook' ? 'Facebook Ads' : 'Google Ads';
  const badgeClass = source === 'facebook' ? 'badge-fb' : 'badge-google';
  return `
    <div class="scrape-source-section">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <h4 style="margin:0;font-size:15px;">${label}</h4>
        <span class="badge ${badgeClass}" style="font-size:11px;">${ads.length} ads</span>
      </div>
      <div class="scrape-ads-grid">
        ${ads.map((ad, i) => renderAd(ad, i, entryKey, source)).join('')}
      </div>
    </div>
  `;
}

function renderEntrySection(entryKey, entryData) {
  const name = getEntryName(entryKey);
  const urls = getEntryUrls(entryKey);
  const isProduct = entryKey === 'my_product';
  const entryClass = isProduct ? 'scrape-entry-product' : 'scrape-entry-competitor';

  const fbAds = entryData.facebook || [];
  const gAds = entryData.google || [];
  const totalAds = fbAds.length + gAds.length;

  if (totalAds === 0) return '';

  const urlLinks = [];
  if (urls.website) urlLinks.push(`<a href="${esc(urls.website)}" target="_blank" rel="noopener" class="scrape-link-badge">Website</a>`);
  if (urls.fb_ads_url) urlLinks.push(`<a href="${esc(urls.fb_ads_url)}" target="_blank" rel="noopener" class="scrape-link-badge">FB Ads Library</a>`);
  if (urls.google_ads_url) urlLinks.push(`<a href="${esc(urls.google_ads_url)}" target="_blank" rel="noopener" class="scrape-link-badge">Google Ads Transparency</a>`);

  return `
    <div class="scrape-entry-section ${entryClass}">
      <div class="scrape-entry-header">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <h3 style="margin:0;font-size:17px;">${esc(name)}</h3>
          <span class="badge ${isProduct ? 'badge-primary' : 'badge-competitor'}" style="font-size:10px;">${isProduct ? 'Product' : 'Competitor'}</span>
          <span class="text-dim" style="font-size:12px;">${totalAds} ads total</span>
        </div>
        ${urlLinks.length ? `<div class="scrape-ad-links" style="margin-top:4px;">${urlLinks.join('')}</div>` : ''}
      </div>
      ${fbAds.length ? renderSourceSection(entryKey, 'facebook', fbAds) : ''}
      ${gAds.length ? renderSourceSection(entryKey, 'google', gAds) : ''}
    </div>
  `;
}

// ========== Push to Context & Clone Ad ==========

let cloneModels = [];
let cloneCurrentAd = null; // { entryKey, source, index, ad }

function getAdFromScrape(entryKey, source, index) {
  const sd = scrape?.scraped_data;
  if (!sd) return null;
  let entryData;
  if (entryKey === 'my_product') {
    entryData = sd.my_product;
  } else {
    entryData = sd.competitors?.[entryKey];
  }
  if (!entryData) return null;
  const ads = entryData[source] || [];
  return ads[index] || null;
}

async function pushAdToContext(entryKey, source, index, btnEl) {
  const ad = getAdFromScrape(entryKey, source, index);
  if (!ad) return;

  btnEl.disabled = true;
  btnEl.textContent = 'Pushing...';

  const entryName = getEntryName(entryKey);
  const content = {
    headline: ad.headline || ad.ocr_structured?.headline || null,
    description: ad.ad_text || ad.ocr_structured?.description || null,
    cta: ad.cta_text || ad.ocr_structured?.cta || null,
    image_path: ad.local_media_path || null,
    source: ad.source || source,
    advertiser: ad.advertiser_name
  };

  try {
    const res = await fetch(`/api/containers/${containerId}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_name: `Scraped Ad — ${entryName} (${source})`,
        source_type: 'manual',
        content
      })
    });
    if (!res.ok) throw new Error('Failed to push');
    btnEl.textContent = 'Pushed';
    btnEl.classList.add('pushed');
  } catch (err) {
    btnEl.textContent = 'Error';
    btnEl.style.color = 'var(--danger)';
    setTimeout(() => {
      btnEl.textContent = 'Push';
      btnEl.style.color = '';
      btnEl.disabled = false;
    }, 2000);
  }
}

async function fetchCloneModels() {
  try {
    const res = await fetch(`/api/containers/${containerId}/clone-ad/models`);
    if (!res.ok) return;
    const data = await res.json();
    cloneModels = data.models || [];
    const sel = document.getElementById('clone-model');
    sel.innerHTML = cloneModels.map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('');
  } catch {}
}

function openCloneModal(entryKey, source, index) {
  const ad = getAdFromScrape(entryKey, source, index);
  if (!ad) return;

  cloneCurrentAd = { entryKey, source, index, ad };

  // Build preview
  const imgSrc = resolveImageSrc(ad);
  const entryName = getEntryName(entryKey);
  const headline = ad.headline || ad.ocr_structured?.headline || '';
  const text = ad.ad_text || ad.ocr_structured?.description || '';

  document.getElementById('clone-ad-preview').innerHTML = `
    ${imgSrc ? `<img src="${esc(imgSrc)}" alt="Ad preview">` : ''}
    <div class="preview-text">
      <strong>${esc(entryName)}</strong>
      ${headline ? `<div>${esc(headline)}</div>` : ''}
      ${text ? `<div class="text-dim" style="margin-top:2px;">${esc(text.substring(0, 120))}${text.length > 120 ? '...' : ''}</div>` : ''}
    </div>
  `;

  // Reset form
  document.getElementById('clone-format').value = '1:1';
  document.getElementById('clone-instructions').value = '';
  document.getElementById('clone-submit-btn').disabled = false;
  document.getElementById('clone-submit-btn').innerHTML = 'Generate Clone';
  document.getElementById('clone-result').style.display = 'none';

  document.getElementById('clone-modal').style.display = 'flex';
}

function closeCloneModal() {
  document.getElementById('clone-modal').style.display = 'none';
  cloneCurrentAd = null;
}

// Close modal on overlay click
document.getElementById('clone-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeCloneModal();
});

async function submitClone() {
  if (!cloneCurrentAd) return;
  const { entryKey, source, index, ad } = cloneCurrentAd;

  const model = document.getElementById('clone-model').value;
  const format = document.getElementById('clone-format').value;
  const customInstructions = document.getElementById('clone-instructions').value.trim();
  const btn = document.getElementById('clone-submit-btn');

  if (!model) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="clone-spinner"></span>Generating...';
  document.getElementById('clone-result').style.display = 'none';

  const entryName = getEntryName(entryKey);
  const safeName = entryName.replace(/[^a-zA-Z0-9_-]/g, '');

  // Build product context from container
  const productCtx = container?.my_product ?
    `Product: ${container.my_product.name || 'N/A'}\nDescription: ${container.my_product.description || 'N/A'}\nWebsite: ${container.my_product.website || 'N/A'}` :
    '';

  try {
    const res = await fetch(`/api/containers/${containerId}/clone-ad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headline: ad.headline || ad.ocr_structured?.headline || '',
        ad_text: ad.ad_text || ad.ocr_structured?.description || '',
        cta: ad.cta_text || ad.ocr_structured?.cta || '',
        image_url: ad.media_url || null,
        source_competitor: entryName,
        product_context: productCtx,
        format,
        network: source === 'google' ? 'google' : 'facebook',
        model,
        save_dir: 'clonedAd',
        save_filename: `${safeName}-${index}`,
        custom_instructions: customInstructions || undefined
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Clone failed' }));
      throw new Error(err.error || 'Clone failed');
    }

    const data = await res.json();
    const resultEl = document.getElementById('clone-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      ${data.image_path ? `<img src="${esc(data.image_path)}" alt="Cloned ad" onclick="openLightbox('${esc(data.image_path)}')">` : '<div class="text-dim" style="font-size:12px;">No image generated</div>'}
      <div class="adapted-copy">
        ${data.adapted_copy?.headline ? `<div><strong>Headline:</strong> ${esc(data.adapted_copy.headline)}</div>` : ''}
        ${data.adapted_copy?.ad_text ? `<div><strong>Ad Text:</strong> ${esc(data.adapted_copy.ad_text)}</div>` : ''}
        ${data.adapted_copy?.cta ? `<div><strong>CTA:</strong> ${esc(data.adapted_copy.cta)}</div>` : ''}
      </div>
      ${data.image_path ? `<div style="margin-top:8px;font-size:11px;color:var(--text-dim);">Saved: ${esc(data.image_path)}</div>` : ''}
    `;

    btn.innerHTML = 'Done';
  } catch (err) {
    btn.innerHTML = 'Generate Clone';
    btn.disabled = false;
    const resultEl = document.getElementById('clone-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div style="color:var(--danger);font-size:13px;">${esc(err.message)}</div>`;
  }
}

function render() {
  // Back link
  document.getElementById('back-link').href = `/container.html?id=${containerId}`;

  // Header
  const containerName = container?.name || 'Unknown';
  document.getElementById('scrape-title').textContent = `Scrape Details`;
  document.getElementById('scrape-meta').innerHTML = [
    `<strong>${esc(containerName)}</strong>`,
    scrape.started_at ? `Started: ${formatDate(scrape.started_at)}` : '',
    scrape.completed_at ? `Completed: ${formatDate(scrape.completed_at)}` : '',
  ].filter(Boolean).join(' &middot; ');

  document.getElementById('scrape-status-badge').innerHTML = renderStatusBadge(scrape.status);

  // Error
  const errorEl = document.getElementById('scrape-error');
  if (scrape.error_message) {
    errorEl.style.display = 'block';
    errorEl.innerHTML = `<div style="color:var(--danger);font-size:14px;"><strong>Error:</strong> ${esc(scrape.error_message)}</div>`;
  }

  // Content
  const sd = scrape.scraped_data;
  if (!sd) {
    document.getElementById('scrape-content').innerHTML = `<div class="empty-state"><h2>No data</h2><p>This scrape has no collected data yet.</p></div>`;
    return;
  }

  let html = '';

  // Render my_product section
  if (sd.my_product) {
    html += renderEntrySection('my_product', sd.my_product);
  }

  // Render competitor sections
  if (sd.competitors) {
    for (const [compId, compData] of Object.entries(sd.competitors)) {
      html += renderEntrySection(compId, compData);
    }
  }

  if (!html) {
    html = `<div class="empty-state"><h2>No ads found</h2><p>The scrape completed but no ads were collected.</p></div>`;
  }

  document.getElementById('scrape-content').innerHTML = html;
}

async function init() {
  if (!containerId || !scrapeId) {
    document.getElementById('scrape-title').textContent = 'Missing parameters';
    return;
  }

  document.title = `Scrape Details - Product Analyzer`;
  document.getElementById('back-link').href = `/container.html?id=${containerId}`;

  try {
    const [containerRes, scrapeRes] = await Promise.all([
      fetch(`/api/containers/${containerId}`),
      fetch(`/api/containers/${containerId}/scrapes/${scrapeId}`)
    ]);

    if (!containerRes.ok) throw new Error('Container not found');
    if (!scrapeRes.ok) throw new Error('Scrape not found');

    container = await containerRes.json();
    scrape = await scrapeRes.json();

    render();
    fetchCloneModels();

    // If still running, poll for updates
    if (scrape.status === 'pending' || scrape.status === 'running') {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/containers/${containerId}/scrapes/${scrapeId}`);
          if (res.ok) {
            scrape = await res.json();
            render();
            if (scrape.status !== 'pending' && scrape.status !== 'running') {
              clearInterval(pollInterval);
            }
          }
        } catch {}
      }, 3000);
    }
  } catch (err) {
    document.getElementById('scrape-title').textContent = 'Error';
    document.getElementById('scrape-meta').textContent = err.message;
  }
}

let pollInterval = null;
init();
