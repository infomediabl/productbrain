/**
 * Agent: Google Ads Integration
 * Route: routes/google-ads.js → /api/google-ads (status, keyword-ideas, accounts, campaigns, analyze)
 * Deps: config, logger, parse-json, Google Ads API (google-ads-api)
 * Stores: storage.gads_analyses[] (via route, not directly)
 *
 * Google Ads API integration for keyword ideas, campaign listing, keyword
 * performance, and AI-powered campaign analysis. Requires .env credentials.
 */

const log = require('../logger');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');

const SRC = 'GoogleAdsAgent';

const AGENT_META = {
  code: 'ag0009',
  id: 'google-ads',
  name: 'Google Ads Agent',
  description: 'Google Ads API integration: keyword ideas, campaigns, analysis.',
  category: 'api',
  model: 'AI_MODEL',
  operations: {
    isConfigured: { description: 'Check if Google Ads credentials are configured', inputs: [] },
    generateKeywordIdeas: { description: 'Generate keyword ideas from seeds/URL', inputs: [{ name: 'params', type: 'object', required: true, from: null }] },
    listAccessibleAccounts: { description: 'List MCC child accounts', inputs: [] },
    listCampaigns: { description: 'List campaigns for an account', inputs: [{ name: 'accountId', type: 'string', required: false, from: null }] },
    getCampaignKeywords: { description: 'Get keyword performance for a campaign', inputs: [{ name: 'campaignId', type: 'string', required: true, from: null }, { name: 'accountId', type: 'string', required: false, from: null }] },
    analyzeCampaigns: { description: 'AI analysis of campaign data', inputs: [{ name: 'campaignData', type: 'array', required: true, from: null }, { name: 'options', type: 'object', required: false, from: null }] },
  },
  consumes: [],
  outputs: { storageKey: 'gads_analyses', dataType: 'json', schema: 'GadsAnalysis' },
  ui: { visible: true },
  prompt_summary: 'Connects to Google Ads API for keyword ideas, campaign listing, and campaign performance analysis with spend efficiency recommendations.',
  prompt_template: `SYSTEM: You are an expert Google Ads strategist and PPC analyst. Analyze campaign data and provide actionable, data-driven recommendations. Focus on spend efficiency, keyword performance, and growth opportunities. Be specific and practical in your recommendations.

CRITICAL: Output ONLY valid JSON matching the structure specified.

USER: Analyze the following Google Ads campaigns and provide actionable insights:

Campaign: \${campaignName} (ID: \${campaignId})
  Status: \${status}
  Channel: \${channelType}
  Budget: \${budget}/day
  Impressions: \${impressions}
  Clicks: \${clicks}
  Cost: \${cost}
  Bidding: \${biddingStrategy}
  Keywords:
  - "\${keyword}" (\${matchType}) imp:\${impressions} clicks:\${clicks} cost:\${cost} conv:\${conversions}

## Output Format
Return a JSON object with this structure:
{
  "summary": "Overall assessment of the campaigns (2-3 sentences)",
  "campaigns_analyzed": N,
  "findings": [{
    "campaign_name": "", "campaign_id": "",
    "status_assessment": "good | needs_attention | critical",
    "recommendations": ["specific actionable recommendation"]
  }],
  "action_items": [{ "priority": "high | medium | low", "action": "specific action to take" }]
}`,
};

/**
 * Create a Google Ads API client instance.
 * Throws if credentials are not configured.
 */
