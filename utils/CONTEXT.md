# utils/ — Shared Utilities

Extracted common functions that were previously duplicated across multiple agents.

## Files

### `parse-json.js`
**Exports:** `parseJsonFromResponse(text)`

Extracts JSON from Claude's text output. Tries four strategies in order:
1. Direct `JSON.parse()` on the full text
2. Extract from markdown code fences (`` ```json ... ``` ``)
3. Find outermost `{ ... }` braces
4. Find outermost `[ ... ]` brackets (for arrays)

Returns parsed object/array or `null` on failure. Never throws.

**Used by:** All 9 AI agents (analyzer, seo, proposal, product-ideator, keyword-ideator, quiz, prompt, image-ad, google-ads)

### `gather-data.js`
**Exports:** `gatherScrapeData(container, competitorIds)`, `gatherCompetitorAnalyses(container, competitorIds)`, `gatherCompetitorAds(container, competitorId, options)`

Three functions for pulling competitor data from storage:

- **`gatherScrapeData`** — For each competitor ID, finds the latest completed scrape with ad data. Returns `{ [compId]: { data, from_scrape } }`. Checks `scrape_results` first, falls back to legacy `analyses`.
- **`gatherCompetitorAnalyses`** — For each competitor ID, finds the latest completed AI analysis (`competitor_analyses[compId]`). Returns `{ [compId]: jsonData }`.
- **`gatherCompetitorAds`** — Gathers ALL unique ads for ONE competitor (deduped by ad ID/link). Supports `options.limit` to cap per-platform. Used by analyzer (unlimited) and seo-agent (limit: 5).

**Used by:** analyzer-agent, seo-agent, proposal-agent, product-ideator-agent

### `summarize-ads.js`
**Exports:** `summarizeAds(ads, options)`

Formats an array of ad objects into a text summary for inclusion in AI prompts. Each ad becomes a labeled block with headline, text, OCR, CTA, platform, duration, EU audience, etc.

Options: `maxAds` (default 30), `textLimit` (default 500 chars), `ocrLimit` (default 300 chars), `includeLastShown` (default false).

**Used by:** analyzer-agent (defaults), proposal-agent (maxAds: 20, textLimit: 300, includeLastShown: true)

### `inject-tracking.js`
**Exports:** `injectTrackingCodes(html, settings)`

Injects Facebook Pixel, Google Analytics (GA4), and custom code snippets into generated HTML. Inserts before `</head>` and `</body>` tags.

**Used by:** quiz-agent, landing-page-agent
