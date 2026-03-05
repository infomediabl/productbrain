/**
 * Tests for AG-018 Taboola Agent
 * Path: agents/taboola-agent.js
 * Exports: { previewCopy, launchPreview, cloneToCampaign, AGENT_META }
 *
 * Uses storage, Anthropic, gather-data, taboola-auth, and global.fetch.
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('../../utils/taboola-auth', () => ({
  getTaboolaToken: jest.fn().mockResolvedValue('mock-token'),
}));
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const { gatherContainerContext } = require('../../utils/gather-data');
const Anthropic = require('@anthropic-ai/sdk');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');

// Mock Anthropic client
const mockCreate = jest.fn();
Anthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

const { previewCopy, launchPreview, AGENT_META } = require('../../agents/taboola-agent');

const MOCK_CONTAINER = {
  id: 'test-container-1',
  my_product: { name: 'TestProduct', url: 'https://example.com' },
  competitors: [],
  scrape_results: [],
  container_context: [],
  settings: {
    taboola: { client_id: 'tid', client_secret: 'tsecret', account_id: 'tacct' },
  },
  taboola_campaigns: [],
};

const MOCK_CAMPAIGN = {
  id: 'camp-001',
  created_at: new Date().toISOString(),
  status: 'generating',
};

beforeEach(() => {
  jest.clearAllMocks();

  storage.readContainer = jest.fn().mockReturnValue(null);
  storage.addTaboolaCampaign = jest.fn().mockReturnValue(null);
  storage.updateTaboolaCampaign = jest.fn();
  storage.getTaboolaCampaign = jest.fn().mockReturnValue(null);

  gatherContainerContext.mockReturnValue([]);

  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: '```json\n{"campaign_name":"Test Campaign","items":[{"title":"Test Title","description":"Test Desc","url":"https://example.com"}]}\n```' }],
  });

  // Mock global fetch for Taboola API calls
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: 'taboola-campaign-123', status: 'RUNNING' }),
  });
});

afterEach(() => {
  delete global.fetch;
});

describe('Taboola Agent (AG-018)', () => {
  test('AGENT_META passes validation', () => {
    validateAgentMeta(AGENT_META);
    expect(AGENT_META.code).toBe('ag0018');
    expect(AGENT_META.id).toBe('taboola');
    expect(AGENT_META.category).toBe('generation');
  });

  test('previewCopy throws when container not found', async () => {
    storage.readContainer.mockReturnValue(null);

    await expect(previewCopy('nonexistent', { source_ad_ids: ['ad1'] }))
      .rejects.toThrow(/[Cc]ontainer not found/);
  });

  test('previewCopy creates campaign record and returns it', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);
    storage.addTaboolaCampaign.mockReturnValue(MOCK_CAMPAIGN);

    const result = await previewCopy('test-container-1', {
      source_ad_ids: ['scrape1:facebook:comp1:0'],
    });

    expect(storage.addTaboolaCampaign).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(result.id).toBe('camp-001');
  });

  test('launchPreview throws if campaign not found', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);
    storage.getTaboolaCampaign.mockReturnValue(null);

    await expect(launchPreview('test-container-1', 'nonexistent', []))
      .rejects.toThrow();
  });

  test('launchPreview throws if campaign status is not preview', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);
    storage.getTaboolaCampaign.mockReturnValue({
      id: 'camp-001',
      status: 'completed',
      result: { items: [] },
    });

    await expect(launchPreview('test-container-1', 'camp-001', []))
      .rejects.toThrow(/preview/i);
  });
});
