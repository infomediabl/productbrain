/**
 * Tests for AG-020 Hooks Generator Agent
 * Agent: agents/hooks-agent.js
 * Exports: { generateHooks, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { gatherContainerContext } = require('../../utils/gather-data');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainer, makeContainerWithAds } = require('../fixtures/container');
const { generateHooks, AGENT_META } = require('../../agents/hooks-agent');

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      hooks: [
        {
          id: 'h1',
          angle_name: 'Fear of Missing Out',
          hook_text: 'Stop losing customers to competitors who already use this.',
          emotion: 'urgency',
          angle_type: 'pain',
          target_segment: 'small business owners',
          inspired_by: 'Competitor FB ad #3',
          rationale: 'Leverages competitive anxiety common in SMBs.',
          adapted_for_product: 'Positions our tool as the industry standard.',
          suggested_visuals: 'Split screen: thriving vs struggling business',
        },
      ],
      angle_summary: 'Generated 1 hook focusing on urgency and FOMO.',
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherContainerContext.mockReturnValue([]);

  storage.readContainer.mockReturnValue(makeContainerWithAds());
  storage.addHooksResult.mockReturnValue({ id: 'hook-1', status: 'generating' });
  storage.updateHooksResult.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('hooks');
    expect(AGENT_META.code).toBe('ag0020');
    expect(AGENT_META.category).toBe('generation');
  });
});

// ── 2. Input Validation ───────────────────────────────────────────────────────
describe('Input validation', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generateHooks('missing-id')).rejects.toThrow('Container not found');
  });

  test('throws when addHooksResult returns null', async () => {
    storage.addHooksResult.mockReturnValue(null);
    await expect(generateHooks('c1')).rejects.toThrow('Failed to create hooks record');
  });
});

// ── 3. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('calls addHooksResult with containerId', async () => {
    const result = await generateHooks('c1');
    expect(storage.addHooksResult).toHaveBeenCalledWith('c1');
    expect(result).toEqual({ id: 'hook-1', status: 'generating' });
  });

  test('returns record immediately without waiting for AI', async () => {
    // Make AI take forever — record should still return
    mockCreate.mockReturnValue(new Promise(() => {}));
    const result = await generateHooks('c1');
    expect(result.id).toBe('hook-1');
    expect(result.status).toBe('generating');
  });
});

// ── 4. AI Integration ─────────────────────────────────────────────────────────
describe('AI integration', () => {
  test('calls Anthropic messages.create after async completes', async () => {
    await generateHooks('c1');
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs).toHaveProperty('model');
    expect(callArgs).toHaveProperty('messages');
    expect(callArgs.messages.length).toBeGreaterThan(0);
  });
});

// ── 5. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('updates storage with completed status and parsed hooks', async () => {
    await generateHooks('c1');
    await waitForAsync();

    expect(storage.updateHooksResult).toHaveBeenCalledWith(
      'c1',
      'hook-1',
      'completed',
      expect.objectContaining({
        hooks: expect.arrayContaining([
          expect.objectContaining({
            id: 'h1',
            angle_name: 'Fear of Missing Out',
          }),
        ]),
        angle_summary: expect.any(String),
      })
    );
  });
});

// ── 6. Error Path ─────────────────────────────────────────────────────────────
describe('Error path', () => {
  test('updates storage with failed status when AI call rejects', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

    await generateHooks('c1');
    await waitForAsync();

    expect(storage.updateHooksResult).toHaveBeenCalledWith(
      'c1',
      'hook-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('API rate limit exceeded'),
      })
    );
  });
});

// ── 7. No Ads Path ────────────────────────────────────────────────────────────
describe('No ads path', () => {
  test('fails when container has no scrape_results', async () => {
    const emptyContainer = makeContainer();
    emptyContainer.scrape_results = [];
    storage.readContainer.mockReturnValue(emptyContainer);

    await generateHooks('c1');
    await waitForAsync();

    expect(storage.updateHooksResult).toHaveBeenCalledWith(
      'c1',
      'hook-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('No scraped ads found'),
      })
    );
  });
});