function createClient() {
  const { GoogleAdsApi } = require('google-ads-api');

  const requiredEnvVars = [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Google Ads credentials not configured. Missing: ${missing.join(', ')}. See .env.example for setup instructions.`);
  }

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });

  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
  });

  return { client, customer };
}

/**
 * Create a client targeting a specific child account under the MCC.
 */
function createClientForAccount(accountId) {
  const { GoogleAdsApi } = require('google-ads-api');

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });

  const customer = client.Customer({
    customer_id: accountId,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID,
  });

  return { client, customer };
}

/**
 * Check if Google Ads credentials are configured.
 */
function isConfigured() {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

/**
 * Generate keyword ideas from seed keywords and/or URL.
 * @param {object} params
 * @param {string[]} [params.keywords] - Seed keywords
 * @param {string} [params.url] - Seed URL for keyword extraction
 * @param {string} [params.language] - Language resource name (default: English)
 * @param {string[]} [params.geo_targets] - Geo target resource names
 */
async function generateKeywordIdeas(params = {}) {
  const { customer } = createClient();

  const requestParams = {
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    language: params.language || 'languageConstants/1000', // English
    geo_target_constants: params.geo_targets || ['geoTargetConstants/2840'], // US
    keyword_plan_network: 'GOOGLE_SEARCH',
  };

  if (params.keywords && params.keywords.length > 0 && params.url) {
    requestParams.keyword_and_url_seed = {
      keywords: params.keywords,
      url: params.url,
    };
  } else if (params.keywords && params.keywords.length > 0) {
    requestParams.keyword_seed = { keywords: params.keywords };
  } else if (params.url) {
    requestParams.url_seed = { url: params.url };
  } else {
    throw new Error('Either keywords or url is required');
  }

  log.info(SRC, 'Generating keyword ideas', {
    keywords: params.keywords,
    url: params.url,
  });

  try {
    const results = await customer.keywordPlanIdeas.generateKeywordIdeas(requestParams);

    const ideas = results.map(idea => ({
      keyword: idea.text,
      avg_monthly_searches: idea.keyword_idea_metrics?.avg_monthly_searches?.toString() || '0',
      competition: idea.keyword_idea_metrics?.competition || 'UNSPECIFIED',
      competition_index: idea.keyword_idea_metrics?.competition_index || 0,
      low_top_of_page_bid_micros: idea.keyword_idea_metrics?.low_top_of_page_bid_micros?.toString() || '0',
      high_top_of_page_bid_micros: idea.keyword_idea_metrics?.high_top_of_page_bid_micros?.toString() || '0',
    }));

    log.info(SRC, 'Keyword ideas generated', { count: ideas.length });
    return ideas;
  } catch (err) {
    log.error(SRC, 'Failed to generate keyword ideas', { err: err.message });
    throw err;
  }
}

/**
 * List accessible client accounts under the MCC (Manager account).
 */
async function listAccessibleAccounts() {
  const { customer } = createClient();

  log.info(SRC, 'Listing accessible accounts');

  try {
    const results = await customer.query(`
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.manager,
        customer_client.status
      FROM customer_client
      WHERE customer_client.manager = false
        AND customer_client.status = 'ENABLED'
    `);

    return results.map(row => ({
      id: row.customer_client?.id?.toString(),
      name: row.customer_client?.descriptive_name || '',
      is_manager: row.customer_client?.manager || false,
      status: row.customer_client?.status || '',
    }));
  } catch (err) {
    log.error(SRC, 'Failed to list accessible accounts', { err: err.message });
    throw err;
  }
}

/**
 * List campaigns for a specific account (or the configured account).
 * @param {string} [accountId] - Client account ID. If omitted, uses GOOGLE_ADS_CUSTOMER_ID.
 */
async function listCampaigns(accountId) {
  const { customer } = accountId ? createClientForAccount(accountId) : createClient();

  log.info(SRC, 'Listing campaigns', { accountId: accountId || 'default' });

  try {
    const campaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
    `);

    return campaigns.map(row => ({
      id: row.campaign?.id?.toString(),
      name: row.campaign?.name,
      status: row.campaign?.status,
      channel_type: row.campaign?.advertising_channel_type,
      bidding_strategy: row.campaign?.bidding_strategy_type,
      budget_micros: row.campaign_budget?.amount_micros?.toString(),
      impressions: row.metrics?.impressions?.toString() || '0',
      clicks: row.metrics?.clicks?.toString() || '0',
      cost_micros: row.metrics?.cost_micros?.toString() || '0',
    }));
  } catch (err) {
    log.error(SRC, 'Failed to list campaigns', { err: err.message });
    throw err;
  }
}

/**
 * Get keyword performance for a campaign.
 * @param {string} campaignId
 * @param {string} [accountId] - Client account ID.
 */
