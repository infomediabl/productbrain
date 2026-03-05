/**
 * Tests for AG-009 Google Ads Agent
 * Path: agents/google-ads-agent.js
 * Exports: { isConfigured, generateKeywordIdeas, listAccessibleAccounts, listCampaigns, getCampaignKeywords, analyzeCampaigns, AGENT_META }
 *
 * Multi-operation agent with env var configuration check.
 */

jest.mock('../../storage');
jest.mock('@anthropic-ai/sdk');

const Anthropic = require('@anthropic-ai/sdk');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');

// Mock Anthropic client
const mockCreate = jest.fn();
Anthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

const { isConfigured, analyzeCampaigns, AGENT_META } = require('../../agents/google-ads-agent');

// Save original env
const originalEnv = { ...process.env };

const REQUIRED_ENV_VARS = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
];

beforeEach(() => {
  jest.clearAllMocks();

  // Clear all google ads env vars
  REQUIRED_ENV_VARS.forEach(key => {
    delete process.env[key];
  });

  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: '```json\n{"summary":"Campaign performing well","recommendations":["Increase budget"],"metrics":{"ctr":0.05,"cpc":1.2}}\n```' }],
  });
});

afterEach(() => {
  // Restore original env
  REQUIRED_ENV_VARS.forEach(key => {
    if (originalEnv[key] !== undefined) {
      process.env[key] = originalEnv[key];
    } else {
      delete process.env[key];
    }
  });
});

describe('Google Ads Agent (AG-009)', () => {
  test('AGENT_META passes validation and has operations', () => {
    validateAgentMeta(AGENT_META);
    expect(AGENT_META.code).toBe('ag0009');
    expect(AGENT_META.id).toBe('google-ads');
    expect(AGENT_META.category).toBe('api');
    expect(AGENT_META.operations).toBeDefined();
    expect(Array.isArray(AGENT_META.operations) || typeof AGENT_META.operations === 'object').toBe(true);
  });

  test('isConfigured() returns false when env vars missing', () => {
    // All env vars are cleared in beforeEach
    expect(isConfigured()).toBe(false);
  });

  test('isConfigured() returns true when all env vars set', () => {
    REQUIRED_ENV_VARS.forEach(key => {
      process.env[key] = 'test-value-' + key;
    });

    expect(isConfigured()).toBe(true);
  });

  test('analyzeCampaigns calls AI and returns structured result', async () => {
    const campaignData = [
      { name: 'Test Campaign', status: 'ENABLED', clicks: 100, impressions: 2000 },
    ];

    const result = await analyzeCampaigns(campaignData, {});

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(result.full_text || result.json_data || result.analyzed_at).toBeDefined();
  });
});
