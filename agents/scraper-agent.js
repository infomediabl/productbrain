/**
 * Agent: Ad Scraper
 * Route: routes/scraper.js → POST /api/containers/:id/scrape
 * Deps: storage, logger, puppeteer (via scrapers/browser), tesseract.js, fs, path, http/https
 * Stores: storage.scrape_results[]
 *
 * Puppeteer-based scraping of Facebook/Google ad libraries with OCR. Downloads
 * media locally, extracts text from image ads, runs with jitter to avoid rate-limits.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const Tesseract = require('tesseract.js');
const Anthropic = require('@anthropic-ai/sdk');
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { scrapeFacebookAds } = require('../scrapers/facebookAdsLibrary');
const { scrapeGoogleAds } = require('../scrapers/googleAdsTransparency');
const { getBrowser } = require('../scrapers/browser');

const SRC = 'ScraperAgent';

const AGENT_META = {
  code: 'ag0001',
  id: 'scraper',
  name: 'Ad Scraper',
  description: 'Puppeteer scraping of Facebook/Google ad libraries with OCR.',
  category: 'scraping',
  model: null,
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'entriesToScrape', type: 'array', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [],
  outputs: { storageKey: 'scrape_results', dataType: 'json', schema: 'ScrapeResult' },
  ui: { visible: true },
  prompt_summary: 'No AI prompt — uses Puppeteer to scrape FB/Google ad libraries. Runs Tesseract OCR on images, uses Claude to structure Google ad OCR text.',
};

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
const SCRAPE_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes — generous for slower scraping

let isScrapingActive = false;
function isScraping() { return isScrapingActive; }

// Ensure screenshots dir exists
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/** Random delay helper: base + random(0, jitter) */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (base, jitter) => sleep(base + Math.floor(Math.random() * jitter));

/**
 * Run scraping for specified entries (my_product and/or competitors).
 * Returns scrape result ID for polling.
 */
async function runScrape(containerId, entriesToScrape, options = {}) {
  const platforms = options.platforms || ['facebook', 'google'];
  const scrapeMeta = {
    entry_names: entriesToScrape.map(e => e.name || e.key).filter(Boolean),
    platforms,
    trigger: options.trigger || 'manual',
  };
  const scrapeResult = await storage.createScrapeResult(containerId, scrapeMeta);
  if (!scrapeResult) throw new Error('Container not found');

  const scrapeOptions = {
    platforms,
    fb_limit: parseInt(options.fb_limit) || 0,
    google_limit: parseInt(options.google_limit) || 0,
    sort_by: options.sort_by || 'impressions',
    dedup_ids: options.dedup_ids || null,
  };

  // Run async with timeout
  executeScrape(containerId, scrapeResult.id, entriesToScrape, scrapeOptions).catch(async (err) => {
    log.error(SRC, 'Scrape crashed', { err: err.message });
    try {
      await storage.updateScrapeStatus(containerId, scrapeResult.id, 'failed', err.message);
    } catch (e) {}
  });

  return scrapeResult;
}

async function executeScrape(containerId, scrapeId, entriesToScrape, scrapeOptions) {
  isScrapingActive = true;
  await storage.updateScrapeStatus(containerId, scrapeId, 'running', null);

  const scrapeWork = doScrapeWork(containerId, scrapeId, entriesToScrape, scrapeOptions);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), SCRAPE_TIMEOUT_MS)
  );

  try {
    await Promise.race([scrapeWork, timeout]);
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      log.warn(SRC, 'Scrape timed out after 25 minutes', { scrapeId });
      await storage.updateScrapeStatus(containerId, scrapeId, 'timed_out',
        'Scrape timed out after 25 minutes. Some data may have been partially scraped.');
      return;
    }
    throw err;
  } finally {
    isScrapingActive = false;
  }
}

