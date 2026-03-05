/**
 * Tests for AG-003 Scraped Ads Analyzer Agent
 * Agent: agents/analyzer-agent.js
 * Exports: { analyzeCompetitor, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('../../utils/summarize-ads');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { gatherCompetitorAds } = require('../../utils/gather-data');
const { summarizeAds } = require('../../utils/summarize-ads');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainer, makeContainerWithAds } = require('../fixtures/container');
const { analyzeCompetitor, AGENT_META } = require('../../agents/analyzer-agent');

const fakeFbAd = {
  ad_url: 'https://facebook.com/ad/123',
  image_url: 'https://example.com/img.jpg',
  headline: 'Buy Now',
  description: 'Great product for you',
};

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      competitor_name: 'Acme Corp',
      overall_strategy: 'Aggressive direct response approach.',
      ad_formats: ['image', 'carousel'],
      messaging_themes: ['urgency', 'social proof'],
      strengths: ['Strong CTAs'],
      weaknesses: ['No video content'],
      recommendations: ['Test video ads'],
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherCompetitorAds.mockReturnValue({ facebook: [fakeFbAd], google: [] });
  summarizeAds.mockReturnValue('Ad summary text');

  const container = makeContainerWithAds();
  container.competitors = [
    { id: 'comp-1', name: 'Acme Corp', website: 'https://acme.com' },
    { id: 'comp-2', name: 'Beta Inc', website: 'https://beta.com' },
  ];
  storage.readContainer.mockReturnValue(container);
  storage.createCompetitorAnalysis.mockResolvedValue({ id: 'analysis-1', status: 'generating' });
  storage.updateCompetitorAnalysis.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('analyzer');
    expect(AGENT_META.code).toBe('ag0003');
    expect(AGENT_META.category).toBe('analysis');
  });
});

// ── 2. Missing Container ──────────────────────────────────────────────────────
describe('Missing container', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(analyzeCompetitor('missing-id', 'comp-1')).rejects.toThrow('Container not found');
  });
});

// ── 3. Missing Competitor ─────────────────────────────────────────────────────
describe('Missing competitor', () => {
  test('throws when competitor ID does not match', async () => {
    await expect(analyzeCompetitor('c1', 'nonexistent-comp')).rejects.toThrow('Competitor not found');
  });
});

// ── 4. No Ads ─────────────────────────────────────────────────────────────────
describe('No ads for competitor', () => {
  test('throws when gatherCompetitorAds returns empty arrays', async () => {
    gatherCompetitorAds.mockReturnValue({ facebook: [], google: [] });
    await expect(analyzeCompetitor('c1', 'comp-1')).rejects.toThrow('No scraped data found');
  });
});

// ── 5. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('creates analysis record and returns it immediately', async () => {
    const result = await analyzeCompetitor('c1', 'comp-1');
    expect(storage.createCompetitorAnalysis).toHaveBeenCalledWith('c1', 'comp-1');
    expect(result).toEqual({ id: 'analysis-1', status: 'generating' });
  });
});

// ── 6. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('updates storage with completed status after AI finishes', async () => {
    await analyzeCompetitor('c1', 'comp-1');
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(summarizeAds).toHaveBeenCalled();
    expect(storage.updateCompetitorAnalysis).toHaveBeenCalledWith(
      'c1',
      'comp-1',
      'analysis-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
      })
    );
  });
});

// ── 7. Error Path ─────────────────────────────────────────────────────────────
describe('Error path', () => {
  test('updates storage with failed status when AI rejects', async () => {
    mockCreate.mockRejectedValue(new Error('Service unavailable'));

    await analyzeCompetitor('c1', 'comp-1');
    await waitForAsync();

    expect(storage.updateCompetitorAnalysis).toHaveBeenCalledWith(
      'c1',
      'comp-1',
      'analysis-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('Service unavailable'),
      })
    );
  });
});
