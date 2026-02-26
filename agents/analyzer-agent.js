/**
 * Agent: Competitor Ads Analyzer
 * Route: routes/competitor-analysis.js → POST /api/containers/:id/competitor-analysis
 * Deps: config, storage, logger, parse-json, gather-data (gatherCompetitorAds), summarize-ads
 * Stores: storage.competitor_analyses[]
 *
 * Analyzes scraped competitor ads using Claude AI. Gathers all scraped ad data
 * for a single competitor, summarizes them, and produces structured analysis.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherCompetitorAds } = require('../utils/gather-data');
const { summarizeAds } = require('../utils/summarize-ads');

const SRC = 'AnalyzerAgent';

const AGENT_META = {
  code: 'ag0003',
  id: 'analyzer',
  name: 'Scraped Ads Analyzer',
  description: 'Per-competitor ad strategy analysis using Claude AI.',
  category: 'analysis',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'competitorId', type: 'string', required: true, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Scraped ad data for the competitor' },
  ],
  outputs: { storageKey: 'competitor_analyses', dataType: 'json', schema: 'CompetitorAnalysis' },
  ui: { visible: true },
};

/**
 * Run AI analysis for a single competitor.
 * Gathers all scraped data for this competitor across all scrape results,
 * sends to Claude for analysis, and saves per-competitor.
 */
async function analyzeCompetitor(containerId, competitorId) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const comp = container.competitors.find(c => c.id === competitorId);
  if (!comp) throw new Error('Competitor not found');

  // Gather scraped data for this competitor from all completed scrapes
  const compAds = gatherCompetitorAds(container, competitorId);
  if (compAds.facebook.length === 0 && compAds.google.length === 0) {
    throw new Error('No scraped data found for this competitor. Run scraping first.');
  }

  // Create the analysis record
  const analysis = await storage.createCompetitorAnalysis(containerId, competitorId);
  if (!analysis) throw new Error('Failed to create analysis');

  // Run async
  executeAnalysis(containerId, competitorId, analysis.id, container, comp, compAds).catch(async (err) => {
    log.error(SRC, 'Competitor analysis crashed', { err: err.message });
    try {
      await storage.updateCompetitorAnalysis(containerId, competitorId, analysis.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return analysis;
}

async function executeAnalysis(containerId, competitorId, analysisId, container, comp, compAds) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildAnalysisPrompt(container, comp, compAds);
    log.info(SRC, 'Sending competitor analysis to Claude', {
      competitor: comp.name,
      fbAds: compAds.facebook.length,
      googleAds: compAds.google.length,
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: config.DEFAULT_MAX_TOKENS,
      system: `You are a senior competitive intelligence analyst specializing in digital advertising. You analyze a single competitor's ad library data and produce a structured analysis.

You receive scraped ad data from Facebook Ads Library and Google Ads Transparency Center for one competitor.

Your job: Produce a comprehensive analysis of this competitor's advertising strategy.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Every observation must reference specific ads from the data.
3. Long-running ads (30+ days) indicate proven strategies — flag them.
4. Include OCR-extracted text when available (ocr_text field) for image ads.
5. Identify patterns in messaging, targeting, formats, and creative approach.
${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;

    try {
      jsonData = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed for competitor analysis', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      ad_count: { facebook: compAds.facebook.length, google: compAds.google.length },
      analyzed_at: new Date().toISOString(),
    };

    await storage.updateCompetitorAnalysis(containerId, competitorId, analysisId, 'completed', result);
    log.info(SRC, 'Competitor analysis completed', { competitor: comp.name, analysisId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateCompetitorAnalysis(containerId, competitorId, analysisId, 'failed', { error: err.message });
  }
}

function buildAnalysisPrompt(container, comp, compAds) {
  const parts = [];

  if (container.my_product) {
    parts.push(`## Context: My Product`);
    parts.push(`Product: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
  } else {
    parts.push(`## Context: No product defined yet`);
  }

  parts.push(`\n## Competitor: ${comp.name}`);
  if (comp.website) parts.push(`Website: ${comp.website}`);

  if (compAds.facebook.length > 0) {
    parts.push(`\n### Facebook Ads (${compAds.facebook.length} ads)`);
    parts.push(summarizeAds(compAds.facebook));
  }

  if (compAds.google.length > 0) {
    parts.push(`\n### Google Ads (${compAds.google.length} ads)`);
    parts.push(summarizeAds(compAds.google));
  }

  parts.push(`\n## Task
Analyze this competitor's advertising strategy and output a JSON object with this exact structure:

{
  "competitor_name": "${comp.name}",
  "summary": "1 sentence summary of their ad strategy",
  "total_ads_analyzed": { "facebook": ${compAds.facebook.length}, "google": ${compAds.google.length} },
  "key_findings": [
    {
      "finding": "Clear statement of the finding",
      "evidence": "Specific ads/data that support this"
    }
  ],
  "messaging_patterns": [
    {
      "pattern": "Description of the messaging pattern",
      "examples": ["Quoted text from ads"]
    }
  ],
  "creative_formats": {
    "dominant_format": "image/video/text",
    "format_breakdown": { "image": 0, "video": 0, "text": 0 },
    "notable_creative_approaches": ["Description of creative styles used"]
  },
  "targeting_insights": {
    "platforms_used": ["Facebook", "Google"],
    "eu_demographics": {
      "primary_age_groups": ["age ranges"],
      "gender_split": "description",
      "top_countries": ["countries"]
    },
    "estimated_spend_level": "low/medium/high based on ad volume and longevity"
  },
  "long_running_ads": [
    {
      "ad_link": "URL",
      "days_running": 0,
      "headline": "ad headline",
      "why_its_working": "analysis of why this ad has longevity"
    }
  ],
  "opportunities_for_us": ["specific opportunity based on data"]
}

Rules:
- Reference specific ads with their ad_link URLs
- Long-running ads (30+ days) are the most important — analyze them deeply
- If OCR text is available, use it to understand image ad messaging
- Focus on actionable insights, not generic observations`);

  return parts.join('\n');
}

module.exports = { analyzeCompetitor, gatherCompetitorAds, run: analyzeCompetitor, AGENT_META };
