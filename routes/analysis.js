/**
 * Route: Legacy Analysis (backward compatibility)
 * Mount: /api/containers/:id/analyze (via server.js)
 * Agent: None (direct scraper calls to facebookAdsLibrary, googleAdsTransparency)
 * Deps: express, storage, scrapers/facebookAdsLibrary, scrapers/googleAdsTransparency, logger
 *
 * POST /     — Trigger analysis (async, scrapes FB + Google ads; optional entry_id to scope)
 * GET  /:aId — Get a specific analysis result
 * GET  /     — List all analyses (summaries, newest first)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { scrapeFacebookAds } = require('../scrapers/facebookAdsLibrary');
const { scrapeGoogleAds } = require('../scrapers/googleAdsTransparency');
const log = require('../logger');

const SRC = 'Analysis';

// Trigger analysis — optionally scoped to a single entry via entry_id
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const entryId = req.body.entry_id || null; // 'my_product' or a competitor UUID

  // Resolve which entries to scrape
  let entriesToScrape;
  if (entryId) {
    if (entryId === 'my_product') {
      entriesToScrape = [{ key: 'my_product', ...container.my_product }];
    } else {
      const comp = container.competitors.find(c => c.id === entryId);
      if (!comp) return res.status(404).json({ error: 'Entry not found' });
      entriesToScrape = [{ key: comp.id, ...comp }];
    }
  } else {
    entriesToScrape = [
      { key: 'my_product', ...container.my_product },
      ...container.competitors.map(c => ({ key: c.id, ...c })),
    ];
  }

  const hasUrls = entriesToScrape.some(e => e.fb_ads_url || e.google_ads_url);
  if (!hasUrls) {
    return res.status(400).json({ error: 'No ad library URLs configured for this entry' });
  }

  try {
    const analysis = await storage.createAnalysis(req.params.id);
    if (!analysis) return res.status(404).json({ error: 'Container not found' });

    // Run async — always set final status even on unexpected crash
    runAnalysis(req.params.id, analysis.id, container, entriesToScrape).catch(async (err) => {
      log.error(SRC, 'Analysis crashed', { err: err.message });
      try { await storage.updateAnalysisStatus(req.params.id, analysis.id, 'failed', err.message); } catch (e) {}
    });

    res.status(202).json({ analysis_id: analysis.id, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get analysis result
router.get('/:aId', (req, res) => {
  const analysis = storage.getAnalysis(req.params.id, req.params.aId);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
  res.json(analysis);
});

// List all analyses for a container
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  // Return summaries without scraped_data for listing
  const summaries = (container.analyses || []).map(a => ({
    id: a.id,
    started_at: a.started_at,
    completed_at: a.completed_at,
    status: a.status,
    error_message: a.error_message,
  }));
  summaries.reverse(); // newest first
  res.json(summaries);
});

const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function runAnalysis(containerId, analysisId, container, entriesToScrape) {
  await storage.updateAnalysisStatus(containerId, analysisId, 'running', null);

  const analysisWork = runAnalysisWork(containerId, analysisId, container, entriesToScrape);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), ANALYSIS_TIMEOUT_MS)
  );

  try {
    await Promise.race([analysisWork, timeout]);
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      log.warn(SRC, 'Analysis timed out after 10 minutes', { analysisId });
      await storage.updateAnalysisStatus(containerId, analysisId, 'timed_out',
        'Analysis timed out after 10 minutes. Some data may have been partially scraped.');
      return;
    }
    throw err;
  }
}

async function runAnalysisWork(containerId, analysisId, container, entriesToScrape) {
  const errors = [];

  for (const entry of entriesToScrape) {
    await scrapeEntry(containerId, analysisId, entry.key, entry, errors);
  }

  // Determine final status
  const urlEntries = entriesToScrape.filter(e => e.fb_ads_url || e.google_ads_url).length;
  if (errors.length > 0 && errors.length >= urlEntries * 2) {
    await storage.updateAnalysisStatus(containerId, analysisId, 'failed', errors.join('; '));
  } else {
    await storage.updateAnalysisStatus(
      containerId, analysisId, 'completed',
      errors.length > 0 ? errors.join('; ') : null
    );
  }
}

async function scrapeEntry(containerId, analysisId, entryKey, entry, errors) {
  const tasks = [];

  if (entry.fb_ads_url) {
    tasks.push(
      (async () => {
        log.info(SRC, `Scraping Facebook for ${entry.name || entryKey}`, { url: entry.fb_ads_url });
        const fbAds = await scrapeFacebookAds(entry.fb_ads_url, analysisId);
        const adObjects = fbAds.map(ad => ({
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
          scraped_at: new Date().toISOString(),
        }));
        await storage.addScrapedData(containerId, analysisId, entryKey, 'facebook', adObjects);
      })().catch(err => {
        log.error(SRC, `Facebook scraping error for ${entry.name || entryKey}`, { err: err.message });
        errors.push(`Facebook (${entry.name || entryKey}): ${err.message}`);
      })
    );
  }

  if (entry.google_ads_url) {
    tasks.push(
      (async () => {
        log.info(SRC, `Scraping Google for ${entry.name || entryKey}`, { url: entry.google_ads_url });
        const googleAds = await scrapeGoogleAds(entry.google_ads_url, analysisId);
        const adObjects = googleAds.map(ad => ({
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
          scraped_at: new Date().toISOString(),
        }));
        await storage.addScrapedData(containerId, analysisId, entryKey, 'google', adObjects);
      })().catch(err => {
        log.error(SRC, `Google scraping error for ${entry.name || entryKey}`, { err: err.message });
        errors.push(`Google (${entry.name || entryKey}): ${err.message}`);
      })
    );
  }

  await Promise.all(tasks);
}

module.exports = router;
