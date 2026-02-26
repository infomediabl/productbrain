/**
 * Agent: Image Ad Creator
 * Route: routes/image-ads.js → POST /api/containers/:id/image-ads
 * Deps: config, storage, logger, parse-json, gather-data (gatherContainerContext), fs, path
 * Stores: storage.image_ads[]
 *
 * Generates image ad creatives with copy, visual direction, and AI-generated
 * images via Pollinations.ai. Produces multiple size variants (Feed, Story, Banner).
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');
const fs = require('fs');
const path = require('path');

const SRC = 'ImageAdAgent';

const AGENT_META = {
  code: 'ag0010',
  id: 'image-ads',
  name: 'Image Ad Creator',
  description: 'Ad copy, visual direction, and AI-generated images via Pollinations.ai.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Competitor ads for creative inspiration' },
    { agent: 'analyzer', dataKey: 'competitor_analyses', description: 'Creative format insights' },
    { agent: 'proposal', dataKey: 'proposals', description: 'Creative brief context' },
  ],
  outputs: { storageKey: 'image_ads', dataType: 'mixed', schema: 'ImageAd' },
  ui: { visible: true },
};

async function generateImageAds(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const ad = await storage.addImageAd(containerId);
  if (!ad) throw new Error('Failed to create image ad record');

  executeImageAds(containerId, ad.id, container, options).catch(async (err) => {
    log.error(SRC, 'Image ad generation crashed', { err: err.message });
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

    log.info(SRC, 'Sending image ad request to Claude', {
      containerId,
      adCount: options.ad_count || 3,
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 12000,
      system: `You are a senior creative director at a top advertising agency. You design high-converting image ads for digital platforms (Facebook, Instagram, Google Display).

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no extra text.
2. Each ad concept must include copy, visual direction, and AI image generation prompts.
3. Design for thumb-stopping scroll: bold visuals, clear value proposition, emotional hooks.
4. Follow platform best practices: minimal text overlay (Facebook 20% rule), strong contrast.
5. Generate prompts ONLY for the AI image tools the user has selected.
6. Consider ad psychology: social proof, urgency, FOMO, aspiration, problem-solution.
7. Each concept should have a distinct creative angle — don't repeat the same approach.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try { jsonData = parseJsonFromResponse(fullText); } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    // Generate actual images via Pollinations.ai for each concept
    if (jsonData && jsonData.ad_concepts) {
      log.info(SRC, 'Generating images via Pollinations.ai', { concepts: jsonData.ad_concepts.length });
      for (let i = 0; i < jsonData.ad_concepts.length; i++) {
        const concept = jsonData.ad_concepts[i];
        try {
          const imgPrompt = pickBestPrompt(concept);
          if (imgPrompt) {
            // Generate 1080x1080 feed image
            const feedImg = await generatePollinationsImage(imgPrompt, 1080, 1080);
            const feedFilename = `imgad_${adId}_${i}_feed.png`;
            const feedPath = path.join(__dirname, '..', 'screenshots', feedFilename);
            fs.writeFileSync(feedPath, feedImg);
            concept.generated_images = concept.generated_images || {};
            concept.generated_images.feed_1x1 = `/screenshots/${feedFilename}`;
            log.info(SRC, `Image generated for concept ${i + 1} (feed)`, { file: feedFilename });

            // Generate 1080x1920 story image
            const storyImg = await generatePollinationsImage(imgPrompt, 1080, 1920);
            const storyFilename = `imgad_${adId}_${i}_story.png`;
            const storyPath = path.join(__dirname, '..', 'screenshots', storyFilename);
            fs.writeFileSync(storyPath, storyImg);
            concept.generated_images.story_9x16 = `/screenshots/${storyFilename}`;
            log.info(SRC, `Image generated for concept ${i + 1} (story)`, { file: storyFilename });

            // Generate 1200x628 banner image
            const bannerImg = await generatePollinationsImage(imgPrompt, 1200, 628);
            const bannerFilename = `imgad_${adId}_${i}_banner.png`;
            const bannerPath = path.join(__dirname, '..', 'screenshots', bannerFilename);
            fs.writeFileSync(bannerPath, bannerImg);
            concept.generated_images.banner_16x9 = `/screenshots/${bannerFilename}`;
            log.info(SRC, `Image generated for concept ${i + 1} (banner)`, { file: bannerFilename });
          }
        } catch (imgErr) {
          log.warn(SRC, `Image generation failed for concept ${i + 1}`, { err: imgErr.message });
          concept.generated_images = concept.generated_images || {};
          concept.generated_images.error = imgErr.message;
        }
      }
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      generated_at: new Date().toISOString(),
      options_used: options,
    };

    await storage.updateImageAd(containerId, adId, 'completed', result);
    log.info(SRC, 'Image ads generated', { adId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateImageAd(containerId, adId, 'failed', { error: err.message });
  }
}

/**
 * Pick the best prompt from a concept's ai_prompts for image generation.
 * Prefers: flux > dalle > nano_banana > stable_diffusion > midjourney > any other
 */
