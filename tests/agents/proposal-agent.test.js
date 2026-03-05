/**
 * Tests for AG-005 Magic AI Proposal Agent
 * Agent: agents/proposal-agent.js
 * Exports: { generateProposal, AGENT_META }
 */

jest.mock('../../storage');
jest.mock('../../utils/gather-data');
jest.mock('../../utils/summarize-ads');
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const Anthropic = require('@anthropic-ai/sdk');
const {
  gatherScrapeData,
  gatherCompetitorAnalyses,
  gatherGadsData,
  gatherContainerContext,
} = require('../../utils/gather-data');
const { summarizeAds } = require('../../utils/summarize-ads');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { makeContainerWithAds } = require('../fixtures/container');
const { generateProposal, AGENT_META } = require('../../agents/proposal-agent');

let mockCreate;

beforeEach(() => {
  jest.clearAllMocks();

  mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      proposal_title: 'Marketing Strategy for TestProduct',
      executive_summary: 'A comprehensive marketing proposal.',
      target_audience: { primary: 'Tech professionals', secondary: 'Small businesses' },
      creative_briefs: [
        { brief_name: 'Brand Awareness Campaign', platform: 'Facebook', format: 'carousel' },
      ],
      budget_recommendations: { monthly_total: 5000, breakdown: [] },
      timeline: { phases: [{ name: 'Phase 1', duration: '2 weeks' }] },
      kpis: ['CTR > 2%', 'CPA < $15'],
    }) }],
  });

  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  gatherScrapeData.mockReturnValue({ 'comp-1': { facebook: [{ headline: 'Ad' }], google: [] } });
  gatherCompetitorAnalyses.mockReturnValue({});
  gatherGadsData.mockReturnValue({ campaigns: [], analysis: {} });
  gatherContainerContext.mockReturnValue([]);
  summarizeAds.mockReturnValue('Ad summary');

  const container = makeContainerWithAds();
  container.competitors = [
    { id: 'comp-1', name: 'Acme Corp' },
    { id: 'comp-2', name: 'Beta Inc' },
  ];
  storage.readContainer.mockReturnValue(container);
  storage.addProposal.mockResolvedValue({ id: 'prop-1', status: 'generating' });
  storage.updateProposal.mockImplementation(() => {});
});

// ── 1. AGENT_META ─────────────────────────────────────────────────────────────
describe('AGENT_META', () => {
  test('passes standard validation', () => {
    validateAgentMeta(AGENT_META);
  });

  test('has correct id, code and category', () => {
    expect(AGENT_META.id).toBe('proposal');
    expect(AGENT_META.code).toBe('ag0005');
    expect(AGENT_META.category).toBe('generation');
  });

  test('uses heavy model', () => {
    expect(AGENT_META.model).toBe('AI_MODEL_HEAVY');
  });
});

// ── 2. Missing Container ──────────────────────────────────────────────────────
describe('Missing container', () => {
  test('throws when container is not found', async () => {
    storage.readContainer.mockReturnValue(null);
    await expect(
      generateProposal('missing-id', { competitorIds: ['comp-1'] })
    ).rejects.toThrow('Container not found');
  });
});

// ── 3. Record Creation ────────────────────────────────────────────────────────
describe('Record creation', () => {
  test('creates proposal record and returns it immediately', async () => {
    const result = await generateProposal('c1', { competitorIds: ['comp-1'] });
    expect(storage.addProposal).toHaveBeenCalledWith('c1', null);
    expect(result).toEqual({ id: 'prop-1', status: 'generating' });
  });

  test('returns record without waiting for AI completion', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));
    const result = await generateProposal('c1', { competitorIds: ['comp-1'] });
    expect(result.id).toBe('prop-1');
    expect(result.status).toBe('generating');
  });
});

// ── 4. Success Path ───────────────────────────────────────────────────────────
describe('Success path', () => {
  test('gathers all data sources and updates storage with completed', async () => {
    await generateProposal('c1', {
      competitorIds: ['comp-1'],
      userContext: 'Focus on ROI',
      userPrompt: 'Emphasize mobile',
    });
    await waitForAsync();

    expect(gatherScrapeData).toHaveBeenCalled();
    expect(gatherCompetitorAnalyses).toHaveBeenCalled();
    expect(gatherGadsData).toHaveBeenCalled();
    expect(gatherContainerContext).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(storage.updateProposal).toHaveBeenCalledWith(
      'c1',
      'prop-1',
      'completed',
      expect.objectContaining({
        full_text: expect.any(String),
      })
    );
  });
});

// ── 5. Error Path ─────────────────────────────────────────────────────────────
describe('Error path', () => {
  test('updates storage with failed status when AI rejects', async () => {
    mockCreate.mockRejectedValue(new Error('Anthropic API down'));

    await generateProposal('c1', { competitorIds: ['comp-1'] });
    await waitForAsync();

    expect(storage.updateProposal).toHaveBeenCalledWith(
      'c1',
      'prop-1',
      'failed',
      expect.objectContaining({
        error: expect.stringContaining('Anthropic API down'),
      })
    );
  });
});
