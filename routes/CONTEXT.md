# routes/ — Express Route Handlers

Thin HTTP layer between the frontend and the agents. Each file defines an Express router that validates input, calls the corresponding agent, and returns status/results.

## Common Pattern

- **POST** to start an operation → returns `{ id, status: 'generating' }` with HTTP 202
- **GET** to poll status or retrieve results → returns the record from storage
- All routes are mounted under `/api/containers/:id/` (except Google Ads which is `/api/google-ads/`)
- Route handlers do NOT contain business logic — they delegate to agents

## File → Agent Mapping

| Route File | Mounted At | Agent |
|-----------|-----------|-------|
| `containers.js` | `/api/containers` | — (CRUD for containers) |
| `metadata.js` | `/:id/metadata` | — (user notes/feedback) |
| `scraper.js` | `/:id/scrape`, `/:id/scrapes` | `scraper-agent.js` |
| `scrape-validator.js` | `/:id/validate-scrape` | `scrape-validator-agent.js` |
| `competitor-analysis.js` | `/:id/competitor-analysis` | `analyzer-agent.js` |
| `seo-analysis.js` | `/:id/seo-analysis` | `seo-agent.js` |
| `proposal.js` | `/:id/propose` | `proposal-agent.js` |
| `prompts.js` | `/:id/generate-prompts` | `prompt-agent.js` |
| `product-ideator.js` | `/:id/ideate-product`, `/:id/product-ideas` | `product-ideator-agent.js` |
| `keyword-ideator.js` | `/:id/keyword-strategy` | `keyword-ideator-agent.js` |
| `google-ads.js` | `/api/google-ads` | `google-ads-agent.js` |
| `image-ads.js` | `/:id/image-ads` | `image-ad-agent.js` |
| `quiz.js` | `/:id/quiz` | `quiz-agent.js` |
| `landing-page.js` | `/:id/landing-page` | `landing-page-agent.js` |
| `test-planner.js` | `/:id/test-plan`, `/:id/test-plans` | `test-planner-agent.js` |
| `clone-ad.js` | `/:id/clone-ad`, `/api/openrouter` | — (OpenRouter image gen for ad cloning) |
| `settings.js` | `/:id/settings` | — (project settings CRUD) |
| `analysis.js` | `/:id/analyze`, `/:id/analyses` | Legacy (backward compat) |

## Key Notes

- `google-ads.js` is the only route NOT scoped to a container — it talks directly to the Google Ads API
- `analysis.js` is a legacy route kept for backward compatibility with old container data
- Most POST endpoints return HTTP 202 (Accepted) because work runs asynchronously
