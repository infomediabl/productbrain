/**
 * Agent: A/B Test Planner
 * Route: routes/test-planner.js → POST /api/containers/:id/test-plan
 * Deps: config, storage, logger, parse-json, gather-data (gatherGadsData, gatherContainerContext)
 * Stores: storage.test_plans[]
 *
 * Generates A/B test plans using the KNOWNS/UNKNOWNS framework. Classifies all
 * container data and produces structured tests with max 1-2 unknowns each.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherGadsData, gatherContainerContext } = require('../utils/gather-data');

const SRC = 'TestPlanner';

const AGENT_META = {
  code: 'ag0013',
  id: 'test-planner',
  name: 'RPS Test Ideator',
  description: 'KNOWNS/UNKNOWNS framework test plans with max 1-2 unknowns.',
  category: 'generation',
  model: 'AI_MODEL_HEAVY',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Competitor ad counts and EU data' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'Messaging patterns and proven ads' },
    { agent: 'seo', dataKey: 'seo_analyses', description: 'SEO keyword data' },
    { agent: 'keyword-ideator', dataKey: 'keyword_strategies', description: 'Keyword clusters and quick wins' },
    { agent: 'google-ads', dataKey: 'gads_analyses', description: 'Google Ads campaign performance' },
    { agent: 'proposal', dataKey: 'proposals', description: 'Creative briefs from proposals' },
  ],
  outputs: { storageKey: 'test_plans', dataType: 'json', schema: 'TestPlan' },
  ui: { visible: true },
  prompt_summary: 'Designs advertising tests using KNOWNS/UNKNOWNS framework with max 1-2 unknowns per test. Provides budget, geo, audience, and success criteria.',
  prompt_template: `SYSTEM:
You are a senior performance marketing strategist who designs rigorous advertising tests using the KNOWNS/UNKNOWNS framework.

CORE PRINCIPLE: Every test plan must have MAXIMUM 1-2 UNKNOWNS. All other variables must be KNOWNS backed by specific data. Reference specific data points from the provided classification. No generic advice.

You receive:
- A structured classification of all KNOWN and UNKNOWN data points
- Product details, competitor data, Google Ads metrics, SEO insights, keyword strategies
- The user's focus area and constraints

Your job: Design 2-5 test plans that systematically reduce unknowns with minimum budget.

RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Every KNOWN referenced must trace back to a specific data point provided.
3. Success criteria must use benchmarks from KNOWN data (e.g. "CPC < $2.00 based on current US CPC of $1.50").
4. Budget must be justified with minimum sample size calculations.
5. For Case (a) HAVE product: focus on expansion, use own Google Ads metrics as primary benchmarks.
6. For Case (b) NO product: focus on MVP validation, use competitor data as benchmarks, each test validates ONE critical assumption.
7. Sequence tests so foundational assumptions are validated before refinement tests.

USER:
## Case: (a) HAVE product or (b) NO product — MVP validation
## Product Details (name, website, site type, unique angle, target audience)
## Container Context (Curated Insights)
## Data Classification — KNOWNS (with source/category/detail for each)
## Data Classification — UNKNOWNS (with category/detail/testable/priority)
## Focus Area, Budget Constraint, Target Channels, Additional Instructions
## Existing Creative Briefs (from Proposal Agent)

## Task: Generate test plan JSON with data_classification, test_plans[] (each with title, hypothesis, channel, knowns_leveraged, unknowns_being_tested, geo, keywords, audience, creative_direction, budget, success_criteria, priority), recommended_sequence, total_budget_estimate`,
};

async function generateTestPlan(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const plan = await storage.addTestPlan(containerId);
  if (!plan) throw new Error('Failed to create test plan');

  executePlan(containerId, plan.id, container, options).catch(async (err) => {
    log.error(SRC, 'Test plan generation crashed', { err: err.message });
    try {
      await storage.updateTestPlan(containerId, plan.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return plan;
}

async function executePlan(containerId, planId, container, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const freshContainer = storage.readContainer(containerId) || container;
    const classification = classifyDataAvailability(freshContainer);
    const prompt = buildPrompt(freshContainer, classification, options);

    log.info(SRC, 'Sending test plan to Claude', {
      containerId,
      knowns: classification.knowns.length,
      unknowns: classification.unknowns.length,
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL_HEAVY,
      max_tokens: 16384,
      system: `${config.APP_CONTEXT}

You are a senior performance marketing strategist who designs rigorous advertising tests using the KNOWNS/UNKNOWNS framework.

CORE PRINCIPLE: Every test plan must have MAXIMUM 1-2 UNKNOWNS. All other variables must be KNOWNS backed by specific data. Reference specific data points from the provided classification. No generic advice.

You receive:
- A structured classification of all KNOWN and UNKNOWN data points
- Product details, competitor data, Google Ads metrics, SEO insights, keyword strategies
- The user's focus area and constraints

Your job: Design 2-5 test plans that systematically reduce unknowns with minimum budget.

RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Every KNOWN referenced must trace back to a specific data point provided.
3. Success criteria must use benchmarks from KNOWN data (e.g. "CPC < $2.00 based on current US CPC of $1.50").
4. Budget must be justified with minimum sample size calculations.
5. For Case (a) HAVE product: focus on expansion, use own Google Ads metrics as primary benchmarks.
6. For Case (b) NO product: focus on MVP validation, use competitor data as benchmarks, each test validates ONE critical assumption.
7. Sequence tests so foundational assumptions are validated before refinement tests.
${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try {
      jsonData = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      classification,
      generated_at: new Date().toISOString(),
      options_used: options,
    };

    await storage.updateTestPlan(containerId, planId, 'completed', result);
    log.info(SRC, 'Test plan completed', { planId, hasJsonData: !!jsonData });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateTestPlan(containerId, planId, 'failed', { error: err.message });
  }
}

/**
 * Walk all data sources in the container and classify each as KNOWN or UNKNOWN.
 */
