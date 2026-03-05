/**
 * Tests for AG-019 SpinOff Ideas agent
 * Agent: agents/spinoff-ideas-agent.js
 * Exports: { generateSpinoffIdeas, AGENT_META }
 */

const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../storage', () => ({
  readContainer: jest.fn(),
  addSpinoffIdea: jest.fn(),
  updateSpinoffIdea: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

jest.mock('../../utils/gather-data', () => ({
  gatherScrapeData: jest.fn().mockResolvedValue({}),
  gatherCompetitorAnalyses: jest.fn().mockResolvedValue({}),
  gatherContainerContext: jest.fn().mockResolvedValue([]),
}));

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { generateSpinoffIdeas, AGENT_META } = require('../../agents/spinoff-ideas-agent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeContainerWithAds() {
  return {
    id: 'c-600',
    my_product: { name: 'SpinOff Product', url: 'https://example.com' },
    competitors: [{ id: 'comp-1', name: 'Rival', url: 'https://rival.com' }],
    scrape_results: [
      {
        id: 'scrape-1',
        status: 'completed',
        scraped_data: {
          my_product: { facebook: [], google: [] },
          competitors: { 'comp-1': { facebook: [], google: [] } },
        },
      },
    ],
    competitor_analyses: {},
    seo_analyses: {},
    container_context: [],
    settings: {},
  };
}

const AI_RESPONSE = JSON.stringify({
  landscape_summary: 'Test landscape overview',
  spinoff_ideas: [{ name: 'Idea 1', description: 'Test idea for a new product angle' }],
});

function mockAISuccess() {
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: AI_RESPONSE }],
      }),
    },
  }));
}

function mockAIFailure() {
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockRejectedValue(new Error('AI service unavailable')),
    },
  }));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AG-019 SpinOff Ideas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAISuccess();
  });

  // 1. AGENT_META
  test('AGENT_META has correct fields', () => {
    validateAgentMeta(AGENT_META, {
      id: 'spinoff-ideas',
      code: 'ag0019',
      category: 'generation',
    });
  });

  // 2. Missing container → throws
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(
      generateSpinoffIdeas('no-such-id', { competitorIds: ['comp-1'] })
    ).rejects.toThrow();
  });

  // 3. Creates record, returns it
  test('creates a spinoff-idea record and returns it', async () => {
    const container = makeContainerWithAds();
    const record = { id: 'spin-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addSpinoffIdea.mockReturnValue(record);

    const result = await generateSpinoffIdeas('c-600', {
      competitorIds: ['comp-1'],
      includeContext: true,
      userPrompt: 'Focus on health niche',
    });

    expect(storage.addSpinoffIdea).toHaveBeenCalledWith('c-600');
    expect(result).toEqual(record);
  });

  // 4. Success → updateSpinoffIdea('completed')
  test('updates record to completed on AI success', async () => {
    const container = makeContainerWithAds();
    const record = { id: 'spin-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addSpinoffIdea.mockReturnValue(record);

    await generateSpinoffIdeas('c-600', {
      competitorIds: ['comp-1'],
      includeContext: true,
    });
    await waitForAsync();

    expect(storage.updateSpinoffIdea).toHaveBeenCalledWith(
      'c-600',
      'spin-1',
      'completed',
      expect.objectContaining({})
    );
  });

  // 5. Error → updateSpinoffIdea('failed')
  test('updates record to failed on AI error', async () => {
    mockAIFailure();
    const container = makeContainerWithAds();
    const record = { id: 'spin-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addSpinoffIdea.mockReturnValue(record);

    await generateSpinoffIdeas('c-600', {
      competitorIds: ['comp-1'],
    });
    await waitForAsync();

    expect(storage.updateSpinoffIdea).toHaveBeenCalledWith(
      'c-600',
      'spin-1',
      'failed',
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
