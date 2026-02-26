/**
 * Express Server (SHARED — do not edit from multiple sessions)
 * Entry point. Mounts all 21 route groups. Serves static files.
 * Port: process.env.PORT || 3100
 *
 * When adding a new route:
 *   1. Create routes/<name>.js
 *   2. require() it here
 *   3. app.use() with the mount path
 *   4. Add console.log line in listen()
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const log = require('./logger');

const { updateChangelog, getChangelog } = require('./utils/changelog');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Routes
const containersRouter = require('./routes/containers');
const metadataRouter = require('./routes/metadata');
const analysisRouter = require('./routes/analysis');       // legacy
const scraperRouter = require('./routes/scraper');          // Agent 1: Scraper
const compAnalysisRouter = require('./routes/competitor-analysis'); // Scraped Ads Analyzer
const proposalRouter = require('./routes/proposal');        // Magic AI
const promptsRouter = require('./routes/prompts');          // Agent 4: Prompt Generator
const scrapeValidatorRouter = require('./routes/scrape-validator'); // Agent 1b: Scrape Validator
const productIdeatorRouter = require('./routes/product-ideator');   // NewProductIdeator
const seoAnalysisRouter = require('./routes/seo-analysis');         // SEO Analysis Agent
const googleAdsRouter = require('./routes/google-ads');             // Google Ads Agent
const keywordIdeatorRouter = require('./routes/keyword-ideator');   // Keyword Ideator
const landingPageRouter = require('./routes/landing-page');         // Landing Page Generator
const imageAdsRouter = require('./routes/image-ads');               // Image Ad Creator
const settingsRouter = require('./routes/settings');                 // Project Settings
const quizRouter = require('./routes/quiz');                         // Quiz Generator
const testPlannerRouter = require('./routes/test-planner');           // Test Planner
const cloneAdRouter = require('./routes/clone-ad');                   // Clone Ad (OpenRouter)
const caseStudyRouter = require('./routes/case-study');               // Case Study Analyzer
const containerContextRouter = require('./routes/container-context'); // Container Context (Collector)
const containerChatRouter = require('./routes/container-chat');       // Container Chat

app.use('/api/containers', containersRouter);
app.use('/api/containers/:id/metadata', metadataRouter);

// Legacy analysis routes (backward compat)
app.use('/api/containers/:id/analyze', analysisRouter);
app.use('/api/containers/:id/analyses', analysisRouter);

// Agent 1: Scraper
app.use('/api/containers/:id/scrape', scraperRouter);
app.use('/api/containers/:id/scrapes', scraperRouter);

// Agent 1b: Scrape Validator
app.use('/api/containers/:id/validate-scrape', scrapeValidatorRouter);

// NewProductIdeator
app.use('/api/containers/:id/ideate-product', productIdeatorRouter);
app.use('/api/containers/:id/product-ideas', productIdeatorRouter);

// Scraped Ads Analyzer
app.use('/api/containers/:id/competitor-analysis', compAnalysisRouter);

// SEO Analysis Agent
app.use('/api/containers/:id/seo-analysis', seoAnalysisRouter);

// Google Ads Agent
app.use('/api/google-ads', googleAdsRouter);

// Keyword Ideator
app.use('/api/containers/:id/keyword-strategy', keywordIdeatorRouter);
app.use('/api/containers/:id/keyword-strategies', keywordIdeatorRouter);

// Landing Page Generator
app.use('/api/containers/:id/landing-page', landingPageRouter);
app.use('/api/containers/:id/landing-pages', landingPageRouter);

// Image Ad Creator
app.use('/api/containers/:id/image-ads', imageAdsRouter);

// Project Settings
app.use('/api/containers/:id/settings', settingsRouter);

// Quiz Generator
app.use('/api/containers/:id/quiz', quizRouter);
app.use('/api/containers/:id/quizzes', quizRouter);

// Test Planner
app.use('/api/containers/:id/test-plan', testPlannerRouter);
app.use('/api/containers/:id/test-plans', testPlannerRouter);

// Case Study Analyzer
app.use('/api/containers/:id/case-studies', caseStudyRouter);

// Container Context (Collector)
app.use('/api/containers/:id/context', containerContextRouter);

// Container Chat
app.use('/api/containers/:id/chat', containerChatRouter);

// Clone Ad (OpenRouter)
app.use('/api/containers/:id/clone-ad', cloneAdRouter);
app.use('/api/openrouter', cloneAdRouter);

// Magic AI
app.use('/api/containers/:id/propose', proposalRouter);
app.use('/api/containers/:id/proposals', proposalRouter);

// Agent 4: Prompt Generator
app.use('/api/containers/:id/generate-prompts', promptsRouter);
app.use('/api/containers/:id/prompts', promptsRouter);

// Log viewer
app.get('/api/logs', (req, res) => {
  const logPath = log.getLogPath();
  if (!fs.existsSync(logPath)) return res.json([]);
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const limit = parseInt(req.query.limit) || 200;
  const level = req.query.level;
  let entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (level) entries = entries.filter(e => e.level === level);
  res.json(entries.slice(-limit));
});

app.delete('/api/logs', (req, res) => {
  fs.writeFileSync(log.getLogPath(), '');
  res.json({ cleared: true });
});

// Changelog
app.get('/api/changelog', (req, res) => {
  res.json(getChangelog());
});

// ========== Auto-Scrape Scheduler (6h interval) ==========
const { runAutoScrape, isScraping } = require('./agents/scraper-agent');
const { listAutoScrapeContainers, getScrapeResult } = require('./storage');

async function runAutoScrapeAll() {
  const containers = listAutoScrapeContainers();
  if (containers.length === 0) return;
  if (isScraping()) {
    log.info('AutoScrape', 'Skipping auto-scrape cycle — a scrape is already running');
    return;
  }

  log.info('AutoScrape', `Starting auto-scrape cycle for ${containers.length} containers`);

  for (const c of containers) {
    if (isScraping()) {
      log.info('AutoScrape', 'Skipping remaining containers — a scrape started externally');
      break;
    }
    try {
      log.info('AutoScrape', `Auto-scraping container: ${c.name}`, { containerId: c.id });
      const result = await runAutoScrape(c.id);
      if (!result) continue;

      // Poll for completion (max 30 min)
      const maxWait = 30 * 60 * 1000;
      const pollInterval = 30 * 1000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const current = getScrapeResult(c.id, result.id);
        if (!current || current.status === 'completed' || current.status === 'failed' || current.status === 'timed_out') {
          break;
        }
      }
    } catch (err) {
      log.error('AutoScrape', `Auto-scrape failed for ${c.name}`, { err: err.message });
    }
  }
  log.info('AutoScrape', 'Auto-scrape cycle complete');
}

setInterval(runAutoScrapeAll, 6 * 60 * 60 * 1000);

// Update changelog on startup
try {
  const newCount = updateChangelog();
  console.log(`Changelog updated: ${newCount} new commit(s) recorded`);
} catch (err) {
  console.warn('Changelog update failed:', err.message);
}

app.listen(PORT, () => {
  console.log(`Product Analyzer running at http://localhost:${PORT}`);
  console.log(`  Agent 1: Scraper       — POST /api/containers/:id/scrape`);
  console.log(`  Agent 1b: Validator    — POST /api/containers/:id/validate-scrape/:scrapeId`);
  console.log(`  Ideator: NewProduct   — POST /api/containers/:id/ideate-product`);
  console.log(`  Scraped Ads Analyzer   — POST /api/containers/:id/competitor-analysis`);
  console.log(`  SEO Agent: SEO         — POST /api/containers/:id/seo-analysis`);
  console.log(`  Google Ads: Keywords   — POST /api/google-ads/keyword-ideas`);
  console.log(`  Google Ads: Campaigns — GET  /api/google-ads/campaigns`);
  console.log(`  Keyword Ideator        — POST /api/containers/:id/keyword-strategy`);
  console.log(`  Landing Page Gen       — POST /api/containers/:id/landing-page`);
  console.log(`  Image Ad Creator       — POST /api/containers/:id/image-ads`);
  console.log(`  Settings               — PUT  /api/containers/:id/settings`);
  console.log(`  Quiz Generator         — POST /api/containers/:id/quiz`);
  console.log(`  GAds Analysis          — POST /api/google-ads/analyze-campaigns`);
  console.log(`  RPS Test Ideator       — POST /api/containers/:id/test-plan`);
  console.log(`  Case Study Analyzer    — POST /api/containers/:id/case-studies`);
  console.log(`  Clone Ad (OpenRouter)  — POST /api/containers/:id/clone-ad`);
  console.log(`  Magic AI               — POST /api/containers/:id/propose`);
  console.log(`  Agent 4: Prompt Gen    — POST /api/containers/:id/generate-prompts`);
  console.log(`  Auto-Scrape            — every 6h for enabled containers`);
});
