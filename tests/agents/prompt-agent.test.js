/**
 * Tests for AG-006 Prompt Generator Agent
 * Agent: agents/prompt-agent.js
 * Exports: { generatePrompts, AGENT_META }
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
const { generatePrompts, AGENT_META } = require('../../agents/prompt-agent');

const completedProposal = {
  id: 'prop-1',
  status: 'completed',
  result: {
    json_data: {
      creative_briefs: [
        { number: 1, title: 'Awareness Campaign', source_type: 'Facebook', ad_format: 'image' },
        { number: 2, title: 'Retargeting Push', source_type: 'Google', ad_format: 'text' },
      ],
    },
  },
};

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      prompts: [
        {
          brief_name: 'Awareness Campaign',
          platform: 'Facebook',
          prompt_text: 'Create a vibrant image ad showcasing...',
          negative_prompt: 'No text overlays, no blurry images',
          dimensions: '1080x1080',
        },
      ],
      generation_notes: 'Generated 1 prompt from 2 briefs.',
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherContainerContext.mockReturnValue([]);

  const container = makeContainer();
  container.proposals = [completedProposal];
  storage.readContainer.mockReturnValue(container);
  storage.addGeneratedPrompt.mockResolvedValue({ id: 'prompt-1', status: 'generating' });
  storage.updateGeneratedPrompt.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('prompt-generator');
    expect(AGENT_META.code).toBe('ag0006');
    expect(AGENT_META.category).toBe('generation');
  });
});

// ── 2. Missing Container ──────────────────────────────────────────────────────
describe('Missing container', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(generatePrompts('missing-id', 'prop-1')).rejects.toThrow('Container not found');
  });
});

// ── 3. Missing Proposal ──────────────────────────────────────────────────────
describe('Missing proposal', () => {
  test('throws when proposal is not found', async () => {
    const container = makeContainer();
    container.proposals = [];
    storage.readContainer.mockReturnValue(container);
    await expect(generatePrompts('c1', 'nonexistent')).rejects.toThrow(/[Pp]roposal not found/);
  });
});

// ── 4. Proposal Not Completed ─────────────────────────────────────────────────
describe('Proposal not completed', () => {
  test('throws when proposal status is not completed', async () => {
    const container = makeContainer();
    container.proposals = [{
      id: 'prop-1',
      status: 'generating',
      result: null,
    }];
    storage.readContainer.mockReturnValue(container);
    await expect(generatePrompts('c1', 'prop-1')).rejects.toThrow(/not completed|not ready/i);
  });
});

// ── 5. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('creates prompt record and returns it immediately', async () => {
    const result = await generatePrompts('c1', 'prop-1');
    expect(storage.addGeneratedPrompt).toHaveBeenCalledWith('c1', 'prop-1');
    expect(result).toEqual({ id: 'prompt-1', status: 'generating' });
  });

  test('returns record without waiting for AI to finish', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));
    const result = await generatePrompts('c1', 'prop-1');
    expect(result.id).toBe('prompt-1');
  });
});

// ── 6. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('calls AI and updates storage with completed status', async () => {
    await generatePrompts('c1', 'prop-1');
    await waitForAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(storage.updateGeneratedPrompt).toHaveBeenCalledWith(
      'c1',
      'prompt-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
        json_data: expect.objectContaining({
          prompts: expect.arrayContaining([
            expect.objectContaining({
              brief_name: 'Awareness Campaign',
              prompt_text: expect.any(String),
            }),
          ]),
        }),
      })
    );
  });

  test('AI prompt includes creative briefs from proposal', async () => {
    await generatePrompts('c1', 'prop-1');
    await waitForAsync();

    const callArgs = mockCreate.mock.calls[0][0];
    const messageContent = JSON.stringify(callArgs.messages);
    expect(messageContent).toContain('Awareness Campaign');
  });
});
