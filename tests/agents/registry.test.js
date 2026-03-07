/**
 * Tests for agents/registry.js
 *
 * The registry imports all 21 agents at module load time and exposes:
 *   - getAgent(id) -> { meta, run } | { meta, operations } | null
 *   - listAgents() -> array of 21 agent descriptors
 *   - getDependencyGraph() -> object keyed by agent id
 */

// --- Module mocks (must be declared before require) ---

jest.mock('../../storage', () => {
  const fns = {};
  const syncFns = [
    'readContainer', 'listContainers', 'createContainer', 'deleteContainer',
    'getScrapeResult', 'getCompetitorAnalysis', 'getLatestCompetitorAnalysis', 'getSeoAnalysis',
    'getLatestSeoAnalysis', 'getProposal', 'getGeneratedPrompt', 'getProductIdea',
    'getKeywordStrategy', 'getTestPlan', 'getLandingPage', 'getImageAd', 'getSettings',
    'getQuiz', 'getGadsAnalysis', 'getKeywordIdeas', 'getCaseStudy', 'getContainerContext',
    'getResearchWeb', 'getTaboolaCampaign', 'getSpinoffIdea', 'getHooksResult',
    'getKnownAdIds', 'listAutoScrapeContainers', 'listResearchWeb', 'getScrapeValidation',
    'getAnalysis', 'getValidation', 'getProjectOverview', 'getDataFeed', 'getQuestion',
  ];
  const asyncFns = [
    'updateContainer', 'addMetadata', 'updateMetadata', 'deleteMetadata',
    'createScrapeResult', 'updateScrapeStatus', 'addScrapeData', 'updateScrapeOcrData',
    'updateScrapeNewAdsCount', 'updateScrapeValidation',
    'createCompetitorAnalysis', 'updateCompetitorAnalysis',
    'createSeoAnalysis', 'updateSeoAnalysis',
    'addProposal', 'updateProposal', 'addGeneratedPrompt', 'updateGeneratedPrompt',
    'addProductIdea', 'updateProductIdea', 'acceptProductIdea',
    'addKeywordStrategy', 'updateKeywordStrategy',
    'addTestPlan', 'updateTestPlan', 'addLandingPage', 'updateLandingPage',
    'addImageAd', 'updateImageAd', 'updateSettings',
    'addQuiz', 'updateQuiz', 'addGadsAnalysis', 'updateGadsAnalysis', 'updateGadsAnalysisMeta',
    'addKeywordIdeas', 'updateKeywordIdeas',
    'addCaseStudy', 'updateCaseStudy', 'deleteCaseStudy',
    'addContainerContext', 'deleteContainerContext', 'clearContainerContext',
    'createAnalysis', 'updateAnalysisStatus', 'addScrapedData',
    'addResearchWeb', 'updateResearchWeb', 'deleteResearchWeb',
    'addTaboolaCampaign', 'updateTaboolaCampaign',
    'addSpinoffIdea', 'updateSpinoffIdea',
    'addHooksResult', 'updateHooksResult',
    'addValidation', 'updateValidation', 'deleteValidation',
    'setProjectOverview', 'updateProjectOverview',
    'addDataFeed', 'updateDataFeed', 'deleteDataFeed',
    'addQuestion', 'updateQuestion',
  ];
  for (const fn of syncFns) fns[fn] = jest.fn().mockReturnValue(null);
  for (const fn of asyncFns) fns[fn] = jest.fn().mockResolvedValue(null);
  return fns;
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      }),
    },
  }));
});

jest.mock('../../scrapers/browser', () => ({
  getBrowser: jest.fn(),
  closeBrowser: jest.fn(),
}));
jest.mock('../../scrapers/facebookAdsLibrary', () => ({ scrapeFacebookAds: jest.fn().mockResolvedValue([]) }));
jest.mock('../../scrapers/googleAdsTransparency', () => ({ scrapeGoogleAds: jest.fn().mockResolvedValue([]) }));

jest.mock('../../utils/taboola-auth', () => ({
  getTaboolaToken: jest.fn().mockResolvedValue('mock-token'),
}));

// --- Require after mocks ---

const { getAgent, listAgents, getDependencyGraph } = require('../../agents/registry');

