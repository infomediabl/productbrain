/**
 * Agent: Project Overview (AG-023)
 * Route: routes/project-overview.js → POST /api/containers/:id/project-overview
 * Deps: config, storage, logger, parse-json, gather-data
 * Stores: storage.project_overview (single object)
 *
 * Generates a 5-10 sentence AI overview of the project using product info,
 * competitors, context items, and notes.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');
const Anthropic = require('@anthropic-ai/sdk');

const SRC = 'ProjectOverviewAgent';

const AGENT_META = {
  id: 'project-overview',
  name: 'Project Overview',
  code: 'ag0023',
  description: 'Generates a concise AI-powered project overview for the dashboard',
  category: 'generation',
  model: 'AI_MODEL_FAST',
  inputs: [{ name: 'containerId', type: 'string', required: true, from: null }],
  consumes: [
    { agent: 'container-context', dataKey: 'container_context', description: 'Curated context items' },
  ],
  outputs: { storageKey: 'project_overview', dataType: 'json', schema: 'ProjectOverview' },
  ui: { visible: true },
  prompt_summary: 'Uses product info, competitors, notes, and context to write a 5-10 sentence project overview.',
  prompt_template: `SYSTEM: You summarize a marketing project in 5-10 sentences.

USER:
Write a concise project overview (5-10 sentences) for this marketing project.

## Product
Name: [name]
Website: [website]
Description: [description]

## Competitors ([count])
[list of competitor names + websites]

## Notes ([count])
[note titles + snippets]

## Context Items ([count])
[text briefs]

Write a clear, informative overview that covers: what the product is, who it competes with, what data has been collected, and the current state of analysis. Be specific, not generic.

Return JSON: { "text": "..." }`,
};

async function generateOverview(containerId) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const record = await storage.setProjectOverview(containerId);
  if (!record) throw new Error('Failed to create overview record');

  // Fire and forget
  (async () => {
    try {
      const product = container.my_product;
      const competitors = container.competitors || [];
      const metadata = container.metadata || [];
      const contextItems = gatherContainerContext(container);

      let productSection = 'No product defined yet.';
      if (product) {
        productSection = `Name: ${product.name || 'N/A'}\nWebsite: ${product.website || 'N/A'}`;
        if (product.description) productSection += `\nDescription: ${product.description}`;
      }

      const compSection = competitors.length > 0
        ? competitors.map(c => `- ${c.name}${c.website ? ` (${c.website})` : ''}`).join('\n')
        : 'No competitors added yet.';

      const notesSection = metadata.length > 0
        ? metadata.slice(0, 10).map(m => `- ${m.title || m.type}: ${(m.content || '').slice(0, 100)}`).join('\n')
        : 'No notes yet.';

      const contextSection = contextItems.length > 0
        ? contextItems.slice(0, 15).map(c => `- [${c.source_type}] ${(c.text_brief || '').slice(0, 150)}`).join('\n')
        : 'No context items pushed yet.';

      // Count data
      const scrapeCount = (container.scrape_results || []).filter(s => s.status === 'completed').length;
      const analysisCount = Object.values(container.competitor_analyses || {}).flat().filter(a => a.status === 'completed').length;
      const proposalCount = (container.proposals || []).filter(p => p.status === 'completed').length;

      const prompt = `Write a concise project overview (5-10 sentences) for this marketing project.

## Product
${productSection}

## Competitors (${competitors.length})
${compSection}

## Notes (${metadata.length})
${notesSection}

## Context Items (${contextItems.length})
${contextSection}

## Data Summary
- ${scrapeCount} completed scrapes
- ${analysisCount} completed competitor analyses
- ${proposalCount} completed proposals
- ${(container.keyword_strategies || []).filter(k => k.status === 'completed').length} keyword strategies
- ${(container.seo_analyses ? Object.values(container.seo_analyses).flat() : []).filter(s => s.status === 'completed').length} SEO analyses

Write a clear, informative overview that covers: what the product is, who it competes with, what data has been collected so far, and the current state of analysis. Be specific and reference actual names and numbers. Do NOT give generic advice.

Return JSON: { "text": "..." }`;

      const client = new Anthropic();
      const message = await client.messages.create({
        model: config.AI_MODEL_FAST,
        max_tokens: 1024,
        system: 'You summarize marketing projects concisely. Always respond with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = message.content[0].text;
      const parsed = parseJsonFromResponse(raw);

      if (parsed && parsed.text) {
        await storage.updateProjectOverview(containerId, record.id, 'completed', { text: parsed.text, prompt_sent: prompt });
        log.info(SRC, 'Overview generated', { containerId });
      } else {
        await storage.updateProjectOverview(containerId, record.id, 'completed', { text: raw.slice(0, 2000), prompt_sent: prompt });
      }
    } catch (err) {
      log.error(SRC, 'Overview generation failed', { containerId, err: err.message });
      await storage.updateProjectOverview(containerId, record.id, 'failed', { error: err.message });
    }
  })();

  return record;
}

module.exports = { generateOverview, AGENT_META };
