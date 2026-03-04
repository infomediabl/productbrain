/**
 * Agent: SEO Analyzer
 * Route: routes/seo-analysis.js → POST /api/containers/:id/seo-analysis
 * Deps: config, storage, logger, parse-json, gather-data (gatherCompetitorAds)
 * Stores: storage.seo_analyses[]
 *
 * SEO analysis with two modes: competitor intelligence and own-product audit.
 * Gathers competitor ad data to inform SEO recommendations and keyword gaps.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherCompetitorAds } = require('../utils/gather-data');

const SRC = 'SeoAgent';

const AGENT_META = {
  code: 'ag0004',
  id: 'seo',
  name: 'SEO Analyzer',
  description: 'Competitor SEO intelligence and own-product SEO audit.',
  category: 'analysis',
  model: 'AI_MODEL',
  operations: {
    analyzeSeo: {
      description: 'Competitor SEO intelligence',
      inputs: [
        { name: 'containerId', type: 'string', required: true, from: null },
        { name: 'competitorId', type: 'string', required: true, from: null },
        { name: 'options', type: 'object', required: false, from: null },
      ],
    },
    analyzeOwnSeo: {
      description: 'Own-product SEO audit',
      inputs: [
        { name: 'containerId', type: 'string', required: true, from: null },
        { name: 'options', type: 'object', required: false, from: null },
      ],
    },
  },
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Ad data for context' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'Competitor analysis for messaging patterns' },
  ],
  outputs: { storageKey: 'seo_analyses', dataType: 'json', schema: 'SeoAnalysis' },
  ui: { visible: true },
  prompt_summary: 'Two modes: (1) Competitor — analyzes competitor website SEO to extract strategies we can learn from. (2) Own product — audits our website with actionable priority actions.',
  prompt_template: `=== MODE 1: COMPETITOR SEO INTELLIGENCE ===

SYSTEM: You are a senior competitive intelligence analyst specializing in SEO. Your job is to analyze competitor websites and extract strategies, patterns, and tactics that WE can learn from and replicate for our own product.

You are NOT auditing the competitor or telling them what to fix. Instead, you are studying what they do WELL so we can adopt similar (or better) strategies.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Focus on what the competitor does EFFECTIVELY — their strengths, not their weaknesses.
3. Frame everything as "what we can learn" and "what we should replicate or adapt."
4. Provide specific, actionable takeaways — not generic observations.
5. Prioritize learnings by potential impact for our product.
6. Reference specific URLs, page elements, or patterns when possible.
7. If custom focus instructions are provided, give extra weight to those areas.

USER: ## Competitor SEO Intelligence Request
Competitor: \${competitorName}
Website: \${competitorWebsite}

## Context: Our Product
Product: \${productName}
Website: \${productWebsite}

## Task
Analyze \${competitorWebsite} and extract SEO intelligence. Output JSON:
{
  "competitor_name": "", "website": "", "summary": "", "overall_effectiveness": 0-100,
  "keyword_targeting": { "effectiveness": 0-100, "primary_keywords": [], "keyword_strategy_notes": "" },
  "content_strategy": { "effectiveness": 0-100, "content_types": [], "content_strengths": [], "content_patterns": [] },
  "technical_seo_practices": { "effectiveness": 0-100, "strong_practices": [], "notable_implementations": [] },
  "on_page_patterns": { "effectiveness": 0-100, "title_patterns": "", "meta_patterns": "", "heading_patterns": "", "internal_linking": "" },
  "competitive_advantages": { "quick_wins_for_us": [{ "action": "", "impact": "high/medium/low" }] },
  "priority_learnings": [{ "learning": "", "impact": "high/medium/low" }]
}

=== MODE 2: OWN PRODUCT SEO AUDIT ===

SYSTEM: You are a senior SEO analyst and digital marketing strategist. You audit websites and provide comprehensive SEO recommendations to help them improve their search rankings and organic traffic.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Base your analysis on publicly observable SEO signals and best practices.
3. Provide specific, actionable recommendations — not generic advice.
4. Prioritize findings by impact (high/medium/low).
5. Reference specific URLs, page elements, or patterns when possible.
6. If custom focus instructions are provided, give extra weight to those areas while still covering the full SEO picture.

USER: ## SEO Audit Request — Our Own Product
Product: \${productName}
Website: \${productWebsite}

## Task
Audit the SEO of \${productWebsite} and output JSON:
{
  "product_name": "", "website": "", "summary": "", "overall_score": 0-100,
  "on_page_seo": { "score": 0-100, "title_tag": {}, "meta_description": {}, "heading_structure": {}, "content_quality": {}, "internal_linking": {}, "image_optimization": {} },
  "technical_seo": { "score": 0-100, "site_speed": {}, "mobile_friendliness": {}, "url_structure": {}, "schema_markup": {}, "ssl_https": {}, "crawlability": {} },
  "keyword_strategy": { "score": 0-100, "primary_keywords": [], "keyword_gaps": [], "content_opportunities": [] },
  "priority_actions": [{ "action": "", "impact": "high/medium/low" }]
}`,
};

// ========== Competitor Intelligence ==========

/**
 * Run competitor SEO intelligence for a single competitor.
 * Focuses on what they do WELL that we can learn from and replicate.
 */
