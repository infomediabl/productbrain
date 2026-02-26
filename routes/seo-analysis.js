/**
 * Route: SEO Analysis
 * Mount: /api/containers/:id/seo-analysis (via server.js)
 * Agent: seo-agent.analyzeSeo(), seo-agent.analyzeOwnSeo()
 * Deps: express, storage, seo-agent, logger
 *
 * POST /                          — Trigger SEO analysis (type=competitor requires competitor_id; type=own_product for self-audit)
 * GET  /:competitorId/:analysisId — Get a specific SEO analysis
 * GET  /:competitorId/latest      — Get the latest completed SEO analysis for a competitor
 * GET  /                          — List all SEO analyses (includes own-product under _own_product key)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { analyzeSeo, analyzeOwnSeo } = require('../agents/seo-agent');
const log = require('../logger');

const SRC = 'SeoAnalysisRoute';

// Trigger SEO analysis (competitor or own product)
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const type = req.body.type || 'competitor';
  const options = {
    focus_instructions: req.body.focus_instructions || '',
  };

  if (type === 'own_product') {
    // Own-product SEO audit
    if (!container.my_product || !container.my_product.website) {
      return res.status(400).json({ error: 'No product website configured. Add a website URL to your product first.' });
    }

    try {
      const analysis = await analyzeOwnSeo(req.params.id, options);
      res.status(202).json({ analysis_id: analysis.id, storage_key: '_own_product', status: 'generating' });
    } catch (err) {
      log.error(SRC, 'Failed to start own-product SEO audit', { err: err.message });
      res.status(400).json({ error: err.message });
    }
  } else {
    // Competitor SEO intelligence (default)
    const competitorId = req.body.competitor_id;
    if (!competitorId) return res.status(400).json({ error: 'competitor_id is required' });

    const comp = container.competitors.find(c => c.id === competitorId);
    if (!comp) return res.status(404).json({ error: 'Competitor not found' });

    try {
      const analysis = await analyzeSeo(req.params.id, competitorId, options);
      res.status(202).json({ analysis_id: analysis.id, competitor_id: competitorId, status: 'generating' });
    } catch (err) {
      log.error(SRC, 'Failed to start SEO analysis', { err: err.message });
      res.status(400).json({ error: err.message });
    }
  }
});

// Get specific SEO analysis
router.get('/:competitorId/:analysisId', (req, res) => {
  const analysis = storage.getSeoAnalysis(req.params.id, req.params.competitorId, req.params.analysisId);
  if (!analysis) return res.status(404).json({ error: 'SEO analysis not found' });
  res.json(analysis);
});

// Get latest SEO analysis for a competitor
router.get('/:competitorId/latest', (req, res) => {
  const analysis = storage.getLatestSeoAnalysis(req.params.id, req.params.competitorId);
  if (!analysis) return res.status(404).json({ error: 'No completed SEO analysis found' });
  res.json(analysis);
});

// List all SEO analyses (includes own-product)
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const result = {};

  // Own product analyses
  const ownAnalyses = (container.seo_analyses || {})['_own_product'] || [];
  if (ownAnalyses.length > 0) {
    result['_own_product'] = {
      name: container.my_product?.name || 'My Product',
      website: container.my_product?.website || '',
      analyses: ownAnalyses.map(a => ({
        id: a.id,
        created_at: a.created_at,
        status: a.status,
        analysis_type: a.analysis_type || 'own_product',
      })),
    };
  }

  // Competitor analyses
  for (const comp of container.competitors) {
    const analyses = (container.seo_analyses || {})[comp.id] || [];
    result[comp.id] = {
      name: comp.name,
      website: comp.website,
      analyses: analyses.map(a => ({
        id: a.id,
        created_at: a.created_at,
        status: a.status,
        analysis_type: a.analysis_type || 'competitor',
      })),
    };
  }
  res.json(result);
});

module.exports = router;
