/**
 * Route: Test Planner
 * Mount: /api/containers/:id/test-plan (via server.js)
 * Agent: test-planner-agent.generateTestPlan()
 * Deps: express, storage, test-planner-agent, logger
 *
 * POST /        — Trigger test plan generation (accepts focus, budget_constraint, target_channels, user_instructions)
 * GET  /:planId — Get a specific test plan
 * GET  /        — List all test plans
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateTestPlan } = require('../agents/test-planner-agent');
const log = require('../logger');

const SRC = 'TestPlannerRoute';

// Trigger test plan generation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const options = {
    focus: req.body.focus || '',
    budget_constraint: req.body.budget_constraint || '',
    target_channels: req.body.target_channels || [],
    user_instructions: req.body.user_instructions || '',
  };

  try {
    const plan = await generateTestPlan(req.params.id, options);
    res.status(202).json({ plan_id: plan.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start test plan', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific test plan
router.get('/:planId', (req, res) => {
  const plan = storage.getTestPlan(req.params.id, req.params.planId);
  if (!plan) return res.status(404).json({ error: 'Test plan not found' });
  res.json(plan);
});

// List all test plans
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const plans = (container.test_plans || []).map(p => ({
    id: p.id, created_at: p.created_at, status: p.status,
  }));
  res.json(plans);
});

module.exports = router;
