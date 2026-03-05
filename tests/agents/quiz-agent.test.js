/**
 * Tests for AG-011 Quiz Generator agent
 * Agent: agents/quiz-agent.js
 * Exports: { generateQuiz, AGENT_META }
 */

const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../storage', () => ({
  readContainer: jest.fn(),
  addQuiz: jest.fn(),
  updateQuiz: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

jest.mock('../../utils/gather-data', () => ({
  gatherContainerContext: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/inject-tracking', () => ({
  injectTrackingCodes: jest.fn().mockImplementation((html) => html),
}));

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { generateQuiz, AGENT_META } = require('../../agents/quiz-agent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeContainer() {
  return {
    id: 'c-200',
    my_product: { name: 'Quiz Product', url: 'https://example.com' },
    competitors: [],
    scrape_results: [],
    container_context: [],
    settings: {},
  };
}

const AI_RESPONSE = JSON.stringify({
  title: 'Test Quiz',
  html_content: '<html>quiz</html>',
  questions_count: 5,
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

describe('AG-011 Quiz Generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAISuccess();
  });

  // 1. AGENT_META
  test('AGENT_META has correct fields', () => {
    validateAgentMeta(AGENT_META, {
      id: 'quiz',
      code: 'ag0011',
      category: 'generation',
    });
  });

  // 2. Missing container → throws
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generateQuiz('no-such-id')).rejects.toThrow();
  });

  // 3. Creates record, returns it
  test('creates a quiz record and returns it', async () => {
    const container = makeContainer();
    const record = { id: 'quiz-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addQuiz.mockReturnValue(record);

    const result = await generateQuiz('c-200', {});

    expect(storage.addQuiz).toHaveBeenCalledWith('c-200');
    expect(result).toEqual(record);
  });

  // 4. Success → updateQuiz('completed')
  test('updates record to completed on AI success', async () => {
    const container = makeContainer();
    const record = { id: 'quiz-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addQuiz.mockReturnValue(record);

    await generateQuiz('c-200', {});
    await waitForAsync();

    expect(storage.updateQuiz).toHaveBeenCalledWith(
      'c-200',
      'quiz-1',
      'completed',
      expect.objectContaining({})
    );
  });

  // 5. Error → updateQuiz('failed')
  test('updates record to failed on AI error', async () => {
    mockAIFailure();
    const container = makeContainer();
    const record = { id: 'quiz-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addQuiz.mockReturnValue(record);

    await generateQuiz('c-200', {});
    await waitForAsync();

    expect(storage.updateQuiz).toHaveBeenCalledWith(
      'c-200',
      'quiz-1',
      'failed',
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
