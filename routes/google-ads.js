/**
 * Route: Google Ads
 * Mount: /api/google-ads (via server.js)
 * Agent: google-ads-agent (isConfigured, generateKeywordIdeas, listAccessibleAccounts, listCampaigns, getCampaignKeywords, analyzeCampaigns)
 * Deps: express, google-ads-agent, storage, logger
 *
 * GET  /status                         — Check if Google Ads API credentials are configured
 * POST /keyword-ideas                  — Generate keyword ideas (requires keywords/url)
 * GET  /accounts                       — List accessible client accounts under MCC
 * GET  /campaigns                      — List campaigns (optional ?account_id)
 * GET  /campaigns/:campaignId/keywords — Get keywords for a campaign
 * POST /analyze-campaigns              — Analyze selected campaigns with AI (async with container_id, or sync without)
 * GET  /analysis/:analysisId           — Poll for campaign analysis result (requires ?container_id)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const googleAds = require('../agents/google-ads-agent');
const storage = require('../storage');
const log = require('../logger');

const SRC = 'GoogleAdsRoute';

// Check if Google Ads is configured
router.get('/status', (req, res) => {
  res.json({
    configured: googleAds.isConfigured(),
    required_credentials: [
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_CUSTOMER_ID',
    ],
  });
});

// Generate keyword ideas
router.post('/keyword-ideas', async (req, res) => {
  if (!googleAds.isConfigured()) {
    return res.status(400).json({ error: 'Google Ads credentials not configured. Add them to your .env file.' });
  }

  const { keywords, url, language, geo_targets, container_id } = req.body;

  try {
    // If container_id provided, persist the results
    let record = null;
    if (container_id) {
      record = await storage.addKeywordIdeas(container_id, {
        seed_keywords: keywords || [],
        url: url || '',
        geo_targets: geo_targets || [],
        language: language || '',
      });
      if (!record) {
        return res.status(404).json({ error: 'Container not found' });
      }
    }

    const ideas = await googleAds.generateKeywordIdeas({
      keywords,
      url,
      language,
      geo_targets,
    });

    // Persist completed result if container_id was provided
    if (container_id && record) {
      await storage.updateKeywordIdeas(container_id, record.id, 'completed', {
        ideas,
        count: ideas.length,
        fetched_at: new Date().toISOString(),
      });
    }

    res.json({ ideas, count: ideas.length, record_id: record ? record.id : undefined });
  } catch (err) {
    const errMsg = extractGadsError(err);
    log.error(SRC, 'Keyword ideas failed', { error: errMsg, raw: err.message, errors: err.errors, details: err.details });

    // Persist failure if container_id was provided
    if (container_id) {
      try {
        const records = storage.readContainer(container_id)?.keyword_ideas || [];
        const latest = records[records.length - 1];
        if (latest && latest.status === 'fetching') {
          await storage.updateKeywordIdeas(container_id, latest.id, 'failed', { error: errMsg });
        }
      } catch (e) { /* ignore storage error during error handling */ }
    }

    res.status(500).json({ error: errMsg });
  }
});

// List accessible client accounts under the MCC
router.get('/accounts', async (req, res) => {
  if (!googleAds.isConfigured()) {
    return res.status(400).json({ error: 'Google Ads credentials not configured.' });
  }

  try {
    const accounts = await googleAds.listAccessibleAccounts();
    res.json({ accounts, count: accounts.length });
  } catch (err) {
    const errMsg = extractGadsError(err);
    log.error(SRC, 'List accounts failed', { error: errMsg, raw: err.message, errors: err.errors, details: err.details });
    res.status(500).json({ error: errMsg });
  }
});

// List campaigns (pass ?account_id=xxx for client accounts under MCC)
router.get('/campaigns', async (req, res) => {
  if (!googleAds.isConfigured()) {
    return res.status(400).json({ error: 'Google Ads credentials not configured.' });
  }

  try {
    const campaigns = await googleAds.listCampaigns(req.query.account_id);
    res.json({ campaigns, count: campaigns.length });
  } catch (err) {
    const errMsg = extractGadsError(err);
    log.error(SRC, 'List campaigns failed', { error: errMsg, raw: err.message, errors: err.errors, details: err.details });
    res.status(500).json({ error: errMsg });
  }
});

