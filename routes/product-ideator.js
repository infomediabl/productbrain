/**
 * Route: Product Ideator
 * Mount: /api/containers/:id/ideate-product (via server.js)
 * Agent: product-ideator-agent.ideateProduct()
 * Deps: express, storage, product-ideator-agent, logger
 *
 * POST /               — Trigger product ideation (optional user_prompt)
 * GET  /:ideaId        — Get a specific product idea
 * POST /:ideaId/accept — Accept a product idea (sets my_product on the container)
 * GET  /               — List all product ideas (summaries, newest first)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { ideateProduct } = require('../agents/product-ideator-agent');
const log = require('../logger');

const SRC = 'ProductIdeatorRoute';

// Trigger product ideation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  try {
    const idea = await ideateProduct(req.params.id, {
      userPrompt: req.body.user_prompt || null,
    });
    res.status(202).json({ idea_id: idea.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start product ideation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific product idea
router.get('/:ideaId', (req, res) => {
  const idea = storage.getProductIdea(req.params.id, req.params.ideaId);
  if (!idea) return res.status(404).json({ error: 'Product idea not found' });
  res.json(idea);
});

// Accept a product idea (sets my_product)
router.post('/:ideaId/accept', async (req, res) => {
  const ideaIndex = parseInt(req.body.idea_index) || 0;
  try {
    const updated = await storage.acceptProductIdea(req.params.id, req.params.ideaId, ideaIndex);
    if (!updated) return res.status(400).json({ error: 'Could not accept idea. Ensure it is completed and has valid data.' });
    res.json({ success: true, my_product: updated.my_product });
  } catch (err) {
    log.error(SRC, 'Failed to accept product idea', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// List all product ideas
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const summaries = (container.product_ideas || []).map(i => ({
    id: i.id,
    created_at: i.created_at,
    status: i.status,
    accepted: i.accepted || false,
  }));
  summaries.reverse();
  res.json(summaries);
});

module.exports = router;