async function doScrapeWork(containerId, scrapeId, entriesToScrape, scrapeOptions) {
  const errors = [];

  // Process entries SEQUENTIALLY with delays between them
  for (let i = 0; i < entriesToScrape.length; i++) {
    const entry = entriesToScrape[i];
    await scrapeEntry(containerId, scrapeId, entry.key, entry, errors, scrapeOptions);

    // Delay between entries (not after last one)
    if (i < entriesToScrape.length - 1) {
      log.info(SRC, `Waiting between entries... (${i + 1}/${entriesToScrape.length} done)`);
      await randomDelay(5000, 3000); // 5-8s between entries
    }
  }

  // Download all ad media images locally
  await downloadAllAdMedia(containerId, scrapeId);

  // After all scraping + downloads, run OCR on image ads that have minimal text
  await runOcrOnAds(containerId, scrapeId);

  // Parse Google ad OCR text into structured headline/description/cta/url
  await parseGoogleAdOcrFields(containerId, scrapeId);

  // Count new ads (those marked with is_new from dedup filtering)
  const finalResult = storage.getScrapeResult(containerId, scrapeId);
  if (finalResult && finalResult.scraped_data) {
    const allFinalAds = collectAllAds(finalResult.scraped_data);
    const newCount = allFinalAds.filter(({ ad }) => ad.is_new).length;
    if (newCount > 0) {
      await storage.updateScrapeNewAdsCount(containerId, scrapeId, newCount);
    }
  }

  // Determine final status
  const urlEntries = entriesToScrape.filter(e => e.fb_ads_url || e.google_ads_url).length;
  if (errors.length > 0 && errors.length >= urlEntries * 2) {
    await storage.updateScrapeStatus(containerId, scrapeId, 'failed', errors.join('; '));
  } else {
    await storage.updateScrapeStatus(
      containerId, scrapeId, 'completed',
      errors.length > 0 ? errors.join('; ') : null
    );
  }
}

async function scrapeEntry(containerId, scrapeId, entryKey, entry, errors, options) {
  const platforms = options.platforms || ['facebook', 'google'];

  // Run Facebook THEN Google SEQUENTIALLY (not parallel) to be gentler
  if (entry.fb_ads_url && platforms.includes('facebook')) {
    try {
      log.info(SRC, `Scraping Facebook for ${entry.name || entryKey}`, { url: entry.fb_ads_url, limit: options.fb_limit || 'all' });
      const fbAds = await scrapeFacebookAds(entry.fb_ads_url, scrapeId);
      let adObjects = fbAds.map(ad => ({
        source: 'facebook',
        advertiser_name: ad.advertiser_name || null,
        ad_text: ad.ad_text || null,
        headline: ad.headline || null,
        cta_text: ad.cta_text || null,
        media_url: ad.media_url || null,
        media_type: ad.media_type || null,
        destination_url: ad.destination_url || null,
        started_running: ad.started_running || null,
        screenshot_path: ad.screenshot_path || null,
        platform: ad.platform || null,
        raw_html: ad.raw_html || null,
        extra_data: ad.extra_data || {},
        local_media_path: null, // will be filled by downloadAllAdMedia
        ocr_text: null,
        scraped_at: new Date().toISOString(),
      }));
      // Apply sort + limit
      if (options.fb_limit > 0) {
        adObjects = sortAndLimitAds(adObjects, options.fb_limit, options.sort_by);
        log.info(SRC, `Limited Facebook ads to ${adObjects.length} (requested ${options.fb_limit})`, { entryKey });
      }
      // Dedup: filter out known ads and mark new ones
      if (options.dedup_ids && options.dedup_ids.facebook) {
        const before = adObjects.length;
        adObjects = adObjects.filter(ad => {
          const fbId = ad.extra_data?.fb_ad_id;
          if (fbId && options.dedup_ids.facebook.has(fbId)) return false;
          ad.is_new = true;
          return true;
        });
        if (before !== adObjects.length) {
          log.info(SRC, `Dedup: filtered ${before - adObjects.length} known Facebook ads`, { entryKey });
        }
      }
      await storage.addScrapeData(containerId, scrapeId, entryKey, 'facebook', adObjects);
    } catch (err) {
      log.error(SRC, `Facebook scraping error for ${entry.name || entryKey}`, { err: err.message });
      errors.push(`Facebook (${entry.name || entryKey}): ${err.message}`);
    }

    // Delay between platforms
    if (entry.google_ads_url && platforms.includes('google')) {
      log.info(SRC, 'Waiting between platforms (FB → Google)...');
      await randomDelay(4000, 3000); // 4-7s between platforms
    }
  }

  if (entry.google_ads_url && platforms.includes('google')) {
    try {
      log.info(SRC, `Scraping Google for ${entry.name || entryKey}`, { url: entry.google_ads_url, limit: options.google_limit || 'all' });
      const googleAds = await scrapeGoogleAds(entry.google_ads_url, scrapeId);
      let adObjects = googleAds.map(ad => ({
        source: 'google',
        advertiser_name: ad.advertiser_name || null,
        ad_text: ad.ad_text || null,
        headline: ad.headline || null,
        cta_text: ad.cta_text || null,
        media_url: ad.media_url || null,
        media_type: ad.media_type || null,
        destination_url: ad.destination_url || null,
        started_running: ad.started_running || null,
        screenshot_path: ad.screenshot_path || null,
        platform: ad.platform || null,
        raw_html: ad.raw_html || null,
        extra_data: ad.extra_data || {},
        local_media_path: null, // will be filled by downloadAllAdMedia
        ocr_text: null,
        scraped_at: new Date().toISOString(),
      }));
      // Apply sort + limit
      if (options.google_limit > 0) {
        adObjects = sortAndLimitAds(adObjects, options.google_limit, options.sort_by);
        log.info(SRC, `Limited Google ads to ${adObjects.length} (requested ${options.google_limit})`, { entryKey });
      }
      // Dedup: filter out known ads and mark new ones
      if (options.dedup_ids && options.dedup_ids.google) {
        const before = adObjects.length;
        adObjects = adObjects.filter(ad => {
          const creativeId = ad.extra_data?.creative_id;
          if (creativeId && options.dedup_ids.google.has(creativeId)) return false;
          ad.is_new = true;
          return true;
        });
        if (before !== adObjects.length) {
          log.info(SRC, `Dedup: filtered ${before - adObjects.length} known Google ads`, { entryKey });
        }
      }
      await storage.addScrapeData(containerId, scrapeId, entryKey, 'google', adObjects);
    } catch (err) {
      log.error(SRC, `Google scraping error for ${entry.name || entryKey}`, { err: err.message });
      errors.push(`Google (${entry.name || entryKey}): ${err.message}`);
    }
  }
}

