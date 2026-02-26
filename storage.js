/**
 * Storage Layer (SHARED — do not edit from multiple sessions)
 * Used by: ALL 21 route files, several agents directly
 * Data: JSON files in data/<container-id>.json
 *
 * Provides CRUD for all entities: containers, metadata, scrape_results,
 * competitor_analyses, seo_analyses, proposals, generated_prompts,
 * product_ideas, keyword_strategies, landing_pages, image_ads, quizzes,
 * test_plans, case_studies, gads_analyses, container_context, settings.
 *
 * Uses per-container write queue (enqueueWrite) to prevent JSON corruption
 * from concurrent writes.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Per-container write queue to prevent JSON corruption
const writeQueues = new Map();

function getContainerPath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

function enqueueWrite(containerId, fn) {
  const prev = writeQueues.get(containerId) || Promise.resolve();
  const next = prev.then(() => fn());
  writeQueues.set(containerId, next.catch(err => {
    const log = require('./logger');
    log.error('Storage', 'Write queue error', { containerId, err: err.message });
  }));
  return next;
}

function readContainerFile(id) {
  const filePath = getContainerPath(id);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeContainerFile(container) {
  const filePath = getContainerPath(container.id);
  fs.writeFileSync(filePath, JSON.stringify(container, null, 2), 'utf8');
}

// Ensure container has all new fields (migration helper)
function ensureFields(container) {
  if (!container.scrape_results) container.scrape_results = [];
  if (!container.competitor_analyses) container.competitor_analyses = {};
  if (!container.seo_analyses) container.seo_analyses = {};
  if (!container.generated_prompts) container.generated_prompts = [];
  if (!container.analyses) container.analyses = [];
  if (!container.proposals) container.proposals = [];
  if (!container.metadata) container.metadata = [];
  if (!container.product_ideas) container.product_ideas = [];
  if (!container.keyword_strategies) container.keyword_strategies = [];
  if (!container.landing_pages) container.landing_pages = [];
  if (!container.image_ads) container.image_ads = [];
  if (!container.settings) container.settings = {};
  if (!container.quizzes) container.quizzes = [];
  if (!container.gads_analyses) container.gads_analyses = [];
  if (!container.test_plans) container.test_plans = [];
  if (!container.case_studies) container.case_studies = [];
  if (!container.container_context) container.container_context = [];
  if (!container.keyword_ideas) container.keyword_ideas = [];
  // my_product can be null (no existing product) — don't default it
  return container;
}

// --- Container CRUD ---

function listContainers() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'last_analysis.json');
  const summaries = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
      const c = JSON.parse(raw);
      const scrapeCount = (c.scrape_results || []).length + (c.analyses || []).length;
      const lastScrape = (c.scrape_results || []).length > 0
        ? { status: c.scrape_results[c.scrape_results.length - 1].status, completed_at: c.scrape_results[c.scrape_results.length - 1].completed_at }
        : (c.analyses || []).length > 0
          ? { status: c.analyses[c.analyses.length - 1].status, completed_at: c.analyses[c.analyses.length - 1].completed_at }
          : null;
      summaries.push({
        id: c.id,
        name: c.name,
        created_at: c.created_at,
        updated_at: c.updated_at,
        my_product: c.my_product,
        competitor_count: (c.competitors || []).length,
        metadata_count: (c.metadata || []).length,
        analysis_count: scrapeCount,
        last_analysis: lastScrape,
      });
    } catch (e) { /* skip corrupt files */ }
  }
  summaries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return summaries;
}

function readContainer(id) {
  const container = readContainerFile(id);
  if (container) ensureFields(container);
  return container;
}

function createContainer({ name, my_product, competitors }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const container = {
    id,
    name,
    created_at: now,
    updated_at: now,
    my_product: my_product ? {
      name: my_product.name || '',
      website: my_product.website || '',
      fb_ads_url: my_product.fb_ads_url || '',
      google_ads_url: my_product.google_ads_url || '',
      site_type: my_product.site_type || '',
      unique_angle: my_product.unique_angle || '',
      target_audience: my_product.target_audience || '',
    } : null,
    competitors: (competitors || []).map(c => ({
      id: uuidv4(),
      name: c.name || '',
      website: c.website || '',
      fb_ads_url: c.fb_ads_url || '',
      google_ads_url: c.google_ads_url || '',
    })),
    metadata: [],
    analyses: [],           // legacy — kept for backward compat
    scrape_results: [],     // Agent 1: Scraper results
    competitor_analyses: {}, // Agent 2: Per-competitor analyses { compId: [analysis, ...] }
    seo_analyses: {},        // SEO Agent: Per-competitor SEO analyses { compId: [analysis, ...] }
    proposals: [],          // Agent 3: AI proposals
    generated_prompts: [],  // Agent 4: Generated prompts
  };
  writeContainerFile(container);
  return container;
}

