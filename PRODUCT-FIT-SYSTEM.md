# Product-Fit System: KNOWNS/UNKNOWNS Framework

## Overview

Every advertising test should have **maximum 1-2 UNKNOWNS**. All other variables must be backed by data (KNOWNS). This framework ensures tests produce interpretable results by isolating what you're actually testing.

---

## Definitions

### KNOWNS
Confirmed data points from your product, competition, metadata, or advertising platforms. These are facts you can rely on when designing tests.

### UNKNOWNS
Unproven assumptions that need validation. Each test should isolate 1-2 unknowns so results clearly tell you what worked or didn't.

---

## KNOWN Data Sources in the App

| Source | Data Available | Agent/Feature |
|--------|---------------|---------------|
| **Google Ads Metrics** | CPC, impressions, clicks, cost, budget, conversions, tested geos | Google Ads Agent (`gads_analyses`) |
| **Scraped Ad Data** | Competitor ad copy, creatives, running duration, platforms, EU audience demographics | Scraper Agent (`scrape_results`) |
| **Competitor Analysis** | Messaging patterns, long-running ads, opportunities, key findings | Analyzer Agent (`competitor_analyses`) |
| **SEO Analysis** | Primary keywords, keyword gaps, content opportunities, competitor weaknesses | SEO Agent (`seo_analyses`) |
| **Keyword Strategies** | Keyword clusters, quick wins, competitor gaps, intent mapping | Keyword Ideator (`keyword_strategies`) |
| **Product Metadata** | Product name, website, site type, unique angle, target audience | Container (`my_product`) |
| **User Notes** | Feedback, customer notes, product specs, A/B test results | Container (`metadata`) |
| **Proposals** | Creative briefs, patterns, fresh ideas | Proposal Agent (`proposals`) |

---

## Case (a): HAVE Product

When you already have a product and advertising data:

- **Primary KNOWNS**: Your Google Ads CPC/CPA, tested geos, conversion rates, ad performance history
- **Secondary KNOWNS**: Competition messaging patterns, long-running ads (proven), SEO keyword gaps
- **Typical UNKNOWNS**: New geo performance, new angle effectiveness, new audience segments
- **Test focus**: Expansion — new geos, new creative angles, new audience segments
- **Benchmark source**: Your own historical CPC/CPA data

### Example Test Design (Case a)
- **KNOWNS**: US CPC is $1.50, "brain training" angle gets 3.2% CTR, 25-44 age group converts best
- **UNKNOWNS**: Will the same angle work in Germany?
- **Test**: Run the proven US creative in DE market, targeting 25-44, with "brain training" angle
- **Success criteria**: CPC < $2.00 (1.33x US baseline), CTR > 2.5%

---

## Case (b): NO Product (MVP Validation)

When you don't have a product yet and need to validate a concept:

- **Primary KNOWNS**: Competition data (what works for them), market keyword demand, audience demographics from competitor EU data
- **UNKNOWNS**: Everything about YOUR product — will people want it, will they click, will they pay
- **Test focus**: MVP validation — validate ONE critical assumption per test with minimum budget
- **Benchmark source**: Competitor metrics, industry averages from scraped data

### Example Test Design (Case b)
- **KNOWNS**: Competitor X runs "IQ test" ads for 180+ days (proven demand), targets US/DE, gets engagement
- **UNKNOWNS**: Will people click on OUR version of this concept?
- **Test**: Create a simple landing page with our angle, run Google Search ads on proven keywords
- **Success criteria**: CTR > 2% (industry baseline), CPC < $1.50 (competitor benchmark)

---

## Test Design Rules

1. **List all KNOWNS first** — Pull from every data source available in the container
2. **Identify all UNKNOWNS** — What assumptions are you making?
3. **Narrow until max 1-2 UNKNOWNS** — Lock down everything else with data
4. **Define success criteria from KNOWN benchmarks** — Never use arbitrary targets
5. **Reference specific data points** — "Based on competitor X's 180-day ad" not "based on industry standards"
6. **Calculate minimum sample size** — Ensure budget allows statistical significance
7. **Sequence tests logically** — Validate foundational assumptions before testing refinements

---

## Test Planner Agent

The Test Planner agent (`agents/test-planner-agent.js`) implements this framework:

1. **Classifies** all data in the container as KNOWN or UNKNOWN
2. **Generates test plans** with max 1-2 unknowns each
3. **References specific data points** for every known variable
4. **Sets benchmarks** from actual data (Google Ads metrics, competitor performance)
5. **Recommends sequence** — which tests to run first based on dependency and priority
6. **Estimates budget** — minimum spend for statistically significant results

### Data Flow
```
Container Data (all sources)
    |
    v
classifyDataAvailability()  -->  { knowns: [...], unknowns: [...] }
    |
    v
Test Planner Prompt (Claude Opus)
    |
    v
Structured Test Plans (JSON)
    - data_classification
    - test_plans (each with max 1-2 unknowns)
    - recommended_sequence
    - total_budget_estimate
```
