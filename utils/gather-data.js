/**
 * Data Gathering Utilities (SHARED — do not edit from multiple sessions)
 * Used by: 7 agents (proposal, analyzer, seo, product-ideator, image-ad,
 *   container-chat, keyword-ideator, quiz, test-planner, landing-page)
 *   + routes/container-context.js
 * Depends on: utils/context-formatter.js
 *
 * Exports:
 *   gatherScrapeData(container, competitorIds) — Latest scraped ads per competitor
 *   gatherCompetitorAnalyses(container, competitorIds) — Latest AI analysis JSON
 *   gatherCompetitorAds(container, competitorId, opts) — Deduped ads across scrapes
 *   gatherGadsData(container) — Latest Google Ads analysis
 *   gatherContainerContext(container) — Curated context items with text briefs
 */

/**
 * Gather scraped ad data for selected competitors.
 * Used by proposal-agent and product-ideator-agent.
 */
function gatherScrapeData(container, competitorIds) {
  const result = {};
  for (const compId of competitorIds) {
    const scrapes = [...(container.scrape_results || [])].reverse();
    for (const scrape of scrapes) {
      if (scrape.status !== 'completed' && scrape.status !== 'timed_out') continue;
      const compData = scrape.scraped_data?.competitors?.[compId];
      if (compData && ((compData.facebook?.length > 0) || (compData.google?.length > 0))) {
        result[compId] = { data: compData, from_scrape: scrape.id };
        break;
      }
    }
    if (!result[compId]) {
      const analyses = [...(container.analyses || [])].reverse();
      for (const a of analyses) {
        if (a.status !== 'completed' && a.status !== 'timed_out') continue;
        const compData = a.scraped_data?.competitors?.[compId];
        if (compData && ((compData.facebook?.length > 0) || (compData.google?.length > 0))) {
          result[compId] = { data: compData, from_analysis: a.id };
          break;
        }
      }
    }
  }
  return result;
}

/**
 * Gather latest completed competitor analyses (AI-generated JSON).
 * Used by proposal-agent and product-ideator-agent.
 */
function gatherCompetitorAnalyses(container, competitorIds) {
  const result = {};
  const compAnalyses = container.competitor_analyses || {};
  for (const compId of competitorIds) {
    const analyses = compAnalyses[compId] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    if (latest && latest.result?.json_data) {
      result[compId] = latest.result.json_data;
    }
  }
  return result;
}

/**
 * Gather all unique ads for a competitor across scrapes (deduped).
 * Used by analyzer-agent (full) and seo-agent (with limit).
 * @param {object} container
 * @param {string} competitorId
 * @param {object} [options]
 * @param {number} [options.limit] - Max ads per platform (0 = unlimited)
 */
function gatherCompetitorAds(container, competitorId, options = {}) {
  const limit = options.limit || 0;
  const result = { facebook: [], google: [] };
  const seenFb = new Set();
  const seenGoogle = new Set();

  const sources = [
    ...[...(container.scrape_results || [])].reverse(),
    ...[...(container.analyses || [])].reverse(),
  ];

  for (const source of sources) {
    if (source.status !== 'completed' && source.status !== 'timed_out') continue;
    const compData = source.scraped_data?.competitors?.[competitorId];
    if (!compData) continue;

    for (const ad of (compData.facebook || [])) {
      if (limit && result.facebook.length >= limit) break;
      const key = ad.extra_data?.fb_ad_id || ad.extra_data?.ad_link || JSON.stringify(ad.headline);
      if (!seenFb.has(key)) { seenFb.add(key); result.facebook.push(ad); }
    }
    for (const ad of (compData.google || [])) {
      if (limit && result.google.length >= limit) break;
      const key = ad.extra_data?.creative_id || ad.extra_data?.ad_link || JSON.stringify(ad.headline);
      if (!seenGoogle.has(key)) { seenGoogle.add(key); result.google.push(ad); }
    }

    if (limit && result.facebook.length >= limit && result.google.length >= limit) break;
  }

  return result;
}

/**
 * Gather the latest completed Google Ads analysis data from the container.
 * Returns campaign metrics and AI analysis for use by other agents as KNOWN data.
 */
function gatherGadsData(container) {
  const analyses = container.gads_analyses || [];
  const latest = [...analyses].reverse().find(a => a.status === 'completed');
  if (!latest || !latest.result) return null;

  const result = latest.result;
  const campaigns = (result.campaigns || []).map(c => ({
    name: c.name || c.campaign_name || '',
    channel_type: c.channel_type || c.advertising_channel_type || '',
    impressions: c.impressions || 0,
    clicks: c.clicks || 0,
    cost_micros: c.cost_micros || 0,
    budget_micros: c.budget_micros || c.daily_budget_micros || 0,
  }));

  // Extract keyword-level data from persisted campaign data
  const keywords = [];
  for (const c of (result.campaigns || [])) {
    for (const k of (c.keywords || [])) {
      keywords.push({
        campaign: c.name || '',
        keyword: k.keyword || '',
        match_type: k.match_type || '',
        impressions: parseInt(k.impressions) || 0,
        clicks: parseInt(k.clicks) || 0,
        cost_micros: parseInt(k.cost_micros) || 0,
        conversions: parseFloat(k.conversions) || 0,
        avg_cpc: parseInt(k.avg_cpc) || 0,
      });
    }
  }
  keywords.sort((a, b) => b.impressions - a.impressions);

  const analysis = result.json_data || result.analysis || {};

  // Extract keyword ideas from persisted Keyword Planner data
  const kiRecords = container.keyword_ideas || [];
  const latestKi = [...kiRecords].reverse().find(r => r.status === 'completed');
  const keywordIdeas = (latestKi?.result?.ideas || []).map(i => ({
    keyword: i.keyword || '',
    avg_monthly_searches: parseInt(i.avg_monthly_searches) || 0,
    competition: i.competition || '',
    competition_index: i.competition_index || 0,
    low_cpc: parseInt(i.low_top_of_page_bid_micros) || 0,
    high_cpc: parseInt(i.high_top_of_page_bid_micros) || 0,
  }));
  keywordIdeas.sort((a, b) => b.avg_monthly_searches - a.avg_monthly_searches);

  return {
    campaigns,
    keywords,
    keywordIdeas,
    analysis: {
      summary: analysis.summary || analysis.executive_summary || '',
      findings: analysis.key_findings || analysis.findings || [],
      action_items: analysis.action_items || analysis.recommendations || [],
    },
    analyzed_at: latest.created_at,
    account_id: latest.meta?.account_id || latest.meta?.customer_id || '',
  };
}

/**
 * Gather all pushed container context items formatted for agent prompts.
 * Returns items with `brief` — a natural-language text optimized for AI consumption.
 * Uses stored text_brief when available, otherwise generates on-the-fly.
 */
function gatherContainerContext(container) {
  const items = container.container_context || [];
  if (items.length === 0) return null;
  const { formatBrief } = require('./context-formatter');
  return items.map(item => ({
    source_type: item.source_type,
    section_name: item.section_name,
    brief: item.text_brief || formatBrief(item.source_type, item.content, item.section_name),
  }));
}

module.exports = { gatherScrapeData, gatherCompetitorAnalyses, gatherCompetitorAds, gatherGadsData, gatherContainerContext };