function updateContainer(id, updates) {
  return enqueueWrite(id, () => {
    const container = readContainerFile(id);
    if (!container) return null;
    ensureFields(container);
    if (updates.name !== undefined) container.name = updates.name;
    if (updates.my_product !== undefined) {
      container.my_product = updates.my_product ? {
        name: updates.my_product.name || '',
        website: updates.my_product.website || '',
        fb_ads_url: updates.my_product.fb_ads_url || '',
        google_ads_url: updates.my_product.google_ads_url || '',
        site_type: updates.my_product.site_type || '',
        unique_angle: updates.my_product.unique_angle || '',
        target_audience: updates.my_product.target_audience || '',
        // Preserve ideated fields if they exist (from Product Ideator accept)
        ...(container.my_product?.ideated ? {
          ideated: container.my_product.ideated,
          domain_suggestions: container.my_product.domain_suggestions,
        } : {}),
      } : null;
    }
    if (updates.competitors !== undefined) {
      container.competitors = updates.competitors.map(c => ({
        id: c.id || uuidv4(),
        name: c.name || '',
        website: c.website || '',
        fb_ads_url: c.fb_ads_url || '',
        google_ads_url: c.google_ads_url || '',
      }));
    }
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return container;
  });
}

function deleteContainer(id) {
  const filePath = getContainerPath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// --- Metadata CRUD ---

function addMetadata(containerId, { type, title, content }) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const entry = {
      id: uuidv4(),
      type: type || 'other',
      title: title || '',
      content: content || '',
      created_at: new Date().toISOString(),
    };
    container.metadata.push(entry);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return entry;
  });
}

function updateMetadata(containerId, metaId, updates) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    const entry = container.metadata.find(m => m.id === metaId);
    if (!entry) return null;
    if (updates.type !== undefined) entry.type = updates.type;
    if (updates.title !== undefined) entry.title = updates.title;
    if (updates.content !== undefined) entry.content = updates.content;
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return entry;
  });
}

function deleteMetadata(containerId, metaId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    const idx = container.metadata.findIndex(m => m.id === metaId);
    if (idx === -1) return false;
    container.metadata.splice(idx, 1);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return true;
  });
}

// --- Legacy Analysis CRUD (kept for backward compat) ---

function createAnalysis(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analysis = {
      id: uuidv4(),
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'pending',
      error_message: null,
      scraped_data: {
        my_product: { facebook: [], google: [] },
        competitors: {},
      },
    };
    container.analyses.push(analysis);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return analysis;
  });
}

function updateAnalysisStatus(containerId, analysisId, status, errorMessage) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analysis = container.analyses.find(a => a.id === analysisId);
    if (!analysis) return null;
    analysis.status = status;
    analysis.error_message = errorMessage || null;
    if (status === 'completed' || status === 'failed') {
      analysis.completed_at = new Date().toISOString();
    }
    writeContainerFile(container);
    return analysis;
  });
}

function addScrapedData(containerId, analysisId, entryKey, source, ads) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analysis = container.analyses.find(a => a.id === analysisId);
    if (!analysis) return null;
    if (entryKey === 'my_product') {
      analysis.scraped_data.my_product[source] = ads;
    } else {
      if (!analysis.scraped_data.competitors[entryKey]) {
        analysis.scraped_data.competitors[entryKey] = { facebook: [], google: [] };
      }
      analysis.scraped_data.competitors[entryKey][source] = ads;
    }
    writeContainerFile(container);
    return analysis;
  });
}

function getAnalysis(containerId, analysisId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.analyses.find(a => a.id === analysisId) || null;
}

// ========== AGENT 1: Scrape Results CRUD ==========

function createScrapeResult(containerId, meta) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const scrape = {
      id: uuidv4(),
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'pending',
      error_message: null,
      trigger: (meta && meta.trigger) || 'manual',
      new_ads_count: 0,
      scrape_meta: meta || null,
      scraped_data: {
        my_product: { facebook: [], google: [] },
        competitors: {},
      },
    };
    container.scrape_results.push(scrape);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return scrape;
  });
}