// All 21 expected agent IDs
const EXPECTED_IDS = [
  'scraper', 'scrape-validator', 'analyzer', 'seo', 'proposal',
  'prompt-generator', 'product-ideator', 'keyword-ideator', 'google-ads',
  'image-ads', 'quiz', 'landing-page', 'test-planner', 'case-study',
  'container-chat', 'desire-spring', 'research-web', 'taboola',
  'spinoff-ideas', 'folder-scraper', 'hooks', 'content-validator',
  'project-overview', 'data-feed', 'questions',
];

// Multi-operation agents (they expose operations instead of a single run)
const MULTI_OP_IDS = ['google-ads', 'seo'];

describe('agents/registry', () => {
  // ---------------------------------------------------------------
  // listAgents
  // ---------------------------------------------------------------
  describe('listAgents()', () => {
    it('returns exactly 22 agents', () => {
      const agents = listAgents();
      expect(agents).toHaveLength(25);
    });

    it('every agent has a unique id', () => {
      const agents = listAgents();
      const ids = agents.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every agent has a unique code', () => {
      const agents = listAgents();
      const codes = agents.map((a) => a.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('all codes match /^ag\\d{4}$/', () => {
      const agents = listAgents();
      for (const agent of agents) {
        expect(agent.code).toMatch(/^ag\d{4}$/);
      }
    });

    it('codes span ag0001 through ag0022', () => {
      const agents = listAgents();
      const codes = agents.map((a) => a.code).sort();
      expect(codes[0]).toBe('ag0001');
      expect(codes[codes.length - 1]).toBe('ag0025');
    });

    it('contains all expected agent IDs', () => {
      const agents = listAgents();
      const ids = agents.map((a) => a.id);
      for (const expectedId of EXPECTED_IDS) {
        expect(ids).toContain(expectedId);
      }
    });
  });

  // ---------------------------------------------------------------
  // getAgent
  // ---------------------------------------------------------------
  describe('getAgent(id)', () => {
    it('returns null for an unknown id', () => {
      expect(getAgent('unknown')).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(getAgent(undefined)).toBeNull();
    });

    it('returns { meta, run } for standard (single-operation) agents', () => {
      const standardIds = EXPECTED_IDS.filter((id) => !MULTI_OP_IDS.includes(id));
      for (const id of standardIds) {
        const agent = getAgent(id);
        expect(agent).not.toBeNull();
        expect(agent).toHaveProperty('meta');
        expect(agent).toHaveProperty('run');
        // run may be null if the agent doesn't export a `run` function
        // (most agents export named functions instead)
        expect(agent.run === null || typeof agent.run === 'function').toBe(true);
        expect(agent.meta).toHaveProperty('id', id);
      }
    });

    it('returns { meta, operations } for multi-operation agents (google-ads, seo)', () => {
      for (const id of MULTI_OP_IDS) {
        const agent = getAgent(id);
        expect(agent).not.toBeNull();
        expect(agent).toHaveProperty('meta');
        expect(agent).toHaveProperty('operations');
        expect(typeof agent.operations).toBe('object');
        expect(agent.meta).toHaveProperty('id', id);
      }
    });

    it('meta object contains required fields for every agent', () => {
      for (const id of EXPECTED_IDS) {
        const agent = getAgent(id);
        expect(agent.meta).toHaveProperty('id');
        expect(agent.meta).toHaveProperty('name');
        expect(agent.meta).toHaveProperty('code');
        expect(agent.meta).toHaveProperty('description');
        expect(agent.meta).toHaveProperty('category');
      }
    });
  });

  // ---------------------------------------------------------------
  // getDependencyGraph
  // ---------------------------------------------------------------
  describe('getDependencyGraph()', () => {
    it('returns an object', () => {
      const graph = getDependencyGraph();
      expect(typeof graph).toBe('object');
      expect(graph).not.toBeNull();
    });

    it('has all agent ids as keys', () => {
      const graph = getDependencyGraph();
      const keys = Object.keys(graph);
      for (const id of EXPECTED_IDS) {
        expect(keys).toContain(id);
      }
    });

    it('each value is an array', () => {
      const graph = getDependencyGraph();
      for (const id of EXPECTED_IDS) {
        expect(Array.isArray(graph[id])).toBe(true);
      }
    });
  });
});
