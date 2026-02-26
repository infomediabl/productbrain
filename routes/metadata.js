/**
 * Route: Metadata CRUD
 * Mount: /api/containers/:id/metadata (via server.js)
 * Agent: None
 * Deps: express, storage
 *
 * GET    /        — List metadata for a container
 * POST   /        — Add a metadata entry
 * PUT    /:metaId — Update a metadata entry
 * DELETE /:metaId — Delete a metadata entry
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');

// List metadata for container
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  res.json(container.metadata || []);
});

// Add metadata entry
router.post('/', async (req, res) => {
  const { type, title, content } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const entry = await storage.addMetadata(req.params.id, { type, title, content });
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update metadata entry
router.put('/:metaId', async (req, res) => {
  try {
    const entry = await storage.updateMetadata(req.params.id, req.params.metaId, req.body);
    if (!entry) return res.status(404).json({ error: 'Metadata entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete metadata entry
router.delete('/:metaId', async (req, res) => {
  try {
    const result = await storage.deleteMetadata(req.params.id, req.params.metaId);
    if (!result) return res.status(404).json({ error: 'Metadata entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