// =============================================================
// DOWNLOAD ALL AD MEDIA LOCALLY
// =============================================================

/**
 * After scraping, download every ad's media_url (and all_media images)
 * to the local screenshots/ folder. Updates ad objects with local_media_path.
 */
async function downloadAllAdMedia(containerId, scrapeId) {
  const scrapeResult = storage.getScrapeResult(containerId, scrapeId);
  if (!scrapeResult || !scrapeResult.scraped_data) return;

  const allAds = collectAllAds(scrapeResult.scraped_data);
  const totalImages = allAds.filter(({ ad }) => {
    const url = ad.media_url || '';
    return url.startsWith('http') && ad.media_type !== 'video';
  }).length;

  if (totalImages === 0) {
    log.info(SRC, 'No ad images to download');
    return;
  }

  log.info(SRC, `Downloading media for ${totalImages} ads...`);

  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < allAds.length; i++) {
    const { ad, entryKey, source } = allAds[i];

    // Skip ads already downloaded in-browser (F2 fix)
    if (ad.local_media_path) continue;

    // Download primary media_url
    if (ad.media_url && ad.media_url.startsWith('http') && ad.media_type !== 'video') {
      const ext = guessImageExt(ad.media_url);
      const filename = `${scrapeId}_${entryKey}_${source}_${i}.${ext}`;
      const localPath = await downloadImage(ad.media_url, filename);
      if (localPath) {
        ad.local_media_path = localPath;
        downloaded++;
      } else {
        failed++;
      }
      // Small delay between downloads to be gentle
      await randomDelay(300, 400);
    }

    // Download all_media images (extras)
    const allMedia = ad.extra_data?.all_media || [];
    for (let j = 0; j < allMedia.length; j++) {
      const url = allMedia[j];
      if (!url || !url.startsWith('http') || url.includes('youtube.com')) continue;
      // Skip if same as primary media (already downloaded)
      if (url === ad.media_url) continue;
      const ext = guessImageExt(url);
      const filename = `${scrapeId}_${entryKey}_${source}_${i}_extra_${j}.${ext}`;
      const localPath = await downloadImage(url, filename);
      if (localPath) {
        // Store extra local paths in extra_data
        if (!ad.extra_data.local_media) ad.extra_data.local_media = [];
        ad.extra_data.local_media.push(localPath);
        downloaded++;
      } else {
        failed++;
      }
      await randomDelay(200, 300);
    }
  }

  log.info(SRC, `Media download complete: ${downloaded} downloaded, ${failed} failed`);

  // Save updated ad data with local paths
  await storage.updateScrapeOcrData(containerId, scrapeId, scrapeResult.scraped_data);
}