function classifyDataAvailability(container) {
  const knowns = [];
  const unknowns = [];

  // --- Product data ---
  if (container.my_product) {
    knowns.push({ source: 'product', category: 'product_exists', detail: `Product: ${container.my_product.name}` });
    if (container.my_product.website) knowns.push({ source: 'product', category: 'website', detail: container.my_product.website });
    if (container.my_product.site_type) knowns.push({ source: 'product', category: 'site_type', detail: container.my_product.site_type });
    else unknowns.push({ category: 'site_type', detail: 'Product site type not defined', can_be_tested: false, priority: 'low' });
    if (container.my_product.unique_angle) knowns.push({ source: 'product', category: 'unique_angle', detail: container.my_product.unique_angle });
    else unknowns.push({ category: 'unique_angle', detail: 'No unique angle defined — unclear positioning', can_be_tested: true, priority: 'high' });
    if (container.my_product.target_audience) knowns.push({ source: 'product', category: 'target_audience', detail: container.my_product.target_audience });
    else unknowns.push({ category: 'target_audience', detail: 'Target audience not defined', can_be_tested: true, priority: 'high' });
  } else {
    unknowns.push({ category: 'product', detail: 'No product defined — everything about the product is unknown', can_be_tested: true, priority: 'high' });
  }

  // --- Google Ads data ---
  const gadsData = gatherGadsData(container);
  if (gadsData && gadsData.campaigns.length > 0) {
    for (const c of gadsData.campaigns) {
      const cpc = (c.clicks > 0 && c.cost_micros) ? (c.cost_micros / 1e6 / c.clicks).toFixed(2) : null;
      knowns.push({
        source: 'google_ads',
        category: 'campaign_performance',
        detail: `${c.name} [${c.channel_type}]: ${c.impressions} impressions, ${c.clicks} clicks${cpc ? `, CPC $${cpc}` : ''}`,
      });
    }
    if (gadsData.analysis.summary) {
      knowns.push({ source: 'google_ads', category: 'ai_analysis', detail: gadsData.analysis.summary });
    }
    if (gadsData.analysis.findings) {
      for (const f of gadsData.analysis.findings.slice(0, 5)) {
        const text = typeof f === 'string' ? f : f.finding || JSON.stringify(f);
        knowns.push({ source: 'google_ads', category: 'finding', detail: text });
      }
    }
  } else {
    unknowns.push({ category: 'google_ads', detail: 'No Google Ads data — CPC, CTR, conversion baselines unknown', can_be_tested: true, priority: 'medium' });
  }

  // --- Competitor analyses ---
  const compAnalyses = container.competitor_analyses || {};
  for (const comp of (container.competitors || [])) {
    const analyses = compAnalyses[comp.id] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    if (latest?.result?.json_data) {
      const j = latest.result.json_data;
      knowns.push({ source: 'competition', category: 'competitor_analyzed', detail: `${comp.name}: analysis available` });
      if (j.messaging_patterns) {
        for (const p of j.messaging_patterns.slice(0, 3)) {
          knowns.push({ source: 'competition', category: 'messaging_pattern', detail: `${comp.name}: "${p.pattern}" (${p.frequency || 'N/A'})` });
        }
      }
      if (j.long_running_ads) {
        for (const a of j.long_running_ads.slice(0, 3)) {
          knowns.push({ source: 'competition', category: 'proven_ad', detail: `${comp.name}: "${a.headline || 'N/A'}" running ${a.days_running} days` });
        }
      }
      if (j.opportunities_for_us) {
        for (const o of j.opportunities_for_us.slice(0, 3)) {
          knowns.push({ source: 'competition', category: 'opportunity', detail: `${comp.name}: ${o.opportunity}` });
        }
      }
    } else {
      unknowns.push({ category: 'competition', detail: `${comp.name}: not analyzed yet`, can_be_tested: false, priority: 'low' });
    }
  }

  // --- Scrape data (ad counts) ---
  const scrapes = (container.scrape_results || []).filter(s => s.status === 'completed' || s.status === 'timed_out');
  if (scrapes.length > 0) {
    const latestScrape = scrapes[scrapes.length - 1];
    for (const comp of (container.competitors || [])) {
      const compData = latestScrape.scraped_data?.competitors?.[comp.id];
      if (compData) {
        const fbCount = (compData.facebook || []).length;
        const gCount = (compData.google || []).length;
        if (fbCount > 0 || gCount > 0) {
          knowns.push({ source: 'competition', category: 'ad_data', detail: `${comp.name}: ${fbCount} Facebook ads, ${gCount} Google ads scraped` });
          // Check for EU audience data
          const adsWithEu = (compData.facebook || []).filter(a => a.extra_data?.eu_audience);
          if (adsWithEu.length > 0) {
            knowns.push({ source: 'competition', category: 'eu_demographics', detail: `${comp.name}: EU audience data available for ${adsWithEu.length} ads` });
          }
        }
      }
    }
  } else {
    unknowns.push({ category: 'scrape_data', detail: 'No competitor ads scraped yet', can_be_tested: false, priority: 'medium' });
  }

  // --- SEO data ---
  const seoAnalyses = container.seo_analyses || {};
  let hasSeo = false;
  for (const comp of (container.competitors || [])) {
    const analyses = seoAnalyses[comp.id] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    if (latest?.result?.json_data) {
      hasSeo = true;
      const s = latest.result.json_data;
      if (s.keyword_strategy?.primary_keywords?.length > 0) {
        knowns.push({ source: 'seo', category: 'primary_keywords', detail: `${comp.name}: ${s.keyword_strategy.primary_keywords.slice(0, 5).join(', ')}` });
      }
      if (s.keyword_strategy?.keyword_gaps?.length > 0) {
        knowns.push({ source: 'seo', category: 'keyword_gaps', detail: `${comp.name}: ${s.keyword_strategy.keyword_gaps.slice(0, 3).join(', ')}` });
      }
    }
  }
  if (!hasSeo) {
    unknowns.push({ category: 'seo', detail: 'No SEO analysis data', can_be_tested: false, priority: 'low' });
  }

  // --- Keyword strategies ---
  const kwStrategies = (container.keyword_strategies || []).filter(s => s.status === 'completed');
  if (kwStrategies.length > 0) {
    const latest = kwStrategies[kwStrategies.length - 1];
    const json = latest.result?.json_data;
    if (json) {
      if (json.keyword_clusters) {
        for (const cluster of json.keyword_clusters.slice(0, 5)) {
          knowns.push({ source: 'keywords', category: 'keyword_cluster', detail: `${cluster.cluster_name || cluster.theme || cluster.name}: ${cluster.primary_keyword || ''} (${cluster.intent || 'N/A'})` });
        }
      }
      if (json.quick_wins) {
        for (const qw of json.quick_wins.slice(0, 3)) {
          knowns.push({ source: 'keywords', category: 'quick_win', detail: typeof qw === 'string' ? qw : qw.keyword || qw.action || JSON.stringify(qw) });
        }
      }
      if (json.competitor_gaps) {
        for (const gap of json.competitor_gaps.slice(0, 3)) {
          knowns.push({ source: 'keywords', category: 'competitor_gap', detail: typeof gap === 'string' ? gap : gap.gap || gap.description || JSON.stringify(gap) });
        }
      }
    }
  } else {
    unknowns.push({ category: 'keywords', detail: 'No keyword strategy generated yet', can_be_tested: false, priority: 'low' });
  }

  // --- User metadata ---
  const metadata = container.metadata || [];
  if (metadata.length > 0) {
    for (const m of metadata.slice(0, 5)) {
      knowns.push({ source: 'metadata', category: m.type || 'note', detail: `[${m.type}] ${m.title}: ${(m.content || '').substring(0, 100)}` });
    }
  }

  return { knowns, unknowns };
}

