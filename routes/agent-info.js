/**
 * Route: Agent Info
 * Mount: /api/agent-info (via server.js)
 * Agent: None — reads from agents/registry.js
 * Deps: express, agents/registry
 *
 * GET /  — List all registered agents with metadata
 */
const express = require('express');
const router = express.Router();
const { listAgents } = require('../agents/registry');

router.get('/', (req, res) => {
  res.json(listAgents());
});

module.exports = router;