/**
 * Download a single image to screenshots/ folder.
 * Returns local path (relative) or null on failure.
 */
function downloadImage(url, filename) {
  const destPath = path.join(SCREENSHOTS_DIR, filename);
  const relativePath = `screenshots/${filename}`;

  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 15000, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/*,*/*;q=0.8',
    }}, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadImage(res.headers.location, filename).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 100) { resolve(null); return; } // Too small, probably error
          fs.writeFileSync(destPath, buffer);
          resolve(relativePath);
        } catch (e) { resolve(null); }
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function guessImageExt(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.includes('.png')) return 'png';
    if (pathname.includes('.webp')) return 'webp';
    if (pathname.includes('.gif')) return 'gif';
    if (pathname.includes('.svg')) return 'svg';
  } catch (e) {}
  return 'jpg'; // default
}

// =============================================================
// SORT & LIMIT
// =============================================================

function sortAndLimitAds(ads, limit, sortBy) {
  if (!limit || ads.length <= limit) return ads;

  const scored = ads.map(ad => {
    let score = 0;
    if (sortBy === 'impressions' || sortBy === 'default') {
      const impStr = ad.extra_data?.impressions || '';
      score = parseImpressionRange(impStr);
    }
    if (score === 0) {
      score = getRunningDays(ad.started_running);
    }
    return { ad, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.ad);
}

function parseImpressionRange(str) {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, '').trim();
  const rangeMatch = cleaned.match(/(\d+)\s*([KMB]?)\s*[-–]\s*(\d+)\s*([KMB]?)/i);
  if (rangeMatch) {
    const low = parseNumWithSuffix(rangeMatch[1], rangeMatch[2]);
    const high = parseNumWithSuffix(rangeMatch[3], rangeMatch[4]);
    return (low + high) / 2;
  }
  const singleMatch = cleaned.match(/(\d+)\s*([KMB]?)/i);
  if (singleMatch) return parseNumWithSuffix(singleMatch[1], singleMatch[2]);
  return 0;
}

function parseNumWithSuffix(numStr, suffix) {
  let n = parseInt(numStr) || 0;
  const s = (suffix || '').toUpperCase();
  if (s === 'K') n *= 1000;
  else if (s === 'M') n *= 1000000;
  else if (s === 'B') n *= 1000000000;
  return n;
}

function getRunningDays(startedRunning) {
  if (!startedRunning) return 0;
  try {
    const start = new Date(startedRunning);
    if (isNaN(start.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)));
  } catch (e) { return 0; }
}

// =============================================================
// OCR
// =============================================================

async function runOcrOnAds(containerId, scrapeId) {
  const scrapeResult = storage.getScrapeResult(containerId, scrapeId);
  if (!scrapeResult || !scrapeResult.scraped_data) return;

  const allAds = collectAllAds(scrapeResult.scraped_data);
  const adsNeedingOcr = allAds.filter(({ ad }) => {
    const hasLocalImage = ad.local_media_path && fs.existsSync(path.join(__dirname, '..', ad.local_media_path));
    const hasScreenshot = ad.screenshot_path && fs.existsSync(path.join(__dirname, '..', ad.screenshot_path));
    const hasImage = ad.media_type === 'image' && ad.media_url;
    const hasMinimalText = !ad.ad_text || ad.ad_text.length < 20;
    return (hasLocalImage || hasScreenshot || hasImage) && hasMinimalText;
  });

  if (adsNeedingOcr.length === 0) {
    log.info(SRC, 'No ads need OCR');
    return;
  }

  log.info(SRC, `Running OCR on ${adsNeedingOcr.length} image ads`);

  let worker = null;
  try {
    worker = await Tesseract.createWorker('eng');

    for (let i = 0; i < Math.min(adsNeedingOcr.length, 20); i++) {
      const { ad } = adsNeedingOcr[i];
      try {
        // Prefer: local_media_path > screenshot > download remote
        let imagePath = null;
        if (ad.local_media_path) {
          const fullPath = path.join(__dirname, '..', ad.local_media_path);
          if (fs.existsSync(fullPath)) imagePath = fullPath;
        }
        if (!imagePath && ad.screenshot_path) {
          const fullPath = path.join(__dirname, '..', ad.screenshot_path);
          if (fs.existsSync(fullPath)) imagePath = fullPath;
        }
        if (!imagePath && ad.media_url && ad.media_url.startsWith('http')) {
          imagePath = await downloadImageForOcr(ad.media_url, scrapeId, i);
        }

        if (!imagePath) continue;

        const { data: { text } } = await worker.recognize(imagePath);
        const cleanedText = text.trim().replace(/\n{3,}/g, '\n\n');

        if (cleanedText.length > 5) {
          ad.ocr_text = cleanedText;
          log.debug(SRC, `OCR extracted ${cleanedText.length} chars for ad ${i}`, {
            preview: cleanedText.substring(0, 100),
          });
        }
      } catch (ocrErr) {
        log.warn(SRC, `OCR failed for ad ${i}`, { err: ocrErr.message });
      }
    }

    // Save updated data back
    await storage.updateScrapeOcrData(containerId, scrapeId, scrapeResult.scraped_data);
  } catch (err) {
    log.error(SRC, 'OCR worker error', { err: err.message });
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (e) {}
    }
  }
}

