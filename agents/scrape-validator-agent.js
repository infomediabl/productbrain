/**
 * Agent: Scrape Validator
 * Route: routes/scrape-validator.js → POST /api/containers/:id/validate-scrape/:scrapeId
 * Deps: storage, logger, fs, path, http/https
 * Stores: storage.updateScrapeValidation()
 *
 * Validates scrape data quality post-scrape. Checks ad counts, URL accessibility,
 * EU audience data, text content, screenshot files, media links, and OCR presence.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const log = require('../logger');
const storage = require('../storage');

const SRC = 'ScrapeValidator';

const AGENT_META = {
  code: 'ag0002',
  id: 'scrape-validator',
  name: 'Scrape Validator',
  description: 'Validates scrape quality: URL checks, data completeness, media accessibility.',
  category: 'validation',
  model: null,
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'scrapeId', type: 'string', required: true, from: 'scraper' },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Scrape result to validate' },
  ],
  outputs: { storageKey: 'scrape_results', dataType: 'json', schema: 'ValidationReport' },
  ui: { visible: true },
};

const URL_CHECK_TIMEOUT_MS = 8000;
const MAX_URL_CHECKS = 50; // Don't check more than 50 URLs to keep it fast

/**
 * Validate a scrape result. Returns a validation record that's stored in the scrape.
 */
async function validateScrape(containerId, scrapeId) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  // Find the scrape result — check both scrape_results and legacy analyses
  let scrape = (container.scrape_results || []).find(s => s.id === scrapeId);
  let isLegacy = false;
  if (!scrape) {
    scrape = (container.analyses || []).find(a => a.id === scrapeId);
    isLegacy = true;
  }
  if (!scrape) throw new Error('Scrape result not found');
  if (scrape.status !== 'completed' && scrape.status !== 'timed_out') {
    throw new Error('Scrape is not yet completed');
  }

  // Mark validation as running
  await storage.updateScrapeValidation(containerId, scrapeId, isLegacy, {
    status: 'running',
    started_at: new Date().toISOString(),
  });

  // Run async
  executeValidation(containerId, scrapeId, scrape, isLegacy).catch(async (err) => {
    log.error(SRC, 'Validation crashed', { err: err.message });
    try {
      await storage.updateScrapeValidation(containerId, scrapeId, isLegacy, {
        status: 'failed',
        error: err.message,
        completed_at: new Date().toISOString(),
      });
    } catch (e) {}
  });

  return { scrape_id: scrapeId, status: 'running' };
}