async function analyzeSeo(containerId, competitorId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const comp = container.competitors.find(c => c.id === competitorId);
  if (!comp) throw new Error('Competitor not found');

  if (!comp.website) {
    throw new Error('Competitor has no website URL configured. Add a website URL to run SEO analysis.');
  }

  const compAds = gatherCompetitorAds(container, competitorId, { limit: 5 });
  const analysis = await storage.createSeoAnalysis(containerId, competitorId, 'competitor');
  if (!analysis) throw new Error('Failed to create SEO analysis');

  executeSeoAnalysis(containerId, competitorId, analysis.id, container, comp, compAds, options).catch(async (err) => {
    log.error(SRC, 'SEO analysis crashed', { err: err.message });
    try {
      await storage.updateSeoAnalysis(containerId, competitorId, analysis.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return analysis;
}

async function executeSeoAnalysis(containerId, competitorId, analysisId, container, comp, compAds, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildSeoPrompt(container, comp, compAds, options);
    log.info(SRC, 'Sending competitor SEO intelligence to Claude', {
      competitor: comp.name,
      website: comp.website,
      promptLength: prompt.length,
      hasFocusInstructions: !!options.focus_instructions,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: config.DEFAULT_MAX_TOKENS,
      system: `${config.APP_CONTEXT}

You are a senior competitive intelligence analyst specializing in SEO. Your job is to analyze competitor websites and extract strategies, patterns, and tactics that WE can learn from and replicate for our own product.

You are NOT auditing the competitor or telling them what to fix. Instead, you are studying what they do WELL so we can adopt similar (or better) strategies.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Focus on what the competitor does EFFECTIVELY — their strengths, not their weaknesses.
3. Frame everything as "what we can learn" and "what we should replicate or adapt."
4. Provide specific, actionable takeaways — not generic observations.
5. Prioritize learnings by potential impact for our product.
6. Reference specific URLs, page elements, or patterns when possible.
7. If custom focus instructions are provided, give extra weight to those areas.\n${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;

    try {
      jsonData = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed for SEO analysis', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      website: comp.website,
      analysis_type: 'competitor',
      focus_instructions: options.focus_instructions || null,
      analyzed_at: new Date().toISOString(),
    };

    await storage.updateSeoAnalysis(containerId, competitorId, analysisId, 'completed', result);
    log.info(SRC, 'Competitor SEO intelligence completed', { competitor: comp.name, analysisId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateSeoAnalysis(containerId, competitorId, analysisId, 'failed', { error: err.message });
  }
}

function buildSeoPrompt(container, comp, compAds, options) {
  const parts = [];

  parts.push(`## Competitor SEO Intelligence Request`);
  parts.push(`Competitor: ${comp.name}`);
  parts.push(`Website: ${comp.website}`);

  if (container.my_product) {
    parts.push(`\n## Context: Our Product (the one we want to improve)`);
    parts.push(`Product: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
  }

  if (options.focus_instructions) {
    parts.push(`\n## Custom Focus Instructions`);
    parts.push(`The user wants you to focus especially on the following aspects:`);
    parts.push(options.focus_instructions);
  }

  if (compAds.facebook.length > 0 || compAds.google.length > 0) {
    parts.push(`\n## Ad Data Context (from scraped ads)`);
    if (compAds.facebook.length > 0) {
      parts.push(`Facebook Ads (${compAds.facebook.length} samples):`);
      for (const ad of compAds.facebook.slice(0, 3)) {
        if (ad.headline) parts.push(`- Headline: ${ad.headline}`);
        if (ad.destination_url) parts.push(`  Landing: ${ad.destination_url}`);
      }
    }
    if (compAds.google.length > 0) {
      parts.push(`Google Ads (${compAds.google.length} samples):`);
      for (const ad of compAds.google.slice(0, 3)) {
        if (ad.headline) parts.push(`- Headline: ${ad.headline}`);
        if (ad.destination_url) parts.push(`  Landing: ${ad.destination_url}`);
      }
    }
  }

  const latestAnalysis = storage.getLatestCompetitorAnalysis(container.id, comp.id);
  if (latestAnalysis && latestAnalysis.result?.json_data) {
    const json = latestAnalysis.result.json_data;
    if (json.messaging_patterns) {
      parts.push(`\n## Ad Messaging Patterns (from competitor analysis)`);
      for (const pattern of json.messaging_patterns.slice(0, 3)) {
        parts.push(`- ${pattern.pattern}`);
      }
    }
  }

  parts.push(`\n## Task
Analyze ${comp.website} and extract SEO intelligence — what they do well that we can learn from.
Output a JSON object with this exact structure:

{
  "competitor_name": "${comp.name}",
  "website": "${comp.website}",
  "summary": "1 sentence summary of their SEO effectiveness",
  "overall_effectiveness": 0-100,
  "keyword_targeting": {
    "effectiveness": 0-100,
    "primary_keywords": ["keywords they target effectively"],
    "keyword_strategy_notes": "how they approach keyword targeting — what works"
  },
  "content_strategy": {
    "effectiveness": 0-100,
    "content_types": ["types of content they produce — blog posts, guides, tools, etc."],
    "content_strengths": ["what makes their content effective"],
    "content_patterns": ["recurring patterns in their content approach"]
  },
  "technical_seo_practices": {
    "effectiveness": 0-100,
    "strong_practices": ["technical SEO things they do well — site speed, schema, mobile, etc."],
    "notable_implementations": ["specific technical implementations worth noting"]
  },
  "on_page_patterns": {
    "effectiveness": 0-100,
    "title_patterns": "how they structure title tags — what works",
    "meta_patterns": "how they write meta descriptions — what works",
    "heading_patterns": "how they structure headings — what works",
    "internal_linking": "how they approach internal linking — what works"
  },
  "competitive_advantages": {
    "quick_wins_for_us": [
      {
        "action": "specific thing we can do quickly to match or beat them",
        "impact": "high/medium/low"
      }
    ]
  },
  "priority_learnings": [
    {
      "learning": "the key insight or pattern we should adopt",
      "impact": "high/medium/low"
    }
  ]
}

Rules:
- Focus on what they do WELL, not what they do poorly
- Frame everything as learnings and takeaways for US
- Be specific — reference actual pages, patterns, and elements
- Prioritize by impact for our product
- If focus instructions were provided, ensure those areas get deeper analysis
- Rate effectiveness honestly`);

  return parts.join('\n');
}

// ========== Own Product SEO Audit ==========

/**
 * Run SEO audit for our own product.
 * Analyzes our website and recommends what WE should improve.
 */
async function analyzeOwnSeo(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  if (!container.my_product || !container.my_product.website) {
    throw new Error('No product website configured. Add a website URL to your product to run SEO audit.');
  }

  const ownAds = gatherOwnProductContext(container);
  const analysis = await storage.createSeoAnalysis(containerId, '_own_product', 'own_product');
  if (!analysis) throw new Error('Failed to create own-product SEO analysis');

  executeOwnSeoAnalysis(containerId, analysis.id, container, ownAds, options).catch(async (err) => {
    log.error(SRC, 'Own-product SEO analysis crashed', { err: err.message });
    try {
      await storage.updateSeoAnalysis(containerId, '_own_product', analysis.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return analysis;
}

function gatherOwnProductContext(container) {
  const result = { facebook: [], google: [] };
  const scrapes = [...(container.scrape_results || [])].reverse();
  for (const scrape of scrapes) {
    if (scrape.status !== 'completed' && scrape.status !== 'timed_out') continue;
    const myData = scrape.scraped_data?.my_product;
    if (!myData) continue;
    if (result.facebook.length === 0) result.facebook = (myData.facebook || []).slice(0, 5);
    if (result.google.length === 0) result.google = (myData.google || []).slice(0, 5);
    if (result.facebook.length > 0 && result.google.length > 0) break;
  }
  return result;
}

async function executeOwnSeoAnalysis(containerId, analysisId, container, ownAds, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildOwnSeoPrompt(container, ownAds, options);
    const product = container.my_product;
    log.info(SRC, 'Sending own-product SEO audit to Claude', {
      product: product.name,
      website: product.website,
      promptLength: prompt.length,
      hasFocusInstructions: !!options.focus_instructions,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: config.DEFAULT_MAX_TOKENS,
      system: `${config.APP_CONTEXT}

You are a senior SEO analyst and digital marketing strategist. You audit websites and provide comprehensive SEO recommendations to help them improve their search rankings and organic traffic.

You receive our own product's website URL and any available ad/context data, and produce a structured SEO audit with actionable improvement recommendations.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Base your analysis on publicly observable SEO signals and best practices.
3. Provide specific, actionable recommendations — not generic advice.
4. Prioritize findings by impact (high/medium/low).
5. Reference specific URLs, page elements, or patterns when possible.
6. If custom focus instructions are provided, give extra weight to those areas while still covering the full SEO picture.\n${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;

    try {
      jsonData = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed for own-product SEO audit', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      website: product.website,
      analysis_type: 'own_product',
      focus_instructions: options.focus_instructions || null,
      analyzed_at: new Date().toISOString(),
    };

    await storage.updateSeoAnalysis(containerId, '_own_product', analysisId, 'completed', result);
    log.info(SRC, 'Own-product SEO audit completed', { product: product.name, analysisId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateSeoAnalysis(containerId, '_own_product', analysisId, 'failed', { error: err.message });
  }
}

function buildOwnSeoPrompt(container, ownAds, options) {
  const parts = [];
  const product = container.my_product;

  parts.push(`## SEO Audit Request — Our Own Product`);
  parts.push(`Product: ${product.name}`);
  parts.push(`Website: ${product.website}`);

  if (options.focus_instructions) {
    parts.push(`\n## Custom Focus Instructions`);
    parts.push(`The user wants you to focus especially on the following aspects:`);
    parts.push(options.focus_instructions);
  }

  if (ownAds.facebook.length > 0 || ownAds.google.length > 0) {
    parts.push(`\n## Our Ad Data Context (from scraped ads)`);
    if (ownAds.facebook.length > 0) {
      parts.push(`Facebook Ads (${ownAds.facebook.length} samples):`);
      for (const ad of ownAds.facebook.slice(0, 3)) {
        if (ad.headline) parts.push(`- Headline: ${ad.headline}`);
        if (ad.destination_url) parts.push(`  Landing: ${ad.destination_url}`);
      }
    }
    if (ownAds.google.length > 0) {
      parts.push(`Google Ads (${ownAds.google.length} samples):`);
      for (const ad of ownAds.google.slice(0, 3)) {
        if (ad.headline) parts.push(`- Headline: ${ad.headline}`);
        if (ad.destination_url) parts.push(`  Landing: ${ad.destination_url}`);
      }
    }
  }

  // Add competitor context for comparison
  if (container.competitors && container.competitors.length > 0) {
    const compNames = container.competitors.map(c => c.name).join(', ');
    parts.push(`\n## Competitive Context`);
    parts.push(`Our competitors: ${compNames}`);
    parts.push(`Consider these competitors when identifying keyword gaps and opportunities.`);
  }

  parts.push(`\n## Task
Audit the SEO of ${product.website} and output a JSON object with this exact structure.
This is OUR website — recommend what WE should fix and improve:

{
  "product_name": "${product.name}",
  "website": "${product.website}",
  "summary": "1 sentence summary of our SEO posture and top priorities",
  "overall_score": 0-100,
  "on_page_seo": {
    "score": 0-100,
    "title_tag": {
      "status": "good/needs_improvement/missing",
      "current": "what we have",
      "recommendation": "what we should do"
    },
    "meta_description": {
      "status": "good/needs_improvement/missing",
      "current": "what we have",
      "recommendation": "what we should do"
    },
    "heading_structure": {
      "status": "good/needs_improvement/poor",
      "recommendation": "what to improve"
    },
    "content_quality": {
      "status": "good/needs_improvement/poor",
      "recommendation": "actionable advice"
    },
    "internal_linking": {
      "status": "good/needs_improvement/poor",
      "recommendation": "advice"
    },
    "image_optimization": {
      "status": "good/needs_improvement/poor",
      "recommendation": "advice"
    }
  },
  "technical_seo": {
    "score": 0-100,
    "site_speed": {
      "status": "good/needs_improvement/poor",
      "findings": ["observations about load time, render blocking, etc."],
      "recommendation": "advice"
    },
    "mobile_friendliness": {
      "status": "good/needs_improvement/poor",
      "findings": ["responsive design, viewport, touch elements"],
      "recommendation": "advice"
    },
    "url_structure": {
      "status": "good/needs_improvement/poor",
      "findings": ["URL patterns, slugs, parameters"],
      "recommendation": "advice"
    },
    "schema_markup": {
      "status": "present/partial/missing",
      "types_detected": ["schema types found"],
      "recommendation": "advice"
    },
    "ssl_https": {
      "status": "good/issues/missing",
      "findings": ["observations"]
    },
    "crawlability": {
      "status": "good/needs_improvement/poor",
      "findings": ["robots.txt, sitemap, noindex issues"],
      "recommendation": "advice"
    }
  },
  "keyword_strategy": {
    "score": 0-100,
    "primary_keywords": ["keywords we appear to target"],
    "keyword_gaps": ["keywords we're missing that we should target"],
    "content_opportunities": [
      {
        "topic": "topic/keyword area",
        "rationale": "why this is an opportunity",
        "priority": "high/medium/low"
      }
    ]
  },
  "priority_actions": [
    {
      "action": "specific action to take",
      "impact": "high/medium/low"
    }
  ]
}

Rules:
- This is OUR website — frame everything as what WE should fix and improve
- Be specific — reference actual pages, patterns, and elements you can infer
- Prioritize by business impact
- If focus instructions were provided, ensure those areas get deeper analysis
- Score sections honestly — don't inflate or deflate`);

  return parts.join('\n');
}

module.exports = { analyzeSeo, analyzeOwnSeo, AGENT_META };
