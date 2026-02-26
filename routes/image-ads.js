/**
 * Route: Image Ad Creator
 * Mount: /api/containers/:id/image-ads (via server.js)
 * Agent: image-ad-agent.generateImageAds()
 * Deps: express, storage, image-ad-agent, logger
 *
 * POST /      — Trigger image ad generation (accepts platform, objective, target_audience, tone, color_scheme, ad_count, image_models, custom_instructions)
 * GET  /:adId — Get a specific image ad set
 * GET  /      — List all image ad sets
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateImageAds } = require('../agents/image-ad-agent');
const log = require('../logger');

const SRC = 'ImageAdsRoute';

// Trigger image ad generation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const options = {
    platform: req.body.platform || '',
    objective: req.body.objective || '',
    target_audience: req.body.target_audience || '',
    tone: req.body.tone || '',
    color_scheme: req.body.color_scheme || '',
    ad_count: parseInt(req.body.ad_count) || 3,
    image_models: req.body.image_models || ['midjourney', 'dalle', 'nano_banana'],
    custom_instructions: req.body.custom_instructions || '',
  };

  try {
    const ad = await generateImageAds(req.params.id, options);
    res.status(202).json({ ad_id: ad.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start image ad generation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific image ad set
router.get('/:adId', (req, res) => {
  const ad = storage.getImageAd(req.params.id, req.params.adId);
  if (!ad) return res.status(404).json({ error: 'Image ad not found' });
  res.json(ad);
});

// List all image ad sets
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const ads = (container.image_ads || []).map(a => ({
    id: a.id, created_at: a.created_at, status: a.status,
  }));
  res.json(ads);
});

module.exports = router;
