/**
 * Tests for AG-017 ResearchWeb Agent
 * Path: agents/research-web-agent.js
 * Exports: { searchWeb, summarizeSources, AGENT_META }
 *
 * Uses global storage (addResearchWeb, updateResearchWeb, getResearchWeb).
 * Uses Anthropic beta web-search tool.
 */

jest.mock('../../storage');
jest.mock('../../scrapers/browser', () => ({
  getBrowser: jest.fn(),
}));
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// Mock Anthropic client
const mockCreate = jest.fn();
Anthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

const { searchWeb, summarizeSources, AGENT_META } = require('../../agents/research-web-agent');

const MOCK_RESEARCH_RECORD = {
  id: 'research-001',
  topic: 'AI trends 2026',
  status: 'searching',
  created_at: new Date().toISOString(),
  sources: [],
};

beforeEach(() => {
  jest.clearAllMocks();

  storage.addResearchWeb = jest.fn().mockResolvedValue(MOCK_RESEARCH_RECORD);
  storage.updateResearchWeb = jest.fn();
  storage.getResearchWeb = jest.fn().mockReturnValue(null);

  mockCreate.mockResolvedValue({
    content: [
      { type: 'text', text: 'Here are the search results about AI trends in 2026.' },
    ],
  });
});

describe('ResearchWeb Agent (AG-017)', () => {
  test('AGENT_META passes validation', () => {
    validateAgentMeta(AGENT_META);
    expect(AGENT_META.code).toBe('ag0017');
    expect(AGENT_META.id).toBe('research-web');
    expect(AGENT_META.category).toBe('research');
  });

  test('searchWeb creates record and returns it', async () => {
    const result = await searchWeb('AI trends 2026');

    expect(storage.addResearchWeb).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(result.id).toBe('research-001');
    expect(result.status).toBe('searching');
  });

  test('searchWeb — AI search completes and updates record', async () => {
    const result = await searchWeb('AI trends 2026');

    // Wait for the fire-and-forget async search to complete
    await waitForAsync(200);

    // Storage should have been updated
    expect(storage.updateResearchWeb).toHaveBeenCalled();
    const updateCalls = storage.updateResearchWeb.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('summarizeSources throws if research not found', async () => {
    storage.getResearchWeb.mockReturnValue(null);

    await expect(summarizeSources('nonexistent', ['src-1']))
      .rejects.toThrow();
  });

  test('summarizeSources returns summarizing status', async () => {
    const mockResearch = {
      id: 'research-001',
      topic: 'AI trends 2026',
      status: 'completed',
      result: {
        sources: [
          { id: 'src-1', url: 'https://example.com/article', title: 'AI Article', snippet: 'About AI' },
          { id: 'src-2', url: 'https://example.com/blog', title: 'Blog Post', snippet: 'Tech blog' },
        ],
      },
    };
    storage.getResearchWeb.mockReturnValue(mockResearch);

    const result = await summarizeSources('research-001', ['src-1', 'src-2']);

    expect(result).toBeDefined();
    expect(result.research_id || result.id).toBeDefined();
    expect(result.status).toBe('summarizing');
  });
});
