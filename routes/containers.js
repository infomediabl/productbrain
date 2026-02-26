/**
 * Route: Container CRUD
 * Mount: /api/containers (via server.js)
 * Agent: None
 * Deps: express, storage
 *
 * GET    /     — List all containers (summary)
 * GET    /:id  — Get full container by ID
 * POST   /     — Create a new container
 * PUT    /:id  — Update a container
 * DELETE /:id  — Delete a container
 */
const express = require('express');
const router = express.Router();
const storage = require('../storage');

// List all containers (summary)
router.get('/', (req, res) => {
  res.json(storage.listContainers());
});

// Get full container
router.get('/:id', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  res.json(container);
});

// Create container
router.post('/', (req, res) => {
  const { name, my_product, competitors } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  // my_product is optional — null means "no existing product"
  try {
    const container = storage.createContainer({ name, my_product: my_product || null, competitors: competitors || [] });
    res.status(201).json(container);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update container
router.put('/:id', async (req, res) => {
  const existing = storage.readContainer(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Container not found' });
  try {
    const updated = await storage.updateContainer(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Container not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete container
router.delete('/:id', (req, res) => {
  const existed = storage.deleteContainer(req.params.id);
  if (!existed) return res.status(404).json({ error: 'Container not found' });
  res.json({ success: true });
});

module.exports = router;
