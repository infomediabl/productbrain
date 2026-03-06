# ProductBrain — Project Guide

## Multi-Session Work Zones

This project supports parallel Claude Code sessions. Each zone can be worked on independently.
**CRITICAL**: Never edit files in the SHARED zone from two sessions simultaneously.

### SHARED (edit from ONE session only)
- `storage.js` — All data CRUD; every route and agent depends on it
- `server.js` — Route registration; must stay in sync with routes/
- `config.js` — AI model config used by all agents
- `utils/gather-data.js` — Data gathering functions used by 7+ agents
- `public/container.html` — Main dashboard HTML; loads 20+ JS files

### ZONE A: Agents (safe to edit independently)
Each agent is self-contained. Edit any agent without affecting others.
- `agents/<name>-agent.js` — Each imports: config, storage, logger, parse-json, sometimes gather-data
- `routes/<name>.js` — Each route maps 1:1 to one agent (except containers.js, metadata.js, settings.js)

### ZONE B: Dashboard Frontend (safe to edit independently)
Frontend JS files share globals via `container.html` script load order but don't import each other.
- `public/js/*.js` — Each file defines functions used by container.html
- `public/css/style.css` — Styling only, no dependencies

### ZONE C: Standalone Pages (safe to edit independently)
Each page is fully independent with its own JS file.
- `public/competitor-analysis.html` + `public/js/competitor-analysis.js`
- `public/seo-analysis.html` + `public/js/seo-analysis-page.js`
- `public/proposal.html` + `public/js/proposal-report.js`
- `public/test-plan.html` + `public/js/test-plan-report.js`
- `public/image-ads.html` + `public/js/image-ads-report.js`
- `public/keyword-strategy.html` + `public/js/keyword-strategy-page.js`
- `public/desire-spring.html` + `public/js/desire-spring-page.js`
- `public/research-web.html` + `public/js/research-web-page.js`
- `public/case-study.html` + `public/js/case-study-report.js`
- `public/agent-guide.html` + `public/js/agent-guide.js`
- `public/taboola-campaign.html` + `public/js/taboola-campaign-report.js`
- `public/spinoff-ideas.html` + `public/js/spinoff-ideas-report.js`
- `public/ad-workshop.html` + `public/js/ad-workshop.js`
- `public/taboola-workshop.html` + `public/js/taboola-workshop.js`
- `public/content-validator.html` + `public/js/content-validator.js`
- `public/data-feed.html` + `public/js/data-feed-page.js`

---

## Architecture Overview

```
mcp-server.js (MCP stdio server — exposes agents as tools for external clients)
server.js
  ├── routes/*.js (28 route files, each handles one API path)
  │     └── agents/*.js (24 agents, each called by one route)
  │           ├── config.js (AI model settings)
  │           ├── storage.js (JSON file persistence)
  │           ├── utils/parse-json.js (extract JSON from Claude responses)
  │           ├── utils/gather-data.js (collect container data for prompts)
  │           ├── utils/context-formatter.js (JSON → natural language briefs)
  │           ├── utils/summarize-ads.js (format ads for prompts)
  │           ├── utils/inject-tracking.js (FB/GA code injection)
  │           └── utils/taboola-auth.js (Taboola OAuth 2.0 token cache)
  ├── public/*.html (25 pages)
  │     └── public/js/*.js (50 frontend scripts)
  └── public/css/style.css
```

## Backend File Map

### Core Files
| File | Purpose | Used By |
|------|---------|---------|
| `config.js` | AI_MODEL, API keys, constants | All agents |
| `logger.js` | info/warn/error/debug + getLogPath() | All files |
| `storage.js` | JSON file CRUD for all entities | All routes, some agents |
| `server.js` | Express app, mounts 25 route groups | Entry point |
| `mcp-server.js` | MCP server, exposes all 24 agents as tools | MCP clients (Claude Code, Claude Desktop, Cursor) |

