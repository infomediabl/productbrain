/**
 * Route: Competitor Analysis
 * Mount: /api/containers/:id/competitor-analysis (via server.js)
 * Agent: analyzer-agent.analyzeCompetitor()
 * Deps: express, storage, analyzer-agent, logger
 *
 * POST /                          — Trigger analysis for a specific competitor (requires competitor_id)
 * GET  /:competitorId/:analysisId — Get a specific competitor analysis
 * GET  /:competitorId/latest      — Get the latest completed analysis for a competitor
 * GET  /                          — List all competitor analyses grouped by competitor
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { analyzeCompetitor } = require('../agents/analyzer-agent');
const log = require('../logger');

const SRC = 'CompAnalysisRoute';

// Trigger analysis for a specific competitor
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const competitorId = req.body.competitor_id;
  if (!competitorId) return res.status(400).json({ error: 'competitor_id is required' });

  const comp = container.competitors.find(c => c.id === competitorId);
  if (!comp) return res.status(404).json({ error: 'Competitor not found' });

  try {
    const analysis = await analyzeCompetitor(req.params.id, competitorId);
    res.status(202).json({ analysis_id: analysis.id, competitor_id: competitorId, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start competitor analysis', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific competitor analysis
router.get('/:competitorId/:analysisId', (req, res) => {
  const analysis = storage.getCompetitorAnalysis(req.params.id, req.params.competitorId, req.params.analysisId);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
  res.json(analysis);
});

// Get latest analysis for a competitor
router.get('/:competitorId/latest', (req, res) => {
  const analysis = storage.getLatestCompetitorAnalysis(req.params.id, req.params.competitorId);
  if (!analysis) return res.status(404).json({ error: 'No completed analysis found' });
  res.json(analysis);
});

// List all competitor analyses
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const result = {};
  for (const comp of container.competitors) {
    const analyses = (container.competitor_analyses || {})[comp.id] || [];
    result[comp.id] = {
      name: comp.name,
      analyses: analyses.map(a => ({
        id: a.id,
        created_at: a.created_at,
        status: a.status,
      })),
    };
  }
  res.json(result);
});

module.exports = router;
