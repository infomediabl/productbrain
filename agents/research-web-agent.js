/**
 * Agent: ResearchWeb
 * Route: routes/research-web.js → POST /api/research-web/search
 * Deps: config, storage, logger, parse-json, scrapers/browser
 * Stores: data/web-research.json (global, not per-container)
 *
 * Phase 1: searchWeb() — Uses Claude with web_search tool to find sources on a topic.
 * Phase 2: summarizeSources() — Fetches page content via Puppeteer, summarizes with Claude.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');

const SRC = 'ResearchWebAgent';

const AGENT_META = {
  code: 'ag0017',
  id: 'research-web',
  name: 'ResearchWeb',
  description: 'Web research tool — search any topic, curate sources, summarize, push to context.',
  category: 'research',
  model: 'AI_MODEL',
  inputs: [
    { name: 'topic', type: 'string', required: true, from: null },
  ],
  consumes: [],
  outputs: { storageKey: 'web-research.json', dataType: 'json', schema: 'ResearchWeb' },
  ui: { visible: true },
  prompt_summary: 'Phase 1: Searches the web for 8-15 diverse sources on a topic. Phase 2: Summarizes each source with key insights. Phase 3: Synthesizes a combined brief.',
  prompt_template: `PHASE 1 — SEARCH:
SYSTEM:
You are a web research assistant. When given a topic, use the web search tool to find the most relevant, high-quality sources. Search multiple angles to get comprehensive coverage.

After searching, respond with ONLY a JSON object (no markdown fences) in this exact format:
{
  "sources": [
    {
      "id": "s1",
      "url": "https://...",
      "title": "Page Title",
      "type": "article",
      "snippet": "Brief description of what this page covers",
      "relevance_note": "Why this source matters for the topic"
    }
  ],
  "search_summary": "1-2 sentence overview of what was found"
}
Source types: "article", "video", "pdf", "social", "other"
Find 8-15 diverse, high-quality sources. Prefer recent content. Include a mix of source types when available.

USER: Research this topic thoroughly: [topic]

---

PHASE 2 — SUMMARIZE (per source):
SYSTEM:
You are a research assistant. Summarize the given web page content in relation to a specific research topic. Respond with ONLY a JSON object (no markdown fences):
{
  "summary": "3-5 sentence summary of the page content",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "relevance_to_topic": "How this content relates to the research topic"
}

USER: Research topic: [topic]
Source: [title] ([url])
Page content: [fetched page text, truncated to 15k chars]

---

PHASE 3 — COMBINED BRIEF:
SYSTEM: You are a research assistant. Synthesize multiple source summaries into a concise combined brief (3-5 sentences). Focus on the most important findings and actionable insights.

USER: Topic: [topic]
Source summaries: [list of title: summary pairs]
Write a concise synthesis of these findings:`,
};

// ========== Phase 1: Search ==========

async function searchWeb(topic) {
  const record = await storage.addResearchWeb(topic);
  if (!record) throw new Error('Failed to create research record');

  executeSearch(record.id, topic).catch(async (err) => {
    log.error(SRC, 'Search crashed', { err: err.message });
    try {
      await storage.updateResearchWeb(record.id, 'failed', { error: err.message });
    } catch (e) { /* ignore */ }
  });

  return record;
}

