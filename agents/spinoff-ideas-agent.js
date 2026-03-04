/**
 * Agent: SpinOff Ideas
 * Route: routes/spinoff-ideas.js → POST /api/containers/:id/spinoff-ideas
 * Deps: config, storage, logger, parse-json, gather-data (gatherScrapeData, gatherCompetitorAnalyses, gatherContainerContext)
 * Stores: storage.spinoff_ideas[]
 *
 * Analyzes container data (product info, competitor analyses, scrape results, SEO data,
 * container context) and proposes spin-off product/business ideas adjacent to the current market.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherScrapeData, gatherCompetitorAnalyses, gatherContainerContext } = require('../utils/gather-data');

const SRC = 'SpinOffIdeasAgent';

const AGENT_META = {
  code: 'ag0019',
  id: 'spinoff-ideas',
  name: 'SpinOff Ideas',
  description: 'Proposes spin-off product and business ideas adjacent to the current market.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'competitorIds', type: 'array', required: false, from: null },
    { name: 'includeContext', type: 'boolean', required: false, from: null },
    { name: 'userPrompt', type: 'string', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Competitor ad data' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'AI competitor analyses' },
    { agent: 'seo', dataKey: 'seo_analyses', description: 'SEO analysis reports' },
  ],
  outputs: { storageKey: 'spinoff_ideas', dataType: 'json', schema: 'SpinOffIdea' },
  ui: { visible: true },
  prompt_summary: 'Identifies transferable assets and adjacent opportunities from competitor data. Proposes 5 spin-off product ideas with effort estimates and synergy analysis.',
  prompt_template: `SYSTEM:
You are an expert product strategist specializing in spin-off ideation and adjacent market discovery. You analyze existing product landscapes, competitive data, and market signals to propose compelling spin-off product ideas.

You excel at:
- Identifying transferable assets (skills, audience, infrastructure, brand equity) from existing businesses
- Spotting adjacent opportunities that leverage existing market knowledge
- Evaluating effort-to-opportunity ratios for spin-off ventures
- Understanding synergies between a core product and potential spin-offs

CRITICAL: Output ONLY valid JSON. No markdown, no explanations outside JSON.

USER:
# Spin-Off Product Ideation
Analyze the data below and propose spin-off product or business ideas that are ADJACENT to this market — not direct competitors, but related products that leverage the same audience, skills, or infrastructure.

## User Instructions (if provided)
## Current Product (name, website, type, target audience, unique angle)
## Competitor Intelligence (AI-Analyzed): summaries, key findings, messaging patterns, weaknesses per competitor
## Competitor Ad Data: FB/Google ad counts and sample headlines/text/CTAs per competitor
## SEO Intelligence: summaries, keyword opportunities, content gaps per competitor
## Curated Context: context items with source_type and briefs

## Task: Propose 5 spin-off product or business ideas. Output JSON with landscape_summary (current_product, market_type, transferable_assets[], adjacent_opportunities[]) and spinoff_ideas[] (idea_name, description, why_it_could_work, key_differentiators[], target_audience, revenue_model, next_steps[], effort_estimate, effort_details, synergy_with_current)

Rules:
- Each idea should target a DIFFERENT adjacent market or audience segment
- effort_estimate must be exactly one of: "low", "medium", "high"
- Focus on ideas where existing market knowledge provides a real advantage
- Be specific about the target audience
- next_steps should be concrete, actionable items (max 5 per idea)
- Reference specific data points from the analysis above to justify each idea`,
};

/**
 * Generate spin-off product ideas based on container data.
 */
