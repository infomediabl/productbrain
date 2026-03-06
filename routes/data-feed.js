/**
 * Route: User Data Feed
 * Mount: /api/containers/:id/data-feed (via server.js)
 * Agent: data-feed-agent.analyzeDataFeed()
 * Deps: express, storage, data-feed-agent, logger
 *
 * POST /           — Upload CSV and trigger analysis
 * GET  /:feedId    — Get specific feed result
 * GET  /           — List all feeds
 * DELETE /:feedId  — Delete a feed
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { analyzeDataFeed } = require('../agents/data-feed-agent');
const log = require('../logger');

// POST / — Upload CSV and trigger analysis
router.post('/', async (req, res) => {
  try {
    const { csv_text, filename } = req.body;
    if (!csv_text) return res.status(400).json({ error: 'csv_text is required' });
    const record = await analyzeDataFeed(req.params.id, { csv_text, filename });
    res.status(202).json({ feed_id: record.id, status: 'analyzing' });
  } catch (err) {
    log.error('DataFeedRoute', 'POST failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET / — List all feeds
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const feeds = (container.data_feeds || []).map(f => ({
    id: f.id,
    created_at: f.created_at,
    status: f.status,
    filename: f.filename,
    row_count: f.row_count,
    columns: f.columns,
  }));
  res.json(feeds);
});

// GET /:feedId — Get specific feed
router.get('/:feedId', (req, res) => {
  const feed = storage.getDataFeed(req.params.id, req.params.feedId);
  if (!feed) return res.status(404).json({ error: 'Feed not found' });
  res.json(feed);
});

// DELETE /:feedId — Delete a feed
router.delete('/:feedId', async (req, res) => {
  try {
    const result = await storage.deleteDataFeed(req.params.id, req.params.feedId);
    if (!result) return res.status(404).json({ error: 'Feed not found' });
    res.json({ deleted: true });
  } catch (err) {
    log.error('DataFeedRoute', 'DELETE failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
