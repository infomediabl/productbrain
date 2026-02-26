/**
 * Route: Proposal Generator
 * Mount: /api/containers/:id/propose (via server.js)
 * Agent: proposal-agent.generateProposal()
 * Deps: express, storage, proposal-agent, logger
 *
 * POST /     — Start proposal generation (async, returns proposal_id); accepts competitor_ids, user_context, user_prompt
 * GET  /:pId — Get a specific proposal result
 * GET  /     — List all proposals (summaries, newest first)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateProposal } = require('../agents/proposal-agent');
const log = require('../logger');

const SRC = 'ProposalRoute';

// Trigger Claude API proposal
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const competitorIds = req.body.competitor_ids || [];
  const userContext = (req.body.user_context || '').trim();
  const userPrompt = (req.body.user_prompt || '').trim();

  // If no competitor_ids provided, use all competitors
  let selectedIds = competitorIds;
  if (selectedIds.length === 0) {
    selectedIds = container.competitors.map(c => c.id);
  }

  if (selectedIds.length === 0) {
    return res.status(400).json({ error: 'No competitors to analyze' });
  }

  try {
    const proposal = await generateProposal(req.params.id, {
      competitorIds: selectedIds,
      userContext,
      userPrompt,
    });
    res.status(202).json({ proposal_id: proposal.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start proposal', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get proposal result
router.get('/:pId', (req, res) => {
  const proposal = storage.getProposal(req.params.id, req.params.pId);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  res.json(proposal);
});

// List all proposals
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const summaries = (container.proposals || []).map(p => ({
    id: p.id,
    created_at: p.created_at,
    status: p.status,
  }));
  summaries.reverse();
  res.json(summaries);
});

module.exports = router;