async function executeSearch(recordId, topic) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    log.info(SRC, 'Starting web search', { recordId, topic });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 8192,
      betas: ['web-search-2025-03-05'],
      tools: [{ type: 'web_search_20250305' }],
      system: `${config.APP_CONTEXT}

You are a web research assistant. When given a topic, use the web search tool to find the most relevant, high-quality sources. Search multiple angles to get comprehensive coverage.

After searching, respond with ONLY a JSON object (no markdown fences) in this exact format:
{
  "sources": [
    {
      "id": "s1",
      "url": "https://...",
      "title": "Page Title",
      "type": "article",
      "snippet": "Brief description of what this page covers",
      "relevance_note": "Why this source matters for the topic"
    }
  ],
  "search_summary": "1-2 sentence overview of what was found"
}

Source types: "article", "video", "pdf", "social", "other"
Find 8-15 diverse, high-quality sources. Prefer recent content. Include a mix of source types when available.`,
      messages: [{ role: 'user', content: `Research this topic thoroughly: ${topic}` }],
    });

    // Extract text blocks from the response (skip tool_use blocks)
    const fullText = message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    let parsed = null;
    try {
      parsed = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'Failed to parse search JSON', { err: e.message });
    }

    if (!parsed || !parsed.sources) {
      await storage.updateResearchWeb(recordId, 'failed', {
        error: 'Failed to parse search results',
        raw_text: fullText,
      });
      return;
    }

    // Ensure each source has an id
    parsed.sources.forEach((s, i) => {
      if (!s.id) s.id = `s${i + 1}`;
    });

    const result = {
      sources: parsed.sources,
      search_summary: parsed.search_summary || '',
      searched_at: new Date().toISOString(),
      summaries: [],
      combined_brief: null,
      summarized_at: null,
    };

    await storage.updateResearchWeb(recordId, 'completed', result);
    log.info(SRC, 'Search completed', { recordId, sourceCount: result.sources.length });
  } catch (err) {
    log.error(SRC, 'Search failed', { recordId, err: err.message });
    await storage.updateResearchWeb(recordId, 'failed', { error: err.message });
  }
}

// ========== Phase 2: Summarize ==========

async function summarizeSources(researchId, sourceIds) {
  const record = storage.getResearchWeb(researchId);
  if (!record) throw new Error('Research record not found');
  if (!record.result?.sources?.length) throw new Error('No sources to summarize');

  const selectedSources = record.result.sources.filter(s => sourceIds.includes(s.id));
  if (selectedSources.length === 0) throw new Error('No matching sources found');

  await storage.updateResearchWeb(researchId, 'summarizing', record.result);

  executeSummarize(researchId, selectedSources, record.topic).catch(async (err) => {
    log.error(SRC, 'Summarize crashed', { err: err.message });
    try {
      const current = storage.getResearchWeb(researchId);
      await storage.updateResearchWeb(researchId, 'failed', current?.result || { error: err.message });
    } catch (e) { /* ignore */ }
  });

  return { research_id: researchId, status: 'summarizing' };
}

async function executeSummarize(researchId, sources, topic) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    log.info(SRC, 'Starting summarization', { researchId, sourceCount: sources.length });

    for (const source of sources) {
      try {
        // Fetch page content
        const pageText = await fetchPageText(source.url);

        if (!pageText || pageText.length < 50) {
          log.warn(SRC, 'Skipping source — insufficient content', { url: source.url });
          // Save a minimal summary
          const summary = {
            source_id: source.id,
            url: source.url,
            title: source.title,
            summary: 'Could not fetch page content for summarization.',
            key_insights: [],
            relevance_to_topic: source.relevance_note || '',
          };
          await saveIncrementalSummary(researchId, summary);
          continue;
        }

        // Truncate to ~15k chars to stay within token limits
        const truncated = pageText.length > 15000 ? pageText.substring(0, 15000) + '\n[...content truncated]' : pageText;

        const message = await client.messages.create({
          model: config.AI_MODEL_FAST,
          max_tokens: 2048,
          system: `You are a research assistant. Summarize the given web page content in relation to a specific research topic. Respond with ONLY a JSON object (no markdown fences):
{
  "summary": "3-5 sentence summary of the page content",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "relevance_to_topic": "How this content relates to the research topic"
}`,
          messages: [{
            role: 'user',
            content: `Research topic: ${topic}\n\nSource: ${source.title} (${source.url})\n\nPage content:\n${truncated}`,
          }],
        });

        const text = message.content.map(c => c.text || '').join('\n');
        let parsed = null;
        try {
          parsed = parseJsonFromResponse(text);
        } catch (e) {
          log.warn(SRC, 'Failed to parse summary JSON', { url: source.url });
        }

        const summary = {
          source_id: source.id,
          url: source.url,
          title: source.title,
          summary: parsed?.summary || text.substring(0, 500),
          key_insights: parsed?.key_insights || [],
          relevance_to_topic: parsed?.relevance_to_topic || source.relevance_note || '',
        };

        await saveIncrementalSummary(researchId, summary);
        log.info(SRC, 'Source summarized', { url: source.url });
      } catch (err) {
        log.error(SRC, 'Failed to summarize source', { url: source.url, err: err.message });
        const summary = {
          source_id: source.id,
          url: source.url,
          title: source.title,
          summary: `Error: ${err.message}`,
          key_insights: [],
          relevance_to_topic: source.relevance_note || '',
        };
        await saveIncrementalSummary(researchId, summary);
      }
    }

    // Generate combined brief
    const current = storage.getResearchWeb(researchId);
    if (current?.result?.summaries?.length > 0) {
      const combinedBrief = await generateCombinedBrief(client, topic, current.result.summaries);
      current.result.combined_brief = combinedBrief;
      current.result.summarized_at = new Date().toISOString();
      await storage.updateResearchWeb(researchId, 'completed', current.result);
    } else {
      await storage.updateResearchWeb(researchId, 'completed', current?.result);
    }

    log.info(SRC, 'Summarization completed', { researchId });
  } catch (err) {
    log.error(SRC, 'Summarization failed', { researchId, err: err.message });
    const current = storage.getResearchWeb(researchId);
    await storage.updateResearchWeb(researchId, 'failed', current?.result || { error: err.message });
  }
}

