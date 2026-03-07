/**
 * Tests for AG-015 Container Chat Agent
 * Path: agents/container-chat-agent.js
 * Exports: { chat, AGENT_META }
 *
 * chat() is synchronous (awaits AI response, returns text directly).
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const { gatherContainerContext, gatherGadsData } = require('../../utils/gather-data');
const Anthropic = require('@anthropic-ai/sdk');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');

// Mock Anthropic client
const mockCreate = jest.fn();
Anthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

const { chat, AGENT_META } = require('../../agents/container-chat-agent');

const MOCK_CONTAINER = {
  id: 'test-container-1',
  my_product: {
    name: 'TestProduct',
    url: 'https://example.com',
    description: 'A test product for unit testing',
  },
  competitors: [
    { id: 'comp1', name: 'Competitor One', url: 'https://comp1.com' },
  ],
  scrape_results: [],
  competitor_analyses: {},
  seo_analyses: {},
  proposals: [],
  generated_prompts: [],
  container_context: [],
  settings: {},
};

beforeEach(() => {
  jest.clearAllMocks();

  storage.readContainer = jest.fn().mockReturnValue(null);

  gatherContainerContext.mockReturnValue([]);
  gatherGadsData.mockReturnValue({ campaigns: [], analysis: {} });

  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'This is the AI response.' }],
  });
});

describe('Container Chat Agent (AG-015)', () => {
  test('AGENT_META passes validation', () => {
    validateAgentMeta(AGENT_META);
    expect(AGENT_META.code).toBe('ag0015');
    expect(AGENT_META.id).toBe('container-chat');
    expect(AGENT_META.category).toBe('chat');
  });

  test('throws when container not found', async () => {
    storage.readContainer.mockReturnValue(null);

    await expect(chat('nonexistent', { message: 'hello' }))
      .rejects.toThrow('Container not found');
  });

  test('returns AI response text on success', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);

    const result = await chat('test-container-1', {
      message: 'What is my product about?',
      history: [],
    });

    expect(result.response).toBe('This is the AI response.');
    expect(result.prompt_sent).toBeDefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('includes product info in system prompt', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);

    await chat('test-container-1', {
      message: 'Tell me about my product',
      history: [],
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system || callArgs.messages[0].content).toBeDefined();

    // The system prompt should reference the product
    const systemContent = typeof callArgs.system === 'string'
      ? callArgs.system
      : Array.isArray(callArgs.system)
        ? callArgs.system.map(s => s.text || s).join(' ')
        : JSON.stringify(callArgs);
    expect(systemContent).toContain('TestProduct');
  });

  test('passes message history correctly', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);

    const history = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
    ];

    await chat('test-container-1', {
      message: 'Follow-up question',
      history,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;

    // Should include history messages plus the new message
    expect(messages.length).toBeGreaterThanOrEqual(3);

    // Last message should be the current user message
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toContain('Follow-up question');
  });

  test('API error propagates directly (no fire-and-forget)', async () => {
    storage.readContainer.mockReturnValue(MOCK_CONTAINER);
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(chat('test-container-1', {
      message: 'hello',
      history: [],
    })).rejects.toThrow('API rate limit exceeded');
  });
});