function collectAllAds(scrapedData) {
  const results = [];
  if (scrapedData.my_product) {
    for (const ad of (scrapedData.my_product.facebook || [])) {
      results.push({ ad, entryKey: 'my_product', source: 'facebook' });
    }
    for (const ad of (scrapedData.my_product.google || [])) {
      results.push({ ad, entryKey: 'my_product', source: 'google' });
    }
  }
  if (scrapedData.competitors) {
    for (const compId of Object.keys(scrapedData.competitors)) {
      const comp = scrapedData.competitors[compId];
      for (const ad of (comp.facebook || [])) {
        results.push({ ad, entryKey: compId, source: 'facebook' });
      }
      for (const ad of (comp.google || [])) {
        results.push({ ad, entryKey: compId, source: 'google' });
      }
    }
  }
  return results;
}

async function downloadImageForOcr(url, scrapeId, index) {
  const tmpPath = path.join(SCREENSHOTS_DIR, `${scrapeId}_ocr_${index}.png`);

  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          fs.writeFileSync(tmpPath, Buffer.concat(chunks));
          resolve(tmpPath);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// =============================================================
// GOOGLE AD OCR STRUCTURED PARSING
// =============================================================

/** Known CTA button phrases for heuristic detection */
const KNOWN_CTAS = [
  'shop now', 'buy now', 'learn more', 'sign up', 'get started', 'subscribe',
  'download', 'install', 'book now', 'contact us', 'get offer', 'apply now',
  'order now', 'try free', 'start free', 'claim offer', 'see more', 'visit site',
  'get quote', 'request demo', 'watch now', 'explore', 'join now', 'view more',
];

/** Labels that indicate a sponsored/paid ad — skip as headline, tag instead */
const SPONSORED_LABELS = ['sponsored', 'sponsored ad', 'ad', 'ads', 'promoted', 'paid'];

/**
 * Heuristic parse of Google ad OCR text into structured fields.
 * Returns { headline, description, cta, url, sponsored } or null if heuristics fail.
 */
function heuristicParseGoogleAd(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return null;

  let url = null;
  let cta = null;
  let headline = null;
  let sponsored = false;
  const descLines = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Detect and skip sponsored labels — just tag it
    if (!sponsored && SPONSORED_LABELS.includes(lower)) {
      sponsored = true;
      continue;
    }
    // Detect URL (domain pattern — also match lines with OCR noise before the domain)
    const urlMatch = line.match(/(https?:\/\/)?([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}(\/\S*)?/i);
    if (!url && urlMatch) {
      url = urlMatch[0];
      continue;
    }
    // Detect CTA
    if (!cta && KNOWN_CTAS.some(c => lower === c || lower.startsWith(c + ' ') || lower.endsWith(' ' + c))) {
      cta = line;
      continue;
    }
    // First substantial content line is headline
    if (!headline && line.length > 3) {
      headline = line;
      continue;
    }
    // Remaining lines are description
    if (headline && line.length > 3) {
      descLines.push(line);
    }
  }

  if (!headline) return null;

  return {
    headline,
    description: descLines.join(' ').substring(0, 500) || null,
    cta: cta || null,
    url: url || null,
    sponsored,
  };
}

/**
 * AI parse of Google ad OCR text using Claude Haiku for structured fields.
 * Returns { headline, description, cta, url } or null on failure.
 */
async function aiParseGoogleAd(ocrText) {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: config.AI_MODEL_FAST,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Parse this Google ad image OCR text into structured fields. Return ONLY valid JSON with these keys: headline, description, cta, url, sponsored. "sponsored" is a boolean — true if the text contains a "Sponsored" or "Ad" label. Do NOT use the "Sponsored" label as the headline — use the actual ad title. Use null for any field you can't identify.\n\nOCR text:\n${ocrText.substring(0, 1000)}`,
      }],
    });
    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      headline: parsed.headline || null,
      description: parsed.description || null,
      cta: parsed.cta || null,
      url: parsed.url || null,
      sponsored: !!parsed.sponsored,
    };
  } catch (err) {
    log.warn(SRC, 'AI OCR parse failed', { err: err.message });
    return null;
  }
}

