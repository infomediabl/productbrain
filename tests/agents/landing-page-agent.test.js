/**
 * Tests for AG-012 Landing Page Generator agent
 * Agent: agents/landing-page-agent.js
 * Exports: { generateLandingPage, AGENT_META }
 */

const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../storage', () => ({
  readContainer: jest.fn(),
  addLandingPage: jest.fn(),
  updateLandingPage: jest.fn(),
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
const { generateLandingPage, AGENT_META } = require('../../agents/landing-page-agent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeContainer() {
  return {
    id: 'c-300',
    my_product: { name: 'LP Product', url: 'https://example.com' },
    competitors: [],
    scrape_results: [],
    container_context: [],
    settings: {},
  };
}

const AI_RESPONSE = JSON.stringify({
  page_title: 'Landing Page',
  html_content: '<html>page</html>',
  sections: [],
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

describe('AG-012 Landing Page Generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAISuccess();
  });

  // 1. AGENT_META
  test('AGENT_META has correct fields', () => {
    validateAgentMeta(AGENT_META, {
      id: 'landing-page',
      code: 'ag0012',
      category: 'generation',
    });
  });

  // 2. Missing container → throws
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generateLandingPage('no-such-id')).rejects.toThrow();
  });

  // 3. Creates record, returns it
  test('creates a landing-page record and returns it', async () => {
    const container = makeContainer();
    const record = { id: 'lp-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addLandingPage.mockReturnValue(record);

    const result = await generateLandingPage('c-300', {});

    expect(storage.addLandingPage).toHaveBeenCalledWith('c-300');
    expect(result).toEqual(record);
  });

  // 4. Success → updateLandingPage('completed')
  test('updates record to completed on AI success', async () => {
    const container = makeContainer();
    const record = { id: 'lp-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addLandingPage.mockReturnValue(record);

    await generateLandingPage('c-300', {});
    await waitForAsync();

    expect(storage.updateLandingPage).toHaveBeenCalledWith(
      'c-300',
      'lp-1',
      'completed',
      expect.objectContaining({})
    );
  });

  // 5. Error → updateLandingPage('failed')
  test('updates record to failed on AI error', async () => {
    mockAIFailure();
    const container = makeContainer();
    const record = { id: 'lp-1', status: 'generating' };
    storage.readContainer.mockReturnValue(container);
    storage.addLandingPage.mockReturnValue(record);

    await generateLandingPage('c-300', {});
    await waitForAsync();

    expect(storage.updateLandingPage).toHaveBeenCalledWith(
      'c-300',
      'lp-1',
      'failed',
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
