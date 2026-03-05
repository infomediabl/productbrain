/**
 * Tests for AG-004 SEO Analyzer Agent
 * Agent: agents/seo-agent.js
 * Exports: { analyzeSeo, analyzeOwnSeo, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { gatherCompetitorAds } = require('../../utils/gather-data');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainer } = require('../fixtures/container');
const { analyzeSeo, analyzeOwnSeo, AGENT_META } = require('../../agents/seo-agent');

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      overall_score: 72,
      title_analysis: { score: 80, current: 'My Product', recommendation: 'Add keywords' },
      meta_description: { score: 65, current: 'A great product', recommendation: 'Expand to 155 chars' },
      heading_structure: { score: 70, issues: ['Missing H2 tags'] },
      content_quality: { score: 75, word_count: 1200 },
      technical_seo: { score: 68, issues: ['No sitemap.xml'] },
      recommendations: ['Add structured data', 'Improve page speed'],
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherCompetitorAds.mockReturnValue({ facebook: [], google: [] });

  const container = makeContainer();
  container.my_product = {
    name: 'TestProduct',
    website: 'https://testproduct.com',
    description: 'A product for testing',
  };
  container.competitors = [
    { id: 'comp-1', name: 'Rival Co', website: 'https://rival.co' },
    { id: 'comp-no-site', name: 'No Site Inc' },
  ];
  storage.readContainer.mockReturnValue(container);
  storage.createSeoAnalysis.mockResolvedValue({ id: 'seo-1', status: 'generating' });
  storage.updateSeoAnalysis.mockImplementation(() => {});
  storage.getLatestCompetitorAnalysis.mockReturnValue(null);
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('seo');
    expect(AGENT_META.code).toBe('ag0004');
    expect(AGENT_META.category).toBe('analysis');
  });

  test('has operations defined', () => {
    expect(AGENT_META.operations).toBeDefined();
    expect(Array.isArray(AGENT_META.operations) || typeof AGENT_META.operations === 'object').toBe(true);
  });
});

// ── 2. analyzeSeo — Missing Container ─────────────────────────────────────────
describe('analyzeSeo — missing container', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(analyzeSeo('missing-id', 'comp-1')).rejects.toThrow('Container not found');
  });
});

// ── 3. analyzeSeo — Competitor Not Found ──────────────────────────────────────
describe('analyzeSeo — competitor not found', () => {
  test('throws when competitor ID does not exist', async () => {
    await expect(analyzeSeo('c1', 'nonexistent')).rejects.toThrow('Competitor not found');
  });
});

// ── 4. analyzeSeo — No Website ────────────────────────────────────────────────
describe('analyzeSeo — no website', () => {
  test('throws when competitor has no website', async () => {
    await expect(analyzeSeo('c1', 'comp-no-site')).rejects.toThrow(/website/i);
  });
});

// ── 5. analyzeSeo — Creates Analysis ──────────────────────────────────────────
describe('analyzeSeo — record creation', () => {
  test('creates seo analysis record and returns it', async () => {
    const result = await analyzeSeo('c1', 'comp-1');
    expect(storage.createSeoAnalysis).toHaveBeenCalledWith('c1', 'comp-1', 'competitor');
    expect(result).toEqual({ id: 'seo-1', status: 'generating' });
  });

  test('calls AI after async resolution', async () => {
    await analyzeSeo('c1', 'comp-1');
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(storage.updateSeoAnalysis).toHaveBeenCalledWith(
      'c1',
      'comp-1',
      'seo-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
      })
    );
  });
});

// ── 6. analyzeOwnSeo — No Product Website ─────────────────────────────────────
describe('analyzeOwnSeo — no product website', () => {
  test('throws when product has no website', async () => {
    const container = makeContainer();
    container.my_product = { name: 'TestProduct', description: 'No website here' };
    storage.readContainer.mockReturnValue(container);

    await expect(analyzeOwnSeo('c1')).rejects.toThrow(/website/i);
  });
});

// ── 7. analyzeOwnSeo — Creates Analysis ───────────────────────────────────────
describe('analyzeOwnSeo — record creation', () => {
  test('creates own-product seo analysis and returns it', async () => {
    const result = await analyzeOwnSeo('c1');
    expect(storage.createSeoAnalysis).toHaveBeenCalledWith('c1', '_own_product', 'own_product');
    expect(result).toEqual({ id: 'seo-1', status: 'generating' });
  });

  test('calls AI and updates storage on success', async () => {
    await analyzeOwnSeo('c1');
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(storage.updateSeoAnalysis).toHaveBeenCalledWith(
      'c1',
      '_own_product',
      'seo-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
      })
    );
  });
});
