# agents/ — Subagent Modules

Every tool is a **subagent** — an independent module with its own context. Each subagent defines its inputs, outputs, dependencies, and a `run` function.

## Subagent Architecture

### AGENT_META
Every agent file exports an `AGENT_META` object:

```js
const AGENT_META = {
  id: 'analyzer',                    // unique identifier
  name: 'Scraped Ads Analyzer',      // human-readable name
  description: '...',                // what it does
  category: 'analysis',             // scraping | validation | analysis | generation | api
  model: 'AI_MODEL',               // config.js key, or null for non-AI agents
  inputs: [                         // function parameters
    { name: 'containerId', type: 'string', required: true, from: null },
  ],
  consumes: [                       // data read from other agents' outputs
    { agent: 'scraper', dataKey: 'scrape_results', description: '...' },
  ],
  outputs: {
    storageKey: 'competitor_analyses', // where results land in container JSON
    dataType: 'json',                  // json | html | mixed
    schema: 'CompetitorAnalysis',      // informal output shape name
  },
  ui: { visible: true },            // false = hidden from page (e.g., prompt-generator)
};
```

Multi-operation agents (seo, google-ads) use `operations: {}` instead of `inputs: []`.

### Registry (`registry.js`)
Central lookup for all subagents:
```js
const { getAgent, listAgents, getDependencyGraph } = require('./registry');

getAgent('analyzer')       // → { meta, run }
getAgent('seo')            // → { meta, operations: { analyzeSeo, analyzeOwnSeo } }
listAgents()               // → array of all AGENT_META
getDependencyGraph()       // → { agentId: [dependencyIds] }
```

### Critical Rule: Structured Data
Subagent outputs must be **structured data** (JSON), not verbose text. Human-readable formatting is only for final UI display. The `json_data` field is the primary output; `full_text` is kept for debugging.

## Common Pattern

Every agent follows this flow:
1. Public function creates a record in storage (status: `generating`)
2. Kicks off `execute*()` async (non-blocking — returns ID to caller immediately)
3. `execute*()` builds a prompt, calls Claude, parses JSON, saves result
4. On success: status → `completed`. On error: status → `failed`

## Shared Dependencies

All agents import from:
- `../config` — model names (`AI_MODEL`, `AI_MODEL_HEAVY`, `AI_MODEL_FAST`), `DEFAULT_MAX_TOKENS`, `CONCISENESS_INSTRUCTION`
- `../utils/parse-json` — `parseJsonFromResponse()` for extracting JSON from Claude output
- `../storage` — reading/writing container data
- `../logger` — structured logging

Some agents also use:
- `../utils/gather-data` — `gatherScrapeData()`, `gatherCompetitorAnalyses()`, `gatherCompetitorAds()`
- `../utils/summarize-ads` — `summarizeAds()` for formatting ad data into prompt text

## Agent Index

| ID | File | Name | Model | Category |
|----|------|------|-------|----------|
| `scraper` | `scraper-agent.js` | Ad Scraper | — | scraping |
| `scrape-validator` | `scrape-validator-agent.js` | Scrape Validator | — | validation |
| `analyzer` | `analyzer-agent.js` | Scraped Ads Analyzer | `AI_MODEL` | analysis |
| `seo` | `seo-agent.js` | SEO Analyzer | `AI_MODEL` | analysis |
| `case-study` | `case-study-agent.js` | Case Study Analyzer | `AI_MODEL` | analysis |
| `proposal` | `proposal-agent.js` | Magic AI | `AI_MODEL_HEAVY` | generation |
| `prompt-generator` | `prompt-agent.js` | Prompt Generator | `AI_MODEL` | generation |
| `product-ideator` | `product-ideator-agent.js` | Product Ideator | `AI_MODEL` | generation |
| `keyword-ideator` | `keyword-ideator-agent.js` | Keyword Ideator | `AI_MODEL` | generation |
| `test-planner` | `test-planner-agent.js` | RPS Test Ideator | `AI_MODEL_HEAVY` | generation |
| `image-ads` | `image-ad-agent.js` | Image Ad Creator | `AI_MODEL` | generation |
| `quiz` | `quiz-agent.js` | Quiz Generator | `AI_MODEL` | generation |
| `landing-page` | `landing-page-agent.js` | Landing Page Generator | `AI_MODEL` | generation |
| `google-ads` | `google-ads-agent.js` | Google Ads Agent | `AI_MODEL` | api |

## Dependency Graph

```
Scraper → Validator → Analyzer ─┐
                                 ├─→ Proposal (+ Google Ads) → Prompt Generator (hidden)
SEO Analyzer ───────────────────┤
                                 ├─→ Keyword Ideator (+ Google Ads)
Product Ideator ────────────────┤
Case Study Analyzer ────────────┤
                                 └─→ Test Planner (consumes ALL data sources)

Standalone: Image Ad Creator, Quiz Generator, Landing Page, Google Ads API
```

## Key Notes

- `scraper-agent.js` and `scrape-validator-agent.js` do NOT call Claude — they use Puppeteer and HTTP checks
- `proposal-agent.js` and `test-planner-agent.js` use `AI_MODEL_HEAVY` (Opus) for deeper reasoning
- `quiz-agent.js` uses `AI_MODEL_FAST` (Haiku) for its quality-check pass
- `google-ads-agent.js` handles direct Google Ads API calls — multi-operation agent
- `seo-agent.js` is multi-operation: `analyzeSeo` (competitor) + `analyzeOwnSeo` (own product)
- `prompt-generator` is hidden from the UI (`ui.visible: false`) but callable by other agents
- `analyzer-agent.js` re-exports `gatherCompetitorAds` for backward compatibility