function pickBestPrompt(concept) {
  const prompts = concept.ai_prompts || concept.ai_image_prompts || {};
  // Prefer prompts that work well with Pollinations (which uses FLUX)
  const priority = ['flux', 'dalle', 'nano_banana', 'stable_diffusion', 'nanogpt', 'ideogram', 'midjourney'];
  for (const key of priority) {
    if (prompts[key] && typeof prompts[key] === 'string') return prompts[key];
  }
  // Fallback: use any available prompt
  for (const val of Object.values(prompts)) {
    if (typeof val === 'string' && val.length > 10) return val;
  }
  // Last resort: use visual direction
  if (concept.visual_direction) {
    const vd = concept.visual_direction;
    return `${vd.style || 'photographic'} ad, ${vd.layout || ''}, ${vd.focal_point || ''}, ${vd.background || ''}, ${vd.mood || ''} mood`;
  }
  return null;
}

/**
 * Generate an image using Pollinations.ai (free, no API key)
 * Uses FLUX model. Rate limit: ~1 req/15s for anonymous.
 */
async function generatePollinationsImage(prompt, width = 1024, height = 1024) {
  const encodedPrompt = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    model: 'flux',
    width: width.toString(),
    height: height.toString(),
    nologo: 'true',
    enhance: 'true',
  });

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params}`;

  // Throttle: wait 16 seconds between requests to respect rate limit
  await delay(16000);

  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error('Image too small — generation may have failed');
  }
  return buffer;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPrompt(container, options) {
  const parts = [];

  parts.push('## Image Ad Creation Request');

  if (container.my_product) {
    parts.push(`\n### Product`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
  }

  if (options.platform) parts.push(`\n### Platform: ${options.platform}`);
  if (options.objective) parts.push(`### Campaign Objective: ${options.objective}`);
  if (options.target_audience) parts.push(`### Target Audience: ${options.target_audience}`);
  if (options.tone) parts.push(`### Tone/Style: ${options.tone}`);
  if (options.color_scheme) parts.push(`### Preferred Colors: ${options.color_scheme}`);
  if (options.custom_instructions) parts.push(`### Custom Instructions:\n${options.custom_instructions}`);

  const adCount = options.ad_count || 3;
  parts.push(`\n### Number of Ad Concepts: ${adCount}`);

  // Container Context (curated insights)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    parts.push('\n### Container Context (Curated Insights)');
    for (const item of contextData) {
      parts.push(`**[${item.source_type}] ${item.section_name}**`);
      parts.push(item.brief);
    }
  }

  // Gather competitor ad patterns for inspiration
  const competitorAds = [];
  const scrapes = (container.scrape_results || []).filter(s => s.status === 'completed');
  for (const scrape of scrapes.slice(-2)) {
    for (const [compId, compData] of Object.entries(scrape.scraped_data?.competitors || {})) {
      const comp = container.competitors.find(c => c.id === compId);
      for (const ad of [...(compData.facebook || []), ...(compData.google || [])].slice(0, 4)) {
        competitorAds.push({
          competitor: comp?.name || 'Unknown',
          headline: ad.headline,
          text: ad.ad_text?.substring(0, 150),
          cta: ad.cta_text,
          media_type: ad.media_type,
          ocr_text: ad.ocr_text?.substring(0, 100),
        });
      }
    }
  }

  if (competitorAds.length > 0) {
    parts.push(`\n### Competitor Ad Examples (for differentiation)`);
    for (const ca of competitorAds.slice(0, 10)) {
      parts.push(`- [${ca.competitor}] "${ca.headline || ''}" | ${ca.media_type || 'image'} | CTA: "${ca.cta || ''}"${ca.ocr_text ? ` | Image text: "${ca.ocr_text}"` : ''}`);
    }
  }

  // Get latest proposal for messaging context
  const proposals = container.proposals || [];
  const latestProposal = [...proposals].reverse().find(p => p.status === 'completed');
  if (latestProposal?.result?.json_data) {
    const p = latestProposal.result.json_data;
    if (p.creative_briefs) {
      parts.push(`\n### Creative Brief Context`);
      for (const brief of (p.creative_briefs || []).slice(0, 3)) {
        parts.push(`- Theme: ${brief.theme || brief.name || ''} | Tone: ${brief.tone || ''} | Key message: ${brief.key_message || ''}`);
      }
    }
  }

  // Get competitor analysis insights
  for (const comp of container.competitors.slice(0, 3)) {
    const analyses = (container.competitor_analyses || {})[comp.id] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    if (latest?.result?.json_data?.creative_formats) {
      parts.push(`\n### ${comp.name} Creative Intel`);
      const cf = latest.result.json_data.creative_formats;
      parts.push(`Dominant format: ${cf.dominant_format}`);
      if (cf.notable_creative_approaches) {
        cf.notable_creative_approaches.slice(0, 3).forEach(a => parts.push(`- ${a}`));
      }
    }
  }

  // Build dynamic ai_prompts schema based on selected models
  const selectedModels = options.image_models || ['midjourney', 'dalle', 'nano_banana'];
  const modelPromptDescriptions = {
    midjourney: '"midjourney": "detailed Midjourney prompt with --ar, --style, --v parameters"',
    dalle: '"dalle": "detailed DALL-E/ChatGPT image generation prompt"',
    nano_banana: '"nano_banana": "direct descriptive prompt optimized for Nano Banana image generator"',
    nanogpt: '"nanogpt": "detailed prompt for NanoGPT image generation, descriptive and specific"',
    stable_diffusion: '"stable_diffusion": "Stable Diffusion prompt with quality tags, negative prompt hints"',
    ideogram: '"ideogram": "Ideogram prompt optimized for text-in-image rendering"',
    flux: '"flux": "Flux/FLUX.1 prompt, natural language, detailed scene description"',
  };

  const aiPromptsBlock = selectedModels
    .map(m => modelPromptDescriptions[m] || `"${m}": "detailed prompt for ${m}"`)
    .join(',\n        ');

  parts.push(`\n### Selected AI Image Tools: ${selectedModels.join(', ')}
Generate prompts ONLY for these tools. Tailor each prompt to the specific tool's strengths and syntax.`);

  parts.push(`\n## Output Format
Generate ${adCount} distinct ad concepts. Output JSON:

{
  "campaign_theme": "overarching theme for this ad set",
  "target_platforms": ["Facebook Feed", "Instagram Feed", "Instagram Stories", "Google Display"],
  "ad_concepts": [
    {
      "concept_number": 1,
      "concept_name": "short creative name",
      "creative_angle": "problem-solution|aspirational|social-proof|urgency|educational|emotional",
      "copy": {
        "primary_text": "main ad body text (125 chars for FB, compelling hook)",
        "headline": "bold headline (40 chars max)",
        "description": "link description (30 chars)",
        "cta_button": "Shop Now|Learn More|Sign Up|Get Started|etc."
      },
      "visual_direction": {
        "layout": "description of the layout composition",
        "focal_point": "what draws the eye first",
        "background": "background description",
        "text_overlay": "what text appears on the image itself (keep minimal)",
        "color_palette": ["#hex1", "#hex2", "#hex3"],
        "style": "photographic|illustrated|3d-render|flat-design|collage|minimalist",
        "mood": "energetic|calm|luxurious|playful|professional|bold"
      },
      "size_variants": {
        "feed_1x1": "1080x1080 specific notes",
        "story_9x16": "1080x1920 specific notes",
        "banner_16x9": "1200x628 specific notes"
      },
      "ai_prompts": {
        ${aiPromptsBlock}
      },
      "psychology_hooks": ["what psychological triggers this ad uses"],
      "a_b_test_suggestion": "what element to test in a variant"
    }
  ],
  "creative_guidelines": {
    "brand_consistency": "notes on maintaining brand consistency across concepts",
    "do_nots": ["things to avoid in these ads"],
    "performance_tips": ["tips for maximizing ad performance"]
  }
}`);

  return parts.join('\n');
}

module.exports = { generateImageAds, run: generateImageAds, AGENT_META };