### Routes → Agent Mapping
| Route File | Mounts At | Code | Calls Agent |
|------------|-----------|------|-------------|
| `routes/containers.js` | `/api/containers` | | None (direct CRUD) |
| `routes/metadata.js` | `/api/containers/:id/metadata` | | None (direct CRUD) |
| `routes/settings.js` | `/api/containers/:id/settings` | | None (direct CRUD) |
| `routes/scraper.js` | `/api/containers/:id/scrape` | AG-001 | scraper-agent.runScrape() |
| `routes/scrape-validator.js` | `/api/containers/:id/validate-scrape` | AG-002 | scrape-validator-agent.validateScrape() |
| `routes/competitor-analysis.js` | `/api/containers/:id/competitor-analysis` | AG-003 | analyzer-agent.analyzeCompetitor() |
| `routes/seo-analysis.js` | `/api/containers/:id/seo-analysis` | AG-004 | seo-agent.analyzeSeo/analyzeOwnSeo() |
| `routes/proposal.js` | `/api/containers/:id/propose` | AG-005 | proposal-agent.generateProposal() |
| `routes/prompts.js` | `/api/containers/:id/generate-prompts` | AG-006 | prompt-agent.generatePrompts() |
| `routes/product-ideator.js` | `/api/containers/:id/ideate-product` | AG-007 | product-ideator-agent.ideateProduct() |
| `routes/keyword-ideator.js` | `/api/containers/:id/keyword-strategy` | AG-008 | keyword-ideator-agent.generateKeywordStrategy() |
| `routes/landing-page.js` | `/api/containers/:id/landing-page` | AG-012 | landing-page-agent.generateLandingPage() |
| `routes/image-ads.js` | `/api/containers/:id/image-ads` | AG-010 | image-ad-agent.generateImageAds() |
| `routes/quiz.js` | `/api/containers/:id/quiz` | AG-011 | quiz-agent.generateQuiz() |
| `routes/test-planner.js` | `/api/containers/:id/test-plan` | AG-013 | test-planner-agent.generateTestPlan() |
| `routes/case-study.js` | `/api/containers/:id/case-studies` | AG-014 | case-study-agent.analyzeCaseStudy() |
| `routes/clone-ad.js` | `/api/containers/:id/clone-ad` | | None (direct OpenRouter API; accepts save_dir, save_filename, custom_instructions) |
| `routes/google-ads.js` | `/api/google-ads` | AG-009 | google-ads-agent (various) |
| `routes/container-context.js` | `/api/containers/:id/context` | | None (uses gather-data + context-formatter) |
| `routes/container-chat.js` | `/api/containers/:id/chat` | AG-015 | container-chat-agent.chat() |
| `routes/analysis.js` | `/api/containers/:id/analyze` | | Legacy (direct scraper calls) |
| `routes/desire-spring.js` | `/api/desire-spring` | AG-016 | desire-spring-agent.generateInstructions() |
| `routes/research-web.js` | `/api/research-web` | AG-017 | research-web-agent.searchWeb(), summarizeSources() |
| `routes/taboola.js` | `/api/containers/:id/taboola-campaign` | AG-018 | taboola-agent.cloneToCampaign() |
| `routes/spinoff-ideas.js` | `/api/containers/:id/spinoff-ideas` | AG-019 | spinoff-ideas-agent.generateSpinoffIdeas() |
| `routes/agent-info.js` | `/api/agent-info` | | None (reads agents/registry.js) |
| `routes/folder-scraper.js` | `/api/containers/:id/folder-scrape` | AG-021 | folder-scraper-agent.importFromFolder() |
| `routes/hooks.js` | `/api/containers/:id/hooks` | AG-020 | hooks-agent.generateHooks() |
| `routes/content-validator.js` | `/api/containers/:id/content-validator` | AG-022 | content-validator-agent.validateContent() |
| `routes/project-overview.js` | `/api/containers/:id/project-overview` | AG-023 | project-overview-agent.generateOverview() |
| `routes/data-feed.js` | `/api/containers/:id/data-feed` | AG-024 | data-feed-agent.analyzeDataFeed() |

### Agent Dependencies
All agents require: `config.js`, `logger.js`, `storage.js`, `utils/parse-json.js`