function updateScrapeStatus(containerId, scrapeId, status, errorMessage) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const scrape = container.scrape_results.find(s => s.id === scrapeId);
    if (!scrape) return null;
    scrape.status = status;
    scrape.error_message = errorMessage || null;
    if (status === 'completed' || status === 'failed' || status === 'timed_out') {
      scrape.completed_at = new Date().toISOString();
    }
    writeContainerFile(container);
    return scrape;
  });
}

function addScrapeData(containerId, scrapeId, entryKey, source, ads) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const scrape = container.scrape_results.find(s => s.id === scrapeId);
    if (!scrape) return null;
    if (entryKey === 'my_product') {
      scrape.scraped_data.my_product[source] = ads;
    } else {
      if (!scrape.scraped_data.competitors[entryKey]) {
        scrape.scraped_data.competitors[entryKey] = { facebook: [], google: [] };
      }
      scrape.scraped_data.competitors[entryKey][source] = ads;
    }
    writeContainerFile(container);
    return scrape;
  });
}

function getScrapeResult(containerId, scrapeId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.scrape_results.find(s => s.id === scrapeId) || null;
}

function updateScrapeOcrData(containerId, scrapeId, scrapedData) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const scrape = container.scrape_results.find(s => s.id === scrapeId);
    if (!scrape) return null;
    scrape.scraped_data = scrapedData;
    writeContainerFile(container);
    return scrape;
  });
}

// ========== AGENT 1b: Scrape Validation ==========

function updateScrapeValidation(containerId, scrapeId, isLegacy, validation) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const list = isLegacy ? container.analyses : container.scrape_results;
    const item = list.find(s => s.id === scrapeId);
    if (!item) return null;
    item.validation = { ...(item.validation || {}), ...validation };
    writeContainerFile(container);
    return item.validation;
  });
}

function getScrapeValidation(containerId, scrapeId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  let item = container.scrape_results.find(s => s.id === scrapeId);
  if (!item) item = container.analyses.find(a => a.id === scrapeId);
  if (!item) return null;
  return item.validation || null;
}

// ========== AGENT 2: Competitor Analysis CRUD ==========

function createCompetitorAnalysis(containerId, competitorId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    if (!container.competitor_analyses[competitorId]) {
      container.competitor_analyses[competitorId] = [];
    }
    const analysis = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.competitor_analyses[competitorId].push(analysis);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return analysis;
  });
}

function updateCompetitorAnalysis(containerId, competitorId, analysisId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analyses = container.competitor_analyses[competitorId] || [];
    const analysis = analyses.find(a => a.id === analysisId);
    if (!analysis) return null;
    analysis.status = status;
    if (result !== undefined) analysis.result = result;
    writeContainerFile(container);
    return analysis;
  });
}

function getCompetitorAnalysis(containerId, competitorId, analysisId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  const analyses = container.competitor_analyses[competitorId] || [];
  return analyses.find(a => a.id === analysisId) || null;
}

function getLatestCompetitorAnalysis(containerId, competitorId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  const analyses = container.competitor_analyses[competitorId] || [];
  return [...analyses].reverse().find(a => a.status === 'completed') || null;
}

// ========== AGENT 3: Proposal CRUD (enhanced) ==========

function addProposal(containerId, analysisId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const proposal = {
      id: uuidv4(),
      analysis_id: analysisId,
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.proposals.push(proposal);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return proposal;
  });
}

function updateProposal(containerId, proposalId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const proposal = container.proposals.find(p => p.id === proposalId);
    if (!proposal) return null;
    proposal.status = status;
    if (result !== undefined) proposal.result = result;
    writeContainerFile(container);
    return proposal;
  });
}

function getProposal(containerId, proposalId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.proposals.find(p => p.id === proposalId) || null;
}

// ========== AGENT 4: Generated Prompts CRUD ==========

function addGeneratedPrompt(containerId, proposalId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const prompt = {
      id: uuidv4(),
      proposal_id: proposalId,
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.generated_prompts.push(prompt);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return prompt;
  });
}

function updateGeneratedPrompt(containerId, promptId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const prompt = container.generated_prompts.find(p => p.id === promptId);
    if (!prompt) return null;
    prompt.status = status;
    if (result !== undefined) prompt.result = result;
    writeContainerFile(container);
    return prompt;
  });
}

function getGeneratedPrompt(containerId, promptId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.generated_prompts.find(p => p.id === promptId) || null;
}

