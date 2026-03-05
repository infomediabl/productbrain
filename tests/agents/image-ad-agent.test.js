/**
 * Tests for AG-010 Image Ad Curator agent
 * Agent: agents/image-ad-agent.js
 * Exports: { generateImageAds, AGENT_META }
 */

const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../storage', () => ({
  readContainer: jest.fn(),
  addImageAd: jest.fn(),
  updateImageAd: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

jest.mock('../../utils/gather-data', () => ({
  gatherCompetitorAds: jest.fn().mockResolvedValue({ facebook: [], google: [] }),
  gatherCompetitorAnalyses: jest.fn().mockResolvedValue({}),
  gatherContainerContext: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/summarize-ads', () => ({
  summarizeAds: jest.fn().mockReturnValue(''),
}));

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { generateImageAds, AGENT_META } = require('../../agents/image-ad-agent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeContainerWithAds() {
  return {
    id: 'c-100',
    my_product: { name: 'Test Product', url: 'https://example.com' },
    competitors: [{ id: 'comp-1', name: 'Rival', url: 'https://rival.com' }],
    scrape_results: [],
    competitor_analyses: {},
    container_context: [],
    settings: {},
  };
}

const AI_RESPONSE = JSON.stringify({
  selected_ads: [{ rank: 1, ad_reference: 'fb-ad-1', reasoning: 'Strong visual hook' }],
  curation_notes: 'Selected based on engagement potential',
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

describe('AG-010 Image Ad Curator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAISuccess();
  });

  // 1. AGENT_META
  test('AGENT_META has correct fields', () => {
    validateAgentMeta(AGENT_META, {
      id: 'image-ads',
      code: 'ag0010',
      category: 'generation',
    });
  });

  // 2. Missing container → throws
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generateImageAds('no-such-id')).rejects.toThrow();
  });

  // 3. Creates record, returns it
  test('creates an image-ad record and returns it', async () => {
    const container = makeContainerWithAds();
    const record = { id: 'img-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addImageAd.mockReturnValue(record);

    const result = await generateImageAds('c-100', {});

    expect(storage.addImageAd).toHaveBeenCalledWith('c-100');
    expect(result).toEqual(record);
  });

  // 4. Success → updateImageAd('completed')
  test('updates record to completed on AI success', async () => {
    const container = makeContainerWithAds();
    const record = { id: 'img-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addImageAd.mockReturnValue(record);

    await generateImageAds('c-100', {});
    await waitForAsync();

    expect(storage.updateImageAd).toHaveBeenCalledWith(
      'c-100',
      'img-1',
      'completed',
      expect.objectContaining({})
    );
  });

  // 5. Error → updateImageAd('failed')
  test('updates record to failed on AI error', async () => {
    mockAIFailure();
    const container = makeContainerWithAds();
    const record = { id: 'img-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addImageAd.mockReturnValue(record);

    await generateImageAds('c-100', {});
    await waitForAsync();

    expect(storage.updateImageAd).toHaveBeenCalledWith(
      'c-100',
      'img-1',
      'failed',
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
