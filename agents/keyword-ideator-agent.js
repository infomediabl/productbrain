/**
 * Agent: Keyword Strategy Generator
 * Route: routes/keyword-ideator.js → POST /api/containers/:id/keyword-strategy
 * Deps: config, storage, logger, parse-json, gather-data (gatherGadsData, gatherContainerContext)
 * Stores: storage.keyword_strategies[]
 *
 * Generates keyword strategies by combining competitor ads, SEO insights,
 * Google Ads data, and product context into clustered, prioritized recommendations.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherGadsData, gatherContainerContext } = require('../utils/gather-data');

const SRC = 'KeywordIdeator';

const AGENT_META = {
  code: 'ag0008',
  id: 'keyword-ideator',
  name: 'Keyword Ideator',
  description: 'Keyword strategy from competitor, SEO, and Google Ads data.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'Competitor messaging patterns' },
    { agent: 'seo', dataKey: 'seo_analyses', description: 'SEO keyword intelligence' },
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Ad text patterns' },
    { agent: 'google-ads', dataKey: 'gads_analyses', description: 'Google Ads performance data' },
  ],
  outputs: { storageKey: 'keyword_strategies', dataType: 'json', schema: 'KeywordStrategy' },
  ui: { visible: true },
};

async function generateKeywordStrategy(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const strategy = await storage.addKeywordStrategy(containerId);
  if (!strategy) throw new Error('Failed to create keyword strategy');

  executeStrategy(containerId, strategy.id, container, options).catch(async (err) => {
    log.error(SRC, 'Keyword strategy generation crashed', { err: err.message });
    try {
      await storage.updateKeywordStrategy(containerId, strategy.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return strategy;
}

async function executeStrategy(containerId, strategyId, container, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const context = gatherContext(container, options);
    const prompt = buildPrompt(container, context, options);

    log.info(SRC, 'Sending keyword strategy to Claude', {
      containerId,
      competitorCount: container.competitors.length,
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 12000,
      system: `You are a senior digital marketing strategist and keyword research expert. You analyze competitor data, SEO insights, and ad intelligence to create comprehensive keyword strategies.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Every recommendation must be backed by competitor data or market logic.
3. Group keywords by search intent (informational, navigational, commercial, transactional).
4. Prioritize by opportunity score (search volume × relevance × competition gap).
5. Include long-tail variations that competitors are missing.
6. Consider the full funnel: awareness → consideration → decision → retention.
7. When Google Ads keyword data or Keyword Planner data is available, use actual CPC ranges and search volumes — do NOT estimate when real data exists.
${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try { jsonData = parseJsonFromResponse(fullText); } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      generated_at: new Date().toISOString(),
      options_used: options,
    };

    await storage.updateKeywordStrategy(containerId, strategyId, 'completed', result);
    log.info(SRC, 'Keyword strategy completed', { strategyId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateKeywordStrategy(containerId, strategyId, 'failed', { error: err.message });
  }
}

function gatherContext(container, options) {
  const ctx = {
    competitors: [],
    seoInsights: [],
    adPatterns: [],
    gadsPerformance: null,
    gadsCampaigns: [],
    gadsKeywords: [],      // keyword-level Google Ads performance
    gadsKeywordIdeas: [],  // Google Keyword Planner suggestions with bid estimates
    longRunningAds: [],    // proven competitor ads (30+ days)
    ownSeoInsights: null,  // own-product SEO gaps
  };

  // Gather Google Ads data (KNOWN data)
  const gadsData = gatherGadsData(container);
  if (gadsData) {
    ctx.gadsPerformance = gadsData.analysis;
    ctx.gadsCampaigns = gadsData.campaigns;
    if (gadsData.keywords) {
      ctx.gadsKeywords = gadsData.keywords.slice(0, 50); // top 50 by impressions
    }
    if (gadsData.keywordIdeas) {
      ctx.gadsKeywordIdeas = gadsData.keywordIdeas.slice(0, 50); // top 50 by search volume
    }
  }

  // Gather competitor analysis insights
  for (const comp of container.competitors) {
    const compAnalyses = (container.competitor_analyses || {})[comp.id] || [];
    const latest = [...compAnalyses].reverse().find(a => a.status === 'completed');
    if (latest?.result?.json_data) {
      const j = latest.result.json_data;
      ctx.competitors.push({
        name: comp.name,
        website: comp.website,
        messaging: (j.messaging_patterns || []).slice(0, 5),
        keywords: j.key_findings || [],
      });

      // Long-running ads from competitor analyses
      if (j.long_running_ads && j.long_running_ads.length > 0) {
        for (const lra of j.long_running_ads) {
          ctx.longRunningAds.push({
            competitor: comp.name,
            headline: lra.headline,
            days_running: lra.days_running,
            why_working: lra.why_its_working,
          });
        }
      }
    }

    // SEO insights (fixed field paths with fallback chains)
    const seoAnalyses = (container.seo_analyses || {})[comp.id] || [];
    const latestSeo = [...seoAnalyses].reverse().find(a => a.status === 'completed');
    if (latestSeo?.result?.json_data) {
      const s = latestSeo.result.json_data;
      ctx.seoInsights.push({
        competitor: comp.name,
        primaryKeywords: s.keyword_targeting?.primary_keywords || s.keyword_strategy?.primary_keywords || [],
        keywordGaps: s.keyword_strategy?.keyword_gaps || [],
        contentOpportunities: s.keyword_strategy?.content_opportunities || [],
        quickWins: (s.competitive_advantages?.quick_wins_for_us || []).map(q => q.action),
        learnings: (s.priority_learnings || []).filter(l => l.impact === 'high' || l.impact === 'medium').map(l => l.learning),
      });
    }
  }

  // Own-product SEO insights
  const ownSeoAnalyses = (container.seo_analyses || {})['_own_product'] || [];
  const latestOwnSeo = [...ownSeoAnalyses].reverse().find(a => a.status === 'completed');
  if (latestOwnSeo?.result?.json_data) {
    const own = latestOwnSeo.result.json_data;
    ctx.ownSeoInsights = {
      primaryKeywords: own.keyword_strategy?.primary_keywords || [],
      keywordGaps: own.keyword_strategy?.keyword_gaps || [],
      contentOpportunities: own.keyword_strategy?.content_opportunities || [],
      priorityActions: (own.priority_actions || []).map(a => a.action),
    };
  }

  // Gather ad text patterns from scrapes (with destination URL and platform)
  const scrapes = (container.scrape_results || []).filter(s => s.status === 'completed');
  for (const scrape of scrapes.slice(-3)) {
    for (const [compId, compData] of Object.entries(scrape.scraped_data?.competitors || {})) {
      const comp = container.competitors.find(c => c.id === compId);
      const allAds = [...(compData.facebook || []), ...(compData.google || [])];
      for (const ad of allAds.slice(0, 5)) {
        if (ad.headline || ad.ad_text) {
          ctx.adPatterns.push({
            competitor: comp?.name || 'Unknown',
            headline: ad.headline,
            text: ad.ad_text?.substring(0, 200),
            cta: ad.cta_text,
            destination_url: ad.destination_url || null,
            platform: ad.platform || null,
          });
        }
      }
    }
  }

  return ctx;
}

function buildPrompt(container, ctx, options) {
  const parts = [];

  if (container.my_product) {
    parts.push(`## My Product`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
  }

  if (options.niche) parts.push(`\n## Niche/Industry: ${options.niche}`);
  if (options.goals) parts.push(`## Campaign Goals: ${options.goals}`);
  if (options.budget_level) parts.push(`## Budget Level: ${options.budget_level}`);

  // Container Context (curated insights) — skippable via options.use_context
  const contextData = options.use_context !== false ? gatherContainerContext(container) : [];
  if (contextData && contextData.length > 0) {
    parts.push('\n## Container Context (Curated Insights)');
    for (const item of contextData) {
      parts.push(`### [${item.source_type}] ${item.section_name}`);
      parts.push(item.brief);
    }
  }

  if (ctx.competitors.length > 0) {
    parts.push(`\n## Competitor Intelligence`);
    for (const c of ctx.competitors) {
      parts.push(`\n### ${c.name} (${c.website || 'no website'})`);
      if (c.messaging.length > 0) {
        parts.push(`Messaging patterns:`);
        c.messaging.forEach(m => parts.push(`- ${m.pattern}: ${(m.examples || []).slice(0, 2).join(', ')}`));
      }
    }
  }

  if (ctx.seoInsights.length > 0) {
    parts.push(`\n## SEO Intelligence`);
    for (const s of ctx.seoInsights) {
      parts.push(`\n### ${s.competitor}`);
      if (s.primaryKeywords.length > 0) parts.push(`Primary keywords: ${s.primaryKeywords.join(', ')}`);
      if (s.keywordGaps.length > 0) parts.push(`Keyword gaps: ${s.keywordGaps.join(', ')}`);
      if (s.contentOpportunities.length > 0) {
        parts.push(`Content opportunities:`);
        s.contentOpportunities.forEach(o => parts.push(`- ${o.topic || o} (${o.priority || 'medium'}): ${o.rationale || ''}`));
      }
      if (s.quickWins && s.quickWins.length > 0) parts.push(`Quick wins: ${s.quickWins.slice(0, 3).join('; ')}`);
      if (s.learnings && s.learnings.length > 0) parts.push(`Key learnings: ${s.learnings.slice(0, 3).join('; ')}`);
    }
  }

  if (ctx.gadsCampaigns.length > 0) {
    parts.push(`\n## Google Ads Performance (KNOWN data)`);
    for (const c of ctx.gadsCampaigns) {
      const cpc = (c.clicks > 0 && c.cost_micros) ? `$${(c.cost_micros / 1e6 / c.clicks).toFixed(2)}` : 'N/A';
      parts.push(`- ${c.name} [${c.channel_type}]: ${c.impressions} impr, ${c.clicks} clicks, CPC ${cpc}`);
    }
    if (ctx.gadsPerformance?.summary) {
      parts.push(`Analysis: ${ctx.gadsPerformance.summary}`);
    }
    if (ctx.gadsPerformance?.findings?.length > 0) {
      parts.push('Key findings:');
      for (const f of ctx.gadsPerformance.findings.slice(0, 5)) {
        parts.push(`- ${typeof f === 'string' ? f : f.finding || JSON.stringify(f)}`);
      }
    }
  }

  // Keyword-level Google Ads performance
  if (ctx.gadsKeywords.length > 0) {
    parts.push(`\n## Your Keyword Performance (KNOWN data — from Google Ads)`);
    parts.push(`These are keywords you're currently bidding on with real performance data:`);
    for (const k of ctx.gadsKeywords.slice(0, 30)) {
      const matchLabel = k.match_type ? ` [${k.match_type.toUpperCase()}]` : '';
      const cpc = k.clicks > 0 && k.cost_micros ? `$${(k.cost_micros / 1e6 / k.clicks).toFixed(2)}` : 'N/A';
      const conv = k.conversions > 0 ? `, ${k.conversions} conv` : '';
      parts.push(`- "${k.keyword}"${matchLabel} (${k.campaign}): ${k.impressions} impr, ${k.clicks} clicks, CPC ${cpc}${conv}`);
    }
  }

  // Google Keyword Planner suggestions with bid estimates
  if (ctx.gadsKeywordIdeas.length > 0) {
    parts.push(`\n## Google Keyword Planner Data (search volume + bid estimates)`);
    parts.push(`These are keyword suggestions from Google's Keyword Planner with real market data:`);
    for (const ki of ctx.gadsKeywordIdeas.slice(0, 30)) {
      const lowCpc = ki.low_cpc ? `$${(ki.low_cpc / 1e6).toFixed(2)}` : 'N/A';
      const highCpc = ki.high_cpc ? `$${(ki.high_cpc / 1e6).toFixed(2)}` : 'N/A';
      const compIdx = ki.competition_index ? ` (idx ${ki.competition_index})` : '';
      parts.push(`- "${ki.keyword}" — ${ki.avg_monthly_searches.toLocaleString()} searches/mo, competition: ${ki.competition || 'N/A'}${compIdx}, CPC range: ${lowCpc}–${highCpc}`);
    }
  }

  // Own-product SEO position
  if (ctx.ownSeoInsights) {
    const own = ctx.ownSeoInsights;
    parts.push(`\n## Your SEO Position`);
    if (own.primaryKeywords.length > 0) parts.push(`Primary keywords: ${own.primaryKeywords.join(', ')}`);
    if (own.keywordGaps.length > 0) parts.push(`Keyword gaps (not targeting): ${own.keywordGaps.join(', ')}`);
    if (own.contentOpportunities.length > 0) {
      parts.push(`Content opportunities:`);
      own.contentOpportunities.forEach(o => parts.push(`- ${o.topic || o} (${o.priority || 'medium'}): ${o.rationale || ''}`));
    }
    if (own.priorityActions.length > 0) parts.push(`Priority actions: ${own.priorityActions.join('; ')}`);
  }

  // Proven long-running competitor ads
  if (ctx.longRunningAds.length > 0) {
    parts.push(`\n## Proven Competitor Ads (Running 30+ Days)`);
    parts.push(`These ads have been running long enough to indicate profitable keywords/messaging:`);
    for (const lra of ctx.longRunningAds.slice(0, 15)) {
      const days = lra.days_running ? ` — running ${lra.days_running} days` : '';
      const why = lra.why_working ? ` — Why: ${lra.why_working}` : '';
      parts.push(`- [${lra.competitor}] "${lra.headline || 'N/A'}"${days}${why}`);
    }
  }

  if (ctx.adPatterns.length > 0) {
    parts.push(`\n## Ad Copy Patterns (from competitor ads)`);
    for (const ad of ctx.adPatterns.slice(0, 15)) {
      const platform = ad.platform ? ` [${ad.platform}]` : '';
      const url = ad.destination_url ? ` → ${ad.destination_url}` : '';
      parts.push(`- [${ad.competitor}]${platform} "${ad.headline || ''}" — ${ad.text || ''}${url}`);
    }
  }

  parts.push(`\n## Task
Generate a comprehensive keyword strategy. Output JSON:

{
  "strategy_summary": "2-3 sentence summary of the keyword strategy",
  "total_keywords": 0,
  "keyword_clusters": [
    {
      "cluster_name": "descriptive name for this keyword group",
      "intent": "informational|navigational|commercial|transactional",
      "funnel_stage": "awareness|consideration|decision|retention",
      "priority": "high|medium|low",
      "opportunity_score": 0-100,
      "rationale": "why this cluster matters based on competitor data",
      "primary_keyword": "main keyword",
      "keywords": [
        {
          "keyword": "the keyword phrase",
          "intent": "informational|commercial|transactional",
          "competition": "high|medium|low",
          "bid_recommendation": "suggested bid range or approach"
        }
      ]
    }
  ],
  "quick_wins": [
    {
      "keyword": "keyword phrase",
      "why": "why this is a quick win",
      "action": "specific action to take"
    }
  ],
  "competitor_gaps": [
    {
      "gap": "description of the gap",
      "keywords": ["keywords to target"],
      "opportunity_size": "high|medium|low"
    }
  ],
  "ad_keyword_recommendations": [
    { "theme": "theme name", "keywords": ["keyword1", "keyword2"] }
  ],
  "auction_keywords": [
    {
      "keyword": "exact keyword to bid on",
      "match_type": "exact|phrase|broad",
      "source": "where this keyword came from (gads data, competitor, seo gap, etc.)",
      "estimated_cpc": "$X.XX",
      "rationale": "why this keyword should perform well in auction",
      "priority": "high|medium|low"
    }
  ]
}`);

  return parts.join('\n');
}

module.exports = { generateKeywordStrategy, run: generateKeywordStrategy, AGENT_META };