// ========== SEO Agent: SEO Analysis CRUD ==========

function createSeoAnalysis(containerId, competitorId, analysisType) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    if (!container.seo_analyses[competitorId]) {
      container.seo_analyses[competitorId] = [];
    }
    const analysis = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      analysis_type: analysisType || 'competitor',
      result: null,
    };
    container.seo_analyses[competitorId].push(analysis);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return analysis;
  });
}

function updateSeoAnalysis(containerId, competitorId, analysisId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analyses = container.seo_analyses[competitorId] || [];
    const analysis = analyses.find(a => a.id === analysisId);
    if (!analysis) return null;
    analysis.status = status;
    if (result !== undefined) analysis.result = result;
    writeContainerFile(container);
    return analysis;
  });
}

function getSeoAnalysis(containerId, competitorId, analysisId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  const analyses = container.seo_analyses[competitorId] || [];
  return analyses.find(a => a.id === analysisId) || null;
}

function getLatestSeoAnalysis(containerId, competitorId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  const analyses = container.seo_analyses[competitorId] || [];
  return [...analyses].reverse().find(a => a.status === 'completed') || null;
}

// ========== NewProductIdeator: Product Ideas CRUD ==========

function addProductIdea(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const idea = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.product_ideas.push(idea);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return idea;
  });
}

function updateProductIdea(containerId, ideaId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const idea = container.product_ideas.find(i => i.id === ideaId);
    if (!idea) return null;
    idea.status = status;
    if (result !== undefined) idea.result = result;
    writeContainerFile(container);
    return idea;
  });
}

function getProductIdea(containerId, ideaId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.product_ideas.find(i => i.id === ideaId) || null;
}

function acceptProductIdea(containerId, ideaId, ideaIndex) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const idea = container.product_ideas.find(i => i.id === ideaId);
    if (!idea || idea.status !== 'completed' || !idea.result?.json_data) return null;

    const ideas = idea.result.json_data.product_ideas || [];
    const picked = ideas[ideaIndex || 0];
    if (!picked) return null;

    container.my_product = {
      name: picked.project_name || '',
      website: '',
      fb_ads_url: '',
      google_ads_url: '',
      ideated: true,
      site_type: picked.site_type || '',
      domain_suggestions: picked.domain_suggestions || [],
      target_audience: picked.target_audience || '',
      unique_angle: picked.unique_angle || '',
    };
    idea.accepted = true;
    idea.accepted_index = ideaIndex || 0;
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return container;
  });
}

// ========== Keyword Ideator: Keyword Strategy CRUD ==========

function addKeywordStrategy(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const strategy = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.keyword_strategies.push(strategy);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return strategy;
  });
}

function updateKeywordStrategy(containerId, strategyId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const strategy = container.keyword_strategies.find(s => s.id === strategyId);
    if (!strategy) return null;
    strategy.status = status;
    if (result !== undefined) strategy.result = result;
    writeContainerFile(container);
    return strategy;
  });
}

function getKeywordStrategy(containerId, strategyId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.keyword_strategies.find(s => s.id === strategyId) || null;
}

// ========== Test Planner CRUD ==========

function addTestPlan(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const plan = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.test_plans.push(plan);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return plan;
  });
}

function updateTestPlan(containerId, planId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const plan = container.test_plans.find(p => p.id === planId);
    if (!plan) return null;
    plan.status = status;
    if (result !== undefined) plan.result = result;
    writeContainerFile(container);
    return plan;
  });
}

function getTestPlan(containerId, planId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.test_plans.find(p => p.id === planId) || null;
}

// ========== Landing Page Generator CRUD ==========

function addLandingPage(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const page = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.landing_pages.push(page);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return page;
  });
}

function updateLandingPage(containerId, pageId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const page = container.landing_pages.find(p => p.id === pageId);
    if (!page) return null;
    page.status = status;
    if (result !== undefined) page.result = result;
    writeContainerFile(container);
    return page;
  });
}

function getLandingPage(containerId, pageId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.landing_pages.find(p => p.id === pageId) || null;
}

// ========== Image Ad Creator CRUD ==========

function addImageAd(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const ad = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.image_ads.push(ad);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return ad;
  });
}

function updateImageAd(containerId, adId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const ad = container.image_ads.find(a => a.id === adId);
    if (!ad) return null;
    ad.status = status;
    if (result !== undefined) ad.result = result;
    writeContainerFile(container);
    return ad;
  });
}

function getImageAd(containerId, adId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.image_ads.find(a => a.id === adId) || null;
}

