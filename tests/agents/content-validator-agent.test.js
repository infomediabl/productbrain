/**
 * Tests for AG-022 Content Validator Agent
 * Agent: agents/content-validator-agent.js
 * Exports: { validateContent, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const { gatherContainerContext } = require('../../utils/gather-data');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainer } = require('../fixtures/container');
const { validateContent, AGENT_META } = require('../../agents/content-validator-agent');

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      verdict: 'needs_work',
      score: 6,
      summary: 'The hook shows promise but misses the product\'s core value proposition.',
      strengths: ['Creates urgency', 'Clear CTA'],
      weaknesses: ['Does not reference the unique product angle', 'Too generic'],
      recommendations: ['Reference the specific product benefit', 'Add social proof element'],
      user_perspective_notes: 'A user would find this mildly interesting but not compelling enough to click.',
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherContainerContext.mockReturnValue([
    { brief: 'Competitor uses aggressive pricing strategies.' },
  ]);

  storage.readContainer.mockReturnValue(makeContainer());
  storage.addValidation.mockResolvedValue({ id: 'val-1', status: 'generating' });
  storage.updateValidation.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('content-validator');
    expect(AGENT_META.code).toBe('ag0022');
    expect(AGENT_META.category).toBe('validation');
  });
});

// ── 2. Input Validation ───────────────────────────────────────────────────────
describe('Input validation', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(validateContent('missing-id', { validate_type: 'hook', content: 'test' }))
      .rejects.toThrow('Container not found');
  });

  test('throws when validate_type is invalid', async () => {
    await expect(validateContent('c1', { validate_type: 'invalid_type', content: 'test' }))
      .rejects.toThrow('Invalid validate_type');
  });

  test('throws when content is empty', async () => {
    await expect(validateContent('c1', { validate_type: 'hook', content: '' }))
      .rejects.toThrow('Content is required');
  });

  test('throws when content is missing', async () => {
    await expect(validateContent('c1', { validate_type: 'hook' }))
      .rejects.toThrow('Content is required');
  });

  test('throws when addValidation returns null', async () => {
    storage.addValidation.mockResolvedValue(null);
    await expect(validateContent('c1', { validate_type: 'hook', content: 'test hook' }))
      .rejects.toThrow('Failed to create validation record');
  });
});

// ── 3. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('calls addValidation with containerId and meta', async () => {
    const result = await validateContent('c1', { validate_type: 'hook', content: 'Buy now!', comment: 'Check urgency' });
    expect(storage.addValidation).toHaveBeenCalledWith('c1', { validate_type: 'hook', comment: 'Check urgency' });
    expect(result).toEqual({ id: 'val-1', status: 'generating' });
  });

  test('returns record immediately without waiting for AI', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));
    const result = await validateContent('c1', { validate_type: 'angle', content: 'test' });
    expect(result.id).toBe('val-1');
    expect(result.status).toBe('generating');
  });
});

// ── 4. AI Integration ─────────────────────────────────────────────────────────
describe('AI integration', () => {
  test('calls Anthropic messages.create after async completes', async () => {
    await validateContent('c1', { validate_type: 'hook', content: 'Stop losing customers!' });
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs).toHaveProperty('model');
    expect(callArgs).toHaveProperty('messages');
    expect(callArgs.messages[0].content).toContain('Stop losing customers!');
  });

  test('includes container context in prompt', async () => {
    await validateContent('c1', { validate_type: 'hook', content: 'test hook' });
    await waitForAsync();

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('aggressive pricing');
  });

  test('includes notes in prompt when metadata exists', async () => {
    const container = makeContainer();
    container.metadata = [{ type: 'user_feedback', title: 'Key insight', content: 'Users want speed' }];
    storage.readContainer.mockReturnValue(container);

    await validateContent('c1', { validate_type: 'hook', content: 'test hook' });
    await waitForAsync();

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Users want speed');
  });
});

// ── 5. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('updates storage with completed status and parsed result', async () => {
    await validateContent('c1', { validate_type: 'hook', content: 'Buy now!' });
    await waitForAsync();

    expect(storage.updateValidation).toHaveBeenCalledWith(
      'c1',
      'val-1',
      'completed',
      expect.objectContaining({
        verdict: 'needs_work',
        score: 6,
        summary: expect.any(String),
        strengths: expect.any(Array),
        weaknesses: expect.any(Array),
        recommendations: expect.any(Array),
        user_perspective_notes: expect.any(String),
        _meta: expect.objectContaining({
          validate_type: 'hook',
          prompt_sent: expect.any(String),
        }),
      })
    );
  });
});

// ── 6. Error Path ─────────────────────────────────────────────────────────────
describe('Error path', () => {
  test('updates storage with failed status when AI call rejects', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

    await validateContent('c1', { validate_type: 'hook', content: 'test' });
    await waitForAsync();

    expect(storage.updateValidation).toHaveBeenCalledWith(
      'c1',
      'val-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('API rate limit exceeded'),
      })
    );
  });

  test('updates storage with failed when AI returns unparseable response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not JSON' }],
    });

    await validateContent('c1', { validate_type: 'hook', content: 'test' });
    await waitForAsync();

    expect(storage.updateValidation).toHaveBeenCalledWith(
      'c1',
      'val-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('Failed to parse'),
      })
    );
  });
});

// ── 7. Prompt content tests ──────────────────────────────────────────────────
describe('Prompt content', () => {
  test('prompt contains product name when my_product exists', async () => {
    await validateContent('c1', { validate_type: 'hook', content: 'Buy now!' });
    await waitForAsync();

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Test Product');
  });

  test('prompt text differs for landing_page vs hook', async () => {
    await validateContent('c1', { validate_type: 'hook', content: 'test' });
    await waitForAsync();
    const hookPrompt = mockCreate.mock.calls[0][0].messages[0].content;

    jest.clearAllMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        verdict: 'pass', score: 8, summary: 'Good.',
        strengths: ['Strong'], weaknesses: [], recommendations: [],
        user_perspective_notes: 'Fine.',
      }) }],
    });
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
    storage.readContainer.mockReturnValue(makeContainer());
    storage.addValidation.mockResolvedValue({ id: 'val-2', status: 'generating' });
    gatherContainerContext.mockReturnValue([]);

    await validateContent('c1', { validate_type: 'landing_page', content: 'test' });
    await waitForAsync();
    const lpPrompt = mockCreate.mock.calls[0][0].messages[0].content;

    expect(hookPrompt).toContain('Does this hook grab');
    expect(lpPrompt).toContain('You just clicked an ad');
    expect(hookPrompt).not.toContain('You just clicked an ad');
    expect(lpPrompt).not.toContain('Does this hook grab');
  });

  test('prompt includes user comment when provided', async () => {
    await validateContent('c1', { validate_type: 'hook', content: 'test', comment: 'Focus on Gen Z' });
    await waitForAsync();

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Focus on Gen Z');
  });
});

// ── 8. All validate_types accepted ───────────────────────────────────────────
describe('Validate types', () => {
  const types = ['landing_page', 'image_ad', 'video_transcript', 'hook', 'angle'];

  test.each(types)('accepts validate_type "%s"', async (type) => {
    await validateContent('c1', { validate_type: type, content: 'test content' });
    await waitForAsync();
    expect(storage.updateValidation).toHaveBeenCalledWith('c1', 'val-1', 'completed', expect.any(Object));
  });
});
