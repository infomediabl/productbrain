/**
 * Tests for AG-008 Keyword Strategist Agent
 * Agent: agents/keyword-ideator-agent.js
 * Exports: { generateKeywordStrategy, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { gatherGadsData, gatherContainerContext } = require('../../utils/gather-data');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainer } = require('../fixtures/container');
const { generateKeywordStrategy, AGENT_META } = require('../../agents/keyword-ideator-agent');

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      keyword_groups: [
        {
          group_name: 'Brand Keywords',
          keywords: ['test product', 'test product review', 'buy test product'],
          intent: 'navigational',
          priority: 'high',
          estimated_volume: 5000,
          competition: 'medium',
        },
        {
          group_name: 'Problem Keywords',
          keywords: ['how to solve X', 'best solution for X'],
          intent: 'informational',
          priority: 'medium',
          estimated_volume: 12000,
          competition: 'low',
        },
      ],
      strategy_summary: 'Focus on brand and problem-aware keywords for initial traction.',
      content_recommendations: ['Create comparison landing pages', 'Build FAQ content'],
      budget_allocation: { brand: '30%', problem: '40%', competitor: '30%' },
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherGadsData.mockReturnValue({ campaigns: [], analysis: {} });
  gatherContainerContext.mockReturnValue([]);

  const container = makeContainer();
  container.my_product = {
    name: 'TestProduct',
    website: 'https://testproduct.com',
    description: 'A testing tool for marketers',
  };
  storage.readContainer.mockReturnValue(container);
  storage.addKeywordStrategy.mockResolvedValue({ id: 'kw-1', status: 'generating' });
  storage.updateKeywordStrategy.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('keyword-ideator');
    expect(AGENT_META.code).toBe('ag0008');
    expect(AGENT_META.category).toBe('generation');
  });
});

// ── 2. Missing Container ──────────────────────────────────────────────────────
describe('Missing container', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generateKeywordStrategy('missing-id')).rejects.toThrow('Container not found');
  });
});

// ── 3. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('creates keyword strategy record and returns it immediately', async () => {
    const result = await generateKeywordStrategy('c1');
    expect(storage.addKeywordStrategy).toHaveBeenCalledWith('c1');
    expect(result).toEqual({ id: 'kw-1', status: 'generating' });
  });

  test('returns record without waiting for AI completion', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));
    const result = await generateKeywordStrategy('c1', { userPrompt: 'Focus on long-tail' });
    expect(result.id).toBe('kw-1');
    expect(result.status).toBe('generating');
  });
});

// ── 4. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('calls AI and updates storage with completed status', async () => {
    await generateKeywordStrategy('c1', { userPrompt: 'Target B2B' });
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(storage.updateKeywordStrategy).toHaveBeenCalledWith(
      'c1',
      'kw-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
        json_data: expect.objectContaining({
          keyword_groups: expect.arrayContaining([
            expect.objectContaining({
              group_name: 'Brand Keywords',
            }),
          ]),
        }),
        generated_at: expect.any(String),
        options_used: expect.any(Object),
      })
    );
  });

  test('gathers context data before calling AI', async () => {
    await generateKeywordStrategy('c1');
    await waitForAsync();

    expect(gatherContainerContext).toHaveBeenCalled();
  });
});

// ── 5. Error Path ─────────────────────────────────────────────────────────────
describe('Error path', () => {
  test('updates storage with failed status when AI call fails', async () => {
    mockCreate.mockRejectedValue(new Error('Context window exceeded'));

    await generateKeywordStrategy('c1');
    await waitForAsync();

    expect(storage.updateKeywordStrategy).toHaveBeenCalledWith(
      'c1',
      'kw-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('Context window exceeded'),
      })
    );
  });
});