// ========== Project Settings ==========

function updateSettings(containerId, settings) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    container.settings = { ...container.settings, ...settings };
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return container.settings;
  });
}

function getSettings(containerId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.settings;
}

// ========== Quiz Generator CRUD ==========

function addQuiz(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const quiz = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
    };
    container.quizzes.push(quiz);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return quiz;
  });
}

function updateQuiz(containerId, quizId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const quiz = container.quizzes.find(q => q.id === quizId);
    if (!quiz) return null;
    quiz.status = status;
    if (result !== undefined) quiz.result = result;
    writeContainerFile(container);
    return quiz;
  });
}

function getQuiz(containerId, quizId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.quizzes.find(q => q.id === quizId) || null;
}

// ========== Google Ads Analysis CRUD ==========

function addGadsAnalysis(containerId, meta = {}) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analysis = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'analyzing',
      result: null,
      meta: meta,
    };
    container.gads_analyses.push(analysis);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return analysis;
  });
}

function updateGadsAnalysis(containerId, analysisId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analysis = container.gads_analyses.find(a => a.id === analysisId);
    if (!analysis) return null;
    analysis.status = status;
    if (result !== undefined) analysis.result = result;
    writeContainerFile(container);
    return analysis;
  });
}

function updateGadsAnalysisMeta(containerId, analysisId, meta) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const analysis = container.gads_analyses.find(a => a.id === analysisId);
    if (!analysis) return null;
    analysis.meta = { ...(analysis.meta || {}), ...meta };
    writeContainerFile(container);
    return analysis;
  });
}

function getGadsAnalysis(containerId, analysisId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.gads_analyses.find(a => a.id === analysisId) || null;
}

// ========== Keyword Ideas (Google Keyword Planner) CRUD ==========

function addKeywordIdeas(containerId, meta = {}) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const record = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'fetching',
      result: null,
      meta: {
        seed_keywords: meta.seed_keywords || [],
        url: meta.url || '',
        geo_targets: meta.geo_targets || [],
        language: meta.language || '',
      },
    };
    container.keyword_ideas.push(record);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return record;
  });
}

function updateKeywordIdeas(containerId, recordId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const record = container.keyword_ideas.find(r => r.id === recordId);
    if (!record) return null;
    record.status = status;
    if (result !== undefined) record.result = result;
    writeContainerFile(container);
    return record;
  });
}

function getKeywordIdeas(containerId, recordId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.keyword_ideas.find(r => r.id === recordId) || null;
}

// ========== Case Study Analyzer CRUD ==========

function addCaseStudy(containerId, meta = {}) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const study = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      status: 'generating',
      result: null,
      meta: {
        source_type: meta.source_type || 'txt',
        source_name: meta.source_name || '',
        competitor_id: meta.competitor_id || null,
      },
    };
    container.case_studies.push(study);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return study;
  });
}

function updateCaseStudy(containerId, studyId, status, result) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const study = container.case_studies.find(s => s.id === studyId);
    if (!study) return null;
    study.status = status;
    if (result !== undefined) study.result = result;
    writeContainerFile(container);
    return study;
  });
}

function getCaseStudy(containerId, studyId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.case_studies.find(s => s.id === studyId) || null;
}

// ========== Container Context (Collector) ==========

function addContainerContext(containerId, { source_type, source_id, section_name, content, text_brief }) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const item = {
      id: uuidv4(),
      source_type: source_type || 'manual',
      source_id: source_id || null,
      section_name: section_name || '',
      content: content || {},
      text_brief: text_brief || '',
      pushed_at: new Date().toISOString(),
    };
    container.container_context.push(item);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return item;
  });
}

function deleteContainerContext(containerId, itemId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return false;
    ensureFields(container);
    const idx = container.container_context.findIndex(c => c.id === itemId);
    if (idx === -1) return false;
    container.container_context.splice(idx, 1);
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return true;
  });
}

function clearContainerContext(containerId) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return false;
    ensureFields(container);
    container.container_context = [];
    container.updated_at = new Date().toISOString();
    writeContainerFile(container);
    return true;
  });
}

function getContainerContext(containerId) {
  const container = readContainerFile(containerId);
  if (!container) return null;
  ensureFields(container);
  return container.container_context;
}

// ========== Auto-Scrape Helpers ==========

/**
 * Scan all completed/timed_out scrape_results for a container and return
 * sets of known ad IDs for deduplication.
 * Returns { facebook: Set<fb_ad_id>, google: Set<creative_id> }
 */