function buildPrompt(container, classification, options) {
  const parts = [];

  // Product context
  const isCase_a = !!container.my_product;
  parts.push(`## Case: ${isCase_a ? '(a) HAVE product' : '(b) NO product — MVP validation'}`);

  if (container.my_product) {
    parts.push(`\n## Product Details`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.site_type) parts.push(`Site Type: ${container.my_product.site_type}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
  } else {
    parts.push(`\nNo product defined. All product-related assumptions are UNKNOWN.`);
    parts.push(`Focus: MVP validation — each test should validate ONE critical assumption with minimum budget.`);
  }

  // Container Context (curated insights)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    parts.push('\n## Container Context (Curated Insights)');
    for (const item of contextData) {
      parts.push(`### [${item.source_type}] ${item.section_name}`);
      parts.push(item.brief);
    }
  }

  // Classification
  parts.push(`\n## Data Classification — KNOWNS (${classification.knowns.length} data points)`);
  for (const k of classification.knowns) {
    parts.push(`- [${k.source}/${k.category}] ${k.detail}`);
  }

  parts.push(`\n## Data Classification — UNKNOWNS (${classification.unknowns.length} items)`);
  for (const u of classification.unknowns) {
    parts.push(`- [${u.category}] ${u.detail} (testable: ${u.can_be_tested ? 'yes' : 'no'}, priority: ${u.priority})`);
  }

  // User options
  if (options.focus) parts.push(`\n## Focus Area: ${options.focus}`);
  if (options.budget_constraint) parts.push(`## Budget Constraint: ${options.budget_constraint}`);
  if (options.target_channels) parts.push(`## Target Channels: ${Array.isArray(options.target_channels) ? options.target_channels.join(', ') : options.target_channels}`);
  if (options.user_instructions) parts.push(`## Additional Instructions:\n${options.user_instructions}`);

  // Existing proposals context
  const proposals = (container.proposals || []).filter(p => p.status === 'completed');
  if (proposals.length > 0) {
    const latest = proposals[proposals.length - 1];
    const json = latest.result?.json_data;
    if (json?.creative_briefs?.length > 0) {
      parts.push(`\n## Existing Creative Briefs (from Proposal Agent)`);
      for (const b of json.creative_briefs.slice(0, 5)) {
        parts.push(`- #${b.number} "${b.title}": ${b.adapted_version?.headline || 'N/A'} [${b.priority || 'N/A'}]`);
      }
    }
  }

  // Task
  parts.push(`\n## Task
Generate a comprehensive test plan. Output JSON with this exact structure:

{
  "data_classification": {
    "knowns": [{ "source": "google_ads|competition|seo|product|metadata|keywords", "category": "...", "detail": "...", "relevance": "high|medium|low" }],
    "unknowns": [{ "category": "...", "detail": "...", "can_be_tested": true, "priority": "high|medium|low" }]
  },
  "test_plans": [
    {
      "test_number": 1,
      "title": "Short title",
      "hypothesis": "If X, then Y because Z (KNOWN)",
      "channel": "google_search|google_display|facebook|instagram",
      "knowns_leveraged": ["Specific KNOWN data point used"],
      "unknowns_being_tested": ["Max 1-2 unknowns this test resolves"],
      "geo": { "target_countries": ["US","DE"], "rationale": "Why, based on data" },
      "keywords": { "primary": ["kw1"], "secondary": ["kw2"], "source": "From which data" },
      "audience": { "description": "...", "demographics": "...", "source": "..." },
      "creative_direction": { "angle": "...", "based_on": "Which competitor ad/pattern", "ad_format": "image|video|text" },
      "budget": { "daily_budget_usd": 50, "duration_days": 14, "total_budget_usd": 700, "rationale": "Why sufficient for significance" },
      "success_criteria": { "primary_metric": "CPC|CTR|CR|CPA", "target_value": "< $2.00", "benchmark_source": "Based on KNOWN: ...", "minimum_sample": "500 clicks" },
      "priority": "high|medium|low"
    }
  ],
  "recommended_sequence": "Run test 1 first because..., then test 2...",
  "total_budget_estimate": "$X for all tests"
}

CRITICAL RULES:
- Each test plan MUST have MAXIMUM 1-2 unknowns_being_tested
- All other variables must reference specific KNOWN data points
- success_criteria.benchmark_source MUST reference a specific KNOWN (e.g. "Current US CPC of $1.50")
- Generate 2-5 test plans ordered by priority
- For Case (a): focus on expansion using own metrics as benchmarks
- For Case (b): focus on MVP validation, each test validates ONE critical assumption`);

  return parts.join('\n');
}

module.exports = { generateTestPlan, run: generateTestPlan, AGENT_META };