async function generateSpinoffIdeas(containerId, { competitorIds, includeContext = true, userPrompt } = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  // Determine competitor IDs
  const compIds = competitorIds && competitorIds.length > 0
    ? competitorIds
    : (container.competitors || []).map(c => c.id);

  // Gather data sources
  const mergedScrapeData = gatherScrapeData(container, compIds);
  const competitorAnalyses = gatherCompetitorAnalyses(container, compIds);

  // Gather SEO analyses
  const seoAnalyses = {};
  const seoData = container.seo_analyses || {};
  for (const compId of compIds) {
    const analyses = seoData[compId] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    if (latest && latest.result?.json_data) {
      seoAnalyses[compId] = latest.result.json_data;
    }
  }
  // Also check own-product SEO
  const ownSeo = seoData['_own_product'] || [];
  const latestOwnSeo = [...ownSeo].reverse().find(a => a.status === 'completed');
  if (latestOwnSeo && latestOwnSeo.result?.json_data) {
    seoAnalyses['_own_product'] = latestOwnSeo.result.json_data;
  }

  // Gather container context if requested
  const containerContext = includeContext ? gatherContainerContext(container) : null;

  // Validate at least one data source exists
  const hasData = Object.keys(mergedScrapeData).length > 0
    || Object.keys(competitorAnalyses).length > 0
    || Object.keys(seoAnalyses).length > 0
    || containerContext
    || container.my_product;

  if (!hasData) {
    throw new Error('No data available. Add product info, scrape ads, or run analyses first.');
  }

  const idea = await storage.addSpinoffIdea(containerId);
  if (!idea) throw new Error('Container not found');

  // Fire-and-forget
  executeSpinoff(containerId, idea.id, container, mergedScrapeData, competitorAnalyses, seoAnalyses, containerContext, userPrompt).catch(async (err) => {
    log.error(SRC, 'SpinOff ideation crashed', { err: err.message });
    try {
      await storage.updateSpinoffIdea(containerId, idea.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return idea;
}

async function executeSpinoff(containerId, ideaId, container, mergedScrapeData, competitorAnalyses, seoAnalyses, containerContext, userPrompt) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildSpinoffPrompt(container, mergedScrapeData, competitorAnalyses, seoAnalyses, containerContext, userPrompt);
    log.info(SRC, 'Sending spin-off ideation request to Claude', {
      promptLength: prompt.length,
      competitors: Object.keys(mergedScrapeData).length,
      hasSeo: Object.keys(seoAnalyses).length > 0,
      hasContext: !!containerContext,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: config.DEFAULT_MAX_TOKENS,
      system: `${config.APP_CONTEXT}

You are an expert product strategist specializing in spin-off ideation and adjacent market discovery. You analyze existing product landscapes, competitive data, and market signals to propose compelling spin-off product ideas.

You excel at:
- Identifying transferable assets (skills, audience, infrastructure, brand equity) from existing businesses
- Spotting adjacent opportunities that leverage existing market knowledge
- Evaluating effort-to-opportunity ratios for spin-off ventures
- Understanding synergies between a core product and potential spin-offs

CRITICAL: Output ONLY valid JSON. No markdown, no explanations outside JSON.
${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonResult = null;

    try {
      jsonResult = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonResult,
      generated_at: new Date().toISOString(),
    };

    await storage.updateSpinoffIdea(containerId, ideaId, 'completed', result);
    log.info(SRC, 'SpinOff ideation completed', { ideaId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateSpinoffIdea(containerId, ideaId, 'failed', { error: err.message });
  }
}

function buildSpinoffPrompt(container, mergedScrapeData, competitorAnalyses, seoAnalyses, containerContext, userPrompt) {
  const parts = [];
  const competitorMap = {};
  for (const c of (container.competitors || [])) competitorMap[c.id] = c;

  parts.push(`# Spin-Off Product Ideation\n`);
  parts.push(`Analyze the data below and propose spin-off product or business ideas that are ADJACENT to this market — not direct competitors, but related products that leverage the same audience, skills, or infrastructure.\n`);

  if (userPrompt) {
    parts.push(`## User Instructions`);
    parts.push(userPrompt);
    parts.push('');
  }

  // Current product info
  if (container.my_product) {
    const p = container.my_product;
    parts.push(`## Current Product`);
    if (p.name) parts.push(`Name: ${p.name}`);
    if (p.website) parts.push(`Website: ${p.website}`);
    if (p.site_type) parts.push(`Type: ${p.site_type}`);
    if (p.target_audience) parts.push(`Target Audience: ${p.target_audience}`);
    if (p.unique_angle) parts.push(`Unique Angle: ${p.unique_angle}`);
    parts.push('');
  }

  // Competitor intelligence from AI analyses
  const analysisIds = Object.keys(competitorAnalyses);
  if (analysisIds.length > 0) {
    parts.push(`## Competitor Intelligence (AI-Analyzed)\n`);
    for (const compId of analysisIds) {
      const comp = competitorMap[compId];
      const analysis = competitorAnalyses[compId];
      parts.push(`### ${comp?.name || compId}`);
      if (comp?.website) parts.push(`Website: ${comp.website}`);
      if (analysis.summary) parts.push(`Summary: ${analysis.summary}`);
      if (analysis.key_findings) {
        parts.push(`Key findings:`);
        for (const f of analysis.key_findings.slice(0, 5)) {
          parts.push(`  - ${f.finding}${f.evidence ? ` (${f.evidence})` : ''}`);
        }
      }
      if (analysis.messaging_patterns) {
        parts.push(`Messaging patterns:`);
        for (const p of analysis.messaging_patterns.slice(0, 3)) {
          parts.push(`  - ${p.pattern}${p.examples ? `: "${p.examples[0]}"` : ''}`);
        }
      }
      if (analysis.weaknesses_and_gaps) {
        parts.push(`Weaknesses: ${analysis.weaknesses_and_gaps.slice(0, 5).join('; ')}`);
      }
      parts.push('');
    }
  }

  // Raw ad data summaries
  const scrapeIds = Object.keys(mergedScrapeData);
  if (scrapeIds.length > 0) {
    parts.push(`## Competitor Ad Data\n`);
    for (const compId of scrapeIds) {
      const comp = competitorMap[compId];
      const entry = mergedScrapeData[compId];
      const data = entry.data || entry;
      const fbAds = data.facebook || [];
      const googleAds = data.google || [];
      parts.push(`### ${comp?.name || compId} — ${fbAds.length} FB ads, ${googleAds.length} Google ads`);

      const allAds = [...fbAds, ...googleAds];
      const withText = allAds.filter(a => a.headline || a.ad_text);
      for (const ad of withText.slice(0, 6)) {
        const line = [];
        if (ad.headline) line.push(`"${ad.headline}"`);
        if (ad.ad_text) line.push(`Text: ${ad.ad_text.substring(0, 120)}`);
        if (ad.cta_text) line.push(`CTA: ${ad.cta_text}`);
        parts.push(`  - ${line.join(' | ')}`);
      }
      parts.push('');
    }
  }

  // SEO data
  const seoIds = Object.keys(seoAnalyses);
  if (seoIds.length > 0) {
    parts.push(`## SEO Intelligence\n`);
    for (const compId of seoIds) {
      const seo = seoAnalyses[compId];
      const label = compId === '_own_product' ? 'Own Product' : (competitorMap[compId]?.name || compId);
      parts.push(`### ${label}`);
      if (seo.summary) parts.push(`Summary: ${seo.summary}`);
      if (seo.keyword_opportunities) {
        const kws = Array.isArray(seo.keyword_opportunities) ? seo.keyword_opportunities : [];
        if (kws.length > 0) {
          parts.push(`Keyword opportunities: ${kws.slice(0, 5).map(k => typeof k === 'string' ? k : k.keyword || k.term || JSON.stringify(k)).join(', ')}`);
        }
      }
      if (seo.content_gaps) {
        const gaps = Array.isArray(seo.content_gaps) ? seo.content_gaps : [];
        if (gaps.length > 0) {
          parts.push(`Content gaps: ${gaps.slice(0, 5).map(g => typeof g === 'string' ? g : g.gap || g.topic || JSON.stringify(g)).join(', ')}`);
        }
      }
      parts.push('');
    }
  }

  // Container context
  if (containerContext && containerContext.length > 0) {
    parts.push(`## Curated Context\n`);
    for (const item of containerContext) {
      parts.push(`[${item.source_type}${item.section_name ? ` — ${item.section_name}` : ''}]`);
      parts.push(item.brief);
      parts.push('');
    }
  }

  parts.push(`## Task

Based on the data above, propose 5 spin-off product or business ideas. These should NOT be direct competitors to the products above, but ADJACENT or COMPLEMENTARY ideas that leverage the same audience, market knowledge, or infrastructure.

For example, if the market is "wedding song apps", spin-offs could be: birthday song app, anniversary video maker, funeral tribute creator, baby name song generator, pet memorial music.

Output JSON:
{
  "landscape_summary": {
    "current_product": "Brief description of the current product/market",
    "market_type": "The niche/industry being analyzed",
    "transferable_assets": ["asset1", "asset2"],
    "adjacent_opportunities": ["opportunity1", "opportunity2"]
  },
  "spinoff_ideas": [
    {
      "idea_name": "Catchy product name",
      "description": "1-2 sentence description of the product",
      "why_it_could_work": "Why this spin-off makes sense given the data",
      "key_differentiators": ["diff1", "diff2"],
      "target_audience": "Specific audience for this spin-off",
      "revenue_model": "How it would make money",
      "next_steps": ["step1", "step2", "step3"],
      "effort_estimate": "low|medium|high",
      "effort_details": "Brief explanation of what effort entails",
      "synergy_with_current": "How this complements the existing product/market"
    }
  ]
}

Rules:
- Each idea should target a DIFFERENT adjacent market or audience segment
- "effort_estimate" must be exactly one of: "low", "medium", "high"
- Focus on ideas where existing market knowledge provides a real advantage
- Be specific about the target audience — no generic "everyone" answers
- next_steps should be concrete, actionable items (max 5 per idea)
- Reference specific data points from the analysis above to justify each idea`);

  return parts.join('\n');
}

module.exports = { generateSpinoffIdeas, AGENT_META };
