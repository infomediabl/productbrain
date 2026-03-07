#!/usr/bin/env node
/**
 * MCP Server — Exposes all ProductBrain agents as MCP tools.
 *
 * Transport: stdio (standard for local MCP servers)
 * Tools: ~28 (21 agent tools + google-ads sub-tools + 3 utility tools)
 *
 * Usage:
 *   node mcp-server.js            (stdio transport, for MCP clients)
 *   npm run mcp                   (same, via package.json script)
 *
 * Configure in Claude Code settings.json or Claude Desktop config:
 *   { "mcpServers": { "product-analyzer": { "command": "node", "args": ["<path>/mcp-server.js"] } } }
 */
require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const storage = require('./storage');

// ---------------------------------------------------------------------------
// Wait-for-completion wrapper for fire-and-forget agents
// ---------------------------------------------------------------------------
async function waitForResult(pollFn, maxWait = 120000) {
  const start = Date.now();
  const inProgress = ['generating', 'scraping', 'analyzing', 'summarizing', 'launching', 'searching', 'pending', 'importing'];
  while (Date.now() - start < maxWait) {
    const record = pollFn();
    if (record && !inProgress.includes(record.status)) {
      return record;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return { status: 'timeout', error: 'Agent did not complete within 120s' };
}

// ---------------------------------------------------------------------------
// Tool definitions — one per agent operation
// ---------------------------------------------------------------------------
const TOOL_MAP = [
  // --- Simple container agents (containerId only) ---
  {
    name: 'run_hooks',
    description: 'Generate marketing hooks and angles for a product container (AG-020)',
    agentFile: './agents/hooks-agent',
    fn: 'generateHooks',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getHooksResult(p.containerId, rec.id),
  },
  {
    name: 'run_image_ads',
    description: 'Generate image ad concepts and copy for a product container (AG-010)',
    agentFile: './agents/image-ad-agent',
    fn: 'generateImageAds',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getImageAd(p.containerId, rec.id),
  },
  {
    name: 'run_quiz',
    description: 'Generate an interactive quiz landing page for a product (AG-011)',
    agentFile: './agents/quiz-agent',
    fn: 'generateQuiz',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getQuiz(p.containerId, rec.id),
  },
  {
    name: 'run_landing_page',
    description: 'Generate a landing page HTML for a product (AG-012)',
    agentFile: './agents/landing-page-agent',
    fn: 'generateLandingPage',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getLandingPage(p.containerId, rec.id),
  },
  {
    name: 'run_test_plan',
    description: 'Generate an A/B test plan for a product (AG-013)',
    agentFile: './agents/test-planner-agent',
    fn: 'generateTestPlan',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getTestPlan(p.containerId, rec.id),
  },
  {
    name: 'run_keyword_strategy',
    description: 'Generate a keyword strategy for a product (AG-008)',
    agentFile: './agents/keyword-ideator-agent',
    fn: 'generateKeywordStrategy',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getKeywordStrategy(p.containerId, rec.id),
  },
  {
    name: 'run_spinoff_ideas',
    description: 'Generate spin-off product ideas based on competitor analysis (AG-019)',
    agentFile: './agents/spinoff-ideas-agent',
    fn: 'generateSpinoffIdeas',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getSpinoffIdea(p.containerId, rec.id),
  },

  {
    name: 'run_content_validator',
    description: 'Validate marketing content against product context with brutally honest feedback (AG-022)',
    agentFile: './agents/content-validator-agent',
    fn: 'validateContent',
    params: {
      containerId: z.string().describe('Container ID'),
      validate_type: z.string().describe('Type: landing_page, image_ad, video_transcript, hook, angle'),
      content: z.string().describe('The marketing content to validate'),
      comment: z.string().optional().describe('Additional instructions or context for the validator'),
    },
    paramsToArgs: p => [p.containerId, { validate_type: p.validate_type, content: p.content, comment: p.comment }],
    getResult: (rec, p) => storage.getValidation(p.containerId, rec.id),
  },

  {
    name: 'run_project_overview',
    description: 'Generate an AI project overview for a container dashboard (AG-023)',
    agentFile: './agents/project-overview-agent',
    fn: 'generateOverview',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getProjectOverview(p.containerId),
  },
  {
    name: 'run_question',
    description: 'Ask a question about a project and get a concise AI answer (AG-025)',
    agentFile: './agents/questions-agent',
    fn: 'askQuestion',
    params: {
      containerId: z.string().describe('Container ID'),
      question: z.string().describe('The question to ask'),
    },
    paramsToArgs: p => [p.containerId, p.question],
    getResult: (rec, p) => storage.getQuestion(p.containerId, rec.id),
  },
  {
    name: 'run_data_feed',
    description: 'Analyze uploaded CSV data for insights and key metrics (AG-024)',
    agentFile: './agents/data-feed-agent',
    fn: 'analyzeDataFeed',
    params: {
      containerId: z.string().describe('Container ID'),
      csv_text: z.string().describe('Raw CSV text content'),
      filename: z.string().optional().describe('Original filename'),
    },
    paramsToArgs: p => [p.containerId, { csv_text: p.csv_text, filename: p.filename }],
    getResult: (rec, p) => storage.getDataFeed(p.containerId, rec.id),
  },

  // --- Agents with extra params ---
  {
    name: 'run_product_ideas',
    description: 'Generate product improvement ideas for a container (AG-007)',
    agentFile: './agents/product-ideator-agent',
    fn: 'ideateProduct',
    params: {
      containerId: z.string().describe('Container ID'),
      userPrompt: z.string().optional().describe('Optional focus area or prompt'),
    },
    paramsToArgs: p => [p.containerId, { userPrompt: p.userPrompt }],
    getResult: (rec, p) => storage.getProductIdea(p.containerId, rec.id),
  },
  {
    name: 'run_competitor_analysis',
    description: 'Analyze a competitor\'s scraped ads (AG-003). Requires prior scrape data.',
    agentFile: './agents/analyzer-agent',
    fn: 'analyzeCompetitor',
    params: {
      containerId: z.string().describe('Container ID'),
      competitorId: z.string().describe('Competitor ID within the container'),
    },
    paramsToArgs: p => [p.containerId, p.competitorId],
    getResult: (rec, p) => storage.getCompetitorAnalysis(p.containerId, p.competitorId, rec.id),
  },
  {
    name: 'run_seo_competitor',
    description: 'Run SEO analysis on a competitor (AG-004)',
    agentFile: './agents/seo-agent',
    fn: 'analyzeSeo',
    params: {
      containerId: z.string().describe('Container ID'),
      competitorId: z.string().describe('Competitor ID'),
    },
    paramsToArgs: p => [p.containerId, p.competitorId],
    getResult: (rec, p) => storage.getSeoAnalysis(p.containerId, p.competitorId, rec.id),
  },
  {
    name: 'run_seo_own',
    description: 'Run SEO analysis on your own product (AG-004)',
    agentFile: './agents/seo-agent',
    fn: 'analyzeOwnSeo',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    getResult: (rec, p) => storage.getSeoAnalysis(p.containerId, '_own_product', rec.id),
  },
  {
    name: 'run_proposal',
    description: 'Generate an AI marketing proposal based on competitor analysis (AG-005)',
    agentFile: './agents/proposal-agent',
    fn: 'generateProposal',
    params: {
      containerId: z.string().describe('Container ID'),
      competitorIds: z.array(z.string()).describe('Array of competitor IDs to include'),
      userContext: z.string().optional().describe('Additional context or goals'),
      userPrompt: z.string().optional().describe('Custom prompt/instructions'),
    },
    paramsToArgs: p => [p.containerId, { competitorIds: p.competitorIds, userContext: p.userContext, userPrompt: p.userPrompt }],
    getResult: (rec, p) => storage.getProposal(p.containerId, rec.id),
  },
  {
    name: 'run_prompts',
    description: 'Generate ad prompts from a proposal (AG-006)',
    agentFile: './agents/prompt-agent',
    fn: 'generatePrompts',
    params: {
      containerId: z.string().describe('Container ID'),
      proposalId: z.string().describe('Proposal ID to base prompts on'),
    },
    paramsToArgs: p => [p.containerId, p.proposalId],
    getResult: (rec, p) => storage.getGeneratedPrompt(p.containerId, rec.id),
  },
  {
    name: 'run_case_study',
    description: 'Analyze a case study from text or URL (AG-014)',
    agentFile: './agents/case-study-agent',
    fn: 'analyzeCaseStudy',
    params: {
      containerId: z.string().describe('Container ID'),
      source_type: z.string().describe('Source type: "text" or "url"'),
      content: z.string().optional().describe('Case study text (when source_type="text")'),
      url: z.string().optional().describe('Case study URL (when source_type="url")'),
    },
    paramsToArgs: p => [p.containerId, { source_type: p.source_type, content: p.content, url: p.url }],
    getResult: (rec, p) => storage.getCaseStudy(p.containerId, rec.id),
  },
  {
    name: 'run_scrape_validate',
    description: 'Validate the quality of a scrape result (AG-002)',
    agentFile: './agents/scrape-validator-agent',
    fn: 'validateScrape',
    params: {
      containerId: z.string().describe('Container ID'),
      scrapeId: z.string().describe('Scrape result ID to validate'),
    },
    paramsToArgs: p => [p.containerId, p.scrapeId],
    noWait: true,
  },
  {
    name: 'run_taboola_preview',
    description: 'Generate Taboola campaign copy preview from scraped ads (AG-018)',
    agentFile: './agents/taboola-agent',
    fn: 'previewCopy',
    params: {
      containerId: z.string().describe('Container ID'),
      ad_ids: z.array(z.string()).optional().describe('Specific ad IDs to use'),
    },
    paramsToArgs: p => [p.containerId, { ad_ids: p.ad_ids }],
    getResult: (rec, p) => storage.getTaboolaCampaign(p.containerId, rec.id),
  },
  {
    name: 'run_taboola_clone',
    description: 'Clone ads into a live Taboola campaign (AG-018). Requires Taboola credentials in settings.',
    agentFile: './agents/taboola-agent',
    fn: 'cloneToCampaign',
    params: {
      containerId: z.string().describe('Container ID'),
      ad_ids: z.array(z.string()).optional().describe('Specific ad IDs to clone'),
    },
    paramsToArgs: p => [p.containerId, { ad_ids: p.ad_ids }],
    getResult: (rec, p) => storage.getTaboolaCampaign(p.containerId, rec.id),
  },
  {
    name: 'run_folder_import',
    description: 'Import ads from the data/uploads/ folder into a container (AG-021)',
    agentFile: './agents/folder-scraper-agent',
    fn: 'importFromFolder',
    params: { containerId: z.string().describe('Container ID') },
    paramsToArgs: p => [p.containerId],
    noWait: true,
  },

  // --- Chat agent (synchronous — returns directly) ---
  {
    name: 'chat',
    description: 'Chat with a container\'s AI assistant. Has full context about the product and competitors (AG-015).',
    agentFile: './agents/container-chat-agent',
    fn: 'chat',
    params: {
      containerId: z.string().describe('Container ID'),
      message: z.string().describe('User message'),
      history: z.array(z.object({ role: z.string(), content: z.string() })).optional().describe('Chat history'),
    },
    paramsToArgs: p => [p.containerId, { message: p.message, history: p.history || [] }],
    sync: true,
  },

  // --- Non-container agents (fire-and-forget with own storage) ---
  {
    name: 'run_desire_spring',
    description: 'Generate step-by-step feature instructions from an idea (AG-016). Not container-specific.',
    agentFile: './agents/desire-spring-agent',
    fn: 'generateInstructions',
    params: { idea_text: z.string().describe('Feature idea description') },
    paramsToArgs: p => [p.idea_text],
    getResult: (rec) => {
      const { getIdea } = require('./agents/desire-spring-agent');
      return getIdea(rec.id);
    },
  },
  {
    name: 'run_web_research',
    description: 'Search the web for a topic and compile sources (AG-017). Not container-specific.',
    agentFile: './agents/research-web-agent',
    fn: 'searchWeb',
    params: { topic: z.string().describe('Research topic') },
    paramsToArgs: p => [p.topic],
    getResult: (rec) => storage.getResearchWeb(rec.id),
  },
];

// ---------------------------------------------------------------------------
// Google Ads sub-tools (AG-009 — multiple operations)
// ---------------------------------------------------------------------------
const GADS_TOOLS = [
  {
    name: 'gads_is_configured',
    description: 'Check if Google Ads API credentials are configured (AG-009)',
    fn: 'isConfigured',
    params: {},
    paramsToArgs: () => [],
  },
  {
    name: 'gads_list_accounts',
    description: 'List accessible Google Ads accounts (AG-009)',
    fn: 'listAccessibleAccounts',
    params: {},
    paramsToArgs: () => [],
  },
  {
    name: 'gads_list_campaigns',
    description: 'List campaigns for a Google Ads account (AG-009)',
    fn: 'listCampaigns',
    params: { accountId: z.string().describe('Google Ads account ID') },
    paramsToArgs: p => [p.accountId],
  },
  {
    name: 'gads_keyword_ideas',
    description: 'Generate keyword ideas via Google Keyword Planner (AG-009)',
    fn: 'generateKeywordIdeas',
    params: {
      keywords: z.array(z.string()).optional().describe('Seed keywords'),
      url: z.string().optional().describe('URL to extract keywords from'),
    },
    paramsToArgs: p => [{ keywords: p.keywords, url: p.url }],
  },
];

// ---------------------------------------------------------------------------
// Build and start the MCP server
// ---------------------------------------------------------------------------
async function main() {
  const server = new McpServer({
    name: 'product-analyzer',
    version: '1.0.0',
  });

  // ---- Utility tools ----

  server.tool(
    'list_containers',
    'List all product containers with their IDs and names',
    {},
    async () => {
      const containers = storage.listContainers();
      return { content: [{ type: 'text', text: JSON.stringify(containers, null, 2) }] };
    }
  );

  server.tool(
    'get_container',
    'Get full details of a product container including all data',
    { containerId: z.string().describe('Container ID') },
    async ({ containerId }) => {
      const container = storage.readContainer(containerId);
      if (!container) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Container not found' }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(container, null, 2) }] };
    }
  );

  server.tool(
    'get_result',
    'Get a specific result by storage key and ID (e.g. proposals, hooks_results, image_ads)',
    {
      containerId: z.string().describe('Container ID'),
      storageKey: z.string().describe('Storage key (e.g. proposals, hooks_results, image_ads, test_plans)'),
      resultId: z.string().describe('Result ID'),
    },
    async ({ containerId, storageKey, resultId }) => {
      const container = storage.readContainer(containerId);
      if (!container) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Container not found' }) }], isError: true };
      }
      const items = container[storageKey];
      if (!items) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown storage key: ${storageKey}` }) }], isError: true };
      }
      // Handle both array and object (competitor_analyses/seo_analyses are objects)
      if (Array.isArray(items)) {
        const item = items.find(i => i.id === resultId);
        if (!item) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Result not found' }) }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }
      // Object-keyed (e.g. competitor_analyses[competitorId] = [...])
      for (const key of Object.keys(items)) {
        const arr = items[key];
        if (Array.isArray(arr)) {
          const item = arr.find(i => i.id === resultId);
          if (item) return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Result not found' }) }], isError: true };
    }
  );

  // ---- Agent tools ----

  for (const tool of TOOL_MAP) {
    const agentMod = require(tool.agentFile);
    const agentFn = agentMod[tool.fn];
    if (!agentFn) {
      console.error(`MCP: Could not find function ${tool.fn} in ${tool.agentFile}`);
      continue;
    }

    server.tool(
      tool.name,
      tool.description,
      tool.params,
      async (params) => {
        try {
          const args = tool.paramsToArgs(params);
          const record = await agentFn(...args);

          // Sync agent — return result directly
          if (tool.sync) {
            return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
          }

          // No-wait agent — return immediately
          if (tool.noWait) {
            return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
          }

          // Fire-and-forget — poll until completed
          if (tool.getResult && record && record.id) {
            const result = await waitForResult(() => tool.getResult(record, params));
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          // Fallback
          return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
        } catch (err) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
        }
      }
    );
  }

  // ---- Google Ads tools ----

  let gadsAgent;
  try {
    gadsAgent = require('./agents/google-ads-agent');
  } catch (e) {
    console.error('MCP: Could not load google-ads-agent:', e.message);
  }

  if (gadsAgent) {
    for (const tool of GADS_TOOLS) {
      const fn = gadsAgent[tool.fn];
      if (!fn) continue;

      server.tool(
        tool.name,
        tool.description,
        tool.params,
        async (params) => {
          try {
            const args = tool.paramsToArgs(params);
            const result = await fn(...args);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
          }
        }
      );
    }
  }

  // ---- Start server ----

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
