# Know-How: Competition Analyzer Platform

Quick reference for understanding how the app works, where things live, and how to make changes.

---

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────┐
│  Browser (public/)                                       │
│  Vanilla HTML/CSS/JS → Fetch API → Poll for results      │
└──────────────┬───────────────────────────────────────────┘
               │ HTTP
┌──────────────▼───────────────────────────────────────────┐
│  Express Server (server.js)                              │
│  Routes (routes/) → thin HTTP layer, no business logic   │
└──────────────┬───────────────────────────────────────────┘
               │ function calls
┌──────────────▼───────────────────────────────────────────┐
│  Agents (agents/) → build prompts, call Claude, parse    │
│  Shared config + utilities (config.js, utils/)           │
└──────────┬───────────────┬───────────────────────────────┘
           │               │
┌──────────▼──────┐  ┌─────▼──────────────┐
│  Claude API     │  │  Storage (storage.js)│
│  (Anthropic SDK)│  │  File-based JSON     │
└─────────────────┘  │  in /data            │
                     └─────────────────────┘
```

---

## Directory Map with Context Files

Every directory has a `CONTEXT.md` that explains what's inside.

| Path | Purpose | Context |
|------|---------|---------|
| `/` | Root — server, storage, config | [KNOW-HOW.md](KNOW-HOW.md) (this file) |
| `config.js` | Centralized AI config (models, tokens, conciseness) | See [Core Modules](#core-modules) below |
| `server.js` | Express app setup, route mounting | See [Core Modules](#core-modules) below |
| `storage.js` | File-based JSON storage with write queues | See [Core Modules](#core-modules) below |
| `logger.js` | JSON structured logging | See [Core Modules](#core-modules) below |
| `agents/` | All 12 AI agent modules | [agents/CONTEXT.md](agents/CONTEXT.md) |
| `utils/` | Shared utility functions (JSON parsing, data gathering, ad summarization, tracking injection) | [utils/CONTEXT.md](utils/CONTEXT.md) |
| `routes/` | Express route handlers (16 files) | [routes/CONTEXT.md](routes/CONTEXT.md) |
| `scrapers/` | Puppeteer scraping modules (Facebook, Google) | [scrapers/CONTEXT.md](scrapers/CONTEXT.md) |
| `public/js/` | Frontend JavaScript (21 files) | [public/js/CONTEXT.md](public/js/CONTEXT.md) |
| `data/` | Container JSON files + log file | Runtime data, not code |
| `screenshots/` | Scraper captures + generated images | Runtime data, not code |

---

## Core Modules

### `config.js`
Central configuration for all AI agents. Change model names here and every agent updates automatically.

| Key | Value | Used By |
|-----|-------|---------|
| `AI_MODEL` | `claude-sonnet-4-6` | 9 agents (default model) |
| `AI_MODEL_HEAVY` | `claude-opus-4-6` | proposal-agent, test-planner-agent (need deeper reasoning) |
| `AI_MODEL_FAST` | `claude-haiku-4-5-20251001` | quiz-agent QA pass |
| `DEFAULT_MAX_TOKENS` | `8192` | Most agents |
| `API_TIMEOUT_MS` | `600000` (10 min) | quiz-agent (long generation) |
| `CONCISENESS_INSTRUCTION` | Injected into every analysis prompt | All analysis agents |

### `server.js`
Express app. Mounts all routes, serves static files from `public/` and `screenshots/`. Port defaults to 3100.

### `storage.js`
File-based JSON storage. Each container is one JSON file in `/data`. Write operations are queued per-container to prevent corruption. Provides CRUD for containers, competitors, scrapes, analyses, proposals, and every other entity.

Key pattern: `readContainer(id)` reads synchronously, all writes go through `enqueueWrite()`.

### `logger.js`
Simple JSON-line logger. Writes to `data/scraper.log`. Exports `info()`, `warn()`, `error()`, `debug()` — each takes `(source, message, data)`.

---

## The Agent Pipeline

### Full Flow (happy path)

```
1. User creates a Container with competitors
2. Scraper Agent scrapes Facebook + Google ad libraries → raw ad data
3. Scrape Validator checks data quality (optional)
4. Analyzer Agent produces per-competitor analysis
5. SEO Agent analyzes competitor websites + own product
6. Proposal Agent generates creative ad briefs from all data
7. Prompt Agent turns briefs into AI image generation prompts
```

### Standalone Agents (can run independently)

- **Product Ideator** — proposes new product concepts (only when no product defined)
- **Keyword Ideator** — keyword strategy from competitor + SEO data
- **Image Ad Creator** — ad concepts with Pollinations.ai image generation
- **Quiz Generator** — interactive HTML quizzes
- **Landing Page Generator** — full HTML landing pages
- **Google Ads Agent** — Google Ads API integration + campaign analysis
- **Test Planner** — KNOWNS/UNKNOWNS framework, structured test plans (consumes all data sources)

---

## How to Add a New Agent

1. Create `agents/new-agent.js` following the pattern in [agents/CONTEXT.md](agents/CONTEXT.md)
2. Import `config`, `parseJsonFromResponse` from shared utils
3. Create `routes/new-agent.js` with POST (trigger) and GET (poll) endpoints
4. Mount the route in `server.js`
5. Add storage functions in `storage.js` (create, update, read)
6. Add frontend JS in `public/js/` and HTML section in the container page
7. Update `agents/CONTEXT.md` with the new agent

---

## How to Change AI Models

Edit `config.js`. All agents import model names from there. The three tiers:
- **Heavy** (`AI_MODEL_HEAVY`): For the most complex analysis (proposal-agent, test-planner-agent)
- **Default** (`AI_MODEL`): Standard analysis quality (most agents)
- **Fast** (`AI_MODEL_FAST`): Quick validation passes (quiz QA check)

---

## How to Change What AI Outputs

Each agent's prompt is in its `build*Prompt()` function. The JSON schema is defined inline in the prompt text. To add/remove output fields:

1. Edit the JSON schema in the agent's prompt
2. Update the corresponding frontend JS to render (or stop rendering) the field
3. Use optional chaining (`?.`) in frontend to handle old data that may or may not have the field

The `CONCISENESS_INSTRUCTION` from config is appended to every analysis system prompt to keep outputs short.

---

## Data Model

Each container JSON file has this structure:

```
{
  id, name, created_at,
  my_product: { name, website, site_type, unique_angle, target_audience } | null,
  competitors: [{ id, name, website }],
  scrape_results: [{ id, status, scraped_data, validation }],
  competitor_analyses: { [compId]: [{ id, status, result }] },
  seo_analyses: { [compId|'_own_product']: [{ id, status, result }] },
  proposals: [{ id, status, result }],
  generated_prompts: [{ id, status, result }],
  product_ideas: [{ id, status, result }],
  keyword_strategies: [{ id, status, result }],
  landing_pages: [{ id, status, result }],
  image_ads: [{ id, status, result }],
  quizzes: [{ id, status, result }],
  gads_analyses: [{ id, status, result, meta }],
  test_plans: [{ id, status, result: { json_data, classification, full_text } }],
  metadata: [{ id, type, title, content }],
  settings: { facebook_pixel_id, google_analytics_id, ... },
  analyses: [...] // legacy, backward compat
}
```

Status lifecycle: `generating` → `completed` | `failed`

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access |
| `SERPAPI_API_KEY` | For search | SerpAPI search data |
| `PORT` | No (default 3100) | Server port |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | For Google Ads | Google Ads API |
| `GOOGLE_ADS_CLIENT_ID` | For Google Ads | OAuth client |
| `GOOGLE_ADS_CLIENT_SECRET` | For Google Ads | OAuth secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | For Google Ads | OAuth refresh token |
| `GOOGLE_ADS_CUSTOMER_ID` | For Google Ads | Account ID |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | No | MCC manager account ID |
