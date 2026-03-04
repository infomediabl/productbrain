/**
 * Route: Folder Ad Importer
 * Mount: /api/containers/:id/folder-scrape (via server.js)
 * Agent: folder-scraper-agent.importFromFolder()
 * Deps: express, folder-scraper-agent, logger
 *
 * POST /        — Trigger folder import
 * GET  /status  — Check if upload folder exists
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const { importFromFolder, checkFolderStatus } = require('../agents/folder-scraper-agent');
const log = require('../logger');

router.get('/status', (req, res) => {
  try {
    const status = checkFolderStatus(req.params.id);
    res.json(status);
  } catch (err) {
    log.error('FolderScraperRoute', 'Status check failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const containerId = req.params.id;
  try {
    const result = await importFromFolder(containerId);
    res.status(202).json({ scrape_id: result.scrape_id, status: 'completed', total_ads: result.total_ads });
  } catch (err) {
    log.error('FolderScraperRoute', 'Import failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
