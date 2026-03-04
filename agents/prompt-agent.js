/**
 * Agent: Prompt Generator
 * Route: routes/prompts.js → POST /api/containers/:id/generate-prompts
 * Deps: config, storage, logger, parse-json
 * Stores: storage.generated_prompts[]
 *
 * Generates detailed ad prompts from a completed proposal's creative briefs.
 * Produces ready-to-use prompts for AI image tools (Midjourney, DALL-E, etc.).
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');

const SRC = 'PromptAgent';

const AGENT_META = {
  code: 'ag0006',
  id: 'prompt-generator',
  name: 'Prompt Generator',
  description: 'Generates AI image prompts from completed proposals.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'proposalId', type: 'string', required: true, from: 'proposal' },
  ],
  consumes: [
    { agent: 'proposal', dataKey: 'proposals', description: 'Completed proposal with creative briefs' },
  ],
  outputs: { storageKey: 'generated_prompts', dataType: 'json', schema: 'GeneratedPrompts' },
  ui: { visible: false },
  prompt_summary: 'Converts creative briefs into AI image prompts for Nano Banana, ChatGPT/DALL-E, and Midjourney with scene composition, lighting, style, and copy overlays.',
};

/**
 * Generate detailed prompts from a proposal's creative briefs.
 */
async function generatePrompts(containerId, proposalId) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const proposal = (container.proposals || []).find(p => p.id === proposalId);
  if (!proposal || proposal.status !== 'completed') {
    throw new Error('Proposal not found or not completed');
  }

  const jsonData = proposal.result?.json_data;
  if (!jsonData || !jsonData.creative_briefs || jsonData.creative_briefs.length === 0) {
    throw new Error('Proposal has no creative briefs to generate prompts from');
  }

  const promptRecord = await storage.addGeneratedPrompt(containerId, proposalId);
  if (!promptRecord) throw new Error('Failed to create prompt record');

  // Run async
  executePromptGeneration(containerId, promptRecord.id, proposal, jsonData).catch(async (err) => {
    log.error(SRC, 'Prompt generation crashed', { err: err.message });
    try {
      await storage.updateGeneratedPrompt(containerId, promptRecord.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return promptRecord;
}

async function executePromptGeneration(containerId, promptRecordId, proposal, jsonData) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildPromptGenerationPrompt(jsonData, proposal.result?.user_context || '');
    log.info(SRC, 'Sending prompt generation request to Claude', {
      briefCount: jsonData.creative_briefs.length,
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 12288,
      system: `${config.APP_CONTEXT}

You are an expert AI image prompt engineer. You take creative briefs for ads and generate highly detailed, production-ready prompts for AI image generation tools.

Each prompt you generate must be IMMEDIATELY usable in tools like:
- Nano Banana (direct descriptive prompts)
- ChatGPT/DALL-E (descriptive prompts with style guidance)
- Midjourney (structured with parameters)

CRITICAL RULES:
1. Output ONLY valid JSON.
2. Each brief gets 3 prompt variants: nano_banana, chatgpt, midjourney.
3. Prompts must be HIGHLY SPECIFIC — no vague descriptions.
4. Include: scene composition, camera angle, lighting, color palette, style, text overlays, mood, aspect ratio, background details.
5. For ad copy overlays, specify EXACT text, font style, placement, and size.
6. Consider the ad format (feed, story, reel, banner) for proper aspect ratio.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonResult = null;

    try {
      jsonResult = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed for prompt generation', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonResult,
      brief_count: jsonData.creative_briefs.length,
      generated_at: new Date().toISOString(),
    };

    await storage.updateGeneratedPrompt(containerId, promptRecordId, 'completed', result);
    log.info(SRC, 'Prompt generation completed', { promptRecordId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateGeneratedPrompt(containerId, promptRecordId, 'failed', { error: err.message });
  }
}

function buildPromptGenerationPrompt(jsonData, userContext) {
  const parts = [];

  if (userContext) {
    parts.push(`## Product Context`);
    parts.push(userContext);
  }

  parts.push(`\n## Creative Briefs to Generate Prompts For`);
  for (const brief of jsonData.creative_briefs) {
    parts.push(`\n### Brief ${brief.number}: ${brief.title}`);
    parts.push(`Source Type: ${brief.source_type}`);
    parts.push(`Ad Format: ${brief.ad_format || 'Not specified'}`);
    if (brief.adapted_version) {
      const av = brief.adapted_version;
      if (av.headline) parts.push(`Headline: ${av.headline}`);
      if (av.ad_text) parts.push(`Ad Text: ${av.ad_text}`);
      if (av.cta) parts.push(`CTA: ${av.cta}`);
      if (av.platform) parts.push(`Platform: ${av.platform}`);
    }
    if (brief.image_prompt) {
      parts.push(`Base Image Prompt (from proposal): ${brief.image_prompt}`);
    }
    if (brief.why_this_ad) {
      parts.push(`Strategy: ${brief.why_this_ad}`);
    }
    if (brief.target_demographics) {
      const td = brief.target_demographics;
      parts.push(`Target: ${td.age_groups || ''} | ${td.gender || ''} | ${td.top_countries || ''}`);
    }
  }

  parts.push(`\n## Task
Generate detailed image prompts for each creative brief. Output a JSON array where each item corresponds to one brief:

{
  "prompts": [
    {
      "brief_number": 1,
      "brief_title": "Title from brief",
      "aspect_ratio": "1:1 / 9:16 / 16:9",
      "nano_banana": {
        "prompt": "Complete prompt for Nano Banana. Be extremely specific about: scene composition, lighting (natural/studio/dramatic), color palette (hex codes if possible), visual style (photorealistic/3D render/flat illustration/watercolor), camera angle (eye-level/overhead/low-angle), background (detailed description), foreground elements, text overlay content with EXACT text from the adapted headline, text placement (top-center/bottom-left/etc), text style (bold sans-serif/script/etc), mood/emotion, any people (gender, age range, expression, clothing, pose). Minimum 5 sentences."
      },
      "chatgpt": {
        "prompt": "Complete prompt for ChatGPT/DALL-E. Same level of detail as nano_banana but formatted for ChatGPT. Prefix with 'Generate an image:' and include style guidance."
      },
      "midjourney": {
        "prompt": "Structured Midjourney prompt. Include the scene description followed by parameters like --ar 1:1 --style raw --v 6.1 --q 2. Use Midjourney-specific syntax."
      },
      "copy_overlay": {
        "headline": "Exact headline text to overlay",
        "subtext": "Exact subtext/body",
        "cta_text": "Exact CTA button text",
        "placement_guide": "Where to place each text element"
      }
    }
  ]
}

Rules:
- Every prompt must be at least 5 sentences with extreme visual specificity
- Include the ad headline/CTA as text overlay instructions
- Match aspect ratio to the ad format (feed=1:1, story/reel=9:16, banner=16:9)
- Consider the target demographics when describing people in the image
- If the original brief was for a video ad, describe a key frame`);

  return parts.join('\n');
}

module.exports = { generatePrompts, run: generatePrompts, AGENT_META };
