/**
 * Tests for AG-013 RPS Test Ideator agent
 * Agent: agents/test-planner-agent.js
 * Exports: { generateTestPlan, AGENT_META }
 */

const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../storage', () => ({
  readContainer: jest.fn(),
  addTestPlan: jest.fn(),
  updateTestPlan: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

jest.mock('../../utils/gather-data', () => ({
  gatherGadsData: jest.fn().mockReturnValue({ campaigns: [], analysis: {} }),
  gatherContainerContext: jest.fn().mockReturnValue([]),
}));

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { generateTestPlan, AGENT_META } = require('../../agents/test-planner-agent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeContainerWithAds() {
  return {
    id: 'c-400',
    my_product: { name: 'Test Planner Product', url: 'https://example.com' },
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
    gads_analyses: [],
    container_context: [],
    settings: {},
  };
}

const AI_RESPONSE = JSON.stringify({
  knowns: [{ label: 'Strong CTA works', source: 'data' }],
  unknowns: [{ label: 'Optimal audience' }],
  test_ideas: [{ name: 'CTA Test' }],
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

describe('AG-013 RPS Test Ideator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAISuccess();
  });

  // 1. AGENT_META
  test('AGENT_META has correct fields', () => {
    validateAgentMeta(AGENT_META, {
      id: 'test-planner',
      code: 'ag0013',
      category: 'generation',
    });
  });

  // 2. Missing container → throws
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generateTestPlan('no-such-id')).rejects.toThrow();
  });

  // 3. Creates record, returns it
  test('creates a test-plan record and returns it', async () => {
    const container = makeContainerWithAds();
    const record = { id: 'plan-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addTestPlan.mockResolvedValue(record);

    const result = await generateTestPlan('c-400', {});

    expect(storage.addTestPlan).toHaveBeenCalledWith('c-400');
    expect(result).toEqual(record);
  });

  // 4. Success → updateTestPlan('completed')
  test('updates record to completed on AI success', async () => {
    const container = makeContainerWithAds();
    const record = { id: 'plan-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addTestPlan.mockResolvedValue(record);

    await generateTestPlan('c-400', {});
    await waitForAsync();

    expect(storage.updateTestPlan).toHaveBeenCalledWith(
      'c-400',
      'plan-1',
      'completed',
      expect.objectContaining({})
    );
  });

  // 5. Error → updateTestPlan('failed')
  test('updates record to failed on AI error', async () => {
    mockAIFailure();
    const container = makeContainerWithAds();
    const record = { id: 'plan-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addTestPlan.mockResolvedValue(record);

    await generateTestPlan('c-400', {});
    await waitForAsync();

    expect(storage.updateTestPlan).toHaveBeenCalledWith(
      'c-400',
      'plan-1',
      'failed',
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
