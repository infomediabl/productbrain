/**
 * Route: Scraper
 * Mount: /api/containers/:id/scrape (via server.js)
 * Agent: scraper-agent.runScrape()
 * Deps: express, storage, scraper-agent, logger
 *
 * POST /           — Trigger scrape (async, returns scrape_id); supports entry_id, platforms, fb_limit, google_limit, sort_by
 * GET  /:scrapeId  — Get a specific scrape result
 * GET  /           — List all scrape results (summaries, newest first)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { runScrape } = require('../agents/scraper-agent');
const log = require('../logger');

const SRC = 'ScraperRoute';

// Trigger scrape — optionally scoped to a single entry via entry_id
// Accepts options: platforms (array), fb_limit (number), google_limit (number), sort_by (string)
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const entryId = req.body.entry_id || null;

  let entriesToScrape;
  if (entryId) {
    if (entryId === 'my_product') {
      if (!container.my_product) return res.status(400).json({ error: 'No product configured' });
      entriesToScrape = [{ key: 'my_product', ...container.my_product }];
    } else {
      const comp = container.competitors.find(c => c.id === entryId);
      if (!comp) return res.status(404).json({ error: 'Entry not found' });
      entriesToScrape = [{ key: comp.id, ...comp }];
    }
  } else {
    entriesToScrape = [];
    if (container.my_product) {
      entriesToScrape.push({ key: 'my_product', ...container.my_product });
    }
    entriesToScrape.push(...container.competitors.map(c => ({ key: c.id, ...c })));
  }

  // Filter entries by selected platforms — remove entries that lack URLs for selected platforms
  const platforms = req.body.platforms || ['facebook', 'google'];
  const hasUrls = entriesToScrape.some(e => {
    if (platforms.includes('facebook') && e.fb_ads_url) return true;
    if (platforms.includes('google') && e.google_ads_url) return true;
    return false;
  });
  if (!hasUrls) {
    return res.status(400).json({ error: 'No ad library URLs configured for selected platforms' });
  }

  const scrapeOptions = {
    platforms,
    fb_limit: parseInt(req.body.fb_limit) || 0,
    google_limit: parseInt(req.body.google_limit) || 0,
    sort_by: req.body.sort_by || 'impressions',
  };

  try {
    const scrapeResult = await runScrape(req.params.id, entriesToScrape, scrapeOptions);
    res.status(202).json({ scrape_id: scrapeResult.id, status: 'pending' });
  } catch (err) {
    log.error(SRC, 'Failed to start scrape', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Get scrape result
router.get('/:scrapeId', (req, res) => {
  const scrape = storage.getScrapeResult(req.params.id, req.params.scrapeId);
  if (!scrape) return res.status(404).json({ error: 'Scrape result not found' });
  res.json(scrape);
});

// List all scrape results
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const summaries = (container.scrape_results || []).map(s => ({
    id: s.id,
    started_at: s.started_at,
    completed_at: s.completed_at,
    status: s.status,
    error_message: s.error_message,
  }));
  summaries.reverse();
  res.json(summaries);
});

module.exports = router;