Additional dependencies per agent:
| Code | Agent | Extra Dependencies |
|------|-------|-------------------|
| AG-001 | scraper-agent | puppeteer, tesseract.js, scrapers/* |
| AG-003 | analyzer-agent | gather-data.gatherCompetitorAds, summarize-ads |
| AG-004 | seo-agent | gather-data.gatherCompetitorAds |
| AG-005 | proposal-agent | gather-data.* (all 5 functions), summarize-ads |
| AG-007 | product-ideator-agent | gather-data.gatherScrapeData, gatherCompetitorAnalyses |
| AG-008 | keyword-ideator-agent | gather-data.gatherContainerContext |
| AG-010 | image-ad-agent | gather-data.gatherCompetitorAds, gatherCompetitorAnalyses, gatherContainerContext, summarize-ads |
| AG-012 | landing-page-agent | gather-data.gatherContainerContext, inject-tracking |
| AG-011 | quiz-agent | gather-data.gatherContainerContext, inject-tracking |
| AG-013 | test-planner-agent | gather-data.gatherContainerContext |
| AG-015 | container-chat-agent | gather-data.gatherContainerContext |
| AG-016 | desire-spring-agent | fs (reads CLAUDE.md), self-contained storage in data/desire-spring.json |
| AG-017 | research-web-agent | scrapers/browser (Puppeteer), self-contained storage in data/web-research.json |
| AG-018 | taboola-agent | gather-data.gatherContainerContext, utils/taboola-auth, Taboola Backstage API |
| AG-019 | spinoff-ideas-agent | gather-data.gatherScrapeData, gatherCompetitorAnalyses, gatherContainerContext |
| AG-020 | hooks-agent | gather-data.gatherContainerContext, gatherScrapeData |
| AG-021 | folder-scraper-agent | fs (reads data/uploads/) |
| AG-022 | content-validator-agent | gather-data.gatherContainerContext |
| AG-023 | project-overview-agent | gather-data.gatherContainerContext |
| AG-024 | data-feed-agent | gather-data.gatherContainerContext |
| | clone-ad (route only) | config.OPENROUTER_API_KEY |

### Utils
| File | Exports | Used By |
|------|---------|---------|
| `parse-json.js` | parseJsonFromResponse(text) | All 16 agents |
| `gather-data.js` | gatherScrapeData, gatherCompetitorAnalyses, gatherCompetitorAds, gatherGadsData, gatherContainerContext | 8 agents + container-context route |
| `context-formatter.js` | formatBrief(sourceType, content, sectionName) | container-context route, gather-data.js |
| `summarize-ads.js` | summarizeAds(ads, options) | analyzer-agent, proposal-agent |
| `inject-tracking.js` | injectTrackingCodes(html, settings) | quiz-agent, landing-page-agent |
| `changelog.js` | updateChangelog(), getChangelog() | server.js (startup + API route) |
| `taboola-auth.js` | getTaboolaToken(credentials?) | taboola-agent, routes/taboola.js |

---

## Frontend File Map

### container.html Script Load Order (order matters — later scripts use earlier globals)
1. `container.js` — Defines: `containerId`, `container`, `loadContainer()`, `renderHeader()`, `esc()`
2. `project-overview.js` — Uses `container`, `containerId`, `esc()`
3. `entries.js` — Defines: `renderEntries()`, `getEntryAdStats()`, uses `container`, `esc()`
3. `container-context.js` — Defines: `loadContainerContext()`, `toggleContextPanel()`, uses `containerId`, `esc()`
4. `metadata.js` — Uses `container`, `containerId`, `esc()`
5. `scraper.js` — Uses `container`, `containerId`, `esc()`
6. `scrape-validator.js` — Uses `container`, `containerId`, `esc()`
7. `folder-scraper.js` — Uses `container`, `containerId`, `esc()`
8. `product-ideator.js` — Uses `container`, `containerId`, `esc()`
8. `competitor-analyzer.js` — Uses `container`, `containerId`, `esc()`
9. `seo-analysis.js` — Uses `container`, `containerId`, `esc()`
10. `google-ads.js` — Uses `container`, `containerId`, `esc()`
11. `keyword-strategy.js` — Uses `container`, `containerId`, `esc()`
12. `test-planner.js` — Uses `container`, `containerId`, `esc()`
13. `landing-page.js` — Uses `container`, `containerId`, `esc()`
14. `quiz.js` — Uses `container`, `containerId`, `esc()`
15. `case-study.js` — Uses `container`, `containerId`, `esc()`
16. `image-ads.js` — Uses `container`, `containerId`, `esc()`
17. `data-feed.js` — Uses `container`, `containerId`, `esc()`
18. `spinoff-ideas.js` — Uses `container`, `containerId`, `esc()`
18. `proposal.js` — Uses `container`, `containerId`, `esc()`
19. `prompts.js` — Uses `container`, `containerId`, `esc()`
20. `settings.js` — Uses `container`, `containerId`, `esc()`
21. `gads-analysis.js` — Uses `container`, `containerId`, `esc()`
22. `agent-info.js` — Self-contained (agent info modal)

### Standalone Pages (no shared globals)
| HTML | JS | API Used |
|------|-----|----------|
| `competitor-analysis.html` | `competitor-analysis.js` | GET /api/containers/:id/competitor-analysis/:comp/:id, POST /api/containers/:id/context |
| `seo-analysis.html` | `seo-analysis-page.js` | GET /api/containers/:id/seo-analysis/:key/:id, POST /api/containers/:id/context |
| `proposal.html` | `proposal-report.js` | GET /api/containers/:id/proposals/:id |
| `test-plan.html` | `test-plan-report.js` | GET /api/containers/:id/test-plans/:id |
| `image-ads.html` | `image-ads-report.js` | Dual-mode: Workflow (?cid=X) — GET /api/containers/:id, POST /api/containers/:id/image-ads, POST /api/containers/:id/context; Report (?cid=X&adId=Y) — GET /api/containers/:id/image-ads/:id, POST /api/containers/:id/context |
| `scrape-details.html` | `scrape-details.js` | GET /api/containers/:id/scrapes/:id, POST /api/containers/:id/context, GET /api/containers/:id/clone-ad/models, POST /api/containers/:id/clone-ad |
| `chat.html` | `chat-page.js` | GET /api/containers, POST /api/containers/:id/chat |
| `keyword-strategy.html` | `keyword-strategy-page.js` | GET /api/containers, GET /api/containers/:id, POST /api/containers/:id/keyword-strategy, GET /api/containers/:id/keyword-strategies/:id |
| `guide.html` | `guide.js` | None (static content) |
| `agent-guide.html` | `agent-guide.js` | None (static content, reads ?agent= query param) |
| `changelog.html` | `changelog.js` | GET /api/changelog |
| `desire-spring.html` | `desire-spring-page.js` | POST /api/desire-spring, GET /api/desire-spring, GET /api/desire-spring/:id, POST /api/desire-spring/:id/save, DELETE /api/desire-spring/:id |
| `research-web.html` | `research-web-page.js` | POST /api/research-web/search, GET /api/research-web, GET /api/research-web/:id, POST /api/research-web/:id/summarize, DELETE /api/research-web/:id, POST /api/containers/:id/context |
| `case-study.html` | `case-study-report.js` | GET /api/containers/:id/case-studies/:studyId, POST /api/containers/:id/context |
| `taboola-campaign.html` | `taboola-campaign-report.js` | GET /api/containers/:id/taboola-campaign/:campaignId |
| `spinoff-ideas.html` | `spinoff-ideas-report.js` | GET /api/containers/:id/spinoff-ideas/:ideaId, POST /api/containers/:id/context |
| `ad-workshop.html` | `ad-workshop.js` | GET /api/containers/:id, GET /api/containers/:id/clone-ad/models, POST /api/containers/:id/clone-ad, POST /api/containers/:id/hooks, GET /api/containers/:id/hooks/:id |
| `taboola-workshop.html` | `taboola-workshop.js` | GET /api/containers/:id, POST /api/containers/:id/taboola-campaign, GET /api/containers/:id/taboola-campaign/:campaignId |
| `content-validator.html` | `content-validator.js` | GET /api/containers/:id, GET /api/containers/:id/context, POST /api/containers/:id/content-validator, GET /api/containers/:id/content-validator/:id, DELETE /api/containers/:id/content-validator/:id |
| `data-feed.html` | `data-feed-page.js` | POST /api/containers/:id/data-feed, GET /api/containers/:id/data-feeds/:id, DELETE /api/containers/:id/data-feeds/:id, POST /api/containers/:id/context |

---

## Data Storage

All data stored in `data/<container-id>.json`. Key fields:
- `my_product` — User's product info
- `competitors[]` — Competitor entries
- `metadata[]` — Notes, HTML snippets, links
- `scrape_results[]` — Scraper output (ads per competitor). Each scrape has `trigger` ('manual'|'auto'), `new_ads_count` (int). Each ad may have `is_new` (bool), `ocr_structured` ({headline, description, cta, url})
- `competitor_analyses{}` — AI analysis per competitor {compId: [analysis,...]}
- `seo_analyses{}` — SEO reports {compId: [analysis,...], _own_product: [...]}
- `proposals[]` — AI marketing proposals
- `generated_prompts[]` — AI-generated ad prompts
- `product_ideas[]` — Product ideation results
- `keyword_strategies[]` — Keyword strategy results
- `landing_pages[]` — Generated landing page HTML
- `image_ads[]` — Image ad generation results
- `quizzes[]` — Quiz HTML results
- `test_plans[]` — A/B test plans
- `case_studies[]` — Case study analyses
- `gads_analyses[]` — Google Ads campaign analyses
- `keyword_ideas[]` — Persisted Google Keyword Planner results (search volume, CPC bids, competition)
- `taboola_campaigns[]` — Taboola campaign clone results {id, created_at, status, source_ad_ids[], result: {campaign_name, taboola_campaign_id, campaign_url, items[], daily_cap, cpc_bid, country_targeting, platform_targeting}}
- `spinoff_ideas[]` — Spin-off product idea results {id, created_at, status, result: {full_text, json_data: {landscape_summary, spinoff_ideas[]}, generated_at}}
- `hooks_results[]` — Hooks/angles generation results {id, created_at, status, result: {hooks: [{id, angle_name, hook_text, emotion, angle_type, target_segment, inspired_by, rationale, adapted_for_product, suggested_visuals}], angle_summary}}
- `validations[]` — Content validation results {id, created_at, status, meta: {validate_type, comment}, result: {verdict, score, summary, strengths[], weaknesses[], recommendations[], user_perspective_notes}}
- `project_overview` — Single object: `{ id, created_at, status, result: { text } }`
- `data_feeds[]` — Data feed results: `{ id, created_at, status, filename, row_count, columns[], preview_rows[], result: { summary, insights[], key_metrics[] } }`
- `container_context[]` — Curated insights (content + text_brief)
- `settings{}` — FB Pixel, GA4, custom code, user context, `auto_scrape_enabled` (bool), `taboola` ({client_id, client_secret, account_id})

Also: `data/changelog.json` — Git commit history + app-start events (not per-container)
Also: `data/desire-spring.json` — DesireSpring feature ideas + generated instructions (not per-container)
Also: `data/web-research.json` — Web research sessions with sources, summaries, and combined briefs (not per-container)

## Container Context System

Context items flow: Push (UI/push-all) → `context-formatter.formatBrief()` → stored with `text_brief` → agents read via `gatherContainerContext()` → injected as natural language into prompts.

Each item has: `{ id, source_type, source_id, section_name, content (JSON), text_brief (string), pushed_at }`

Source types: `competitor_analysis`, `seo_analysis`, `gads_analysis`, `keyword_strategy`, `manual`, `content_validation`, `data_feed`

---

## Server

- Port: `process.env.PORT || 3100`
- Static files: `public/` directory
- Screenshots: `screenshots/` directory (scraper captures, clone-ad defaults)
- Cloned ads: `clonedAd/` directory (clone-ad output from scrape-details page)
- Logs: JSON lines file via logger.js

---

## Agent Naming Convention

Every agent has a unique code (`ag0001`–`ag0022`), stored in `AGENT_META.code`.
Dashboard badges display the formatted version: `AG-001` through `AG-022`.
When adding a new agent, assign the next sequential code.

| Code | ID | Display Name | Category |
|------|----|-------------|----------|
| ag0001 | scraper | Ad Scraper | scraping |
| ag0002 | scrape-validator | Scrape Validator | validation |
| ag0003 | analyzer | Scraped Ads Analyzer | analysis |
| ag0004 | seo | SEO Analyzer | analysis |
| ag0005 | proposal | Magic AI Proposal | generation |
| ag0006 | prompt-generator | Prompt Generator | generation |
| ag0007 | product-ideator | Product Ideator | generation |
| ag0008 | keyword-ideator | Keyword Strategist | generation |
| ag0009 | google-ads | Google Ads Connector | api |
| ag0010 | image-ads | Image Ad Curator | generation |
| ag0011 | quiz | Quiz Generator | generation |
| ag0012 | landing-page | Landing Page Generator | generation |
| ag0013 | test-planner | RPS Test Ideator | generation |
| ag0014 | case-study | Case Study Analyzer | analysis |
| ag0015 | container-chat | Container Chat | chat |
| ag0016 | desire-spring | DesireSpring | generation |
| ag0017 | research-web | ResearchWeb | research |
| ag0018 | taboola | Taboola Campaign Cloner | generation |
| ag0019 | spinoff-ideas | SpinOff Ideas | generation |
| ag0020 | hooks | Hooks Generator | generation |
| ag0021 | folder-scraper | Folder Ad Importer | collection |
| ag0022 | content-validator | Content Validator | validation |
| ag0023 | project-overview | Project Overview | generation |
| ag0024 | data-feed | User Data Feed | analysis |

---

## Adding a New Agent / Feature Segment

When adding a new AI agent or feature segment, follow this exact checklist. Every step is required.

### Step 1: Agent File — `agents/<name>-agent.js`

Create the agent file with the standard header and structure:

```js
/**
 * Agent: <Display Name>
 * Route: routes/<name>.js → POST /api/containers/:id/<endpoint>
 * Deps: config, storage, logger, parse-json, <extra deps>
 * Stores: storage.<pluralKey>[]
 *
 * <One-line description of what this agent does.>
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
// Optional: const { gatherContainerContext } = require('../utils/gather-data');

const SRC = '<AgentName>Agent';

const AGENT_META = {
  id: '<kebab-name>',
  name: '<Display Name>',
  description: '<Short description>',
  category: 'collection' | 'analysis' | 'generation',
  model: 'AI_MODEL',
  inputs: [{ name: 'containerId', type: 'string', required: true, from: null }],
  consumes: [],
  outputs: { storageKey: '<pluralKey>', dataType: 'json' | 'html', schema: '<SchemaName>' },
  ui: { visible: true },
};

async function mainFunction(containerId, options = {}) {
  // 1. Read container
  // 2. Create record via storage
  // 3. Fire-and-forget async execution (with catch → storage update to 'failed')
  // 4. Return the created record
}
module.exports = { mainFunction, AGENT_META };
```

**Rules:**
- Always use `parseJsonFromResponse()` to extract JSON from AI responses
- Always create a record in storage BEFORE starting AI work (so UI can poll)
- Fire-and-forget the AI call; update storage with `status: 'completed'` or `'failed'`
- Use `gatherContainerContext()` if the agent needs curated context data
- Use `injectTrackingCodes()` if the agent produces HTML output

### Step 2: Storage CRUD — `storage.js`

Add three functions following the existing pattern:

```js
// ========== <Display Name> CRUD ==========
function add<Entity>(containerId) { /* enqueueWrite, push to container.<pluralKey>[] */ }
function update<Entity>(containerId, entityId, status, result) { /* enqueueWrite, find & update */ }
function get<Entity>(containerId, entityId) { /* readContainerFile, find by id */ }
```

- Add new functions to the `module.exports` block at the bottom
- Use `enqueueWrite()` for all mutations
- Follow the `{ id, created_at, status, result }` record shape

Also add the new storage key to the **Data Storage** section in this CLAUDE.md file.

### Step 3: Route File — `routes/<name>.js`

Create the route with the standard header:

```js
/**
 * Route: <Display Name>
 * Mount: /api/containers/:id/<endpoint> (via server.js)
 * Agent: <name>-agent.<mainFunction>()
 * Deps: express, storage, <name>-agent, logger
 *
 * POST /           — Trigger generation
 * GET  /:entityId  — Get specific result
 * GET  /           — List all results
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { mainFunction } = require('../agents/<name>-agent');
const log = require('../logger');
```

**Rules:**
- Always use `mergeParams: true` on the router
- POST returns `202` with `{ <entity>_id, status: 'generating' }`
- GET /:id returns the full entity or 404
- GET / returns a summary list (id, created_at, status, key fields)

### Step 4: Register Route — `server.js`

Add two lines following the existing pattern:

```js
const <name>Router = require('./routes/<name>');  // <Display Name>
// ...
app.use('/api/containers/:id/<endpoint>', <name>Router);
app.use('/api/containers/:id/<plural-endpoint>', <name>Router);  // alias
```

Add a `console.log` line in the `listen()` callback.

### Step 5: Dashboard UI — `public/js/<name>.js`

Create the frontend script with the standard header:

```js
/**
 * <Display Name> UI
 * Page: container.html (loaded after container.js)
 * Globals used: container, containerId, esc() — from container.js
 * Globals defined: render<Entities>(), <other functions>
 * API: POST /api/containers/:id/<endpoint>, GET /api/containers/:id/<plural>/:id
 *
 * <One-line description.>
 */
