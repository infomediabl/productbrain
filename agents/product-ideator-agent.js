/**
 * Agent: Product Ideator
 * Route: routes/product-ideator.js → POST /api/containers/:id/ideate-product
 * Deps: config, storage, logger, parse-json, gather-data (gatherScrapeData, gatherCompetitorAnalyses)
 * Stores: storage.product_ideas[]
 *
 * Product ideation from competitor data. Analyzes scrape results and competitor
 * analyses to propose new product concepts (domain, name, audience, direction).
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherScrapeData, gatherCompetitorAnalyses } = require('../utils/gather-data');

const SRC = 'ProductIdeator';

const AGENT_META = {
  code: 'ag0007',
  id: 'product-ideator',
  name: 'Product Ideator',
  description: 'New product concepts from competitive landscape analysis.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'userPrompt', type: 'string', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Competitor ad data' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'AI competitor analyses' },
  ],
  outputs: { storageKey: 'product_ideas', dataType: 'json', schema: 'ProductIdea' },
  ui: { visible: true },
};

/**
 * Generate product ideas based on competitor analysis.
 */
async function ideateProduct(containerId, { userPrompt } = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  // Gather competitor data
  const competitorIds = (container.competitors || []).map(c => c.id);
  if (competitorIds.length === 0) throw new Error('No competitors added');

  const mergedScrapeData = gatherScrapeData(container, competitorIds);
  const competitorAnalyses = gatherCompetitorAnalyses(container, competitorIds);

  if (Object.keys(mergedScrapeData).length === 0 && Object.keys(competitorAnalyses).length === 0) {
    throw new Error('No competitor data available. Scrape ads or run competitor analysis first.');
  }

  const idea = await storage.addProductIdea(containerId);
  if (!idea) throw new Error('Container not found');

  // Run async
  executeIdeation(containerId, idea.id, container, mergedScrapeData, competitorAnalyses, userPrompt).catch(async (err) => {
    log.error(SRC, 'Product ideation crashed', { err: err.message });
    try {
      await storage.updateProductIdea(containerId, idea.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return idea;
}

async function executeIdeation(containerId, ideaId, container, mergedScrapeData, competitorAnalyses, userPrompt) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildIdeationPrompt(container, mergedScrapeData, competitorAnalyses, userPrompt);
    log.info(SRC, 'Sending product ideation request to Claude', {
      promptLength: prompt.length,
      competitors: Object.keys(mergedScrapeData).length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: config.DEFAULT_MAX_TOKENS,
      system: `You are an expert product strategist and brand consultant. You analyze competitive landscapes and identify market opportunities to propose new product concepts.

You specialize in:
- Identifying gaps and underserved segments in existing markets
- Creating compelling brand names and domain suggestions
- Defining product positioning that differentiates from competitors
- Understanding target audience needs from ad campaign data

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

    await storage.updateProductIdea(containerId, ideaId, 'completed', result);
    log.info(SRC, 'Product ideation completed', { ideaId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateProductIdea(containerId, ideaId, 'failed', { error: err.message });
  }
}

function buildIdeationPrompt(container, mergedScrapeData, competitorAnalyses, userPrompt) {
  const parts = [];
  const competitorMap = {};
  for (const c of (container.competitors || [])) competitorMap[c.id] = c;

  parts.push(`# Competitive Landscape Analysis — New Product Ideation\n`);
  parts.push(`You are analyzing a competitive landscape to propose a NEW product that could compete in this market.\n`);

  if (userPrompt) {
    parts.push(`## User Instructions`);
    parts.push(userPrompt);
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
      if (analysis.opportunities_for_us) {
        parts.push(`Opportunities:`);
        for (const o of analysis.opportunities_for_us.slice(0, 3)) {
          parts.push(`  - ${o.opportunity}`);
        }
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
      if (comp?.website) parts.push(`Website: ${comp.website}`);

      // Sample top ads (headlines, text, CTAs)
      const allAds = [...fbAds, ...googleAds];
      const withText = allAds.filter(a => a.headline || a.ad_text);
      for (const ad of withText.slice(0, 8)) {
        const line = [];
        if (ad.headline) line.push(`"${ad.headline}"`);
        if (ad.ad_text) line.push(`Text: ${ad.ad_text.substring(0, 150)}`);
        if (ad.cta_text) line.push(`CTA: ${ad.cta_text}`);
        if (ad.destination_url) line.push(`→ ${ad.destination_url}`);
        parts.push(`  - ${line.join(' | ')}`);
      }

      // EU audience summary
      const euAds = fbAds.filter(a => a.extra_data?.eu_audience);
      if (euAds.length > 0) {
        const topCountries = {};
        for (const ad of euAds) {
          const countries = ad.extra_data.eu_audience.countries || [];
          for (const c of countries) {
            topCountries[c.name] = (topCountries[c.name] || 0) + (c.reach || 0);
          }
        }
        const sorted = Object.entries(topCountries).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (sorted.length > 0) {
          parts.push(`  EU reach: ${sorted.map(([name, reach]) => `${name}: ${reach}`).join(', ')}`);
        }
      }
      parts.push('');
    }
  }

  parts.push(`## Task

Based on the competitive landscape above, propose 3 distinct product concepts that could successfully compete in this market. Each should have a different strategic angle.

Output JSON:
{
  "market_analysis": {
    "market_type": "Brief description of the market/niche",
    "total_competitors_analyzed": ${scrapeIds.length},
    "key_market_trends": ["trend1", "trend2"],
    "underserved_segments": ["segment1", "segment2"],
    "common_weaknesses": ["weakness1", "weakness2"]
  },
  "product_ideas": [
    {
      "project_name": "CatchyName",
      "domain_suggestions": ["catchyname.com", "catchyname.io", "getcatchyname.com"],
      "site_type": "Brief description of what the site/app IS (e.g. 'Gamified IQ testing platform with daily brain training')",
      "tagline": "A memorable one-liner",
      "target_audience": "Specific audience description",
      "unique_angle": "What makes this different from competitors",
      "competitive_advantages": ["advantage1", "advantage2", "advantage3"]
    }
  ]
}

Rules:
- Domain suggestions should be short, memorable, and realistic (.com preferred)
- Each idea should address a DIFFERENT gap or angle in the market
- Use competitor weaknesses as opportunities
- Be specific about target audience — don't be generic
- Site type should be concise (max 15 words)
- Project names should be brandable, easy to spell, and memorable`);

  return parts.join('\n');
}

module.exports = { ideateProduct, run: ideateProduct, AGENT_META };
