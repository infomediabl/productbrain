/**
 * Agent: Hooks Generator (AG-020)
 * Route: routes/hooks.js → POST /api/containers/:id/hooks
 * Deps: config, storage, logger, parse-json, gather-data
 * Stores: storage.hooks_results[]
 *
 * Analyzes scraped ads + container context to generate hooks/angles for ad creation.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');

const SRC = 'HooksAgent';

const AGENT_META = {
  id: 'hooks',
  name: 'Hooks Generator',
  code: 'ag0020',
  description: 'Generates advertising hooks and angles from scraped ad data',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [{ name: 'containerId', type: 'string', required: true, from: null }],
  consumes: [
    { agent: 'scraper', key: 'scrape_results' },
    { agent: 'analyzer', key: 'competitor_analyses' },
  ],
  outputs: { storageKey: 'hooks_results', dataType: 'json', schema: 'HooksResult' },
  ui: { visible: true },
  prompt_summary: 'Analyzes scraped ads + context to generate hooks/angles. Output: hooks with angle name, hook text, emotion, target segment, visual suggestions.',
};

async function generateHooks(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const hookRecord = storage.addHooksResult(containerId);
  if (!hookRecord) throw new Error('Failed to create hooks record');

  // Fire and forget
  (async () => {
    try {
      // Gather context data
      const contextItems = gatherContainerContext(container);

      // Collect all ads across scrapes
      const allAds = [];
      for (const scrape of (container.scrape_results || [])) {
        if (scrape.status !== 'completed' || !scrape.scraped_data) continue;
        const sd = scrape.scraped_data;

        // My product ads
        for (const source of ['facebook', 'google']) {
          for (const ad of (sd.my_product?.[source] || [])) {
            allAds.push({ ...ad, competitor_name: container.my_product?.name || 'My Product', source });
          }
        }

        // Competitor ads
        for (const [compId, compData] of Object.entries(sd.competitors || {})) {
          const comp = container.competitors?.find(c => c.id === compId || c.name === compId);
          const compName = comp?.name || compId;
          for (const source of ['facebook', 'google']) {
            for (const ad of (compData[source] || [])) {
              allAds.push({ ...ad, competitor_name: compName, source });
            }
          }
        }
      }

      if (allAds.length === 0) {
        storage.updateHooksResult(containerId, hookRecord.id, 'failed', { error: 'No scraped ads found. Run a scrape first.' });
        return;
      }

      // Summarize ads for prompt (max 30 ads)
      const adSummaries = allAds.slice(0, 30).map((ad, i) => {
        const parts = [`Ad #${i + 1} (${ad.competitor_name}, ${ad.source})`];
        if (ad.headline) parts.push(`  Headline: ${ad.headline}`);
        if (ad.ad_text) parts.push(`  Text: ${ad.ad_text.substring(0, 200)}`);
        if (ad.cta_text) parts.push(`  CTA: ${ad.cta_text}`);
        return parts.join('\n');
      }).join('\n\n');

      // Product info
      const productInfo = container.my_product
        ? `Product: ${container.my_product.name || 'Unknown'}\nWebsite: ${container.my_product.website || 'N/A'}\nDescription: ${container.my_product.description || 'N/A'}`
        : 'No product info available.';

      // Context briefs
      const contextBrief = contextItems.length > 0
        ? contextItems.map(c => c.text_brief).join('\n\n')
        : '';

      const prompt = `You are an expert advertising strategist. Analyze these scraped competitor ads and generate creative hooks/angles for new ad creation.

## Product Info
${productInfo}

${contextBrief ? `## Context\n${contextBrief}\n` : ''}

## Scraped Ads (${allAds.length} total, showing ${Math.min(allAds.length, 30)})
${adSummaries}

## Task
Generate 8-12 advertising hooks/angles based on patterns in the competitor ads, adapted for our product. Each hook should be a fresh angle that could work as an ad headline or opening line.

Return JSON:
{
  "hooks": [
    {
      "id": 1,
      "angle_name": "Short name for this angle (e.g. 'Social Proof', 'Fear of Missing Out')",
      "hook_text": "The actual hook/headline text, ready to use in an ad",
      "emotion": "Primary emotion targeted (curiosity, fear, desire, urgency, trust, etc.)",
      "angle_type": "Type: social_proof | scarcity | curiosity | transformation | pain_point | authority | comparison | storytelling",
      "target_segment": "Who this hook appeals to most",
      "inspired_by": "Which competitor ad(s) inspired this (by number)",
      "rationale": "Why this hook works — 1-2 sentences",
      "adapted_for_product": "How this is specifically adapted for our product",
      "suggested_visuals": "Brief visual direction for an ad using this hook"
    }
  ],
  "angle_summary": "2-3 sentence overview of the dominant patterns found and the creative strategy"
}`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.AI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API error: ${response.status} ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const parsed = parseJsonFromResponse(rawContent);

      if (!parsed || !parsed.hooks) {
        throw new Error('Failed to parse hooks from AI response');
      }

      // Attach metadata about what was used as input
      parsed._meta = {
        total_ads_scanned: allAds.length,
        ads_in_prompt: Math.min(allAds.length, 30),
        context_items_used: contextItems.length,
        uses_container_context: contextItems.length > 0,
        product_name: container.my_product?.name || null,
        model_used: config.AI_MODEL,
        prompt_sent: prompt,
      };

      storage.updateHooksResult(containerId, hookRecord.id, 'completed', parsed);
      log.info(SRC, `Generated ${parsed.hooks.length} hooks`, { containerId });
    } catch (err) {
      log.error(SRC, 'Hook generation failed', { err: err.message, containerId });
      storage.updateHooksResult(containerId, hookRecord.id, 'failed', { error: err.message });
    }
  })();

  return hookRecord;
}

module.exports = { generateHooks, AGENT_META };