/**
 * Parse Google ad OCR text into structured fields for all Google ads in a scrape.
 * Uses heuristic parsing first, falls back to AI for up to 10 ads.
 */
async function parseGoogleAdOcrFields(containerId, scrapeId) {
  const scrapeResult = storage.getScrapeResult(containerId, scrapeId);
  if (!scrapeResult || !scrapeResult.scraped_data) return;

  const allAds = collectAllAds(scrapeResult.scraped_data);
  const googleAdsWithOcr = allAds.filter(({ ad }) =>
    ad.source === 'google' && ad.ocr_text && ad.ocr_text.length > 10
  );

  if (googleAdsWithOcr.length === 0) {
    log.info(SRC, 'No Google ads with OCR text to parse');
    return;
  }

  log.info(SRC, `Parsing OCR fields for ${googleAdsWithOcr.length} Google ads`);

  const needsAi = [];
  for (const { ad } of googleAdsWithOcr) {
    const result = heuristicParseGoogleAd(ad.ocr_text);
    if (result && result.headline) {
      ad.ocr_structured = result;
    } else {
      needsAi.push(ad);
    }
  }

  // AI fallback for up to 10 ads where heuristics failed
  const aiBatch = needsAi.slice(0, 10);
  if (aiBatch.length > 0) {
    log.info(SRC, `Running AI OCR parse on ${aiBatch.length} ads (heuristics failed)`);
    for (const ad of aiBatch) {
      const result = await aiParseGoogleAd(ad.ocr_text);
      if (result) {
        ad.ocr_structured = result;
      }
      await randomDelay(200, 300); // Small delay between AI calls
    }
  }

  const parsed = googleAdsWithOcr.filter(({ ad }) => ad.ocr_structured).length;
  log.info(SRC, `OCR structured parsing complete: ${parsed}/${googleAdsWithOcr.length} parsed`);

  // Save updated data
  await storage.updateScrapeOcrData(containerId, scrapeId, scrapeResult.scraped_data);
}

/**
 * Auto-scrape a container: scrapes all entries (my_product + competitors) that
 * have ad URLs, filtering out already-known ads.
 */
async function runAutoScrape(containerId) {
  const container = storage.readContainer(containerId);
  if (!container) {
    log.warn(SRC, 'Auto-scrape: container not found', { containerId });
    return null;
  }

  // Build entries to scrape (product + competitors with ad URLs)
  const entriesToScrape = [];
  if (container.my_product && (container.my_product.fb_ads_url || container.my_product.google_ads_url)) {
    entriesToScrape.push({
      key: 'my_product',
      name: container.my_product.name,
      fb_ads_url: container.my_product.fb_ads_url,
      google_ads_url: container.my_product.google_ads_url,
    });
  }
  for (const comp of (container.competitors || [])) {
    if (comp.fb_ads_url || comp.google_ads_url) {
      entriesToScrape.push({
        key: comp.id,
        name: comp.name,
        fb_ads_url: comp.fb_ads_url,
        google_ads_url: comp.google_ads_url,
      });
    }
  }

  if (entriesToScrape.length === 0) {
    log.info(SRC, 'Auto-scrape: no entries with ad URLs', { containerId });
    return null;
  }

  // Get known ad IDs for dedup
  const knownIds = storage.getKnownAdIds(containerId);
  log.info(SRC, `Auto-scrape: ${entriesToScrape.length} entries, ${knownIds.facebook.size} known FB, ${knownIds.google.size} known Google`, { containerId });

  return runScrape(containerId, entriesToScrape, {
    trigger: 'auto',
    dedup_ids: knownIds,
  });
}

module.exports = { runScrape, run: runScrape, runAutoScrape, isScraping, AGENT_META };
