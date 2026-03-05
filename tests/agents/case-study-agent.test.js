/**
 * Tests for AG-014 Case Study Analyzer agent
 * Agent: agents/case-study-agent.js
 * Exports: { analyzeCaseStudy, AGENT_META }
 */

const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../storage', () => ({
  readContainer: jest.fn(),
  addCaseStudy: jest.fn(),
  updateCaseStudy: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { analyzeCaseStudy, AGENT_META } = require('../../agents/case-study-agent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeContainer() {
  return {
    id: 'c-500',
    my_product: { name: 'Case Study Product', url: 'https://example.com' },
    competitors: [],
    scrape_results: [],
    container_context: [],
    settings: {},
  };
}

const AI_RESPONSE = JSON.stringify({
  title: 'Case Study',
  summary: 'Test summary',
  metrics: [],
  strategies: [],
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

describe('AG-014 Case Study Analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAISuccess();
  });

  // 1. AGENT_META
  test('AGENT_META has correct fields', () => {
    validateAgentMeta(AGENT_META, {
      id: 'case-study',
      code: 'ag0014',
      category: 'analysis',
    });
  });

  // 2. Missing container → throws
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(
      analyzeCaseStudy('no-such-id', { source_type: 'txt', content: 'test' })
    ).rejects.toThrow();
  });

  // 3. Creates record, returns it
  test('creates a case-study record and returns it', async () => {
    const container = makeContainer();
    const record = { id: 'study-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addCaseStudy.mockResolvedValue(record);

    const options = { source_type: 'txt', content: Buffer.from('This is a case study about growth hacking.').toString('base64') };
    const result = await analyzeCaseStudy('c-500', options);

    expect(storage.addCaseStudy).toHaveBeenCalledWith(
      'c-500',
      expect.objectContaining({ source_type: 'txt' })
    );
    expect(result).toEqual(record);
  });

  // 4. Success with text input → updateCaseStudy('completed')
  test('updates record to completed on AI success with text input', async () => {
    const container = makeContainer();
    const record = { id: 'study-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addCaseStudy.mockResolvedValue(record);

    const options = { source_type: 'txt', content: Buffer.from('A detailed case study about marketing strategies and their impact on revenue growth over 12 months.').toString('base64') };
    await analyzeCaseStudy('c-500', options);
    await waitForAsync();

    expect(storage.updateCaseStudy).toHaveBeenCalledWith(
      'c-500',
      'study-1',
      'completed',
      expect.objectContaining({})
    );
  });

  // 5. Error → updateCaseStudy('failed')
  test('updates record to failed on AI error', async () => {
    mockAIFailure();
    const container = makeContainer();
    const record = { id: 'study-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addCaseStudy.mockResolvedValue(record);

    const options = { source_type: 'txt', content: Buffer.from('Some case study content about marketing that is detailed enough to analyze.').toString('base64') };
    await analyzeCaseStudy('c-500', options);
    await waitForAsync();

    expect(storage.updateCaseStudy).toHaveBeenCalledWith(
      'c-500',
      'study-1',
      'failed',
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
