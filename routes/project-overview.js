/**
 * Route: Project Overview
 * Mount: /api/containers/:id/project-overview (via server.js)
 * Agent: project-overview-agent.generateOverview()
 * Deps: express, storage, project-overview-agent, logger
 *
 * POST /           — Trigger overview generation
 * GET  /           — Get current overview
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateOverview } = require('../agents/project-overview-agent');
const log = require('../logger');

// POST / — Generate project overview
router.post('/', async (req, res) => {
  try {
    const record = await generateOverview(req.params.id);
    res.status(202).json({ overview_id: record.id, status: 'generating' });
  } catch (err) {
    log.error('ProjectOverviewRoute', 'POST failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET / — Get current overview
router.get('/', (req, res) => {
  const overview = storage.getProjectOverview(req.params.id);
  if (!overview) return res.json(null);
  res.json(overview);
});

module.exports = router;