// Get campaign keywords
router.get('/campaigns/:campaignId/keywords', async (req, res) => {
  if (!googleAds.isConfigured()) {
    return res.status(400).json({ error: 'Google Ads credentials not configured.' });
  }

  try {
    const keywords = await googleAds.getCampaignKeywords(req.params.campaignId, req.query.account_id);
    res.json({ keywords, count: keywords.length });
  } catch (err) {
    const errMsg = extractGadsError(err);
    log.error(SRC, 'Get campaign keywords failed', { error: errMsg, raw: err.message, errors: err.errors, details: err.details });
    res.status(500).json({ error: errMsg });
  }
});

// Analyze selected campaigns with Claude AI
router.post('/analyze-campaigns', async (req, res) => {
  if (!googleAds.isConfigured()) {
    return res.status(400).json({ error: 'Google Ads credentials not configured.' });
  }

  const { campaigns, account_id, container_id } = req.body;
  if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
    return res.status(400).json({ error: 'Select at least one campaign to analyze.' });
  }

  // If container_id provided, run async with storage
  if (container_id) {
    try {
      const analysis = await storage.addGadsAnalysis(container_id);
      if (!analysis) return res.status(404).json({ error: 'Container not found' });

      res.status(202).json({ analysis_id: analysis.id, status: 'analyzing' });

      // Run analysis async
      (async () => {
        try {
          // Fetch campaign details + keywords for each
          const campaignData = [];
          for (const campaignId of campaigns) {
            try {
              const allCampaigns = await googleAds.listCampaigns(account_id);
              const campaign = allCampaigns.find(c => c.id === campaignId);
              if (campaign) {
                let keywords = [];
                try {
                  keywords = await googleAds.getCampaignKeywords(campaignId, account_id);
                } catch (e) {
                  log.warn(SRC, 'Failed to get keywords for campaign', { campaignId, err: e.message });
                }
                campaignData.push({ ...campaign, keywords });
              }
            } catch (e) {
              log.warn(SRC, 'Failed to fetch campaign', { campaignId, err: e.message });
            }
          }

          // Save campaign metadata on the analysis record
          await storage.updateGadsAnalysisMeta(container_id, analysis.id, {
            campaigns_meta: campaignData.map(c => ({
              id: c.id, name: c.name, status: c.status,
              channel_type: c.channel_type, budget_micros: c.budget_micros,
              impressions: c.impressions, clicks: c.clicks, cost_micros: c.cost_micros,
              keyword_count: (c.keywords || []).length,
            })),
            account_id: account_id,
            data_columns: ['impressions', 'clicks', 'cost', 'budget', 'keywords', 'conversions', 'avg_cpc'],
          });

          const result = await googleAds.analyzeCampaigns(campaignData);
          result.campaigns = campaignData;  // persist campaign + keyword data for downstream agents
          await storage.updateGadsAnalysis(container_id, analysis.id, 'completed', result);
        } catch (err) {
          log.error(SRC, 'Campaign analysis failed', { err: err.message });
          await storage.updateGadsAnalysis(container_id, analysis.id, 'failed', { error: err.message });
        }
      })();
    } catch (err) {
      log.error(SRC, 'Failed to start analysis', { err: err.message });
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // Synchronous mode (no container_id)
  try {
    const campaignData = [];
    for (const campaignId of campaigns) {
      const allCampaigns = await googleAds.listCampaigns(account_id);
      const campaign = allCampaigns.find(c => c.id === campaignId);
      if (campaign) {
        let keywords = [];
        try {
          keywords = await googleAds.getCampaignKeywords(campaignId, account_id);
        } catch (e) {}
        campaignData.push({ ...campaign, keywords });
      }
    }
    const result = await googleAds.analyzeCampaigns(campaignData);
    result.campaigns = campaignData;  // include campaign + keyword data in response
    res.json(result);
  } catch (err) {
    const errMsg = extractGadsError(err);
    log.error(SRC, 'Campaign analysis failed', { error: errMsg });
    res.status(500).json({ error: errMsg });
  }
});

// Poll for analysis result
router.get('/analysis/:analysisId', (req, res) => {
  const containerId = req.query.container_id;
  if (!containerId) return res.status(400).json({ error: 'container_id query param required' });
  const analysis = storage.getGadsAnalysis(containerId, req.params.analysisId);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
  res.json(analysis);
});

function extractGadsError(err) {
  // google-ads-api errors can be deeply nested
  if (err.errors && err.errors.length > 0) {
    const first = err.errors[0];
    return first.message || first.error_code || JSON.stringify(first);
  }
  if (err.details) return typeof err.details === 'string' ? err.details : JSON.stringify(err.details);
  if (err.message) return err.message;
  return JSON.stringify(err, Object.getOwnPropertyNames(err));
}

module.exports = router;