async function saveIncrementalSummary(researchId, summary) {
  const current = storage.getResearchWeb(researchId);
  if (!current?.result) return;

  // Avoid duplicates
  const existing = current.result.summaries || [];
  const idx = existing.findIndex(s => s.source_id === summary.source_id);
  if (idx >= 0) {
    existing[idx] = summary;
  } else {
    existing.push(summary);
  }
  current.result.summaries = existing;
  await storage.updateResearchWeb(researchId, 'summarizing', current.result);
}

async function generateCombinedBrief(client, topic, summaries) {
  try {
    const summaryText = summaries
      .filter(s => s.summary && !s.summary.startsWith('Error:') && !s.summary.startsWith('Could not fetch'))
      .map(s => `- ${s.title}: ${s.summary}`)
      .join('\n');

    if (!summaryText) return null;

    const message = await client.messages.create({
      model: config.AI_MODEL_FAST,
      max_tokens: 1024,
      system: 'You are a research assistant. Synthesize multiple source summaries into a concise combined brief (3-5 sentences). Focus on the most important findings and actionable insights.',
      messages: [{
        role: 'user',
        content: `Topic: ${topic}\n\nSource summaries:\n${summaryText}\n\nWrite a concise synthesis of these findings:`,
      }],
    });

    return message.content.map(c => c.text || '').join('\n').trim();
  } catch (err) {
    log.error(SRC, 'Failed to generate combined brief', { err: err.message });
    return null;
  }
}

// ========== Page Fetching ==========

async function fetchPageText(url) {
  // Skip YouTube and PDF URLs — metadata only
  if (/youtube\.com|youtu\.be/i.test(url)) {
    return `[YouTube video: ${url}] — Video content cannot be extracted. Use the title and snippet for context.`;
  }
  if (/\.pdf(\?|$)/i.test(url)) {
    return `[PDF document: ${url}] — PDF content cannot be extracted directly. Use the title and snippet for context.`;
  }

  try {
    const { getBrowser, randomUserAgent } = require('../scrapers/browser');
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent(randomUserAgent());
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Extract text content
      const text = await page.evaluate(() => {
        // Remove scripts, styles, nav, footer
        const removes = document.querySelectorAll('script, style, nav, footer, header, aside, .sidebar, .cookie-banner, .ad');
        removes.forEach(el => el.remove());
        return (document.body?.innerText || '').trim();
      });

      return text;
    } finally {
      await page.close();
    }
  } catch (err) {
    log.warn(SRC, 'Page fetch failed', { url, err: err.message });
    return null;
  }
}

module.exports = { searchWeb, summarizeSources, AGENT_META };
