/**
 * Route: SpinOff Ideas
 * Mount: /api/containers/:id/spinoff-ideas (via server.js)
 * Agent: spinoff-ideas-agent.generateSpinoffIdeas()
 * Deps: express, storage, spinoff-ideas-agent, logger
 *
 * POST /           — Trigger spin-off ideation
 * GET  /:ideaId    — Get specific result
 * GET  /           — List all results
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateSpinoffIdeas } = require('../agents/spinoff-ideas-agent');
const log = require('../logger');

const SRC = 'SpinOffIdeasRoute';

// Trigger spin-off ideation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  try {
    const idea = await generateSpinoffIdeas(req.params.id, {
      competitorIds: req.body.competitor_ids || null,
      includeContext: req.body.include_context !== false,
      userPrompt: req.body.user_prompt || null,
    });
    res.status(202).json({ idea_id: idea.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start spin-off ideation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific spin-off idea
router.get('/:ideaId', (req, res) => {
  const idea = storage.getSpinoffIdea(req.params.id, req.params.ideaId);
  if (!idea) return res.status(404).json({ error: 'Spin-off idea not found' });
  res.json(idea);
});

// List all spin-off ideas
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const summaries = (container.spinoff_ideas || []).map(i => ({
    id: i.id,
    created_at: i.created_at,
    status: i.status,
    idea_count: i.result?.json_data?.spinoff_ideas?.length || 0,
  }));
  summaries.reverse();
  res.json(summaries);
});

module.exports = router;