```

**Rules:**
- Use only the globals from `container.js`: `container`, `containerId`, `esc()`
- Define a `render<Entities>()` function that reads from `container.<pluralKey>`
- Poll for status changes using `setTimeout` (3s intervals), NOT `setInterval`

### Step 6: Register in `container.html`

Add two things:
1. **Script tag** — Add `<script src="/js/<name>.js"></script>` in the script load order (before `settings.js`, after related feature scripts)
2. **HTML section** — Add the UI section card in the appropriate position in the main content area

### Step 7: Standalone Report Page (if the agent produces viewable output)

If the feature has a dedicated report view, create:
- `public/<name>.html` — Standalone page with standard header/nav (including Guide link)
- `public/js/<name>-report.js` — Fetches and renders the full result

**Nav must include:** `Dashboard | Guide | New Container`

### Step 8: Update Documentation (REQUIRED)

Every new agent/feature **must** update these files:

| File | What to Update |
|------|---------------|
| `CLAUDE.md` | Routes→Agent table, Agent Dependencies table, Frontend File Map, Data Storage fields, container.html script load order, Standalone Pages table (if applicable) |
| `public/guide.html` | Add a new subsection under the correct category (Data Collection / Analysis / Generation) with collapsible details |

---

## Documentation Update Rule

**MANDATORY: Any change that significantly alters app functionality must include documentation updates.**

This applies to:
- Adding, removing, or renaming an agent or feature
- Changing API endpoints or request/response shapes
- Adding new storage fields or changing data structures
- Adding or removing pages, modifying navigation
- Changing the container.html script load order
- Modifying how Container Context works

### What to update:

| Change Type | Update CLAUDE.md | Update guide.html |
|-------------|-----------------|-------------------|
| New agent/feature | Yes — all relevant tables | Yes — add section |
| Remove agent/feature | Yes — remove from tables | Yes — remove section |
| Rename/move endpoint | Yes — Routes table | No (unless user-facing name changes) |
| New storage field | Yes — Data Storage section | No (unless user-visible) |
| New page added | Yes — Standalone Pages + script order | Yes — if it's a feature users interact with |
| Nav change | No | Yes — update nav if needed |
| Bug fix / refactor | No | No |

### Post-Task Documentation Check

After completing any task, ask yourself:
1. Did I add, remove, or rename any files?
2. Did I change any API endpoints?
3. Did I add new storage fields?
4. Did I change what users see or can do?

If **any answer is yes**, update `CLAUDE.md` and/or `public/guide.html` before considering the task complete. This is not optional — treat it as part of the definition of done.

---

## Testing

### Commands

```bash
npm test                              # Run all tests
npm test -- tests/agents/hooks-agent.test.js   # Run a single agent test
npx jest --config tests/jest.config.js --verbose  # Verbose output
npx jest --config tests/jest.config.js --coverage # Coverage report
```

### Directory Structure

```
tests/
  jest.config.js           — Jest configuration (moduleNameMapper for puppeteer/tesseract/google-ads-api)
  setup.js                 — Global setup: mocks logger, suppresses console output
  fixtures/
    container.js           — Factory functions: makeContainer, makeContainerWithAds, makeContainerWithAnalyses, etc.
    anthropic-responses.js — AI response shape factories: makeAnthropicResponse, makeJsonResponse
  helpers/
    mock-puppeteer.js      — Puppeteer stub (mapped via moduleNameMapper)
    mock-tesseract.js      — Tesseract.js stub (mapped via moduleNameMapper)
    mock-google-ads.js     — google-ads-api stub (mapped via moduleNameMapper)
    mock-anthropic.js      — setupAnthropicMock() helper for per-test AI mocking
    agent-meta-validator.js — validateAgentMeta() assertion helper
    async-agent-runner.js  — waitForAsync() to flush fire-and-forget promises
  agents/
    registry.test.js       — Tests all 22 agents registered, unique IDs/codes, getAgent, getDependencyGraph
    <agent-name>.test.js   — One test file per agent (21 files)
