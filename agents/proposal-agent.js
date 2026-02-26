/**
 * Agent: Proposal Generator
 * Route: routes/proposal.js → POST /api/containers/:id/propose
 * Deps: config, storage, logger, parse-json, gather-data (gatherScrapeData, gatherCompetitorAnalyses, gatherGadsData, gatherContainerContext), summarize-ads
 * Stores: storage.proposals[]
 *
 * Generates AI marketing proposals using Claude. Gathers all container data
 * (competitor analyses, ads, SEO, GAds, context) to build comprehensive prompts.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherScrapeData, gatherCompetitorAnalyses, gatherGadsData, gatherContainerContext } = require('../utils/gather-data');
const { summarizeAds } = require('../utils/summarize-ads');

const SRC = 'ProposalAgent';

const AGENT_META = {
  code: 'ag0005',
  id: 'proposal',
  name: 'Magic AI',
  description: 'Creative ad proposals from competitor data, analyses, and Google Ads metrics.',
  category: 'generation',
  model: 'AI_MODEL_HEAVY',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'competitorIds', type: 'array', required: true, from: null },
    { name: 'userContext', type: 'string', required: false, from: null },
    { name: 'userPrompt', type: 'string', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Raw scraped ad data' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'AI competitor analyses' },
    { agent: 'google-ads', dataKey: 'gads_analyses', description: 'Google Ads performance data' },
  ],
  outputs: { storageKey: 'proposals', dataType: 'json', schema: 'Proposal' },
  ui: { visible: true },
};

/**
 * Generate a proposal using data from scraper + analyzer agents.
 */