async function getCampaignKeywords(campaignId, accountId) {
  const { customer } = accountId ? createClientForAccount(accountId) : createClient();

  log.info(SRC, 'Getting campaign keywords', { campaignId, accountId });

  try {
    const keywords = await customer.query(`
      SELECT
        ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.average_cpc
      FROM keyword_view
      WHERE campaign.id = ${campaignId}
        AND ad_group_criterion.status != 'REMOVED'
      ORDER BY metrics.impressions DESC
    `);

    return keywords.map(row => ({
      ad_group: row.ad_group?.name,
      keyword: row.ad_group_criterion?.keyword?.text,
      match_type: row.ad_group_criterion?.keyword?.match_type,
      status: row.ad_group_criterion?.status,
      impressions: row.metrics?.impressions?.toString() || '0',
      clicks: row.metrics?.clicks?.toString() || '0',
      cost_micros: row.metrics?.cost_micros?.toString() || '0',
      conversions: row.metrics?.conversions?.toString() || '0',
      avg_cpc: row.metrics?.average_cpc?.toString() || '0',
    }));
  } catch (err) {
    log.error(SRC, 'Failed to get campaign keywords', { err: err.message });
    throw err;
  }
}

/**
 * Analyze selected campaigns using Claude AI.
 * @param {Array} campaignData - Array of campaign objects with their keywords
 * @param {object} options - Additional context
 */
async function analyzeCampaigns(campaignData, options = {}) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  const campaignSummary = campaignData.map(c => {
    const budget = c.budget_micros ? '$' + (parseInt(c.budget_micros) / 1000000).toFixed(2) : 'N/A';
    const cost = c.cost_micros ? '$' + (parseInt(c.cost_micros) / 1000000).toFixed(2) : '$0';
    let kwSummary = '';
    if (c.keywords && c.keywords.length > 0) {
      kwSummary = c.keywords.map(k =>
        `  - "${k.keyword}" (${k.match_type}) imp:${k.impressions} clicks:${k.clicks} cost:$${(parseInt(k.cost_micros || 0) / 1000000).toFixed(2)} conv:${k.conversions}`
      ).join('\n');
    }
    return `Campaign: ${c.name} (ID: ${c.id})
  Status: ${c.status}
  Channel: ${c.channel_type || 'N/A'}
  Budget: ${budget}/day
  Impressions: ${c.impressions || 0}
  Clicks: ${c.clicks || 0}
  Cost: ${cost}
  Bidding: ${c.bidding_strategy || 'N/A'}
${kwSummary ? '  Keywords:\n' + kwSummary : '  No keyword data available'}`;
  }).join('\n\n');

  const prompt = `Analyze the following Google Ads campaigns and provide actionable insights:

${campaignSummary}

## Output Format
Return a JSON object with this structure:
{
  "summary": "Overall assessment of the campaigns (2-3 sentences)",
  "campaigns_analyzed": ${campaignData.length},
  "findings": [
    {
      "campaign_name": "...",
      "campaign_id": "...",
      "status_assessment": "good | needs_attention | critical",
      "recommendations": ["specific actionable recommendation"]
    }
  ],
  "action_items": [
    { "priority": "high | medium | low", "action": "specific action to take" }
  ]
}`;

  log.info(SRC, 'Sending campaign analysis to Claude', { campaignCount: campaignData.length });

  const message = await client.messages.create({
    model: config.AI_MODEL,
    max_tokens: config.DEFAULT_MAX_TOKENS,
    system: `${config.APP_CONTEXT}

You are an expert Google Ads strategist and PPC analyst. Analyze campaign data and provide actionable, data-driven recommendations. Focus on spend efficiency, keyword performance, and growth opportunities. Be specific and practical in your recommendations.

CRITICAL: Output ONLY valid JSON matching the structure specified.
${config.CONCISENESS_INSTRUCTION}`,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = message.content.map(c => c.text || '').join('\n');
  let jsonData = null;
  jsonData = parseJsonFromResponse(fullText);

  log.info(SRC, 'Campaign analysis completed', { hasParsedData: !!jsonData });
  return { full_text: fullText, json_data: jsonData, analyzed_at: new Date().toISOString(), prompt_sent: prompt };
}

module.exports = {
  isConfigured,
  generateKeywordIdeas,
  listAccessibleAccounts,
  listCampaigns,
  getCampaignKeywords,
  analyzeCampaigns,
  AGENT_META,
};
