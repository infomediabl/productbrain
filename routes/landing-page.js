/**
 * Route: Landing Page Generator
 * Mount: /api/containers/:id/landing-page (via server.js)
 * Agent: landing-page-agent.generateLandingPage()
 * Deps: express, storage, landing-page-agent, logger
 *
 * POST /        — Trigger landing page generation (accepts page_type, target_keyword, page_goal, tone, custom_instructions)
 * GET  /:pageId — Get a specific landing page
 * GET  /        — List all landing pages
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateLandingPage } = require('../agents/landing-page-agent');
const log = require('../logger');

const SRC = 'LandingPageRoute';

// Trigger landing page generation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const options = {
    page_type: req.body.page_type || 'landing_page',
    target_keyword: req.body.target_keyword || '',
    page_goal: req.body.page_goal || '',
    tone: req.body.tone || '',
    custom_instructions: req.body.custom_instructions || '',
  };

  try {
    const page = await generateLandingPage(req.params.id, options);
    res.status(202).json({ page_id: page.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start landing page generation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific landing page
router.get('/:pageId', (req, res) => {
  const page = storage.getLandingPage(req.params.id, req.params.pageId);
  if (!page) return res.status(404).json({ error: 'Landing page not found' });
  res.json(page);
});

// List all landing pages
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const pages = (container.landing_pages || []).map(p => ({
    id: p.id, created_at: p.created_at, status: p.status,
    page_type: p.result?.page_type || null,
  }));
  res.json(pages);
});

module.exports = router;
