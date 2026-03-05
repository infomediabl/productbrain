/**
 * Tests for agents/folder-scraper-agent.js
 *
 * The folder scraper agent imports ads from a local folder on disk.
 * Exports: { importFromFolder, checkFolderStatus, AGENT_META }
 * Dependencies: fs (existsSync, readdirSync, readFileSync), storage
 */

jest.mock('../../storage');
jest.mock('fs');

const fs = require('fs');
const storage = require('../../storage');
const { validateAgentMeta } = require('../helpers/agent-meta-validator');
const { waitForAsync } = require('../helpers/async-agent-runner');

const { importFromFolder, checkFolderStatus, AGENT_META } = require('../../agents/folder-scraper-agent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTAINER_ID = 'test-container-001';

function makeContainer(overrides = {}) {
  return {
    id: CONTAINER_ID,
    name: 'Test Product',
    my_product: { name: 'Test Product', url: 'https://example.com' },
    competitors: [],
    scrape_results: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agents/folder-scraper-agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: storage.readContainer returns a valid container
    storage.readContainer.mockReturnValue(makeContainer());
    storage.createScrapeResult.mockReturnValue({ id: 'scrape-001', status: 'running' });
    storage.addScrapeData.mockReturnValue(undefined);
    storage.updateScrapeStatus.mockReturnValue(undefined);
  });

  // ---------------------------------------------------------------
  // AGENT_META
  // ---------------------------------------------------------------
  describe('AGENT_META', () => {
    it('passes validateAgentMeta checks', () => {
      validateAgentMeta(AGENT_META);
    });

    it('has correct identity fields', () => {
      expect(AGENT_META.id).toBe('folder-scraper');
      expect(AGENT_META.code).toBe('ag0021');
      expect(AGENT_META.category).toBe('collection');
    });
  });

  // ---------------------------------------------------------------
  // checkFolderStatus
  // ---------------------------------------------------------------
  describe('checkFolderStatus()', () => {
    it('returns { exists: false } when the folder does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = checkFolderStatus(CONTAINER_ID);

      expect(result.exists).toBe(false);
    });

    it('returns folder info when folder exists with images', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'ad1.png',
        'ad2.jpg',
        'ad3.jpeg',
        'thumbs.db', // non-image, should still count in file_count or be filtered
      ]);

      const result = checkFolderStatus(CONTAINER_ID);

      expect(result.exists).toBe(true);
      expect(result).toHaveProperty('file_count');
      expect(typeof result.file_count).toBe('number');
      expect(result.file_count).toBeGreaterThan(0);
    });

    it('reports has_csv when a CSV file is present', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'ad1.png',
        'ads.csv',
      ]);

      const result = checkFolderStatus(CONTAINER_ID);

      expect(result.exists).toBe(true);
      expect(result.has_csv).toBe(true);
    });

    it('reports has_csv false when no CSV file is present', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'ad1.png',
        'ad2.jpg',
      ]);

      const result = checkFolderStatus(CONTAINER_ID);

      expect(result.exists).toBe(true);
      expect(result.has_csv).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // importFromFolder
  // ---------------------------------------------------------------
  describe('importFromFolder()', () => {
    it('throws when the upload folder does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      await expect(importFromFolder(CONTAINER_ID))
        .rejects
        .toThrow();
    });

    it('throws when the folder contains no image files', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['readme.txt', 'notes.doc']);

      await expect(importFromFolder(CONTAINER_ID))
        .rejects
        .toThrow();
    });

    it('creates a scrape result, adds ad data, and completes when images are present', async () => {
      // Folder exists with image files, but no CSV
      fs.existsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('ads.csv')) return false;
        return true;
      });
      fs.readdirSync.mockReturnValue(['ad1.png', 'ad2.jpg', 'banner.gif']);
      fs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));

      const result = await importFromFolder(CONTAINER_ID);

      // Should have created a scrape result
      expect(storage.createScrapeResult).toHaveBeenCalledWith(
        CONTAINER_ID,
        expect.any(Object),
      );

      // Wait for the async fire-and-forget to settle
      await waitForAsync();

      // Should have added scrape data
      expect(storage.addScrapeData).toHaveBeenCalled();

      // Should have updated status to completed
      expect(storage.updateScrapeStatus).toHaveBeenCalledWith(
        CONTAINER_ID,
        expect.any(String),
        'completed',
      );
    });

    it('maps competitor names from CSV when present', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['ad1.png', 'ad2.jpg', 'ads.csv']);

      // CSV content: filename,competitor_name
      const csvContent = 'filename,competitor_name\nad1.png,Competitor A\nad2.jpg,Competitor B\n';
      fs.readFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('.csv')) {
          return csvContent;
        }
        return Buffer.from('fake-image-data');
      });

      const result = await importFromFolder(CONTAINER_ID);

      // Wait for async processing
      await waitForAsync();

      // Should have created the scrape and processed ads
      expect(storage.createScrapeResult).toHaveBeenCalled();
      expect(storage.addScrapeData).toHaveBeenCalled();
    });
  });
});