async function executeValidation(containerId, scrapeId, scrape, isLegacy) {
  const sd = scrape.scraped_data;
  if (!sd) {
    await storage.updateScrapeValidation(containerId, scrapeId, isLegacy, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      report: buildEmptyReport('No scraped data found'),
    });
    return;
  }

  const report = {
    validated_at: new Date().toISOString(),
    overall_score: 0,  // 0-100
    total_ads: 0,
    entries: [],        // per-entry validation
    issues: [],         // global issues
    url_checks: { total: 0, ok: 0, failed: 0, skipped: 0 },
    summary: {},
  };

  // Gather container info for names
  const container = storage.readContainer(containerId);
  const competitorMap = {};
  if (container) {
    for (const c of (container.competitors || [])) {
      competitorMap[c.id] = c.name;
    }
  }

  // Validate my_product
  if (sd.my_product) {
    const entryReport = await validateEntry(
      'my_product',
      container?.my_product?.name || 'My Product',
      'product',
      sd.my_product,
      report
    );
    report.entries.push(entryReport);
  }

  // Validate competitors
  if (sd.competitors) {
    for (const compId of Object.keys(sd.competitors)) {
      const compData = sd.competitors[compId];
      const entryReport = await validateEntry(
        compId,
        competitorMap[compId] || compId.substring(0, 8),
        'competitor',
        compData,
        report
      );
      report.entries.push(entryReport);
    }
  }

  // Calculate totals
  let totalAds = 0;
  let totalWithImage = 0;
  let totalWithVideo = 0;
  let totalWithText = 0;
  let totalWithHeadline = 0;
  let totalWithCta = 0;
  let totalWithEuData = 0;
  let totalWithScreenshot = 0;
  let totalWithOcr = 0;
  let totalFb = 0;
  let totalGoogle = 0;

  for (const entry of report.entries) {
    totalAds += entry.ad_count;
    totalWithImage += entry.with_image;
    totalWithVideo += entry.with_video;
    totalWithText += entry.with_text;
    totalWithHeadline += entry.with_headline;
    totalWithCta += entry.with_cta;
    totalWithEuData += entry.with_eu_data;
    totalWithScreenshot += entry.with_screenshot;
    totalWithOcr += entry.with_ocr;
    totalFb += entry.facebook_count;
    totalGoogle += entry.google_count;
  }

  report.total_ads = totalAds;
  report.summary = {
    total_ads: totalAds,
    facebook_ads: totalFb,
    google_ads: totalGoogle,
    with_image: totalWithImage,
    with_video: totalWithVideo,
    with_text: totalWithText,
    with_headline: totalWithHeadline,
    with_cta: totalWithCta,
    with_eu_data: totalWithEuData,
    with_screenshot: totalWithScreenshot,
    with_ocr: totalWithOcr,
    image_pct: totalAds > 0 ? Math.round((totalWithImage / totalAds) * 100) : 0,
    text_pct: totalAds > 0 ? Math.round((totalWithText / totalAds) * 100) : 0,
    headline_pct: totalAds > 0 ? Math.round((totalWithHeadline / totalAds) * 100) : 0,
    eu_pct: totalFb > 0 ? Math.round((totalWithEuData / totalFb) * 100) : 0,
    screenshot_pct: totalAds > 0 ? Math.round((totalWithScreenshot / totalAds) * 100) : 0,
  };

  // Global issues
  if (totalAds === 0) {
    report.issues.push({ severity: 'error', message: 'No ads were scraped at all' });
  }
  if (totalFb > 0 && totalWithEuData === 0) {
    report.issues.push({ severity: 'warning', message: 'No EU audience data found on any Facebook ad. EU transparency may not be available for these advertisers.' });
  }
  if (totalWithImage === 0 && totalWithVideo === 0) {
    report.issues.push({ severity: 'warning', message: 'No media (images or videos) found in any ad' });
  }
  if (totalWithText === 0 && totalWithHeadline === 0) {
    report.issues.push({ severity: 'warning', message: 'No text content (ad_text or headline) found in any ad' });
  }

  // Overall score (weighted)
  if (totalAds > 0) {
    let score = 0;
    // Base: having ads at all = 20 pts
    score += 20;
    // Text coverage = 20 pts
    score += Math.round((report.summary.text_pct / 100) * 10);
    score += Math.round((report.summary.headline_pct / 100) * 10);
    // Media coverage = 20 pts
    score += Math.round((report.summary.image_pct / 100) * 20);
    // Screenshot coverage = 15 pts
    score += Math.round((report.summary.screenshot_pct / 100) * 15);
    // CTA = 10 pts
    const ctaPct = totalAds > 0 ? Math.round((totalWithCta / totalAds) * 100) : 0;
    score += Math.round((ctaPct / 100) * 10);
    // EU data = 10 pts (only for FB)
    score += Math.round((report.summary.eu_pct / 100) * 10);
    // URL check success = 5 pts
    const urlOkPct = report.url_checks.total > 0
      ? Math.round((report.url_checks.ok / report.url_checks.total) * 100) : 100;
    score += Math.round((urlOkPct / 100) * 5);
    report.overall_score = Math.min(100, score);
  }

  log.info(SRC, 'Validation completed', {
    scrapeId,
    totalAds,
    score: report.overall_score,
    issues: report.issues.length,
  });

  await storage.updateScrapeValidation(containerId, scrapeId, isLegacy, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    report,
  });
}

