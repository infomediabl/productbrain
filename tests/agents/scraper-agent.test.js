/**
 * Tests for AG-001 Scraper Agent
 * Path: agents/scraper-agent.js
 * Exports: { runScrape, runAutoScrape, isScraping, AGENT_META }
 *
 * Heavily IO-dependent — keep tests simple and focused on initialization logic.
 */

jest.mock('../../storage');
jest.mock('../../scrapers/browser', () => ({
  getBrowser: jest.fn(),
  closeBrowser: jest.fn(),
}));
jest.mock('../../scrapers/facebookAdsLibrary', () => ({ scrapeFacebookAds: jest.fn().mockResolvedValue([]) }));
jest.mock('../../scrapers/googleAdsTransparency', () => ({ scrapeGoogleAds: jest.fn().mockResolvedValue([]) }));
jest.mock('@anthropic-ai/sdk');

const storage = require('../../storage');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');

const { runScrape, isScraping, AGENT_META } = require('../../agents/scraper-agent');

const MOCK_CONTAINER = {
  id: 'test-container-1',
  my_product: { name: 'TestProduct', url: 'https://example.com' },
  competitors: [
    { id: 'comp1', name: 'Competitor One', url: 'https://comp1.com' },
  ],
  scrape_results: [],
  settings: {},
};

const MOCK_SCRAPE_RESULT = {
  id: 'scrape-001',
  created_at: new Date().toISOString(),
  status: 'scraping',
  trigger: 'manual',
  scraped_data: {},
};

beforeEach(() => {
  jest.clearAllMocks();

  storage.readContainer = jest.fn().mockReturnValue(MOCK_CONTAINER);
  storage.createScrapeResult = jest.fn().mockReturnValue(MOCK_SCRAPE_RESULT);
  storage.updateScrapeResult = jest.fn();
});

describe('Scraper Agent (AG-001)', () => {
  test('AGENT_META passes validation with category scraping and model null', () => {
    validateAgentMeta(AGENT_META);
    expect(AGENT_META.code).toBe('ag0001');
    expect(AGENT_META.id).toBe('scraper');
    expect(AGENT_META.category).toBe('scraping');
    // Scraper does not use an AI model directly
    expect(AGENT_META.model).toBeNull();
  });

  test('creates scrape result and returns it', async () => {
    const entries = [
      { competitorId: 'comp1', sources: ['facebook'] },
    ];

    const result = await runScrape('test-container-1', entries);

    expect(storage.createScrapeResult).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(result.id).toBe('scrape-001');
    expect(result.status).toBe('scraping');
  });

  test('isScraping() starts as false', () => {
    expect(isScraping()).toBe(false);
  });

  test('error in scrape creation throws', async () => {
    storage.createScrapeResult = jest.fn().mockImplementation(() => {
      throw new Error('Storage write failed');
    });

    await expect(runScrape('test-container-1', []))
      .rejects.toThrow('Storage write failed');
  });
});
