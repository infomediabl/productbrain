/**
 * Route: Taboola Campaign Cloner
 * Mount: /api/containers/:id/taboola-campaign (via server.js)
 * Agent: taboola-agent.previewCopy(), launchPreview()
 * Deps: express, storage, taboola-agent, taboola-auth, logger
 *
 * POST /                    — Generate AI copy preview (step 1)
 * POST /:campaignId/launch  — Confirm & launch on Taboola (step 2)
 * GET  /:campaignId         — Get specific campaign result
 * GET  /                    — List all Taboola campaigns
 * GET  /test-auth           — Test Taboola credentials
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { previewCopy, launchPreview } = require('../agents/taboola-agent');
const { getTaboolaToken } = require('../utils/taboola-auth');
const log = require('../logger');

const SRC = 'TaboolaRoute';

// Test Taboola credentials (must be before /:campaignId to avoid route conflict)
router.get('/test-auth', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const settings = container.settings || {};
  const taboolaCredentials = settings.taboola || {};

  try {
    await getTaboolaToken(taboolaCredentials);
    res.json({ success: true });
  } catch (err) {
    log.warn(SRC, 'Auth test failed', { err: err.message });
    res.json({ success: false, error: err.message });
  }
});

// Step 1: Generate AI copy preview
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const { ad_ids, campaign_name, daily_cap, cpc_bid, country_targeting, platform_targeting } = req.body;

  if (!ad_ids || !Array.isArray(ad_ids) || ad_ids.length === 0) {
    return res.status(400).json({ error: 'ad_ids must be a non-empty array' });
  }

  try {
    const campaign = await previewCopy(req.params.id, {
      ad_ids,
      campaign_name,
      daily_cap: daily_cap !== undefined ? Number(daily_cap) : undefined,
      cpc_bid: cpc_bid !== undefined ? Number(cpc_bid) : undefined,
      country_targeting,
      platform_targeting,
    });
    res.status(202).json({ taboola_campaign_id: campaign.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start preview', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Step 2: Confirm & launch from preview
router.post('/:campaignId/launch', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const campaign = storage.getTaboolaCampaign(req.params.id, req.params.campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'preview') {
    return res.status(400).json({ error: `Campaign is not in preview status (current: ${campaign.status})` });
  }

  try {
    // Accept optional edited items from the user
    const editedItems = req.body.edited_items || null;
    await launchPreview(req.params.id, req.params.campaignId, editedItems);
    res.status(202).json({ taboola_campaign_id: req.params.campaignId, status: 'launching' });
  } catch (err) {
    log.error(SRC, 'Failed to launch campaign', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific campaign
router.get('/:campaignId', (req, res) => {
  const campaign = storage.getTaboolaCampaign(req.params.id, req.params.campaignId);
  if (!campaign) return res.status(404).json({ error: 'Taboola campaign not found' });
  res.json(campaign);
});

// List all Taboola campaigns
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const campaigns = (container.taboola_campaigns || []).map(c => ({
    id: c.id,
    created_at: c.created_at,
    status: c.status,
    source_ad_ids: c.result?.source_ad_ids || c.source_ad_ids || [],
    campaign_name: c.result?.campaign_name || c.result?.settings?.campaign_name || null,
    campaign_url: c.result?.campaign_url || null,
    taboola_campaign_id: c.result?.taboola_campaign_id || null,
  }));
  res.json(campaigns);
});

module.exports = router;
