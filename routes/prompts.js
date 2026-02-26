/**
 * Route: Prompt Generator
 * Mount: /api/containers/:id/generate-prompts (via server.js)
 * Agent: prompt-agent.generatePrompts()
 * Deps: express, storage, prompt-agent, logger
 *
 * POST /          — Trigger prompt generation from a proposal (requires proposal_id)
 * GET  /:promptId — Get a specific generated prompt result
 * GET  /          — List all generated prompts (summaries, newest first)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generatePrompts } = require('../agents/prompt-agent');
const log = require('../logger');

const SRC = 'PromptsRoute';

// Trigger prompt generation from a proposal
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const proposalId = req.body.proposal_id;
  if (!proposalId) return res.status(400).json({ error: 'proposal_id is required' });

  try {
    const promptRecord = await generatePrompts(req.params.id, proposalId);
    res.status(202).json({ prompt_id: promptRecord.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start prompt generation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific prompt result
router.get('/:promptId', (req, res) => {
  const prompt = storage.getGeneratedPrompt(req.params.id, req.params.promptId);
  if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
  res.json(prompt);
});

// List all generated prompts
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const summaries = (container.generated_prompts || []).map(p => ({
    id: p.id,
    proposal_id: p.proposal_id,
    created_at: p.created_at,
    status: p.status,
  }));
  summaries.reverse();
  res.json(summaries);
});

module.exports = router;
