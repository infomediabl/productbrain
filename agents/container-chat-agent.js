/**
 * Agent: Container Chat
 * Route: routes/container-chat.js → POST /api/containers/:id/chat
 * Deps: config, storage, logger, gather-data (gatherContainerContext, gatherGadsData)
 * Stores: (none — session-only, does NOT persist results)
 *
 * Synchronous chat agent that answers questions using all container data and
 * conversation history. Builds a comprehensive system prompt from container context.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { gatherContainerContext, gatherGadsData } = require('../utils/gather-data');

const SRC = 'ContainerChat';

const AGENT_META = {
  code: 'ag0015',
  id: 'container-chat',
  name: 'Container Chat',
  description: 'Ask questions about container data using AI.',
  category: 'chat',
  model: 'AI_MODEL',
  inputs: [{ name: 'containerId', type: 'string', required: true, from: null }],
  consumes: [],
  outputs: { storageKey: null, dataType: 'text', schema: null },
  ui: { visible: true },
  prompt_summary: 'Answers questions about container data using all available product info, competitor analyses, scrape results, keyword strategies, and context items.',
};

async function chat(containerId, { message, history = [] }) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const systemPrompt = buildSystemPrompt(container);
  const messages = buildMessages(history, message);

  log.info(SRC, 'Chat request', {
    containerId,
    messageLength: message.length,
    historyLength: history.length,
    systemPromptLength: systemPrompt.length,
  });

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  const response = await client.messages.create({
    model: config.AI_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  const text = response.content.map(c => c.text || '').join('\n');
  log.info(SRC, 'Chat response', { containerId, responseLength: text.length });
  return text;
}

function buildSystemPrompt(container) {
  const parts = [];

  parts.push(`${config.APP_CONTEXT}

You are a marketing strategist and data analyst assistant. You have full access to all data in this container. Answer questions precisely using the provided data. Be concise and actionable. Use markdown formatting.`);

  // Product info
  if (container.my_product) {
    const p = container.my_product;
    parts.push(`\n## My Product: ${p.name}`);
    if (p.website) parts.push(`Website: ${p.website}`);
    if (p.site_type) parts.push(`Type: ${p.site_type}`);
    if (p.unique_angle) parts.push(`Unique Angle: ${p.unique_angle}`);
    if (p.target_audience) parts.push(`Target Audience: ${p.target_audience}`);
  }

  // Competitors list
  if (container.competitors && container.competitors.length > 0) {
    parts.push(`\n## Competitors`);
    for (const c of container.competitors) {
      parts.push(`- ${c.name}${c.website ? ` (${c.website})` : ''}`);
    }
  }

  // Metadata/notes
  if (container.metadata && container.metadata.length > 0) {
    parts.push(`\n## Notes & Metadata`);
    for (const m of container.metadata) {
      const content = m.content.length > 500 ? m.content.substring(0, 500) + '...' : m.content;
      parts.push(`### [${m.type}] ${m.title}\n${content}`);
    }
  }

  // Container Context (curated data — the most important part)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    parts.push('\n## Container Context (Curated Analysis Data)');
    for (const item of contextData) {
      parts.push(`### [${item.source_type}] ${item.section_name}`);
      const briefStr = item.brief || '';
      parts.push(briefStr.length > 2000 ? briefStr.substring(0, 2000) + '...[truncated]' : briefStr);
    }
  }

  // Competitor analysis summaries
  const compAnalyses = container.competitor_analyses || {};
  const analysisSummaries = [];
  for (const comp of (container.competitors || [])) {
    const analyses = compAnalyses[comp.id] || [];
    const latest = [...analyses].reverse().find(a => a.status === 'completed');
    if (latest && latest.result?.json_data) {
      const json = latest.result.json_data;
      let summary = `### ${comp.name}\n`;
      if (json.summary) summary += `Summary: ${json.summary}\n`;
      if (json.key_findings && json.key_findings.length > 0) {
        summary += `Key findings: ${json.key_findings.map(f => f.finding).join('; ')}\n`;
      }
      if (json.opportunities_for_us && json.opportunities_for_us.length > 0) {
        const opps = json.opportunities_for_us.map(o => typeof o === 'string' ? o : o.opportunity).join('; ');
        summary += `Opportunities: ${opps}\n`;
      }
      analysisSummaries.push(summary);
    }
  }
  if (analysisSummaries.length > 0) {
    parts.push(`\n## Competitor Analysis Details`);
    parts.push(analysisSummaries.join('\n'));
  }

  // Google Ads data
  const gadsData = gatherGadsData(container);
  if (gadsData && gadsData.campaigns.length > 0) {
    parts.push(`\n## Google Ads Performance`);
    for (const c of gadsData.campaigns) {
      const costUsd = c.cost_micros ? `$${(c.cost_micros / 1e6).toFixed(2)}` : 'N/A';
      const cpc = (c.clicks > 0 && c.cost_micros) ? `$${(c.cost_micros / 1e6 / c.clicks).toFixed(2)}` : 'N/A';
      parts.push(`- ${c.name} [${c.channel_type}]: ${c.impressions} impr, ${c.clicks} clicks, CPC ${cpc}, cost ${costUsd}`);
    }
    if (gadsData.analysis.summary) parts.push(`Analysis: ${gadsData.analysis.summary}`);
  }

  // Keyword strategy summary
  const kwStrategies = (container.keyword_strategies || []).filter(s => s.status === 'completed');
  if (kwStrategies.length > 0) {
    const latest = kwStrategies[kwStrategies.length - 1];
    if (latest.result?.json_data) {
      const kw = latest.result.json_data;
      parts.push('\n## Keyword Strategy');
      if (kw.summary) parts.push(kw.summary);
      if (kw.quick_wins && kw.quick_wins.length > 0) {
        parts.push('Quick wins: ' + kw.quick_wins.map(w => typeof w === 'string' ? w : w.keyword || w.term || '').join(', '));
      }
    }
  }

  // Scrape data summary
  const scrapeCount = (container.scrape_results || []).filter(s => s.status === 'completed').length;
  if (scrapeCount > 0) {
    parts.push(`\n## Available Data: ${scrapeCount} completed ad scrapes`);
  }

  // Cap total system prompt
  let systemPrompt = parts.join('\n');
  if (systemPrompt.length > 80000) {
    systemPrompt = systemPrompt.substring(0, 80000) + '\n\n[System context truncated due to length]';
  }

  return systemPrompt;
}

function buildMessages(history, currentMessage) {
  const messages = [];
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: 'user', content: currentMessage });
  return messages;
}

module.exports = { chat, AGENT_META };
