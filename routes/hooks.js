/**
 * Route: Hooks Generator
 * Mount: /api/containers/:id/hooks (via server.js)
 * Agent: hooks-agent.generateHooks()
 * Deps: express, storage, hooks-agent, logger
 *
 * POST /          — Trigger hook generation
 * GET  /:hookId   — Get specific result
 * GET  /          — List all results
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateHooks } = require('../agents/hooks-agent');
const log = require('../logger');

router.post('/', async (req, res) => {
  try {
    const result = await generateHooks(req.params.id, req.body || {});
    res.status(202).json({ hook_id: result.id, status: 'generating' });
  } catch (err) {
    log.error('HooksRoute', 'Generation failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:hookId', (req, res) => {
  const item = storage.getHooksResult(req.params.id, req.params.hookId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const results = (container.hooks_results || []).map(h => ({
    id: h.id,
    created_at: h.created_at,
    status: h.status,
    hooks_count: h.result?.hooks?.length || 0,
  }));
  res.json(results);
});

module.exports = router;
