/**
 * Route: Keyword Ideator
 * Mount: /api/containers/:id/keyword-strategy (via server.js)
 * Agent: keyword-ideator-agent.generateKeywordStrategy()
 * Deps: express, storage, keyword-ideator-agent, logger
 *
 * POST /            — Trigger keyword strategy generation (accepts niche, goals, budget_level)
 * GET  /:strategyId — Get a specific keyword strategy
 * GET  /            — List all keyword strategies
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateKeywordStrategy } = require('../agents/keyword-ideator-agent');
const log = require('../logger');

const SRC = 'KeywordIdeatorRoute';

// Trigger keyword strategy generation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const options = {
    niche: req.body.niche || '',
    goals: req.body.goals || '',
    budget_level: req.body.budget_level || '',
  };

  try {
    const strategy = await generateKeywordStrategy(req.params.id, options);
    res.status(202).json({ strategy_id: strategy.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start keyword strategy', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific keyword strategy
router.get('/:strategyId', (req, res) => {
  const strategy = storage.getKeywordStrategy(req.params.id, req.params.strategyId);
  if (!strategy) return res.status(404).json({ error: 'Keyword strategy not found' });
  res.json(strategy);
});

// List all keyword strategies
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const strategies = (container.keyword_strategies || []).map(s => ({
    id: s.id, created_at: s.created_at, status: s.status,
  }));
  res.json(strategies);
});

module.exports = router;
