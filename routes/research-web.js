/**
 * Route: ResearchWeb
 * Mount: /api/research-web (via server.js) — global, not per-container
 * Agent: research-web-agent.searchWeb(), summarizeSources()
 * Deps: express, storage, research-web-agent, logger
 *
 * POST /search          — Start a web search
 * GET  /                — List all research sessions
 * GET  /:researchId     — Get specific research record
 * POST /:researchId/summarize — Summarize selected sources
 * DELETE /:researchId   — Delete a research session
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { searchWeb, summarizeSources } = require('../agents/research-web-agent');
const log = require('../logger');

const SRC = 'ResearchWebRoute';

// POST /search — Start a web search
router.post('/search', async (req, res) => {
  const { topic } = req.body;
  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  try {
    const record = await searchWeb(topic.trim());
    res.status(202).json({ research_id: record.id, status: 'searching' });
  } catch (err) {
    log.error(SRC, 'Failed to start search', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET / — List all research sessions
router.get('/', (req, res) => {
  try {
    const list = storage.listResearchWeb();
    res.json(list);
  } catch (err) {
    log.error(SRC, 'Failed to list research', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /:researchId — Get specific research record
router.get('/:researchId', (req, res) => {
  const record = storage.getResearchWeb(req.params.researchId);
  if (!record) return res.status(404).json({ error: 'Research session not found' });
  res.json(record);
});

// POST /:researchId/summarize — Summarize selected sources
router.post('/:researchId/summarize', async (req, res) => {
  const { source_ids } = req.body;
  if (!source_ids || !Array.isArray(source_ids) || source_ids.length === 0) {
    return res.status(400).json({ error: 'source_ids array is required' });
  }

  try {
    const result = await summarizeSources(req.params.researchId, source_ids);
    res.status(202).json(result);
  } catch (err) {
    log.error(SRC, 'Failed to start summarization', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// DELETE /:researchId — Delete a research session
router.delete('/:researchId', async (req, res) => {
  try {
    const deleted = await storage.deleteResearchWeb(req.params.researchId);
    if (!deleted) return res.status(404).json({ error: 'Research session not found' });
    res.json({ deleted: true });
  } catch (err) {
    log.error(SRC, 'Failed to delete research', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
