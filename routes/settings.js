/**
 * Route: Project Settings
 * Mount: /api/containers/:id/settings (via server.js)
 * Agent: None
 * Deps: express, storage, logger
 *
 * GET / — Get container settings (FB Pixel, GA, custom tracking codes)
 * PUT / — Update container settings (merge allowed keys)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const log = require('../logger');

const SRC = 'SettingsRoute';

// Get container settings
router.get('/', (req, res) => {
  const settings = storage.getSettings(req.params.id);
  if (settings === null) return res.status(404).json({ error: 'Container not found' });
  res.json(settings);
});

// Update container settings (merge)
router.put('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const allowed = ['facebook_pixel_id', 'google_analytics_id', 'custom_head_code', 'custom_body_code', 'auto_scrape_enabled'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  try {
    const settings = await storage.updateSettings(req.params.id, updates);
    log.info(SRC, 'Settings updated', { containerId: req.params.id, keys: Object.keys(updates) });
    res.json(settings);
  } catch (err) {
    log.error(SRC, 'Failed to update settings', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
