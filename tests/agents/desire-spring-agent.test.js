/**
 * Tests for AG-016 DesireSpring Agent
 * Path: agents/desire-spring-agent.js
 * Exports: { generateInstructions, getIdea, listIdeas, deleteIdea, saveInstructions, AGENT_META }
 *
 * Uses self-contained file storage (data/desire-spring.json) via fs module.
 * Does NOT use storage.js.
 */

jest.mock('fs');
jest.mock('@anthropic-ai/sdk');

const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

// Mock Anthropic client
const mockCreate = jest.fn();
Anthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

// Track writes to simulate persistent state
let dataStore = { ideas: [] };

beforeEach(() => {
  jest.clearAllMocks();
  dataStore = { ideas: [] };

  fs.existsSync.mockImplementation((p) => {
    if (p.includes('desire-spring.json')) return true;
    if (p.includes('CLAUDE.md')) return true;
    if (p.includes('instructions')) return true;
    return false;
  });

  fs.readFileSync.mockImplementation((p) => {
    if (p.includes('desire-spring.json')) return JSON.stringify(dataStore);
    if (p.includes('CLAUDE.md')) return '# Test CLAUDE.md content';
    return '';
  });

  fs.writeFileSync.mockImplementation((p, content) => {
    if (p.includes('desire-spring.json')) {
      dataStore = JSON.parse(content);
    }
  });

  fs.mkdirSync.mockImplementation(() => {});

  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: '```json\n{"feature_name":"Test Feature","instructions":"Do the thing","implementation_steps":["Step 1","Step 2"]}\n```' }],
  });
});

const { generateInstructions, getIdea, listIdeas, deleteIdea, saveInstructions, AGENT_META } = require('../../agents/desire-spring-agent');

describe('DesireSpring Agent (AG-016)', () => {
  test('AGENT_META passes validation', () => {
    validateAgentMeta(AGENT_META);
    expect(AGENT_META.code).toBe('ag0016');
    expect(AGENT_META.id).toBe('desire-spring');
    expect(AGENT_META.category).toBe('generation');
  });

  test('generateInstructions creates record with status generating', async () => {
    const result = await generateInstructions('Build a chatbot feature');

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.status).toBe('generating');
    expect(result.idea_text || result.topic || result.idea).toBeDefined();
  });

  test('generateInstructions — AI completes and updates idea to completed', async () => {
    const result = await generateInstructions('Build a chatbot feature');

    // Wait for fire-and-forget async to complete
    await waitForAsync(200);

    // The dataStore should have been updated with the completed result
    expect(dataStore.ideas.length).toBeGreaterThanOrEqual(1);
    const idea = dataStore.ideas.find(i => i.id === result.id);
    expect(idea).toBeDefined();
    expect(idea.status).toBe('completed');
    expect(idea.result).toBeDefined();
  });

  test('getIdea / listIdeas / deleteIdea CRUD works', async () => {
    // Seed data
    dataStore = {
      ideas: [
        { id: 'idea-1', idea_text: 'First idea', status: 'completed', created_at: '2026-01-01T00:00:00Z', result: { feature_name: 'F1' } },
        { id: 'idea-2', idea_text: 'Second idea', status: 'generating', created_at: '2026-01-02T00:00:00Z' },
      ],
    };

    // getIdea
    const idea1 = await getIdea('idea-1');
    expect(idea1).toBeDefined();
    expect(idea1.id).toBe('idea-1');

    // listIdeas
    const list = await listIdeas();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);

    // deleteIdea
    await deleteIdea('idea-1');
    expect(dataStore.ideas.length).toBe(1);
    expect(dataStore.ideas[0].id).toBe('idea-2');
  });

  test('saveInstructions writes file and updates idea', async () => {
    dataStore = {
      ideas: [
        { id: 'idea-1', idea_text: 'Test idea', status: 'completed', created_at: '2026-01-01T00:00:00Z', result: { feature_name: 'F1', instructions: 'Do stuff' } },
      ],
    };

    await saveInstructions('idea-1', 'test-output.md', '# Test instructions content');

    // Should have called writeFileSync for the instructions file
    const writeCalls = fs.writeFileSync.mock.calls;
    const instructionWrite = writeCalls.find(([p]) => p.includes('test-output.md'));
    expect(instructionWrite).toBeDefined();
    expect(instructionWrite[1]).toBe('# Test instructions content');

    // Idea should have saved_as updated
    const updatedIdea = dataStore.ideas.find(i => i.id === 'idea-1');
    expect(updatedIdea.saved_as).toBeDefined();
  });

  test('saveInstructions blocks path traversal (filename with ..)', async () => {
    dataStore = {
      ideas: [
        { id: 'idea-1', idea_text: 'Test idea', status: 'completed', created_at: '2026-01-01T00:00:00Z', result: {} },
      ],
    };

    expect(() => saveInstructions('idea-1', '../../../etc/passwd', 'malicious content'))
      .toThrow(/[Ii]nvalid filename/);
  });
});
