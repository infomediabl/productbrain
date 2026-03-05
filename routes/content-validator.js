/**
 * Route: Content Validator
 * Mount: /api/containers/:id/content-validator (via server.js)
 * Agent: content-validator-agent.validateContent()
 * Deps: express, storage, content-validator-agent, logger
 *
 * POST /              — Trigger validation
 * GET  /:validationId — Get specific result
 * GET  /              — List all results
 * DELETE /:validationId — Delete a validation
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { validateContent } = require('../agents/content-validator-agent');
const log = require('../logger');

router.post('/', async (req, res) => {
  try {
    const { validate_type, content, comment } = req.body || {};
    const result = await validateContent(req.params.id, { validate_type, content, comment });
    res.status(202).json({ validation_id: result.id, status: 'generating' });
  } catch (err) {
    log.error('ContentValidatorRoute', 'Validation failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:validationId', (req, res) => {
  const item = storage.getValidation(req.params.id, req.params.validationId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const results = (container.validations || []).map(v => ({
    id: v.id,
    created_at: v.created_at,
    status: v.status,
    validate_type: v.meta?.validate_type || 'unknown',
    verdict: v.result?.verdict || null,
    score: v.result?.score || null,
  }));
  res.json(results);
});

router.delete('/:validationId', async (req, res) => {
  try {
    const deleted = await storage.deleteValidation(req.params.id, req.params.validationId);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    log.error('ContentValidatorRoute', 'Delete failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
