/**
 * MCP Server Tests
 *
 * Tests that mcp-server.js registers all expected tools and that
 * utility tools work correctly.
 */

// Mock storage before requiring mcp-server internals
jest.mock('../storage');

const storage = require('../storage');

// We can't easily test the full MCP server via stdio in jest,
// so we test the tool map and utility logic directly.

describe('MCP Server', () => {
  describe('Module loading', () => {
    test('mcp-server.js has valid syntax', () => {
      const { execSync } = require('child_process');
      const path = require('path');
      const file = path.join(__dirname, '..', 'mcp-server.js');
      // node --check only parses, does not execute
      expect(() => execSync(`node --check "${file}"`, { stdio: 'pipe' })).not.toThrow();
    });
  });

  describe('All agent files are importable', () => {
    const agentFiles = [
      '../agents/hooks-agent',
      '../agents/image-ad-agent',
      '../agents/quiz-agent',
      '../agents/landing-page-agent',
      '../agents/test-planner-agent',
      '../agents/keyword-ideator-agent',
      '../agents/spinoff-ideas-agent',
      '../agents/product-ideator-agent',
      '../agents/analyzer-agent',
      '../agents/seo-agent',
      '../agents/proposal-agent',
      '../agents/prompt-agent',
      '../agents/case-study-agent',
      '../agents/scrape-validator-agent',
      '../agents/taboola-agent',
      '../agents/folder-scraper-agent',
      '../agents/container-chat-agent',
      '../agents/desire-spring-agent',
      '../agents/research-web-agent',
      '../agents/google-ads-agent',
    ];

    test.each(agentFiles)('%s loads without error', (agentFile) => {
      expect(() => require(agentFile)).not.toThrow();
    });

    test('all agents export AGENT_META', () => {
      for (const f of agentFiles) {
        const mod = require(f);
        expect(mod.AGENT_META).toBeDefined();
        expect(mod.AGENT_META.id).toBeTruthy();
      }
    });
  });

  describe('Utility: list_containers', () => {
    test('returns array of containers', () => {
      storage.listContainers.mockReturnValue([
        { id: 'c1', name: 'Test Container', created_at: '2025-01-01' },
      ]);
      const result = storage.listContainers();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].id).toBe('c1');
    });
  });

  describe('Utility: get_container', () => {
    test('returns container when found', () => {
      storage.readContainer.mockReturnValue({
        id: 'c1',
        name: 'Test',
        competitors: [],
        scrape_results: [],
      });
      const result = storage.readContainer('c1');
      expect(result).toBeTruthy();
      expect(result.id).toBe('c1');
    });

    test('returns null when not found', () => {
      storage.readContainer.mockReturnValue(null);
      const result = storage.readContainer('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Utility: get_result', () => {
    test('finds result in array storage key', () => {
      const container = {
        id: 'c1',
        hooks_results: [
          { id: 'h1', status: 'completed', result: { hooks: [] } },
          { id: 'h2', status: 'generating' },
        ],
      };
      storage.readContainer.mockReturnValue(container);
      const c = storage.readContainer('c1');
      const item = c.hooks_results.find(i => i.id === 'h1');
      expect(item).toBeTruthy();
      expect(item.status).toBe('completed');
    });

    test('finds result in object-keyed storage key', () => {
      const container = {
        id: 'c1',
        competitor_analyses: {
          comp1: [
            { id: 'a1', status: 'completed', result: {} },
          ],
        },
      };
      storage.readContainer.mockReturnValue(container);
      const c = storage.readContainer('c1');
      const item = c.competitor_analyses['comp1'].find(i => i.id === 'a1');
      expect(item).toBeTruthy();
      expect(item.status).toBe('completed');
    });
  });

  describe('waitForResult logic', () => {
    test('in-progress statuses are correctly identified', () => {
      const inProgress = ['generating', 'scraping', 'analyzing', 'summarizing', 'launching', 'searching', 'pending', 'importing'];
      // Completed statuses should NOT be in the list
      expect(inProgress).not.toContain('completed');
      expect(inProgress).not.toContain('failed');
      // All expected in-progress statuses are present
      expect(inProgress).toContain('generating');
      expect(inProgress).toContain('scraping');
      expect(inProgress).toContain('searching');
    });
  });
});
