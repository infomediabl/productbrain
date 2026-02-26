/**
 * Route: Scrape Validator
 * Mount: /api/containers/:id/validate-scrape (via server.js)
 * Agent: scrape-validator-agent.validateScrape()
 * Deps: express, storage, scrape-validator-agent, logger
 *
 * POST /:scrapeId — Trigger validation for a scrape result
 * GET  /:scrapeId — Get validation result for a scrape
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { validateScrape } = require('../agents/scrape-validator-agent');
const log = require('../logger');

const SRC = 'ScrapeValidatorRoute';

// Trigger validation for a scrape result
router.post('/:scrapeId', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  try {
    const result = await validateScrape(req.params.id, req.params.scrapeId);
    res.status(202).json(result);
  } catch (err) {
    log.error(SRC, 'Failed to start validation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get validation result for a scrape
router.get('/:scrapeId', (req, res) => {
  const validation = storage.getScrapeValidation(req.params.id, req.params.scrapeId);
  if (!validation) return res.status(404).json({ error: 'No validation found for this scrape' });
  res.json(validation);
});

module.exports = router;
