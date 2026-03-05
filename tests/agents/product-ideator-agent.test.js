/**
 * Tests for AG-007 Product Ideator Agent
 * Agent: agents/product-ideator-agent.js
 * Exports: { ideateProduct, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const {
  gatherScrapeData,
  gatherCompetitorAnalyses,
  gatherContainerContext,
} = require('../../utils/gather-data');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainerWithAds } = require('../fixtures/container');
const { ideateProduct, AGENT_META } = require('../../agents/product-ideator-agent');

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      product_ideas: [
        {
          idea_name: 'AI Writing Assistant',
          description: 'An AI-powered tool that helps marketers write ad copy.',
          target_market: 'Digital marketers',
          revenue_model: 'SaaS subscription',
          competitive_advantage: 'Trained on winning ad data',
          estimated_effort: 'Medium',
          potential_score: 8,
        },
      ],
      market_gaps: ['No affordable AI ad-copy tool for SMBs'],
      methodology: 'Analyzed competitor positioning and scraped ad patterns.',
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherScrapeData.mockReturnValue({ 'comp-1': { facebook: [{ headline: 'Ad' }], google: [] } });
  gatherCompetitorAnalyses.mockReturnValue({});
  gatherContainerContext.mockReturnValue([]);

  const container = makeContainerWithAds();
  container.competitors = [
    { id: 'comp-1', name: 'Acme Corp' },
  ];
  storage.readContainer.mockReturnValue(container);
  storage.addProductIdea.mockResolvedValue({ id: 'idea-1', status: 'generating' });
  storage.updateProductIdea.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('product-ideator');
    expect(AGENT_META.code).toBe('ag0007');
    expect(AGENT_META.category).toBe('generation');
  });
});

// ── 2. Missing Container ──────────────────────────────────────────────────────
describe('Missing container', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(ideateProduct('missing-id', {})).rejects.toThrow('Container not found');
  });
});

// ── 3. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('creates product idea record and returns it immediately', async () => {
    const result = await ideateProduct('c1', {});
    expect(storage.addProductIdea).toHaveBeenCalledWith('c1');
    expect(result).toEqual({ id: 'idea-1', status: 'generating' });
  });

  test('returns record without waiting for AI', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));
    const result = await ideateProduct('c1', { userPrompt: 'Focus on SaaS' });
    expect(result.id).toBe('idea-1');
    expect(result.status).toBe('generating');
  });
});

// ── 4. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('gathers data and updates storage with completed status', async () => {
    await ideateProduct('c1', { userPrompt: 'Explore B2B ideas' });
    await waitForAsync();

    expect(gatherScrapeData).toHaveBeenCalled();
    expect(gatherCompetitorAnalyses).toHaveBeenCalled();
    expect(gatherContainerContext).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(storage.updateProductIdea).toHaveBeenCalledWith(
      'c1',
      'idea-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
        json_data: expect.objectContaining({
          product_ideas: expect.arrayContaining([
            expect.objectContaining({
              idea_name: 'AI Writing Assistant',
            }),
          ]),
        }),
        generated_at: expect.any(String),
      })
    );
  });

  test('passes userPrompt into AI message', async () => {
    await ideateProduct('c1', { userPrompt: 'Focus on health niche' });
    await waitForAsync();

    const callArgs = mockCreate.mock.calls[0][0];
    const messageContent = JSON.stringify(callArgs.messages);
    expect(messageContent).toContain('health niche');
  });
});

// ── 5. Error Path ─────────────────────────────────────────────────────────────
describe('Error path', () => {
  test('updates storage with failed status when AI rejects', async () => {
    mockCreate.mockRejectedValue(new Error('Model overloaded'));

    await ideateProduct('c1', {});
    await waitForAsync();

    expect(storage.updateProductIdea).toHaveBeenCalledWith(
      'c1',
      'idea-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('Model overloaded'),
      })
    );
  });
});
