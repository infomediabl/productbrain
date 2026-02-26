# Product Analyzer — Project Guide

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

---

## Architecture Overview

```
server.js
  ├── routes/*.js (21 route files, each handles one API path)
  │     └── agents/*.js (14 AI agents, each called by one route)
  │           ├── config.js (AI model settings)
  │           ├── storage.js (JSON file persistence)
  │           ├── utils/parse-json.js (extract JSON from Claude responses)
  │           ├── utils/gather-data.js (collect container data for prompts)
  │           ├── utils/context-formatter.js (JSON → natural language briefs)
  │           ├── utils/summarize-ads.js (format ads for prompts)
  │           └── utils/inject-tracking.js (FB/GA code injection)
  ├── public/*.html (13 pages)
  │     └── public/js/*.js (45 frontend scripts)
  └── public/css/style.css
```

## Backend File Map

### Core Files
| File | Purpose | Used By |
|------|---------|---------|
| `config.js` | AI_MODEL, API keys, constants | All agents |
| `logger.js` | info/warn/error/debug + getLogPath() | All files |
| `storage.js` | JSON file CRUD for all entities | All routes, some agents |
| `server.js` | Express app, mounts 21 route groups | Entry point |

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
| `routes/clone-ad.js` | `/api/containers/:id/clone-ad` | | None (direct OpenRouter API) |
| `routes/google-ads.js` | `/api/google-ads` | AG-009 | google-ads-agent (various) |
| `routes/container-context.js` | `/api/containers/:id/context` | | None (uses gather-data + context-formatter) |
| `routes/container-chat.js` | `/api/containers/:id/chat` | AG-015 | container-chat-agent.chat() |
| `routes/analysis.js` | `/api/containers/:id/analyze` | | Legacy (direct scraper calls) |

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
| AG-010 | image-ad-agent | gather-data.gatherCompetitorAds, gatherScrapeData, gatherContainerContext |
| AG-012 | landing-page-agent | gather-data.gatherContainerContext, inject-tracking |
| AG-011 | quiz-agent | gather-data.gatherContainerContext, inject-tracking |
| AG-013 | test-planner-agent | gather-data.gatherContainerContext |
| AG-015 | container-chat-agent | gather-data.gatherContainerContext |
| | clone-ad (route only) | config.OPENROUTER_API_KEY |

### Utils
| File | Exports | Used By |
|------|---------|---------|
| `parse-json.js` | parseJsonFromResponse(text) | All 14 agents |
| `gather-data.js` | gatherScrapeData, gatherCompetitorAnalyses, gatherCompetitorAds, gatherGadsData, gatherContainerContext | 7 agents + container-context route |
| `context-formatter.js` | formatBrief(sourceType, content, sectionName) | container-context route, gather-data.js |
| `summarize-ads.js` | summarizeAds(ads, options) | analyzer-agent, proposal-agent |
| `inject-tracking.js` | injectTrackingCodes(html, settings) | quiz-agent, landing-page-agent |

---

## Frontend File Map

### container.html Script Load Order (order matters — later scripts use earlier globals)
1. `container.js` — Defines: `containerId`, `container`, `loadContainer()`, `renderHeader()`, `esc()`
2. `entries.js` — Defines: `renderEntries()`, `getEntryAdStats()`, uses `container`, `esc()`
3. `container-context.js` — Defines: `loadContainerContext()`, `toggleContextPanel()`, uses `containerId`, `esc()`
4. `metadata.js` — Uses `container`, `containerId`, `esc()`
5. `scraper.js` — Uses `container`, `containerId`, `esc()`
6. `scrape-validator.js` — Uses `container`, `containerId`, `esc()`
7. `product-ideator.js` — Uses `container`, `containerId`, `esc()`
8. `competitor-analyzer.js` — Uses `container`, `containerId`, `esc()`
9. `seo-analysis.js` — Uses `container`, `containerId`, `esc()`
10. `google-ads.js` — Uses `container`, `containerId`, `esc()`
11. `keyword-strategy.js` — Uses `container`, `containerId`, `esc()`
12. `test-planner.js` — Uses `container`, `containerId`, `esc()`
13. `landing-page.js` — Uses `container`, `containerId`, `esc()`
14. `quiz.js` — Uses `container`, `containerId`, `esc()`
15. `case-study.js` — Uses `container`, `containerId`, `esc()`
16. `image-ads.js` — Uses `container`, `containerId`, `esc()`
17. `proposal.js` — Uses `container`, `containerId`, `esc()`
18. `prompts.js` — Uses `container`, `containerId`, `esc()`
19. `settings.js` — Uses `container`, `containerId`, `esc()`
20. `gads-analysis.js` — Uses `container`, `containerId`, `esc()`

### Standalone Pages (no shared globals)
| HTML | JS | API Used |
|------|-----|----------|
| `competitor-analysis.html` | `competitor-analysis.js` | GET /api/containers/:id/competitor-analysis/:comp/:id, POST /api/containers/:id/context |
| `seo-analysis.html` | `seo-analysis-page.js` | GET /api/containers/:id/seo-analysis/:key/:id, POST /api/containers/:id/context |
| `proposal.html` | `proposal-report.js` | GET /api/containers/:id/proposals/:id |
| `test-plan.html` | `test-plan-report.js` | GET /api/containers/:id/test-plans/:id |
| `image-ads.html` | `image-ads-report.js` | GET /api/containers/:id/image-ads/:id |
| `scrape-details.html` | `scrape-details.js` | GET /api/containers/:id/scrapes/:id |
| `chat.html` | `chat-page.js` | GET /api/containers, POST /api/containers/:id/chat |
| `guide.html` | `guide.js` | None (static content) |

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
- `container_context[]` — Curated insights (content + text_brief)
- `settings{}` — FB Pixel, GA4, custom code, user context, `auto_scrape_enabled` (bool)

## Container Context System

Context items flow: Push (UI/push-all) → `context-formatter.formatBrief()` → stored with `text_brief` → agents read via `gatherContainerContext()` → injected as natural language into prompts.

Each item has: `{ id, source_type, source_id, section_name, content (JSON), text_brief (string), pushed_at }`

Source types: `competitor_analysis`, `seo_analysis`, `gads_analysis`, `keyword_strategy`, `manual`

---

## Server

- Port: `process.env.PORT || 3100`
- Static files: `public/` directory
- Screenshots: `screenshots/` directory
- Logs: JSON lines file via logger.js

---

## Agent Naming Convention

Every agent has a unique code (`ag0001`–`ag0015`), stored in `AGENT_META.code`.
Dashboard badges display the formatted version: `AG-001` through `AG-015`.
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
| ag0010 | image-ads | Image Ad Creator | generation |
| ag0011 | quiz | Quiz Generator | generation |
| ag0012 | landing-page | Landing Page Generator | generation |
| ag0013 | test-planner | RPS Test Ideator | generation |
| ag0014 | case-study | Case Study Analyzer | analysis |
| ag0015 | container-chat | Container Chat | chat |

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
