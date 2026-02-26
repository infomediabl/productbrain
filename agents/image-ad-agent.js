/**
 * Agent: Image Ad Curator
 * Route: routes/image-ads.js → POST /api/containers/:id/image-ads
 * Deps: config, storage, logger, parse-json, gather-data (gatherCompetitorAds, gatherCompetitorAnalyses, gatherContainerContext), summarize-ads
 * Stores: storage.image_ads[]
 *
 * Curates the best competitor ads to clone and recommends which AI model to use
 * for each. The Clone Ad feature on the report page handles actual image generation.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherCompetitorAds, gatherCompetitorAnalyses, gatherContainerContext } = require('../utils/gather-data');
const { summarizeAds } = require('../utils/summarize-ads');

const SRC = 'ImageAdAgent';

const AGENT_META = {
  code: 'ag0010',
  id: 'image-ads',
  name: 'Image Ad Curator',
  description: 'Curates best competitor ads for cloning with AI model recommendations.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Competitor ads to curate for cloning' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'Creative format insights and effectiveness signals' },
    { agent: 'proposal', dataKey: 'proposals', description: 'Creative brief context' },
    { agent: 'container-context', dataKey: 'container_context', description: 'Curated insights from all analyses' },
  ],
  outputs: { storageKey: 'image_ads', dataType: 'json', schema: 'ImageAdCuration' },
  ui: { visible: true },
};

async function generateImageAds(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const ad = await storage.addImageAd(containerId);
  if (!ad) throw new Error('Failed to create image ad record');

  executeImageAds(containerId, ad.id, container, options).catch(async (err) => {
    log.error(SRC, 'Image ad curation crashed', { err: err.message });
    try {
      await storage.updateImageAd(containerId, ad.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return ad;
}

async function executeImageAds(containerId, adId, container, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildPrompt(container, options);

    log.info(SRC, 'Sending ad curation request to Claude', {
      containerId,
      adCount: options.ad_count || 5,
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 12000,
      system: `You are a senior ad strategist specializing in competitive intelligence and creative curation. Your job is to analyze a pool of competitor ads, identify the highest-performing ones worth cloning, and provide detailed adaptation strategies for the user's product.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Rank ads by cloning potential — prioritize ads with strong effectiveness signals (long-running, clear CTA, emotional hooks, proven formats).
3. For each curated ad, explain WHY it should be cloned and HOW to adapt it.
4. Recommend the best AI image model for each ad based on its visual style.
5. Provide a ready-to-use prompt for the recommended model.
6. Each adaptation must differentiate from the original — never suggest a direct copy.
7. Consider the user's platform, objective, and audience when ranking and adapting.`,
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

    await storage.updateImageAd(containerId, adId, 'completed', result);
    log.info(SRC, 'Ad curation completed', { adId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateImageAd(containerId, adId, 'failed', { error: err.message });
  }
}

function buildPrompt(container, options) {
  const parts = [];

  parts.push('## Ad Curation & Clone Recommendation Request');

  // Product info
  if (container.my_product) {
    parts.push(`\n### Your Product`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
  }

  // Options
  if (options.platform) parts.push(`\n### Platform: ${options.platform}`);
  if (options.objective) parts.push(`### Campaign Objective: ${options.objective}`);
  if (options.target_audience) parts.push(`### Target Audience: ${options.target_audience}`);
  if (options.tone) parts.push(`### Tone/Style: ${options.tone}`);
  if (options.color_scheme) parts.push(`### Preferred Colors: ${options.color_scheme}`);
  if (options.custom_instructions) parts.push(`### Custom Instructions:\n${options.custom_instructions}`);

  const adCount = options.ad_count || 5;
  parts.push(`\n### Number of Ads to Curate: ${adCount}`);

  // Container Context (curated insights)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    parts.push('\n### Container Context (Curated Insights)');
    for (const item of contextData) {
      parts.push(`**[${item.source_type}] ${item.section_name}**`);
      parts.push(item.brief);
    }
  }

  // Gather competitor ads using shared utilities
  const competitorIds = (container.competitors || []).map(c => c.id);
  const allAdsForPrompt = [];

  for (const comp of (container.competitors || [])) {
    const ads = gatherCompetitorAds(container, comp.id, { limit: 15 });
    const fbAds = (ads.facebook || []).map(a => ({ ...a, platform: 'facebook' }));
    const gAds = (ads.google || []).map(a => ({ ...a, platform: 'google' }));
    const combined = [...fbAds, ...gAds];
    if (combined.length > 0) {
      parts.push(`\n### ${comp.name} — Scraped Ads (${combined.length} ads)`);
      parts.push(summarizeAds(combined, { maxAds: 15, textLimit: 400, ocrLimit: 200, includeLastShown: true }));
      allAdsForPrompt.push({ competitor: comp.name, count: combined.length });
    }
  }

  if (allAdsForPrompt.length === 0) {
    parts.push('\n### No scraped competitor ads found. Base recommendations on container context and product info only.');
  }

  // Competitor analyses (creative intel)
  const analyses = gatherCompetitorAnalyses(container, competitorIds);
  if (Object.keys(analyses).length > 0) {
    parts.push('\n### Competitor Analysis Intel');
    for (const [compId, analysis] of Object.entries(analyses)) {
      const comp = (container.competitors || []).find(c => c.id === compId);
      const compName = comp?.name || compId;
      if (analysis.creative_formats) {
        parts.push(`**${compName} Creative Formats:** dominant: ${analysis.creative_formats.dominant_format || 'unknown'}`);
        if (analysis.creative_formats.notable_creative_approaches) {
          analysis.creative_formats.notable_creative_approaches.slice(0, 3).forEach(a => parts.push(`  - ${a}`));
        }
      }
      if (analysis.key_themes) {
        const themes = Array.isArray(analysis.key_themes) ? analysis.key_themes.slice(0, 3).join(', ') : analysis.key_themes;
        parts.push(`**${compName} Key Themes:** ${themes}`);
      }
      if (analysis.messaging_patterns) {
        parts.push(`**${compName} Messaging:** ${JSON.stringify(analysis.messaging_patterns).substring(0, 300)}`);
      }
    }
  }

  // Proposal context
  const proposals = container.proposals || [];
  const latestProposal = [...proposals].reverse().find(p => p.status === 'completed');
  if (latestProposal?.result?.json_data) {
    const p = latestProposal.result.json_data;
    if (p.creative_briefs) {
      parts.push(`\n### Creative Brief Context (from Proposal)`);
      for (const brief of (p.creative_briefs || []).slice(0, 3)) {
        parts.push(`- Theme: ${brief.theme || brief.name || ''} | Tone: ${brief.tone || ''} | Key message: ${brief.key_message || ''}`);
      }
    }
  }

  // AI Model capabilities reference
  const selectedModels = options.image_models || ['nano_banana', 'dalle', 'midjourney'];
  const modelCapabilities = {
    nano_banana: { name: 'Nano Banana (Gemini Flash)', strengths: 'Cheapest, fast, good for simple product shots and clean layouts', weaknesses: 'Less artistic control, simpler compositions', best_for: 'Product-focused ads, clean backgrounds, e-commerce style' },
    dalle: { name: 'ChatGPT / DALL-E (GPT Image)', strengths: 'Best text rendering, photorealistic, follows complex instructions well', weaknesses: 'Slower, more expensive', best_for: 'Ads needing text overlay, lifestyle photography, detailed scenes' },
    midjourney: { name: 'Midjourney', strengths: 'Most artistic, stunning aesthetics, great mood/atmosphere', weaknesses: 'Text rendering poor, needs specific syntax', best_for: 'Brand imagery, aspirational lifestyle, artistic/premium feel' },
    stable_diffusion: { name: 'Stable Diffusion', strengths: 'Free/local, highly customizable with LoRAs, good for specific styles', weaknesses: 'Needs more prompt engineering, inconsistent quality', best_for: 'Iterating quickly, specific trained styles, batch generation' },
    ideogram: { name: 'Ideogram', strengths: 'Excellent text-in-image, good typography rendering', weaknesses: 'Limited artistic range compared to MJ', best_for: 'Ads with prominent text, logos, typographic designs' },
    flux: { name: 'Flux', strengths: 'Fast, good quality, natural language prompts', weaknesses: 'Less control over fine details', best_for: 'Quick iterations, general-purpose ad imagery' },
    nanogpt: { name: 'NanoGPT', strengths: 'Good quality-to-cost ratio, diverse outputs', weaknesses: 'Less predictable than top-tier models', best_for: 'Budget-friendly ad campaigns, testing variations' },
  };

  parts.push(`\n### Available AI Image Models for Cloning`);
  parts.push('When recommending a model, consider the ad\'s visual style and what model would best reproduce it:');
  for (const modelKey of selectedModels) {
    const cap = modelCapabilities[modelKey];
    if (cap) {
      parts.push(`- **${cap.name}**: ${cap.strengths}. Best for: ${cap.best_for}`);
    }
  }

  // Output schema
  parts.push(`\n## Output Format
Curate the top ${adCount} competitor ads worth cloning. Rank by cloning potential. Output JSON:

{
  "curation_summary": "2-3 sentence overview of what was found and the curation strategy",
  "curated_ads": [
    {
      "rank": 1,
      "source_competitor": "competitor name",
      "source_platform": "facebook|google",
      "source_ad_ref": "ad number or identifier from the scraped data (e.g. 'Ad 3')",
      "original_headline": "the original ad's headline",
      "original_ad_text": "the original ad's body text (truncated if long)",
      "original_cta": "the original CTA",
      "why_clone": "1-2 sentences explaining why this ad is worth cloning",
      "effectiveness_signals": ["long-running (X days)", "strong emotional hook", "clear value prop", "etc."],
      "adaptation_strategy": {
        "angle": "the creative angle to take for adaptation",
        "key_changes": ["change 1", "change 2", "change 3"],
        "adapted_headline": "new headline for user's product",
        "adapted_ad_text": "new ad text adapted for user's product",
        "adapted_cta": "new CTA"
      },
      "recommended_model": "model_key from available models",
      "model_reasoning": "why this model is best for this particular ad's visual style",
      "recommended_format": "1:1|9:16|16:9",
      "visual_direction": {
        "style": "photographic|illustrated|3d-render|flat-design|minimalist",
        "layout": "description of composition",
        "mood": "energetic|calm|luxurious|playful|professional|bold",
        "color_palette": ["#hex1", "#hex2", "#hex3"],
        "text_overlay": "what text to overlay on the image"
      },
      "ai_prompts": {
        "<recommended_model_key>": "detailed prompt optimized for that specific model"
      }
    }
  ],
  "ad_concepts": [
    {
      "concept_number": 1,
      "concept_name": "short creative name",
      "based_on_curated_ad": 1,
      "creative_angle": "problem-solution|aspirational|social-proof|urgency|educational|emotional",
      "copy": {
        "primary_text": "main ad body text",
        "headline": "headline",
        "description": "link description",
        "cta_button": "CTA text"
      },
      "visual_direction": {
        "layout": "layout description",
        "focal_point": "what draws the eye",
        "background": "background description",
        "text_overlay": "text on image",
        "color_palette": ["#hex1", "#hex2"],
        "style": "photographic|illustrated|etc",
        "mood": "mood description"
      },
      "ai_prompts": {
        ${selectedModels.map(m => `"${m}": "detailed prompt for ${m}"`).join(',\n        ')}
      },
      "psychology_hooks": ["psychological trigger used"],
      "a_b_test_suggestion": "what to test in a variant"
    }
  ],
  "model_recommendation_summary": {
    "best_for_this_campaign": "model_key",
    "reasoning": "why this model is the best overall pick for this campaign",
    "model_notes": {
      ${selectedModels.map(m => `"${m}": "brief note on how this model fits this specific campaign"`).join(',\n      ')}
    }
  },
  "creative_guidelines": {
    "brand_consistency": "notes on maintaining brand consistency",
    "do_nots": ["things to avoid"],
    "performance_tips": ["tips for maximizing performance"]
  }
}`);

  return parts.join('\n');
}

module.exports = { generateImageAds, run: generateImageAds, AGENT_META };
