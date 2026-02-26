# Competition Analyzer — Agent Guide

## Project Overview
A multi-agent competition analysis tool built with Express.js and vanilla JavaScript frontend. The app scrapes competitor ads (Facebook & Google), analyzes them with Claude AI, generates marketing proposals, and creates AI image prompts.

## Detailed Documentation
- **[KNOW-HOW.md](KNOW-HOW.md)** — Full architecture guide, data model, how to add agents, how to change models
- **[PRODUCT-FIT-SYSTEM.md](PRODUCT-FIT-SYSTEM.md)** — KNOWNS/UNKNOWNS framework for test design
- **[agents/CONTEXT.md](agents/CONTEXT.md)** — All 13 agents: what they do, which model they use, data flow
- **[utils/CONTEXT.md](utils/CONTEXT.md)** — Shared utilities: JSON parsing, data gathering, ad summarization
- **[routes/CONTEXT.md](routes/CONTEXT.md)** — Route-to-agent mapping, API patterns
- **[public/js/CONTEXT.md](public/js/CONTEXT.md)** — Frontend files: which page each JS file serves
- **[scrapers/CONTEXT.md](scrapers/CONTEXT.md)** — Puppeteer scraping modules

## Tech Stack
- **Backend:** Node.js + Express.js (port 3100)
- **Frontend:** Vanilla HTML/CSS/JS (served from `/public`)
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk`)
- **Scraping:** Puppeteer + Stealth plugin, Tesseract.js for OCR
- **Storage:** File-based JSON in `/data` directory
- **MCP Servers:** Playwright (browser automation), SerpAPI (search data)

## Architecture

### Agent Pipeline
```
Container → [Scraper] → [Validator] → [Analyzer] ─┐
                                                    ├→ [Proposal] (+ Google Ads data) → [Prompt Gen]
         → [SEO Agent] ───────────────────────────┤
                                                    ├→ [Keyword Ideator] (+ Google Ads data)
         → [Product Ideator] (when no product) ────┤
                                                    └→ [Test Planner] (consumes ALL data sources)
         → [Image Ad Creator]  (standalone)
         → [Quiz Generator]    (standalone)
         → [Landing Page Gen]  (standalone)
         → [Google Ads Agent]  (standalone API)
```

### Directory Structure
```
├── KNOW-HOW.md            # Full architecture & know-how guide
├── config.js              # Centralized AI config (models, tokens)
├── server.js              # Express server, route mounting
├── storage.js             # File-based JSON storage with write queues
├── logger.js              # JSON logging utility
├── PRODUCT-FIT-SYSTEM.md  # KNOWNS/UNKNOWNS framework docs
├── agents/                # AI agent logic (13 agents)
│   ├── CONTEXT.md         # Agent index & data flow
│   ├── scraper-agent.js
│   ├── scrape-validator-agent.js
│   ├── analyzer-agent.js
│   ├── seo-agent.js
│   ├── proposal-agent.js
│   ├── prompt-agent.js
│   ├── product-ideator-agent.js
│   ├── keyword-ideator-agent.js
│   ├── google-ads-agent.js
│   ├── image-ad-agent.js
│   ├── quiz-agent.js
│   ├── landing-page-agent.js
│   └── test-planner-agent.js
├── utils/                 # Shared utilities
│   ├── CONTEXT.md         # Utility docs
│   ├── parse-json.js      # JSON extraction from AI output
│   ├── gather-data.js     # Competitor data gathering
│   ├── summarize-ads.js   # Ad data formatting for prompts
│   └── inject-tracking.js # Tracking code injection for HTML
├── routes/                # Express route handlers (16 files)
│   └── CONTEXT.md         # Route-to-agent mapping
├── scrapers/              # Puppeteer scraping modules
│   ├── CONTEXT.md         # Scraper docs
│   ├── browser.js
│   ├── facebookAdsLibrary.js
│   └── googleAdsTransparency.js
├── public/                # Frontend
│   ├── js/                # Page-specific JavaScript (21 files)
│   │   └── CONTEXT.md     # Frontend file index
│   └── css/               # Styles
├── data/                  # Container JSON files + logs
└── screenshots/           # Scraper captures + generated images
```

## Coding Conventions

### Backend
- Use `require()` (CommonJS modules), not ES modules
- All agents follow the pattern: receive container data → call Claude API → return structured JSON
- AI model names and shared config live in `config.js` — never hardcode model strings in agents
- Common functions (JSON parsing, data gathering) live in `utils/` — never duplicate across agents
- Storage operations are async and serialized per container via write queues
- Route handlers: one file per agent in `/routes`
- Agent files: one file per agent in `/agents`
- Use `uuid` for generating IDs
- Status lifecycle: `generating` → `completed` | `failed`

### Frontend
- Vanilla JavaScript, no frameworks
- Fetch API for HTTP requests
- Poll-based async status checking for long-running operations
- CSS classes use kebab-case
- Use optional chaining (`?.`) and `|| ''` defaults to handle missing fields from both old and new AI outputs

### API Pattern
- POST to start an agent operation (returns ID with HTTP 202)
- GET to poll status / retrieve results
- All routes nested under `/api/containers/:id/` (except Google Ads: `/api/google-ads/`)

## Setup & Running
```bash
npm install
npm start       # Starts on port 3100
```

## Environment Variables
- `ANTHROPIC_API_KEY` — Required for Claude AI features
- `SERPAPI_API_KEY` — Required for SerpAPI search data
- `PORT` — Server port (default: 3100)
- `GOOGLE_ADS_*` — See [KNOW-HOW.md](KNOW-HOW.md) for full list

## Testing
- No formal test suite yet
- Manual testing via the web UI at http://localhost:3100

## Important Notes
- Container data is stored as JSON files in `/data` — do not modify directly while server is running
- Puppeteer browser instance is shared and managed in `scrapers/browser.js`
- OCR processing can be slow; Tesseract runs in a worker
- The scraper has a 15-minute timeout per operation
- SerpAPI key is stored in `.env` — never commit this file