function getKnownAdIds(containerId) {
  const container = readContainerFile(containerId);
  if (!container) return { facebook: new Set(), google: new Set() };
  ensureFields(container);

  const fbIds = new Set();
  const googleIds = new Set();

  const scrapes = (container.scrape_results || []).filter(
    s => s.status === 'completed' || s.status === 'timed_out'
  );

  for (const s of scrapes) {
    const sd = s.scraped_data;
    if (!sd) continue;

    const collectAds = (entryData) => {
      for (const ad of (entryData.facebook || [])) {
        if (ad.extra_data?.fb_ad_id) fbIds.add(ad.extra_data.fb_ad_id);
      }
      for (const ad of (entryData.google || [])) {
        if (ad.extra_data?.creative_id) googleIds.add(ad.extra_data.creative_id);
      }
    };

    if (sd.my_product) collectAds(sd.my_product);
    if (sd.competitors) {
      for (const compData of Object.values(sd.competitors)) {
        collectAds(compData);
      }
    }
  }

  return { facebook: fbIds, google: googleIds };
}

/**
 * List all containers that have auto_scrape_enabled in settings.
 * Returns array of { id, name, my_product, competitors }.
 */
function listAutoScrapeContainers() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'last_analysis.json');
  const results = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
      const c = JSON.parse(raw);
      ensureFields(c);
      if (c.settings && c.settings.auto_scrape_enabled) {
        results.push({
          id: c.id,
          name: c.name,
          my_product: c.my_product,
          competitors: c.competitors || [],
        });
      }
    } catch (e) { /* skip corrupt files */ }
  }
  return results;
}

/**
 * Update the new_ads_count field on a scrape result.
 */
function updateScrapeNewAdsCount(containerId, scrapeId, count) {
  return enqueueWrite(containerId, () => {
    const container = readContainerFile(containerId);
    if (!container) return null;
    ensureFields(container);
    const scrape = container.scrape_results.find(s => s.id === scrapeId);
    if (!scrape) return null;
    scrape.new_ads_count = count;
    writeContainerFile(container);
    return scrape;
  });
}

module.exports = {
  // Container
  listContainers, readContainer, createContainer, updateContainer, deleteContainer,
  // Metadata
  addMetadata, updateMetadata, deleteMetadata,
  // Legacy analysis
  createAnalysis, updateAnalysisStatus, addScrapedData, getAnalysis,
  // Agent 1: Scraper
  createScrapeResult, updateScrapeStatus, addScrapeData, getScrapeResult, updateScrapeOcrData,
  // Auto-Scrape helpers
  getKnownAdIds, listAutoScrapeContainers, updateScrapeNewAdsCount,
  // Agent 1b: Scrape Validation
  updateScrapeValidation, getScrapeValidation,
  // Agent 2: Competitor Analysis
  createCompetitorAnalysis, updateCompetitorAnalysis, getCompetitorAnalysis, getLatestCompetitorAnalysis,
  // SEO Agent: SEO Analysis
  createSeoAnalysis, updateSeoAnalysis, getSeoAnalysis, getLatestSeoAnalysis,
  // Agent 3: Proposals
  addProposal, updateProposal, getProposal,
  // Agent 4: Prompt Generation
  addGeneratedPrompt, updateGeneratedPrompt, getGeneratedPrompt,
  // NewProductIdeator
  addProductIdea, updateProductIdea, getProductIdea, acceptProductIdea,
  // Keyword Ideator
  addKeywordStrategy, updateKeywordStrategy, getKeywordStrategy,
  // Test Planner
  addTestPlan, updateTestPlan, getTestPlan,
  // Landing Page Generator
  addLandingPage, updateLandingPage, getLandingPage,
  // Image Ad Creator
  addImageAd, updateImageAd, getImageAd,
  // Project Settings
  updateSettings, getSettings,
  // Quiz Generator
  addQuiz, updateQuiz, getQuiz,
  // Google Ads Analysis
  addGadsAnalysis, updateGadsAnalysis, updateGadsAnalysisMeta, getGadsAnalysis,
  // Keyword Ideas (Google Keyword Planner)
  addKeywordIdeas, updateKeywordIdeas, getKeywordIdeas,
  // Case Study Analyzer
  addCaseStudy, updateCaseStudy, getCaseStudy,
  // Container Context (Collector)
  addContainerContext, deleteContainerContext, clearContainerContext, getContainerContext,
};
