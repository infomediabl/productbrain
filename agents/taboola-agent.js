/**
 * Agent: Taboola Campaign Cloner
 * Route: routes/taboola.js → POST /api/containers/:id/taboola-campaign
 * Deps: config, storage, logger, parse-json, gather-data (gatherContainerContext), taboola-auth
 * Stores: storage.taboola_campaigns[]
 *
 * Clones top-performing FB ads from scrape_results into live Taboola campaigns
 * via the Backstage API. Generates Taboola-optimized copy via Claude.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');
const { getTaboolaToken } = require('../utils/taboola-auth');

const SRC = 'TaboolaAgent';

const AGENT_META = {
  code: 'ag0018',
  id: 'taboola',
  name: 'Taboola Campaign Cloner',
  description: 'Clones top FB ads into live Taboola campaigns with AI-optimized copy.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'FB ads to clone into Taboola' },
    { agent: 'container-context', dataKey: 'container_context', description: 'Curated insights for copy optimization' },
  ],
  outputs: { storageKey: 'taboola_campaigns', dataType: 'json', schema: 'TaboolaCampaign' },
  ui: { visible: true },
  prompt_summary: 'Adapts Facebook ad copy for Taboola native advertising with curiosity-driven titles under 60 chars and descriptions under 150 chars.',
  prompt_template: `USER (single message, no system prompt):
You are adapting Facebook ads for Taboola native advertising. Taboola titles must be curiosity-driven, teaser-style headlines under 60 characters. Descriptions should be under 150 characters and compelling.

PRODUCT CONTEXT:
Product: [product name]
CURATED INSIGHTS: [container context briefs, if available]

SOURCE FACEBOOK ADS:
Ad 1 (id: [id]):
  Headline: [headline]
  Description: [description]
  CTA: [cta]
  URL: [url]
[...repeated for each selected ad]

For each ad, generate a Taboola-optimized version. Return JSON array:
[
  {
    "source_ad_id": "<original ad id>",
    "taboola_title": "<under 60 chars, curiosity/teaser style>",
    "taboola_description": "<under 150 chars, compelling>",
    "destination_url": "<landing page URL from original ad>"
  }
]

Rules:
- Titles: Use curiosity gaps, numbers, or surprising angles. No clickbait that can't be delivered.
- Keep the core value proposition but reframe for native ad context.
- If the original URL is empty, use a placeholder "#".
- Return ONLY the JSON array.`,
};

async function previewCopy(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const campaign = await storage.addTaboolaCampaign(containerId);
  if (!campaign) throw new Error('Failed to create Taboola campaign record');

  await storage.updateTaboolaCampaign(containerId, campaign.id, 'generating', {
    source_ad_ids: options.ad_ids || [],
  });

  executePreview(containerId, campaign.id, container, options).catch(async (err) => {
    log.error(SRC, 'Taboola preview generation crashed', { err: err.message });
    try {
      await storage.updateTaboolaCampaign(containerId, campaign.id, 'failed', {
        source_ad_ids: options.ad_ids || [],
        error: err.message,
        failed_step: 'unknown',
      });
    } catch (e) {}
  });

  return campaign;
}

async function launchPreview(containerId, campaignId, editedItems) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const campaign = storage.getTaboolaCampaign(containerId, campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'preview') throw new Error('Campaign is not in preview status');

  const preview = campaign.result;
  if (!preview || !preview.taboola_copy) throw new Error('No preview data available');

  await storage.updateTaboolaCampaign(containerId, campaignId, 'launching', preview);

  executeLaunch(containerId, campaignId, container, preview, editedItems).catch(async (err) => {
    log.error(SRC, 'Taboola launch crashed', { err: err.message });
    try {
      await storage.updateTaboolaCampaign(containerId, campaignId, 'failed', {
        ...preview,
        error: err.message,
        failed_step: 'unknown',
      });
    } catch (e) {}
  });
}

// Legacy: direct clone without preview (kept for backwards compatibility)
async function cloneToCampaign(containerId, options = {}) {
  return previewCopy(containerId, options);
}

// --- Phase 1: Generate preview (AI copy only, no Taboola API calls) ---
async function executePreview(containerId, campaignId, container, options) {
  const {
    ad_ids = [],
    campaign_name,
    daily_cap = 20,
    cpc_bid = 0.5,
    country_targeting = ['US'],
    platform_targeting = ['DESK', 'PHON', 'TBLT'],
  } = options;

  // --- Step A: Gather source data ---
  log.info(SRC, 'Gathering source ads for preview', { containerId, adCount: ad_ids.length });

  const sourceAds = gatherSourceAds(container, ad_ids);

  if (sourceAds.length === 0) {
    await storage.updateTaboolaCampaign(containerId, campaignId, 'failed', {
      source_ad_ids: ad_ids,
      error: 'No matching ads found in scrape results',
      failed_step: 'gather_source_data',
    });
    return;
  }

  const contextItems = gatherContainerContext(container);
  const contextText = contextItems
    ? contextItems.map(c => `[${c.source_type}] ${c.section_name}: ${c.brief}`).join('\n\n')
    : '';

  const productName = container.my_product?.name || container.name || 'Product';
  const finalCampaignName = campaign_name || `${productName} Taboola Test - ${new Date().toISOString().split('T')[0]}`;

  // --- Step B: Generate Taboola-optimized copy via Claude ---
  log.info(SRC, 'Generating Taboola-optimized copy', { adCount: sourceAds.length });

  let taboolaCopy;
  try {
    taboolaCopy = await generateTaboolaCopy(sourceAds, productName, contextText);
    log.info(SRC, 'Preview copy generated', { itemCount: taboolaCopy.length });
  } catch (err) {
    log.error(SRC, 'Copy generation failed', { err: err.message });
    await storage.updateTaboolaCampaign(containerId, campaignId, 'failed', {
      source_ad_ids: ad_ids,
      error: `Copy generation failed: ${err.message}`,
      failed_step: 'copy_generation',
    });
    return;
  }

  // Save preview with source ads + AI copy + settings (no Taboola API call yet)
  await storage.updateTaboolaCampaign(containerId, campaignId, 'preview', {
    source_ad_ids: ad_ids,
    source_ads: sourceAds,
    taboola_copy: taboolaCopy,
    settings: { campaign_name: finalCampaignName, daily_cap, cpc_bid, country_targeting, platform_targeting },
  });

  log.info(SRC, 'Preview ready', { campaignId, itemCount: taboolaCopy.length });
}

// --- Phase 2: Launch from preview (creates Taboola campaign + items) ---
async function executeLaunch(containerId, campaignId, container, preview, editedItems) {
  const { source_ads: sourceAds, settings } = preview;
  const { campaign_name, daily_cap, cpc_bid, country_targeting, platform_targeting } = settings;

  // Use edited items if provided, otherwise use original AI copy
  const taboolaCopy = editedItems || preview.taboola_copy;

  // --- Step C: Create Taboola Campaign via Backstage API ---
  log.info(SRC, 'Creating Taboola campaign');

  const containerSettings = container.settings || {};
  const taboolaCredentials = containerSettings.taboola || {};
  const accountId = taboolaCredentials.account_id || config.TABOOLA_ACCOUNT_ID;

  if (!accountId) {
    await storage.updateTaboolaCampaign(containerId, campaignId, 'failed', {
      ...preview,
      error: 'Taboola Account ID not configured',
      failed_step: 'campaign_creation',
    });
    return;
  }

  let token;
  try {
    token = await getTaboolaToken(taboolaCredentials);
  } catch (err) {
    await storage.updateTaboolaCampaign(containerId, campaignId, 'failed', {
      ...preview,
      error: `Authentication failed: ${err.message}`,
      failed_step: 'authentication',
    });
    return;
  }

  let taboolaCampaignId;
  try {
    const campaignPayload = {
      name: campaign_name,
      branding_text: container.my_product?.name || container.name || 'Product',
      cpc: cpc_bid,
      daily_cap: daily_cap,
      spending_limit_model: 'ENTIRE',
      country_targeting: { type: 'INCLUDE', value: country_targeting },
      platform_targeting: { type: 'INCLUDE', value: platform_targeting },
      status: 'ACTIVE',
      start_date: new Date().toISOString().split('T')[0],
    };

    const campaignRes = await fetch(
      `https://backstage.taboola.com/backstage/api/1.0/${accountId}/campaigns/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(campaignPayload),
      }
    );

    if (!campaignRes.ok) {
      const errBody = await campaignRes.text();
      throw new Error(`Campaign creation failed (${campaignRes.status}): ${errBody}`);
    }

    const campaignData = await campaignRes.json();
    taboolaCampaignId = campaignData.id;
    log.info(SRC, 'Campaign created', { taboolaCampaignId });
  } catch (err) {
    log.error(SRC, 'Campaign creation failed', { err: err.message });
    await storage.updateTaboolaCampaign(containerId, campaignId, 'failed', {
      ...preview,
      error: err.message,
      failed_step: 'campaign_creation',
    });
    return;
  }

  // --- Step D: Upload images and create campaign items ---
  log.info(SRC, 'Creating campaign items');

  const itemResults = [];
  for (const copy of taboolaCopy) {
    try {
      const sourceAd = sourceAds.find(a => a.id === copy.source_ad_id);
      let imageUrl = sourceAd?.image_url || '';

      // If local screenshot, upload to Taboola
      if (!imageUrl && sourceAd?.screenshot_path) {
        imageUrl = await uploadScreenshot(sourceAd.screenshot_path, accountId, token);
      }

      const itemPayload = {
        url: copy.destination_url || '#',
        title: copy.taboola_title,
        description: copy.taboola_description || '',
        status: 'ACTIVE',
      };
      if (imageUrl) itemPayload.thumbnail_url = imageUrl;

      const itemRes = await fetch(
        `https://backstage.taboola.com/backstage/api/1.0/${accountId}/campaigns/${taboolaCampaignId}/items/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(itemPayload),
        }
      );

      if (!itemRes.ok) {
        const errBody = await itemRes.text();
        log.warn(SRC, 'Item creation failed', { sourceAdId: copy.source_ad_id, error: errBody });
        itemResults.push({
          source_ad_id: copy.source_ad_id,
          taboola_item_id: null,
          taboola_title: copy.taboola_title,
          status: 'failed',
          error: errBody,
        });
        continue;
      }

      const itemData = await itemRes.json();
      itemResults.push({
        source_ad_id: copy.source_ad_id,
        taboola_item_id: itemData.id,
        taboola_title: copy.taboola_title,
        taboola_description: copy.taboola_description,
        destination_url: copy.destination_url,
        image_url: imageUrl,
        status: 'created',
      });

      log.info(SRC, 'Item created', { taboolaItemId: itemData.id });
    } catch (err) {
      log.warn(SRC, 'Item creation error', { sourceAdId: copy.source_ad_id, err: err.message });
      itemResults.push({
        source_ad_id: copy.source_ad_id,
        taboola_item_id: null,
        taboola_title: copy.taboola_title,
        status: 'failed',
        error: err.message,
      });
    }
  }

  // --- Step E: Save results ---
  const campaignUrl = `https://ads.taboola.com/campaigns/${taboolaCampaignId}`;
  const successCount = itemResults.filter(i => i.status === 'created').length;

  await storage.updateTaboolaCampaign(containerId, campaignId, 'completed', {
    source_ad_ids: preview.source_ad_ids,
    source_ads: sourceAds,
    taboola_copy: taboolaCopy,
    campaign_name,
    taboola_campaign_id: taboolaCampaignId,
    campaign_url: campaignUrl,
    daily_cap,
    cpc_bid,
    country_targeting,
    platform_targeting,
    items: itemResults,
    items_created: successCount,
    items_failed: itemResults.length - successCount,
  });

  log.info(SRC, 'Campaign launch completed', {
    taboolaCampaignId,
    itemsCreated: successCount,
    itemsFailed: itemResults.length - successCount,
  });
}

// --- Shared helpers ---

function gatherSourceAds(container, adIds) {
  const sourceAds = [];
  for (const scrape of (container.scrape_results || [])) {
    if (scrape.status !== 'completed' || !scrape.scraped_data) continue;
    const sd = scrape.scraped_data;

    // Build ad list with composite IDs matching frontend: scrapeId:group:source:index
    const groups = [];
    if (sd.my_product) {
      for (const src of ['facebook', 'google']) {
        const ads = sd.my_product[src] || [];
        for (let i = 0; i < ads.length; i++) {
          groups.push({ ad: ads[i], compositeId: scrape.id + ':my_product:' + src + ':' + i });
        }
      }
    }
    for (const [compId, compData] of Object.entries(sd.competitors || {})) {
      for (const src of ['facebook', 'google']) {
        const ads = compData[src] || [];
        for (let i = 0; i < ads.length; i++) {
          groups.push({ ad: ads[i], compositeId: scrape.id + ':' + compId + ':' + src + ':' + i });
        }
      }
    }

    for (const { ad, compositeId } of groups) {
      const adId = ad.id || compositeId;
      if (adIds.includes(adId)) {
        sourceAds.push({
          id: adId,
          headline: ad.ocr_structured?.headline || ad.headline || ad.title || '',
          description: ad.ocr_structured?.description || ad.ad_text || ad.description || ad.body || '',
          cta: ad.ocr_structured?.cta || ad.cta_text || ad.cta || '',
          url: ad.ocr_structured?.url || ad.link_url || ad.destination_url || ad.url || '',
          image_url: ad.media_url || ad.image_url || '',
          screenshot_path: ad.local_media_path || ad.screenshot_path || '',
        });
      }
    }
  }
  return sourceAds;
}

async function generateTaboolaCopy(sourceAds, productName, contextText) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  const adSummaries = sourceAds.map((ad, i) => (
    `Ad ${i + 1} (id: ${ad.id}):\n  Headline: ${ad.headline}\n  Description: ${ad.description}\n  CTA: ${ad.cta}\n  URL: ${ad.url}`
  )).join('\n\n');

  const prompt = `${config.APP_CONTEXT}

You are adapting Facebook ads for Taboola native advertising. Taboola titles must be curiosity-driven, teaser-style headlines under 60 characters. Descriptions should be under 150 characters and compelling.

PRODUCT CONTEXT:
Product: ${productName}
${contextText ? `\nCURATED INSIGHTS:\n${contextText}` : ''}

SOURCE FACEBOOK ADS:
${adSummaries}

For each ad, generate a Taboola-optimized version. Return JSON array:
[
  {
    "source_ad_id": "<original ad id>",
    "taboola_title": "<under 60 chars, curiosity/teaser style>",
    "taboola_description": "<under 150 chars, compelling>",
    "destination_url": "<landing page URL from original ad>"
  }
]

Rules:
- Titles: Use curiosity gaps, numbers, or surprising angles. No clickbait that can't be delivered.
- Keep the core value proposition but reframe for native ad context.
- If the original URL is empty, use a placeholder "#".
- Return ONLY the JSON array.`;

  const response = await client.messages.create({
    model: config.AI_MODEL,
    max_tokens: config.DEFAULT_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.content[0].text;
  const taboolaCopy = parseJsonFromResponse(responseText);

  if (!Array.isArray(taboolaCopy)) {
    throw new Error('AI response was not a valid JSON array');
  }

  return taboolaCopy;
}

async function uploadScreenshot(screenshotPath, accountId, token) {
  const fs = require('fs');
  const path = require('path');
  const fullPath = path.resolve(__dirname, '..', screenshotPath);
  if (!fs.existsSync(fullPath)) return '';

  try {
    const imageData = fs.readFileSync(fullPath);
    const boundary = '----TaboolaUpload' + Date.now();
    const filename = path.basename(fullPath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
      imageData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(
      `https://backstage.taboola.com/backstage/api/1.0/${accountId}/resources/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );

    if (uploadRes.ok) {
      const uploadData = await uploadRes.json();
      const url = uploadData.url || uploadData.thumbnail_url || '';
      log.info(SRC, 'Image uploaded', { imageUrl: url });
      return url;
    }
    log.warn(SRC, 'Image upload failed, continuing without image', { status: uploadRes.status });
  } catch (err) {
    log.warn(SRC, 'Image upload error', { err: err.message });
  }
  return '';
}

module.exports = { previewCopy, launchPreview, cloneToCampaign, AGENT_META };