```

### Test Pattern (standard AI agents)

Each agent test file follows this structure:
1. `jest.mock('../../storage')` + `jest.mock('@anthropic-ai/sdk')` + other deps
2. `beforeEach`: clearAllMocks, set up storage mocks with `mockResolvedValue`, configure Anthropic mock
3. **AGENT_META** — validates required fields via `validateAgentMeta()`
4. **Input validation** — missing container/params throw expected errors
5. **Record creation** — `storage.add*()` called, record returned immediately
6. **Success path** — AI resolves → `storage.update*()` called with 'completed' (uses `waitForAsync()`)
7. **Error path** — AI rejects → `storage.update*()` called with 'failed'

### Mocking Strategy

| Dependency | Approach | Reason |
|---|---|---|
| `storage.js` | `jest.mock('../../storage')` | All 48 CRUD functions mocked |
| `@anthropic-ai/sdk` | `jest.mock(...)` + `mockImplementation` | No real API calls |
| `logger.js` | Global mock in `setup.js` | Suppress file writes |
| `puppeteer` | `moduleNameMapper` in jest.config.js | No browser needed |
| `tesseract.js` | `moduleNameMapper` in jest.config.js | No OCR engine needed |
| `google-ads-api` | `moduleNameMapper` in jest.config.js | No Google API needed |
| `utils/parse-json.js` | NOT mocked | Pure function, tested with real impl |
| `utils/gather-data.js` | `jest.mock(...)` per test file | Returns fixture data |
| `config.js` | NOT mocked | Static constants |

### Key Gotchas

- All `storage.add*()` / `storage.create*()` functions return Promises — mock with `.mockResolvedValue()`, not `.mockReturnValue()`
- `storage.addHooksResult()` is the exception — hooks-agent does NOT await it
- `gatherContainerContext()` and other gather-data functions are synchronous — mock with `.mockReturnValue()`
- Fire-and-forget agents need `await waitForAsync()` before asserting on storage.update calls
- `updateCompetitorAnalysis` / `updateSeoAnalysis` take competitorId as 2nd arg (5 total args)
- Prompt agent reads proposals from `container.proposals[]`, not via `storage.getProposal()`

---

## MCP Server

`mcp-server.js` exposes all 22 agents as MCP tools via stdio transport. Any MCP-compatible client (Claude Code, Claude Desktop, Cursor) can call these tools.

### Running

```bash
npm run mcp                    # Start MCP server (stdio)
node mcp-server.js             # Same thing
```

### Configuration

Add to your MCP client config (e.g. `~/.claude/settings.json` for Claude Code):

```json
{
  "mcpServers": {
    "product-analyzer": {
      "command": "node",
      "args": ["C:/Users/PC/Desktop/AI/mcp-server.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

See `mcp-config.example.json` for a template.

### Environment Variables

- `ANTHROPIC_API_KEY` — Required for all AI agents
- `OPENROUTER_API_KEY` — Required for clone-ad features
- `GOOGLE_ADS_*` — Required for Google Ads tools (AG-009)
- `TABOOLA_*` — Required for Taboola tools (AG-018)

### Tool List (31 tools)

#### Utility Tools (3)

| Tool | Description |
|------|-------------|
| `list_containers` | List all product containers |
| `get_container` | Get full container data by ID |
| `get_result` | Get a specific result by container ID, storage key, and result ID |

#### Agent Tools (22)

| Tool | Agent | Key Params |
|------|-------|------------|
| `run_hooks` | AG-020 Hooks Generator | containerId |
| `run_image_ads` | AG-010 Image Ad Curator | containerId |
| `run_quiz` | AG-011 Quiz Generator | containerId |
| `run_landing_page` | AG-012 Landing Page Generator | containerId |
| `run_test_plan` | AG-013 RPS Test Ideator | containerId |
| `run_keyword_strategy` | AG-008 Keyword Strategist | containerId |
| `run_spinoff_ideas` | AG-019 SpinOff Ideas | containerId |
| `run_product_ideas` | AG-007 Product Ideator | containerId, userPrompt? |
| `run_competitor_analysis` | AG-003 Scraped Ads Analyzer | containerId, competitorId |
| `run_seo_competitor` | AG-004 SEO Analyzer (competitor) | containerId, competitorId |
| `run_seo_own` | AG-004 SEO Analyzer (own product) | containerId |
| `run_proposal` | AG-005 Magic AI Proposal | containerId, competitorIds[], userContext?, userPrompt? |
| `run_prompts` | AG-006 Prompt Generator | containerId, proposalId |
| `run_case_study` | AG-014 Case Study Analyzer | containerId, source_type, content?, url? |
| `run_scrape_validate` | AG-002 Scrape Validator | containerId, scrapeId |
| `run_taboola_preview` | AG-018 Taboola Preview | containerId, ad_ids? |
| `run_taboola_clone` | AG-018 Taboola Clone | containerId, ad_ids? |
| `run_folder_import` | AG-021 Folder Ad Importer | containerId |
| `chat` | AG-015 Container Chat | containerId, message, history? |
| `run_desire_spring` | AG-016 DesireSpring | idea_text |
| `run_web_research` | AG-017 ResearchWeb | topic |
| `run_content_validator` | AG-022 Content Validator | containerId, validate_type, content, comment? |
| `run_project_overview` | AG-023 Project Overview | containerId |
| `run_data_feed` | AG-024 User Data Feed | containerId, csv_text, filename? |

#### Google Ads Tools (4)

| Tool | Description |
|------|-------------|
| `gads_is_configured` | Check if Google Ads API is configured |
| `gads_list_accounts` | List accessible Google Ads accounts |
| `gads_list_campaigns` | List campaigns for an account |
| `gads_keyword_ideas` | Generate keyword ideas via Keyword Planner |

### How It Works

- **Fire-and-forget agents** (most): The tool calls the agent, which returns `{ id, status: 'generating' }`. The MCP tool then polls storage every 2s until status is `completed` or `failed` (max 120s timeout).
- **Sync agents** (`chat`): Returns the result directly.
- **No-wait agents** (`run_scrape_validate`, `run_folder_import`): Returns immediately after triggering.
- **Non-container agents** (`run_desire_spring`, `run_web_research`): Use their own storage files, not container storage.
