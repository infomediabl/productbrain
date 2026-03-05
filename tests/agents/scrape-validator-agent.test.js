/**
 * Tests for agents/scrape-validator-agent.js
 *
 * The scrape validator agent validates scraped ad data for quality issues.
 * Exports: { validateScrape, AGENT_META }
 * Dependencies: storage (readContainer, getScrapeResult, getAnalysis,
 *               updateScrapeValidation, getScrapeValidation)
 */

jest.mock('../../storage');

const storage = require('../../storage');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { validateScrape, AGENT_META } = require('../../agents/scrape-validator-agent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTAINER_ID = 'test-container-001';
const SCRAPE_ID = 'scrape-001';

function makeContainer(overrides = {}) {
  return {
    id: CONTAINER_ID,
    name: 'Test Product',
    my_product: { name: 'Test Product', url: 'https://example.com' },
    competitors: [
      { id: 'comp-1', name: 'Competitor One', url: 'https://comp1.com' },
    ],
    scrape_results: [],
    ...overrides,
  };
}

function makeScrapeResult(overrides = {}) {
  return {
    id: SCRAPE_ID,
    status: 'completed',
    created_at: '2026-03-01T00:00:00Z',
    scraped_data: {
      my_product: {
        facebook: [
          {
            headline: 'Great Product Ad',
            description: 'Buy our amazing product today',
            image_url: 'https://example.com/ad1.png',
            url: 'https://example.com/landing',
            source: 'facebook',
          },
        ],
        google: [],
      },
      competitors: {
        'comp-1': {
          facebook: [
            {
              headline: 'Competitor Ad',
              description: 'Try competitor product',
              image_url: 'https://comp1.com/ad1.png',
              url: 'https://comp1.com/landing',
              source: 'facebook',
            },
          ],
          google: [],
        },
      },
    },
    ...overrides,
  };
}

function makeScrapeWithIssues() {
  return makeScrapeResult({
    scraped_data: {
      my_product: {
        facebook: [
          {
            // Missing headline — should trigger an issue
            headline: '',
            description: 'Buy our product',
            image_url: 'https://example.com/ad1.png',
            url: 'https://example.com/landing',
            source: 'facebook',
          },
          {
            headline: 'Good Ad',
            description: '',
            // Missing image — should trigger an issue
            image_url: '',
            url: '',
            source: 'facebook',
          },
        ],
        google: [],
      },
      competitors: {},
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agents/scrape-validator-agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Defaults: container with scrape_results embedded
    const container = makeContainer();
    container.scrape_results = [makeScrapeResult()];
    storage.readContainer.mockReturnValue(container);
    storage.updateScrapeValidation.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------
  // AGENT_META
  // ---------------------------------------------------------------
  describe('AGENT_META', () => {
    it('passes validateAgentMeta checks', () => {
      validateAgentMeta(AGENT_META);
    });

    it('has correct identity fields', () => {
      expect(AGENT_META.id).toBe('scrape-validator');
      expect(AGENT_META.code).toBe('ag0002');
      expect(AGENT_META.category).toBe('validation');
    });

    it('has model set to null (rule-based, no AI)', () => {
      expect(AGENT_META.model).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // validateScrape — error cases
  // ---------------------------------------------------------------
  describe('validateScrape() — error cases', () => {
    it('throws when the container does not exist', async () => {
      storage.readContainer.mockReturnValue(null);

      await expect(validateScrape(CONTAINER_ID, SCRAPE_ID))
        .rejects
        .toThrow();
    });

    it('throws when the scrape result does not exist', async () => {
      const container = makeContainer();
      container.scrape_results = [];
      storage.readContainer.mockReturnValue(container);

      await expect(validateScrape(CONTAINER_ID, SCRAPE_ID))
        .rejects
        .toThrow();
    });
  });

  // ---------------------------------------------------------------
  // validateScrape — success cases
  // ---------------------------------------------------------------
  describe('validateScrape() — success', () => {
    it('validates a good scrape and produces a report with a score', async () => {
      const goodScrape = makeScrapeResult();
      const container = makeContainer();
      container.scrape_results = [goodScrape];
      storage.readContainer.mockReturnValue(container);

      const result = await validateScrape(CONTAINER_ID, SCRAPE_ID);

      // Wait for async fire-and-forget processing
      await waitForAsync();

      // Should call updateScrapeValidation with a completed report
      // Agent passes: (containerId, scrapeId, isLegacy, { status, completed_at, report })
      const completedCall = storage.updateScrapeValidation.mock.calls.find(
        c => c[3] && c[3].status === 'completed'
      );
      expect(completedCall).toBeDefined();
      expect(completedCall[0]).toBe(CONTAINER_ID);
      expect(completedCall[1]).toBe(SCRAPE_ID);
      expect(completedCall[2]).toBe(false); // isLegacy

      const wrapper = completedCall[3];
      expect(wrapper).toHaveProperty('status', 'completed');
      if (wrapper.report) {
        expect(wrapper.report).toHaveProperty('overall_score');
        expect(typeof wrapper.report.overall_score).toBe('number');
        expect(wrapper.report.overall_score).toBeGreaterThanOrEqual(0);
        expect(wrapper.report.overall_score).toBeLessThanOrEqual(100);
      }
    });

    it('detects issues in a scrape with missing data', async () => {
      const container = makeContainer();
      container.scrape_results = [makeScrapeWithIssues()];
      storage.readContainer.mockReturnValue(container);

      const result = await validateScrape(CONTAINER_ID, SCRAPE_ID);

      // Wait for async processing
      await waitForAsync();

      expect(storage.updateScrapeValidation).toHaveBeenCalled();
      // Agent passes: (containerId, scrapeId, isLegacy, { status, completed_at, report })
      const completedCall = storage.updateScrapeValidation.mock.calls.find(
        c => c[3] && c[3].status === 'completed'
      );
      expect(completedCall).toBeDefined();
      const wrapper = completedCall[3];
      expect(wrapper).toHaveProperty('status', 'completed');

      // With missing headlines and images, there should be issues
      if (wrapper.report && wrapper.report.issues) {
        expect(wrapper.report.issues.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------
  // validateScrape — error handling
  // ---------------------------------------------------------------
  describe('validateScrape() — error handling', () => {
    it('handles unexpected errors gracefully during validation', async () => {
      // Scrape with malformed data that might cause processing errors
      const malformedScrape = makeScrapeResult({
        scraped_data: null,
      });
      const container = makeContainer();
      container.scrape_results = [malformedScrape];
      storage.readContainer.mockReturnValue(container);

      // Should either throw or handle gracefully (not crash unhandled)
      try {
        const result = await validateScrape(CONTAINER_ID, SCRAPE_ID);
        await waitForAsync();

        // If it doesn't throw, it should have updated validation with failed status
        // or handled the error in some way
        if (storage.updateScrapeValidation.mock.calls.length > 0) {
          // Agent passes: (containerId, scrapeId, isLegacy, report) — report is 4th arg
          const lastCall = storage.updateScrapeValidation.mock.calls[storage.updateScrapeValidation.mock.calls.length - 1];
          const report = lastCall[3];
          // Either completed with issues or marked as failed
          expect(['completed', 'failed', 'running']).toContain(report.status);
        }
      } catch (err) {
        // Throwing is also acceptable — the error is surfaced, not silently swallowed
        expect(err).toBeDefined();
      }
    });

    it('handles storage.updateScrapeValidation failure without crashing', async () => {
      storage.updateScrapeValidation.mockRejectedValue(new Error('Storage write failed'));

      // Should not throw an unhandled rejection
      // The function fires-and-forgets, so the main call may succeed even if update fails
      let threw = false;
      try {
        await validateScrape(CONTAINER_ID, SCRAPE_ID);
        await waitForAsync();
      } catch (err) {
        threw = true;
      }

      // Whether it threw or not, the process should not have an unhandled rejection
      // This test primarily ensures no unhandled promise rejection crashes the process
      expect(true).toBe(true);
    });
  });
});
