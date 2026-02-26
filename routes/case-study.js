/**
 * Route: Case Study Analyzer
 * Mount: /api/containers/:id/case-studies (via server.js)
 * Agent: case-study-agent.analyzeCaseStudy()
 * Deps: express, storage, case-study-agent, logger
 *
 * POST /         — Trigger case study analysis (requires source_type, content; accepts source_name, competitor_id)
 * GET  /:studyId — Get a specific case study
 * GET  /         — List all case studies
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { analyzeCaseStudy } = require('../agents/case-study-agent');
const log = require('../logger');

const SRC = 'CaseStudyRoute';

// Trigger case study analysis
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const { source_type, source_name, content, competitor_id } = req.body;

  if (!source_type || !['pdf', 'txt', 'image', 'url'].includes(source_type)) {
    return res.status(400).json({ error: 'Invalid source_type. Must be pdf, txt, image, or url.' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required (base64 data or URL string).' });
  }

  const options = {
    source_type,
    source_name: source_name || 'Untitled',
    content,
    competitor_id: competitor_id || null,
  };

  try {
    const study = await analyzeCaseStudy(req.params.id, options);
    res.status(202).json({ study_id: study.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start case study analysis', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific case study
router.get('/:studyId', (req, res) => {
  const study = storage.getCaseStudy(req.params.id, req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Case study not found' });
  res.json(study);
});

// List all case studies
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const studies = (container.case_studies || []).map(s => ({
    id: s.id,
    created_at: s.created_at,
    status: s.status,
    source_type: s.meta?.source_type || null,
    source_name: s.meta?.source_name || null,
    competitor_name: s.result?.json_data?.competitor_name || null,
  }));
  res.json(studies);
});

module.exports = router;
