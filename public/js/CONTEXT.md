# public/js/ — Frontend JavaScript

Vanilla JavaScript files, one per page/feature. No frameworks. Uses Fetch API for HTTP and poll-based status checking for async operations.

## Page Files

| File | Page | What It Renders |
|------|------|----------------|
| `dashboard.js` | `index.html` | Container list, create/delete containers |
| `container.js` | `container.html` | Main container view — orchestrates all sections below |
| `add-container.js` | `add-container.html` | Container creation form |
| `entries.js` | (section in container) | Competitor/product list with ad counts |
| `scraper.js` | (section) | Scrape controls, scrape history, progress polling |
| `scrape-validator.js` | (section) | Validation results display |
| `competitor-analyzer.js` | (section) | Per-competitor analysis trigger buttons |
| `competitor-analysis.js` | `competitor-analysis.html` | Full competitor analysis report (standalone page) |
| `seo-analysis.js` | (section) | SEO analysis triggers + report modals (competitor + own-product) |
| `proposal.js` | (section) | Proposal generation + brief display |
| `proposal-report.js` | `proposal.html` | Full proposal report (standalone page, like competitor-analysis.js) |
| `prompts.js` | (section) | Image prompt generation from proposals |
| `product-ideator.js` | (section) | Product idea cards with accept flow |
| `keyword-strategy.js` | (section) | Keyword clusters, quick wins, competitor gaps |
| `test-planner.js` | (section) | Test plan generation + list display |
| `test-plan-report.js` | `test-plan.html` | Full test plan report (standalone page) |
| `google-ads.js` | (section) | Google Ads account/campaign management |
| `gads-analysis.js` | (section) | Campaign analysis results display |
| `image-ads.js` | (section) | Image ad generation + list display |
| `image-ads-report.js` | `image-ads.html` | Full image ads report + clone via OpenRouter (standalone page) |
| `landing-page.js` | (section) | Landing page generation + preview |
| `quiz.js` | (section) | Quiz generation + preview |
| `metadata.js` | (section) | User notes and feedback |
| `settings.js` | (section) | Project settings (tracking codes, etc.) |
| `analysis.js` | — | Legacy analysis display (backward compat) |

## Common Patterns

- **Polling:** After triggering an agent, JS polls `GET /api/.../status` every 3 seconds until `completed` or `failed`
- **`esc()` function:** HTML escaping via `document.createElement('div').textContent` — defined in each page that needs it
- **`loadContainer()`:** Fetches the full container JSON and re-renders all sections — called after any state change
- **Modal reuse:** Several features (SEO, keywords, proposals) use `proposal-modal` as a shared display modal

## Backward Compatibility

Frontend renders gracefully handle missing fields with `?.` optional chaining and `|| ''` defaults. Old (verbose) and new (concise) AI output formats both render correctly.