async function generateProposal(containerId, { competitorIds, userContext, userPrompt }) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  // Gather scraped data for selected competitors
  const mergedScrapeData = gatherScrapeData(container, competitorIds);
  if (Object.keys(mergedScrapeData).length === 0) {
    throw new Error('No scraped data found for selected competitors');
  }

  // Gather competitor analyses (from analyzer agent)
  const competitorAnalyses = gatherCompetitorAnalyses(container, competitorIds);

  const proposal = await storage.addProposal(containerId, null);
  if (!proposal) throw new Error('Container not found');

  // Run async
  executeProposal(containerId, proposal.id, container, mergedScrapeData, competitorAnalyses, userContext, userPrompt).catch(async (err) => {
    log.error(SRC, 'Proposal generation crashed', { err: err.message });
    try {
      await storage.updateProposal(containerId, proposal.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return proposal;
}

async function executeProposal(containerId, proposalId, container, mergedScrapeData, competitorAnalyses, userContext, userPrompt) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const freshContainer = storage.readContainer(containerId) || container;
    const prompt = buildPrompt(freshContainer, mergedScrapeData, competitorAnalyses, userContext, userPrompt);
    log.info(SRC, 'Sending to Claude API', {
      promptLength: prompt.length,
      competitorCount: Object.keys(mergedScrapeData).length,
      hasAnalyses: Object.keys(competitorAnalyses).length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL_HEAVY,
      max_tokens: 16384,
      system: `${config.APP_CONTEXT}

You are a senior ad creative strategist specializing in performance marketing across Facebook, Instagram, and Google. You analyze competitor ad libraries and produce a concise set of ready-to-execute creative briefs with precise demographic targeting and format specifications.

You receive:
- "My Product" section = the CLIENT's product (NOT an ad to analyze). Use this as context for adapting competitor creatives.
- Competitor sections = actual scraped ad data to analyze, including EU audience data (age groups, gender breakdown, country-level reach) when available.
- Competitor Analysis = AI-generated analysis of each competitor's strategy (when available). Use this to make better-informed recommendations.

Your job: Select the 5-10 BEST competitor ads to clone/adapt, and output a STRUCTURED JSON object with creative briefs and patterns.

DEMOGRAPHIC & LOCALIZATION RULES:
- When EU audience data is provided for an ad, analyze it to determine optimal age group targeting, gender split, and country-level localization.
- For each creative brief, specify the exact ad format/placement with rationale.
- Use demographic data to justify targeting decisions.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Every recommendation MUST reference a specific competitor ad from the data.
3. For Google text-only ads: write image generation prompts for AI image creation.
4. Long-running ads (30+ days) are proven — prioritize them heavily.
5. Do NOT mention GDPR, privacy, data protection.
6. Clearly separate evidence-based patterns from speculative fresh ideas.
7. When competitor analysis is available, use it to inform your recommendations.
${config.CONCISENESS_INSTRUCTION}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');

    let jsonData = null;
    try {
      const rawJson = parseJsonFromResponse(fullText);
      if (rawJson) {
        jsonData = normalizeProposalJson(rawJson);
        const warnings = validateProposal(jsonData, mergedScrapeData);
        if (warnings.length > 0) {
          log.info(SRC, 'Proposal validation warnings', { warnings });
          jsonData._validation_warnings = warnings;
        }
      }
    } catch (parseErr) {
      log.info(SRC, 'JSON parse failed', { err: parseErr.message });
    }

    const result = {
      full_text: fullText,
      prompt_log: prompt,
      user_context: userContext || '',
      user_prompt: userPrompt || '',
    };

    if (jsonData) {
      result.json_data = jsonData;
    }

    result.creative_briefs = extractSection(fullText, 'Creative Briefs', 'Patterns');
    result.patterns = extractSection(fullText, 'Patterns');

    await storage.updateProposal(containerId, proposalId, 'completed', result);
    log.info(SRC, 'Proposal completed', { proposalId, hasJsonData: !!jsonData });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateProposal(containerId, proposalId, 'failed', { error: err.message });
  }
}

function buildPrompt(container, mergedScrapeData, competitorAnalyses, userContext, userPrompt) {
  const instructionParts = [];
  const dataParts = [];

  if (container.my_product) {
    instructionParts.push(`## My Product: ${container.my_product.name}`);
    if (container.my_product.website) instructionParts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.site_type) instructionParts.push(`Type: ${container.my_product.site_type}`);
    if (container.my_product.unique_angle) instructionParts.push(`Unique Angle: ${container.my_product.unique_angle}`);
    if (container.my_product.target_audience) instructionParts.push(`Target Audience: ${container.my_product.target_audience}`);
    instructionParts.push(`(Your product — the proposal should recommend ads for this product based on competitor analysis below)`);
  } else {
    instructionParts.push(`## No Existing Product`);
    instructionParts.push(`The user does not have an existing product yet. Proposals should include product concept recommendations alongside creative briefs. Suggest a brand direction and adapt competitor strategies for a new entrant.`);
  }
  if (userContext) {
    instructionParts.push(`\n### Product Context (provided by user)`);
    instructionParts.push(userContext);
  }

  if (userPrompt) {
    instructionParts.push(`\n## Additional Instructions (from user)`);
    instructionParts.push(userPrompt);
  }

  if (container.metadata && container.metadata.length > 0) {
    instructionParts.push(`\n## My Product Notes & Feedback`);
    for (const m of container.metadata) {
      instructionParts.push(`### [${m.type}] ${m.title}`);
      instructionParts.push(m.content);
    }
  }

  // Include Container Context (curated insights from Collector)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    dataParts.push('\n## Container Context (Curated Insights)');
    for (const item of contextData) {
      dataParts.push(`### [${item.source_type}] ${item.section_name}`);
      dataParts.push(item.brief);
    }
  }

  // Include Google Ads performance data (KNOWN data)
  const gadsData = gatherGadsData(container);
  if (gadsData && gadsData.campaigns.length > 0) {
    dataParts.push(`\n## Our Google Ads Performance (KNOWN data)`);
    dataParts.push(`Account: ${gadsData.account_id || 'N/A'} | Analyzed: ${gadsData.analyzed_at || 'N/A'}`);
    for (const c of gadsData.campaigns) {
      const costUsd = c.cost_micros ? `$${(c.cost_micros / 1e6).toFixed(2)}` : 'N/A';
      const budgetUsd = c.budget_micros ? `$${(c.budget_micros / 1e6).toFixed(2)}/day` : 'N/A';
      const cpc = (c.clicks > 0 && c.cost_micros) ? `$${(c.cost_micros / 1e6 / c.clicks).toFixed(2)}` : 'N/A';
      dataParts.push(`- ${c.name} [${c.channel_type}]: ${c.impressions} impr, ${c.clicks} clicks, CPC ${cpc}, cost ${costUsd}, budget ${budgetUsd}`);
    }
    if (gadsData.analysis.summary) {
      dataParts.push(`\nAI Analysis Summary: ${gadsData.analysis.summary}`);
    }
    if (gadsData.analysis.action_items && gadsData.analysis.action_items.length > 0) {
      dataParts.push('Action Items:');
      for (const item of gadsData.analysis.action_items.slice(0, 5)) {
        dataParts.push(`- ${typeof item === 'string' ? item : item.action || item.recommendation || JSON.stringify(item)}`);
      }
    }
  }

  // Include competitor analyses from Analyzer Agent
  if (Object.keys(competitorAnalyses).length > 0) {
    dataParts.push(`\n## Competitor Intelligence (from Analyzer Agent)`);
    for (const comp of container.competitors) {
      const analysis = competitorAnalyses[comp.id];
      if (!analysis) continue;
      dataParts.push(`\n### Analysis: ${comp.name}`);
      dataParts.push(`Summary: ${analysis.summary || 'N/A'}`);
      if (analysis.key_findings) {
        dataParts.push('Key Findings:');
        for (const f of analysis.key_findings.slice(0, 5)) {
          dataParts.push(`- ${f.finding}`);
        }
      }
      if (analysis.messaging_patterns) {
        dataParts.push('Messaging Patterns:');
        for (const p of analysis.messaging_patterns.slice(0, 5)) {
          dataParts.push(`- ${p.pattern} (${p.frequency || 'N/A'})`);
        }
      }
      if (analysis.long_running_ads) {
        dataParts.push('Long-Running Ads:');
        for (const a of analysis.long_running_ads.slice(0, 3)) {
          dataParts.push(`- ${a.headline || 'N/A'} (${a.days_running} days) — ${a.why_its_working || ''}`);
        }
      }
      if (analysis.opportunities_for_us) {
        dataParts.push('Opportunities:');
        for (const o of analysis.opportunities_for_us.slice(0, 3)) {
          dataParts.push(`- ${o.opportunity}`);
        }
      }
    }
  }

  // Raw scraped ad data
  for (const comp of container.competitors) {
    const merged = mergedScrapeData[comp.id];
    if (!merged) continue;

    dataParts.push(`\n## Competitor: ${comp.name}`);
    if (comp.website) dataParts.push(`Website: ${comp.website}`);

    const compData = merged.data;
    if (compData) {
      if (compData.facebook && compData.facebook.length > 0) {
        dataParts.push(`### Facebook Ads (${compData.facebook.length} ads)`);
        dataParts.push(summarizeAds(compData.facebook, { maxAds: 20, textLimit: 300, ocrLimit: 200, includeLastShown: true }));
      }
      if (compData.google && compData.google.length > 0) {
        dataParts.push(`### Google Ads (${compData.google.length} ads)`);
        dataParts.push(summarizeAds(compData.google, { maxAds: 20, textLimit: 300, ocrLimit: 200, includeLastShown: true }));
      }
    }
  }

  const taskParts = [];
  taskParts.push(`\n## Task
Output a single JSON object with exactly 2 top-level keys: "creative_briefs", "patterns". No markdown, no code fences, no extra text — ONLY valid JSON.

Select 5-10 competitor ads that are the BEST candidates for cloning/adapting for our product. Prioritize long-running ads (30+ days = proven). Use competitor analysis insights when available.

IMPORTANT: Pick DIVERSE angles:
- Different hooks (challenge, benefit, curiosity, social proof, etc.)
- Different formats (image, video, text-to-image)
- Different competitors (spread selections across available competitors)
- Google text ads = proven copy angles to turn into image creatives

Output this exact JSON structure:

{
  "creative_briefs": [
    {
      "number": 1,
      "title": "Short descriptive title",
      "source_type": "IMAGE or VIDEO",
      "source_ad_link": "EXACT ad_link URL from data",
      "source_competitor": "Competitor name",
      "running_days": 187,
      "original_copy": { "headline": "Verbatim", "text": "Verbatim", "cta": "Original CTA" },
      "why_this_ad": "1-2 sentences with data",
      "target_demographics": "25-44 women, DE/FR",
      "ad_format": "Exact placement recommendation with rationale",
      "adapted_version": { "headline": "Our headline", "ad_text": "Our copy", "cta": "Our CTA", "platform": "Platform" },
      "image_prompt": "Detailed 3-4 sentence prompt for AI image generation",
      "priority": "high/medium/low"
    }
  ],
  "patterns": {
    "evidence_based": [{ "title": "Pattern", "description": "Evidence" }],
    "fresh_ideas": [{ "title": "Idea", "what_to_do": "Description" }]
  }
}

Rules:
- creative_briefs: 5-10 entries with diverse angles
- patterns.evidence_based: Patterns backed by data
- patterns.fresh_ideas: 3-5 genuinely novel ideas
- All source_ad_link values MUST be real URLs from scraped data
- Do NOT include budget advice, landing page tips, testing frameworks, timeline plans`);

  const instructions = instructionParts.join('\n');
  const task = taskParts.join('\n');
  let data = dataParts.join('\n');
  const maxTotal = 100000;
  const overhead = instructions.length + task.length + 100;
  if (overhead + data.length > maxTotal) {
    const maxData = maxTotal - overhead;
    data = data.substring(0, maxData) + '\n\n[Data truncated due to length]';
  }

  return instructions + '\n' + data + '\n' + task;
}

function normalizeProposalJson(raw) {
  const result = {};

  const briefs = raw.creative_briefs || [];
  result.creative_briefs = briefs.map((b, i) => {
    const rawLink = b.source_ad_link || b.based_on_competitor_ad || '';
    const rawLinks = b.source_ad_links || b.based_on_competitor_ads || b.ad_links || b.source_ads || [];
    let adLinks = [];
    if (rawLink) adLinks.push(rawLink);
    if (Array.isArray(rawLinks)) adLinks.push(...rawLinks);
    else if (rawLinks) adLinks.push(rawLinks);
    adLinks = [...new Set(adLinks.filter(Boolean))];
    const firstLink = adLinks[0] || '';

    const sourceType = b.source_type || b.format || b.format_and_placement || '';
    const isVideo = /video/i.test(sourceType);

    const td = b.target_demographics || b.targeting || {};
    let normalizedDemographics;
    if (typeof td === 'string') {
      normalizedDemographics = td;
    } else {
      normalizedDemographics = {
        age_groups: td.age_groups ? (Array.isArray(td.age_groups) ? td.age_groups.join(', ') : td.age_groups) : td.age || '',
        gender: td.gender || '',
        top_countries: td.top_countries
          ? (Array.isArray(td.top_countries) ? td.top_countries.join(', ') : td.top_countries)
          : td.countries ? (Array.isArray(td.countries) ? td.countries.join(', ') : td.countries) : '',
      };
    }

    const oc = b.original_copy || {};
    const av = b.adapted_version || {};
    const ac = b.ad_copy || {};
    const cd = b.creative_direction || {};

    const runDays = b.running_days || b.competitor_ad_longevity_days || b.source_runtime_days || b.days_running || 0;
    const imgPrompt = b.image_prompt || b.image_generation_prompt || cd.image_generation_prompt || cd.image_prompt || b.visual_description || '';

    return {
      number: b.number || i + 1,
      title: b.title || b.brief_name || `Brief ${i + 1}`,
      source_type: isVideo ? 'VIDEO' : 'IMAGE',
      source_ad_link: firstLink,
      source_ad_links: adLinks,
      source_competitor: b.source_competitor || b.competitor || '',
      running_days: runDays,
      original_copy: { headline: oc.headline || '', text: oc.text || oc.primary_text || '', cta: oc.cta || '' },
      why_this_ad: b.why_this_ad || b.why_selected || b.rationale || '',
      target_demographics: normalizedDemographics,
      ad_format: b.ad_format || b.format_and_placement || '',
      adapted_version: {
        headline: av.headline || ac.headline || cd.headline || '',
        ad_text: av.ad_text || av.text || ac.primary_text || ac.ad_text || '',
        cta: av.cta || ac.cta || cd.cta || b.cta || '',
        platform: av.platform || '',
      },
      image_prompt: imgPrompt,
      priority: b.priority || '',
    };
  });

  const patternsObj = raw.patterns || {};
  const evidenceBased = patternsObj.evidence_based || raw.evidence_based_patterns || raw.competitor_patterns || [];
  const freshIdeas = patternsObj.fresh_ideas || raw.speculative_fresh_ideas || raw.fresh_ideas || [];

  result.patterns = {
    evidence_based: (Array.isArray(evidenceBased) ? evidenceBased : []).map(p => ({
      title: p.title || p.pattern || '',
      description: p.description || p.details || p.evidence || '',
    })),
    fresh_ideas: (Array.isArray(freshIdeas) ? freshIdeas : []).map(idea => ({
      title: idea.title || idea.idea || '',
      what_to_do: idea.what_to_do || idea.description || idea.concept || '',
    })),
  };

  result.data_gaps = raw.data_gaps || [];

  return result;
}

function validateProposal(jsonData, mergedScrapeData) {
  const warnings = [];
  const knownLinks = new Set();
  for (const compId of Object.keys(mergedScrapeData)) {
    const compData = mergedScrapeData[compId].data;
    for (const platform of ['facebook', 'google']) {
      for (const ad of (compData?.[platform] || [])) {
        const extra = ad.extra_data || {};
        if (extra.ad_link) knownLinks.add(extra.ad_link.toLowerCase());
        if (extra.fb_ad_id) knownLinks.add(`https://www.facebook.com/ads/library/?id=${extra.fb_ad_id}`.toLowerCase());
        if (extra.creative_id) knownLinks.add(`https://adstransparency.google.com/advertiser/creative/${extra.creative_id}`.toLowerCase());
      }
    }
  }

  const briefs = jsonData.creative_briefs || [];
  for (let i = 0; i < briefs.length; i++) {
    const b = briefs[i];
    if (!b.image_prompt) warnings.push(`Brief ${i + 1}: missing image_prompt`);
    const allLinks = b.source_ad_links || (b.source_ad_link ? [b.source_ad_link] : []);
    if (allLinks.length === 0) warnings.push(`Brief ${i + 1}: missing source_ad_link`);
    if (!b.adapted_version || !b.adapted_version.headline) warnings.push(`Brief ${i + 1}: missing adapted headline`);
  }

  return warnings;
}

function extractSection(text, startKeyword, endKeyword) {
  const lines = text.split('\n');
  const escStart = startKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startRe = new RegExp(`^#{1,3}\\s+.*${escStart}`, 'i');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx < 0) return '';
  const startLevel = (lines[startIdx].match(/^(#{1,3})\s/) || ['', '#'])[1].length;
  let endIdx = lines.length;
  if (endKeyword) {
    const escEnd = endKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const endRe = new RegExp(`^#{1,${startLevel}}\\s+.*${escEnd}`, 'i');
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (endRe.test(lines[i])) { endIdx = i; break; }
    }
  }
  return lines.slice(startIdx, endIdx).join('\n').trim();
}

module.exports = { generateProposal, run: generateProposal, AGENT_META };