async function validateEntry(entryKey, entryName, entryType, entryData, globalReport) {
  const fbAds = entryData.facebook || [];
  const googleAds = entryData.google || [];
  const allAds = [...fbAds, ...googleAds];

  const entry = {
    entry_key: entryKey,
    entry_name: entryName,
    entry_type: entryType,
    ad_count: allAds.length,
    facebook_count: fbAds.length,
    google_count: googleAds.length,
    with_image: 0,
    with_video: 0,
    with_text: 0,
    with_headline: 0,
    with_cta: 0,
    with_eu_data: 0,
    with_screenshot: 0,
    with_ocr: 0,
    broken_images: [],
    broken_videos: [],
    missing_screenshots: [],
    issues: [],
  };

  if (allAds.length === 0) {
    entry.issues.push({ severity: 'warning', message: `No ads scraped for ${entryName}` });
    return entry;
  }

  // Collect URLs to check (limit to MAX_URL_CHECKS total across all entries)
  const urlsToCheck = [];

  for (const ad of allAds) {
    // Text checks
    if (ad.ad_text && ad.ad_text.trim().length > 0) entry.with_text++;
    if (ad.headline && ad.headline.trim().length > 0) entry.with_headline++;
    if (ad.cta_text && ad.cta_text.trim().length > 0) entry.with_cta++;
    if (ad.ocr_text && ad.ocr_text.trim().length > 0) entry.with_ocr++;

    // EU data (Facebook only)
    const eu = ad.extra_data?.eu_audience;
    if (eu && (eu.total_reach || eu.countries || eu.genders || eu.age_groups)) {
      entry.with_eu_data++;
    }

    // Media type classification
    const isVideo = ad.media_type === 'video' ||
      (ad.media_url && (ad.media_url.includes('video') || ad.media_url.endsWith('.mp4')));
    const isImage = ad.media_type === 'image' || (ad.media_url && !isVideo);

    if (isVideo && ad.media_url) entry.with_video++;
    if (isImage && ad.media_url) entry.with_image++;

    // Screenshot check (local file)
    if (ad.screenshot_path) {
      const fullPath = path.join(__dirname, '..', ad.screenshot_path);
      if (fs.existsSync(fullPath)) {
        entry.with_screenshot++;
      } else {
        entry.missing_screenshots.push(ad.screenshot_path);
      }
    }

    // Queue media URL for HTTP check
    if (ad.media_url && ad.media_url.startsWith('http')) {
      if (globalReport.url_checks.total + urlsToCheck.length < MAX_URL_CHECKS) {
        urlsToCheck.push({
          url: ad.media_url,
          type: isVideo ? 'video' : 'image',
          ad_id: ad.extra_data?.fb_ad_id || ad.extra_data?.creative_id || null,
        });
      } else {
        globalReport.url_checks.skipped++;
      }
    }

    // Check all_media URLs too (sample first 2 per ad)
    const allMedia = ad.extra_data?.all_media || [];
    for (let i = 0; i < Math.min(allMedia.length, 2); i++) {
      const mUrl = allMedia[i];
      if (mUrl && mUrl.startsWith('http')) {
        if (globalReport.url_checks.total + urlsToCheck.length < MAX_URL_CHECKS) {
          const mIsVideo = mUrl.includes('video') || mUrl.endsWith('.mp4') || mUrl.includes('youtube.com');
          urlsToCheck.push({
            url: mUrl,
            type: mIsVideo ? 'video' : 'image',
            ad_id: ad.extra_data?.fb_ad_id || ad.extra_data?.creative_id || null,
          });
        } else {
          globalReport.url_checks.skipped++;
        }
      }
    }
  }

  // Run URL checks in parallel (batches of 10)
  const batchSize = 10;
  for (let i = 0; i < urlsToCheck.length; i += batchSize) {
    const batch = urlsToCheck.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(item => checkUrl(item.url)));

    for (let j = 0; j < batch.length; j++) {
      globalReport.url_checks.total++;
      if (results[j].ok) {
        globalReport.url_checks.ok++;
      } else {
        globalReport.url_checks.failed++;
        const item = batch[j];
        const failInfo = { url: item.url.substring(0, 120), status: results[j].status, error: results[j].error };
        if (item.type === 'video') {
          entry.broken_videos.push(failInfo);
        } else {
          entry.broken_images.push(failInfo);
        }
      }
    }
  }

  // Entry-level issues
  if (fbAds.length > 0 && entry.with_eu_data === 0) {
    entry.issues.push({ severity: 'info', message: `No EU audience data for ${entryName}'s Facebook ads` });
  }
  if (entry.missing_screenshots.length > 0) {
    entry.issues.push({ severity: 'warning', message: `${entry.missing_screenshots.length} screenshot file(s) missing on disk` });
  }
  if (entry.broken_images.length > 0) {
    entry.issues.push({ severity: 'warning', message: `${entry.broken_images.length} image URL(s) not accessible` });
  }
  if (entry.broken_videos.length > 0) {
    entry.issues.push({ severity: 'warning', message: `${entry.broken_videos.length} video URL(s) not accessible` });
  }
  if (entry.with_text === 0 && entry.with_headline === 0) {
    entry.issues.push({ severity: 'warning', message: `No text content found for ${entryName}'s ads` });
  }

  return entry;
}

/**
 * HTTP HEAD check for a URL. Returns { ok, status, error }.
 */
function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, { method: 'HEAD', timeout: URL_CHECK_TIMEOUT_MS }, (res) => {
        // Follow redirects (up to 3)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          checkUrl(res.headers.location).then(resolve);
          return;
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          error: null,
        });
      });
      req.on('error', (err) => resolve({ ok: false, status: null, error: err.code || err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: null, error: 'TIMEOUT' }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, status: null, error: e.message });
    }
  });
}

function buildEmptyReport(message) {
  return {
    validated_at: new Date().toISOString(),
    overall_score: 0,
    total_ads: 0,
    entries: [],
    issues: [{ severity: 'error', message }],
    url_checks: { total: 0, ok: 0, failed: 0, skipped: 0 },
    summary: {},
  };
}

module.exports = { validateScrape, run: validateScrape, AGENT_META };
