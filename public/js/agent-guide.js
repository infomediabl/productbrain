/**
 * Agent Guide Page
 * Page: agent-guide.html (standalone)
 * Globals used: none (standalone)
 * Globals defined: none
 * API: none (static content)
 *
 * Renders detailed documentation for each agent.
 * Reads ?agent=<id> from URL to select which agent to show.
 */
(function () {

  // ── Agent order (for prev/next navigation) ──
  var AGENT_ORDER = [
    'scraper', 'scrape-validator', 'analyzer', 'seo', 'proposal',
    'prompt-generator', 'product-ideator', 'keyword-ideator', 'google-ads',
    'image-ads', 'quiz', 'landing-page', 'test-planner', 'case-study',
    'container-chat', 'desire-spring', 'research-web'
  ];

  // ── Category styling ──
  var CAT_CLASS = {
    scraping: 'cat-scraping',
    validation: 'cat-validation',
    analysis: 'cat-analysis',
    generation: 'cat-generation',
    api: 'cat-api',
    chat: 'cat-chat',
    research: 'cat-research'
  };

  // ── Agent guide data ──
  var AGENT_GUIDES = {

    'scraper': {
      code: 'AG-001', name: 'Ad Scraper', category: 'scraping',
      overview: '<p>The Ad Scraper is the primary data collection engine. It visits competitor ad libraries using a headless browser (Puppeteer), captures every ad creative it finds, downloads media, and extracts ad copy — building a local archive of competitor advertising activity.</p>' +
        '<p>It supports both <strong>Facebook Ad Library</strong> and <strong>Google Ads Transparency Center</strong> as sources. For each platform, it scrolls through listings, captures screenshots, extracts text content, and downloads images/videos to local storage.</p>' +
        '<p>A unique feature is the built-in <strong>OCR pipeline</strong>: for image-only ads (common on Google), Tesseract.js reads text from the images, then a heuristic parser (with Claude AI fallback) structures the extracted text into headline, description, CTA, and URL fields.</p>',
      howItWorks: [
        'Takes your list of competitors with their Ad Library / Transparency Center URLs',
        'Launches a headless browser for each competitor, one at a time with random delays to avoid rate limiting',
        'Scrolls through the ad listings, applying sort (by impressions or running time) and limit filters',
        'Extracts ad data: copy, headlines, CTAs, media URLs, EU audience demographics, and running dates',
        'Downloads all ad media (images/videos) to the local <code>screenshots/</code> folder with path tracking',
        'Runs Tesseract OCR on image ads (up to 20 per scrape) to extract text from image-only creatives',
        'For Google ads with OCR text, parses into structured fields (headline/description/CTA/URL) using heuristics first, Claude AI for complex cases',
        'Deduplicates ads by Facebook Ad ID or Google Creative ID, marking new ads with an <code>is_new</code> flag',
        'Updates the scrape record with status "completed" and the count of new ads found'
      ],
      prerequisites: [
        'At least one competitor added to the container with a Facebook Ad Library or Google Ads Transparency Center URL',
        'Server must be running with Puppeteer/Chromium available'
      ],
      outputs: '<p>Creates a <strong>scrape result</strong> record in <code>scrape_results[]</code> containing all scraped ads organized by competitor and platform. Each ad includes:</p>' +
        '<ul><li>Source platform (facebook/google), headline, ad text, CTA text</li>' +
        '<li>Media URL + locally downloaded media path</li>' +
        '<li>OCR text and structured OCR fields (for image ads)</li>' +
        '<li>EU audience demographics, running dates, impressions (Facebook)</li>' +
        '<li>Screenshots of each ad</li></ul>',
      downstream: [
        '<strong>AG-003 Scraped Ads Analyzer</strong> — reads scraped ads to analyze competitor messaging patterns',
        '<strong>AG-004 SEO Analyzer</strong> — uses top ads for competitor messaging context',
        '<strong>AG-005 Magic AI Proposal</strong> — reads all scraped ads for comprehensive strategy generation',
        '<strong>AG-007 Product Ideator</strong> — uses scrape data for market gap analysis',
        '<strong>AG-010 Image Ad Curator</strong> — reads scraped ads to curate top ads worth cloning'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Ad Scraper</strong> section. Select which competitors to scrape, choose platforms (Facebook, Google, or both), set sort order and limits, then click <strong>Scrape</strong>.</p>' +
        '<p>The scrape runs in the background (up to 25 minutes for large jobs). A status bar shows progress. When complete, scraped ads appear as cards showing the creative, copy, and media. Click any scrape result to open the <strong>Scrape Details</strong> page for a full view.</p>' +
        '<p>You can also enable <strong>Auto Scrape</strong> in container Settings to automatically re-scrape competitors on a schedule.</p>',
      tips: [
        'Scrape at least 3 competitors for best downstream analysis quality',
        'Use "Sort by Running Time" to prioritize long-running ads — these are proven performers',
        'Run the Scrape Validator (AG-002) after scraping to check data quality',
        'Facebook Ad Library URLs must be in the format: <code>facebook.com/ads/library/?active_status=all&ad_type=all&country=XX&q=BRAND</code>',
        'Google Transparency URLs must point to the advertiser page, not a specific ad'
      ]
    },

    'scrape-validator': {
      code: 'AG-002', name: 'Scrape Validator', category: 'validation',
      overview: '<p>The Scrape Validator is a quality assurance tool that audits the output of the Ad Scraper. Unlike most agents, it does <strong>not use AI</strong> — it performs purely data-driven validation to check completeness, media integrity, and data quality.</p>' +
        '<p>After scraping, data quality can vary: some ads may have missing text, broken image URLs, or incomplete metadata. The validator catches these issues early so you know whether to re-scrape or proceed to analysis.</p>',
      howItWorks: [
        'Reads a completed scrape result and iterates over every scraped entry (my_product + competitors)',
        'For each entry, counts ads with text, images, videos, headlines, CTAs, EU audience data, screenshots, and OCR results',
        'HTTP HEAD-checks media URLs in parallel (batches of 10, up to 50 total) to detect broken images and videos',
        'Verifies that screenshot files exist on disk',
        'Calculates a weighted overall quality score (0-100) based on coverage percentages',
        'Produces a per-entry validation report and a global issues list with warnings and errors'
      ],
      prerequisites: [
        'A completed scrape result (AG-001 must have run successfully)'
      ],
      outputs: '<p>Adds a <strong>validation</strong> object to the scrape result containing:</p>' +
        '<ul><li><strong>Overall score</strong> (0-100) with weighted breakdown</li>' +
        '<li>Per-entry stats: ad count, text coverage, media coverage, CTA presence, EU data, OCR results</li>' +
        '<li>Lists of broken image/video URLs</li>' +
        '<li>Global issues list with severity levels (warning/error)</li></ul>',
      downstream: [
        'No direct downstream consumers — this is a quality check tool',
        'Helps you decide whether to re-scrape before running analysis agents'
      ],
      uiGuide: '<p>After a scrape completes, a <strong>Validate</strong> button appears on the scrape result card. Click it to run validation. The result shows a quality score badge (green/yellow/red) and a detailed breakdown of any issues found.</p>',
      tips: [
        'A score above 70 is generally good enough for analysis',
        'Broken media URLs are common for older ads — this does not affect text analysis quality',
        'If the score is very low, try re-scraping with different settings (e.g., fewer ads, different sort order)',
        'Validation is fast (seconds, not minutes) since it does not use AI'
      ]
    },

    'analyzer': {
      code: 'AG-003', name: 'Scraped Ads Analyzer', category: 'analysis',
      overview: '<p>The Scraped Ads Analyzer performs deep AI analysis of a single competitor\'s scraped advertising. It examines patterns across all of their ads to understand messaging strategy, creative approaches, targeting, and vulnerabilities.</p>' +
        '<p>Unlike surface-level ad reviews, this agent looks for <strong>patterns and trends</strong> across an entire ad portfolio. It identifies which messaging angles a competitor uses most, which creative formats they prefer, and — crucially — which ads have been running the longest (30+ days), as these are proven performers with demonstrated ROI.</p>',
      howItWorks: [
        'Gathers all scraped ads for a single competitor from all completed scrapes',
        'Summarizes ads using <code>summarizeAds()</code> — compresses ad data into a prompt-friendly format with emphasis on long-running ads',
        'Builds a detailed prompt with competitor context, summarized ads, and EU demographic data',
        'Sends to Claude AI with a system prompt emphasizing long-running ads as KPIs, messaging patterns, and demographic insights',
        'Parses the structured JSON response: summary, key findings, messaging patterns, creative formats, targeting insights, long-running ads analysis, and opportunities',
        'Stores both the full text response and structured JSON data'
      ],
      prerequisites: [
        'At least one completed scrape (AG-001) containing ads for the target competitor',
        'More ads = better analysis quality'
      ],
      outputs: '<p>Creates a <strong>competitor analysis</strong> record containing:</p>' +
        '<ul><li><strong>Summary</strong> — high-level overview of the competitor\'s ad strategy</li>' +
        '<li><strong>Key findings</strong> — the most important patterns discovered</li>' +
        '<li><strong>Messaging patterns</strong> — recurring themes, angles, and hooks</li>' +
        '<li><strong>Creative formats</strong> — visual styles, ad types, layout preferences</li>' +
        '<li><strong>Targeting insights</strong> — audience demographics and geo targeting</li>' +
        '<li><strong>Long-running ads</strong> — ads running 30+ days with analysis of why they work</li>' +
        '<li><strong>Opportunities for us</strong> — gaps and weaknesses to exploit</li></ul>',
      downstream: [
        '<strong>AG-005 Magic AI Proposal</strong> — reads competitor analyses for strategy generation',
        '<strong>AG-007 Product Ideator</strong> — uses analyses for market gap identification',
        '<strong>AG-010 Image Ad Curator</strong> — uses analysis intel for ad curation decisions',
        '<strong>Container Context</strong> — can be pushed to context for all downstream agents to read'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Competitor Analysis</strong> section. Select a competitor and click <strong>Analyze</strong>. The analysis runs in the background (1-3 minutes). When complete, click <strong>View</strong> to open the full analysis report on a dedicated page.</p>' +
        '<p>From the report page, you can <strong>push sections to Container Context</strong> to make insights available to all downstream agents.</p>',
      tips: [
        'Analyze each competitor separately for the most focused insights',
        'Run after scraping multiple times — more ads across time periods gives richer pattern analysis',
        'Always push the best analyses to Container Context before running the Proposal',
        'Long-running ads (30+ days) are the most valuable data points — they indicate proven strategies'
      ]
    },

    'seo': {
      code: 'AG-004', name: 'SEO Analyzer', category: 'analysis',
      overview: '<p>The SEO Analyzer has two distinct modes. <strong>Competitor SEO</strong> studies a competitor\'s website to extract keyword strategies, content structures, and technical SEO patterns you can learn from. <strong>Own Product SEO</strong> audits your own product\'s site with scores and improvement recommendations.</p>' +
        '<p>Unlike the Ads Analyzer which examines advertising, the SEO agent analyzes <strong>websites and pages directly</strong>. It looks at keyword targeting, content strategy, technical SEO practices, on-page patterns, and competitive advantages — framing everything as actionable learnings for your own product.</p>',
      howItWorks: [
        '<strong>Competitor Mode:</strong> Takes the competitor\'s URL and gathers their top 5 ads for messaging context',
        'Sends the URL + ad context to Claude for comprehensive SEO intelligence analysis',
        'Analyzes: keyword targeting, content strategy, technical SEO, on-page patterns, competitive advantages, priority learnings',
        '<strong>Own Product Mode:</strong> Gathers your product\'s ads from the latest scrapes',
        'Sends to Claude for an SEO audit with competitor benchmarking context',
        'Produces: on-page SEO audit, technical SEO issues, keyword strategy recommendations, priority actions',
        'Both modes can accept custom <strong>focus instructions</strong> to prioritize specific areas (e.g., "focus on blog content strategy")'
      ],
      prerequisites: [
        '<strong>Competitor SEO:</strong> A competitor with a URL added to the container (scrape data is optional but improves quality)',
        '<strong>Own Product SEO:</strong> Your product URL filled in the "My Product" section'
      ],
      outputs: '<p>Creates an <strong>SEO analysis</strong> record containing:</p>' +
        '<ul><li><strong>Keyword targeting</strong> — what keywords they target and how</li>' +
        '<li><strong>Content strategy</strong> — content types, topics, publishing patterns</li>' +
        '<li><strong>Technical SEO practices</strong> — site structure, speed, mobile optimization</li>' +
        '<li><strong>On-page patterns</strong> — heading structure, meta tags, internal linking</li>' +
        '<li><strong>Competitive advantages</strong> — what they do uniquely well</li>' +
        '<li><strong>Priority learnings / actions</strong> — ranked recommendations for your product</li></ul>',
      downstream: [
        '<strong>AG-012 Landing Page Generator</strong> — uses SEO keywords and opportunities for page optimization',
        '<strong>Container Context</strong> — can be pushed to context for all downstream agents'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>SEO Analysis</strong> section. Choose between analyzing a competitor\'s site or your own product\'s site. Optionally enter focus instructions to guide the analysis. Click <strong>Analyze</strong>.</p>' +
        '<p>Results open on a dedicated report page where you can review findings and push sections to Container Context.</p>',
      tips: [
        'Run competitor SEO analysis on your top 2-3 competitors to identify shared patterns',
        'Run own product SEO after competitor analyses — the audit will benchmark against competitor findings',
        'Use focus instructions like "focus on blog SEO" or "focus on product page optimization" for targeted insights',
        'Push SEO results to Container Context — the Landing Page Generator reads these for keyword optimization'
      ]
    },

    'proposal': {
      code: 'AG-005', name: 'Magic AI Proposal', category: 'generation',
      overview: '<p>The Magic AI Proposal is the <strong>central strategy step</strong> of the entire workflow. It reads all container data — competitor analyses, SEO insights, Google Ads performance, scraped ads, metadata, and all Container Context items — to generate a comprehensive marketing strategy with creative briefs.</p>' +
        '<p>This is the most data-hungry agent in the platform. The more context you push before running it, the more tailored and specific the output. It uses the heavy AI model for maximum reasoning depth.</p>' +
        '<p>The output serves as the foundation for downstream generation agents: the Prompt Generator requires a completed proposal, while the Image Ad Curator and RPS Test Ideator read it for messaging context.</p>',
      howItWorks: [
        'Gathers scraped ads for selected competitors + all competitor analyses',
        'Collects Google Ads performance data, container metadata, and all Container Context items',
        'Builds a comprehensive prompt with product info, user context, and all gathered data',
        'Sends to Claude (heavy model) requesting structured output: creative briefs + strategic patterns',
        'For each creative brief: identifies source ad, running days, original copy, adapted version, image prompt, target demographics, ad format',
        'Normalizes the JSON response (handles variations in Claude\'s key naming)',
        'Validates briefs — checks for image prompts, source links, headline presence',
        'Stores full text + structured JSON with separate sections for creative briefs and patterns'
      ],
      prerequisites: [
        'At least one competitor with scraped ads (AG-001)',
        'At least one competitor analysis (AG-003) pushed to Container Context',
        'Recommended: SEO analysis, Google Ads data, and metadata also pushed to context'
      ],
      outputs: '<p>Creates a <strong>proposal</strong> record containing:</p>' +
        '<ul><li><strong>Creative briefs</strong> (5-10) — each with source ad reference, adapted copy, image generation prompt, target demographics, and recommended ad format</li>' +
        '<li><strong>Evidence-based patterns</strong> — strategies proven by long-running competitor ads</li>' +
        '<li><strong>Fresh ideas</strong> — novel approaches that competitors haven\'t tried</li>' +
        '<li><strong>Full text</strong> — the complete strategy document with positioning, messaging frameworks, channel priorities, and budget allocation</li></ul>',
      downstream: [
        '<strong>AG-006 Prompt Generator</strong> — <em>requires</em> a completed proposal to generate image prompts',
        '<strong>AG-010 Image Ad Curator</strong> — reads the proposal for creative brief context',
        '<strong>AG-013 RPS Test Ideator</strong> — reads the proposal for hypothesis generation'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Proposal</strong> section. Select which competitors to include, optionally add custom context or instructions, then click <strong>Generate Proposal</strong>.</p>' +
        '<p>This is a heavier generation (2-5 minutes). When complete, click <strong>View</strong> to open the full proposal report page with creative briefs, patterns, and strategy sections.</p>',
      tips: [
        'Push as much context as possible before running — Container Context is the biggest quality lever',
        'Include at least 3 analyzed competitors for the best creative brief diversity',
        'Use the "User Context" field to add specific goals, constraints, or brand voice guidelines',
        'Run the proposal <em>after</em> all analyses are done and pushed to context',
        'The Prompt Generator won\'t work without a completed proposal — run this first'
      ]
    },

    'prompt-generator': {
      code: 'AG-006', name: 'Prompt Generator', category: 'generation',
      overview: '<p>The Prompt Generator takes a completed proposal\'s creative briefs and transforms each brief into detailed, ready-to-use prompts for AI image generation tools. Each prompt is precisely crafted for a specific tool\'s syntax and capabilities.</p>' +
        '<p>It generates three variants per brief: <strong>NanoBanana</strong>, <strong>ChatGPT/DALL-E</strong>, and <strong>Midjourney</strong> — each optimized for that tool\'s prompt format, strengths, and quirks.</p>',
      howItWorks: [
        'Reads a completed proposal and extracts its creative briefs',
        'For each brief, analyzes: ad format (determines aspect ratio), target demographics, messaging, visual direction',
        'Generates 3 detailed image prompts per brief, each tailored to a specific AI tool\'s syntax',
        '<strong>NanoBanana prompt:</strong> descriptive, detailed composition and lighting instructions',
        '<strong>ChatGPT/DALL-E prompt:</strong> natural language with specific style cues',
        '<strong>Midjourney prompt:</strong> comma-separated keywords with parameters (--ar, --v, --style)',
        'Includes text overlay instructions: headline placement, subtext, CTA button specifications',
        'Stores all prompts as a structured array mapped to brief numbers and titles'
      ],
      prerequisites: [
        'A completed proposal (AG-005) with at least one creative brief'
      ],
      outputs: '<p>Creates a <strong>generated prompts</strong> record containing an array of prompt sets, one per creative brief:</p>' +
        '<ul><li><strong>Brief reference</strong> — brief number and title</li>' +
        '<li><strong>Aspect ratio</strong> — calculated from the brief\'s ad format</li>' +
        '<li><strong>NanoBanana prompt</strong> — detailed visual composition instructions</li>' +
        '<li><strong>ChatGPT prompt</strong> — natural language for DALL-E</li>' +
        '<li><strong>Midjourney prompt</strong> — keyword-based with parameters</li>' +
        '<li><strong>Copy overlay</strong> — headline, subtext, and CTA placement instructions</li></ul>',
      downstream: [
        'No direct downstream consumers — prompts are the end product for use in external AI image tools'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Prompts</strong> section. Select a completed proposal and click <strong>Generate Prompts</strong>. When complete, each prompt appears as a copyable card with tabs for each AI tool format.</p>',
      tips: [
        'You must run the Magic AI Proposal (AG-005) first — the Prompt Generator requires it',
        'Copy the prompt for whichever AI image tool you prefer',
        'Midjourney prompts include --ar parameters for correct aspect ratio',
        'NanoBanana prompts tend to be the most detailed with explicit composition instructions',
        'You can modify prompts after copying — they\'re starting points, not rigid templates'
      ]
    },

    'product-ideator': {
      code: 'AG-007', name: 'Product Ideator', category: 'generation',
      overview: '<p>The Product Ideator analyzes competitor data and market patterns to brainstorm entirely new product concepts. It identifies gaps in the market that competitors aren\'t addressing and proposes differentiated products to fill those gaps.</p>' +
        '<p>This is a strategic brainstorming tool — useful when you\'re exploring new product directions, looking for niche opportunities, or want to understand where the market has unmet demand.</p>',
      howItWorks: [
        'Gathers all competitor scraped data across all completed scrapes',
        'Collects all competitor analyses for messaging pattern context',
        'Analyzes the market landscape: recurring themes, positioning strategies, target audience overlaps, messaging weaknesses',
        'Identifies gaps — what competitors collectively miss or underserve',
        'Proposes 3 distinct product concepts, each targeting a different market gap',
        'For each concept: generates project name, domain suggestions, tagline, target audience, unique angle, and competitive advantages',
        'Considers EU demographic distribution from competitor ad targeting data'
      ],
      prerequisites: [
        'At least one completed scrape (AG-001) with competitor ads',
        'At least one competitor analysis (AG-003) for richer market insights'
      ],
      outputs: '<p>Creates a <strong>product idea</strong> record containing:</p>' +
        '<ul><li><strong>Market analysis</strong> — overview of the competitive landscape and identified gaps</li>' +
        '<li><strong>3 product concepts</strong>, each with: project name, domain suggestions, site type, tagline, target audience, unique angle, and competitive advantages</li></ul>',
      downstream: [
        'No direct downstream consumers — product ideas are strategic output for your decision-making'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Product Ideator</strong> section. Optionally add a custom prompt to guide ideation (e.g., "focus on B2B opportunities" or "think about subscription models"). Click <strong>Ideate</strong>.</p>' +
        '<p>Results show 3 product concept cards with names, taglines, and strategic rationale.</p>',
      tips: [
        'Run after analyzing multiple competitors — more data means more nuanced gap identification',
        'Use the custom prompt to steer ideation toward specific niches or business models',
        'Domain suggestions are just ideas — always check availability separately',
        'Consider running this early in your research to discover adjacent opportunities'
      ]
    },

    'keyword-ideator': {
      code: 'AG-008', name: 'Keyword Strategist', category: 'generation',
      overview: '<p>The Keyword Strategist generates comprehensive keyword strategies by combining four data sources: competitor ad messaging, SEO analysis insights, Google Ads performance metrics, and Google Keyword Planner data. It produces keyword clusters organized by search intent and funnel stage.</p>' +
        '<p>When Google Ads data is available, it uses <strong>real performance metrics</strong> (actual CPC, search volume, conversion rates) instead of estimates — making recommendations grounded in market reality.</p>',
      howItWorks: [
        'Gathers context from multiple sources: competitor messaging patterns, SEO insights, Google Ads performance (CPC, keywords, search volume), keyword planner data, own SEO position, long-running ad copy, and container context',
        'Sends all gathered data to Claude for keyword strategy generation',
        'Claude builds keyword clusters organized by search intent (informational/navigational/commercial/transactional) and funnel stage',
        'Scores keywords by opportunity: search volume x relevance x competition gap',
        'Identifies quick wins — keywords with high opportunity and low competition',
        'Maps competitor keyword gaps — terms competitors rank for but you don\'t',
        'Produces auction keyword recommendations with bid guidance (when Google Ads data exists)',
        'Prioritizes all recommendations by estimated impact'
      ],
      prerequisites: [
        'Container with product info filled in',
        'Recommended: competitor analyses pushed to context, Google Ads data connected, SEO analyses run'
      ],
      outputs: '<p>Creates a <strong>keyword strategy</strong> record containing:</p>' +
        '<ul><li><strong>Keyword clusters</strong> — grouped by search intent and funnel stage with priority rankings</li>' +
        '<li><strong>Quick wins</strong> — high-opportunity, low-competition keywords to target first</li>' +
        '<li><strong>Competitor gaps</strong> — keywords competitors rank for that you\'re missing</li>' +
        '<li><strong>Ad keyword recommendations</strong> — keywords for paid campaigns with bid guidance</li>' +
        '<li><strong>Auction keywords</strong> — specific bidding recommendations for Google Ads</li></ul>',
      downstream: [
        '<strong>Container Context</strong> — can be pushed to context for Proposal and other agents'
      ],
      uiGuide: '<p>Available in two places:</p>' +
        '<ul><li><strong>Container dashboard</strong> — Keyword Strategist section with a generate button</li>' +
        '<li><strong>Dedicated <a href="/keyword-strategy.html">Keyword Strategy page</a></strong> — select a container, toggle context inclusion, set niche/goals/budget, and view results inline with keyword clusters and tables</li></ul>' +
        '<p>The dedicated page auto-populates the niche field from your product data and lets you view past strategies.</p>',
      tips: [
        'Connect Google Ads data first for the most accurate keyword recommendations',
        'Use the "Budget Level" setting to get recommendations appropriate for your spend level',
        'Run after competitor analyses and SEO analyses for the richest keyword insights',
        'Push keyword strategy results to Container Context — the Proposal agent reads them',
        'Use the "Goals" field to focus on specific objectives (e.g., "drive organic blog traffic")'
      ]
    },

    'google-ads': {
      code: 'AG-009', name: 'Google Ads Connector', category: 'api',
      overview: '<p>The Google Ads Connector integrates with <strong>your own Google Ads account</strong> to pull campaign performance data. Unlike the Ad Scraper which collects competitor ads from public libraries, this agent accesses your private campaign metrics: clicks, impressions, CTR, conversions, cost, ad copy, and keywords.</p>' +
        '<p>It also provides access to the <strong>Google Keyword Planner</strong> for search volume and bid estimates on any keyword set. The performance data and keyword insights feed into multiple downstream agents for better-informed strategy generation.</p>',
      howItWorks: [
        '<strong>Account connection:</strong> Validates Google Ads API credentials (client ID, secret, refresh token, developer token)',
        '<strong>Account listing:</strong> Fetches accessible client accounts under your MCC (multi-client center)',
        '<strong>Campaign data:</strong> Pulls campaign-level performance metrics (impressions, clicks, CTR, conversions, cost)',
        '<strong>Keyword performance:</strong> Fetches keyword-level data for selected campaigns (search terms, CPC, conversion rates)',
        '<strong>Keyword ideas:</strong> Calls Google Keyword Planner with seed keywords or a URL to get search volume, competition level, and bid ranges',
        '<strong>Campaign analysis:</strong> Sends selected campaign data to Claude AI for performance analysis with actionable recommendations',
        'Persists keyword planner results and campaign analyses in container storage'
      ],
      prerequisites: [
        'Google Ads API credentials configured (client ID, client secret, developer token, refresh token)',
        'At least one accessible Google Ads account'
      ],
      outputs: '<p>Produces multiple data types:</p>' +
        '<ul><li><strong>Keyword ideas</strong> — search volume, competition level, low/high bid estimates for seed keywords</li>' +
        '<li><strong>Campaign metrics</strong> — clicks, impressions, CTR, conversions, cost per campaign</li>' +
        '<li><strong>Keyword performance</strong> — search term-level metrics for campaign keywords</li>' +
        '<li><strong>Campaign analysis</strong> — AI-generated insights on what\'s working and what isn\'t</li></ul>',
      downstream: [
        '<strong>AG-005 Magic AI Proposal</strong> — reads Google Ads performance for strategy context',
        '<strong>AG-008 Keyword Strategist</strong> — uses real CPC/search volume for keyword recommendations',
        '<strong>AG-013 RPS Test Ideator</strong> — reads campaign metrics for test hypothesis generation',
        '<strong>AG-015 Container Chat</strong> — includes Google Ads data in chat context',
        '<strong>Container Context</strong> — campaign analyses can be pushed to context'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Google Ads</strong> section. If credentials are configured, you\'ll see options to:</p>' +
        '<ul><li>Select an account and view campaigns</li>' +
        '<li>Run AI analysis on selected campaigns</li>' +
        '<li>Search keyword ideas with the Keyword Planner</li></ul>' +
        '<p>Campaign analyses can be pushed to Container Context from their results view.</p>',
      tips: [
        'Set up your Google Ads API credentials in the server environment before using this agent',
        'Pull keyword planner data before running the Keyword Strategist — it uses real bid data instead of estimates',
        'Analyze your best and worst campaigns to understand what\'s working',
        'Push campaign analysis to Container Context — it significantly improves Proposal quality',
        'Supports both MCC (multi-client) and single account setups'
      ]
    },

    'image-ads': {
      code: 'AG-010', name: 'Image Ad Curator', category: 'generation',
      overview: '<p>The Image Ad Curator analyzes competitor ads and curates the best ones worth cloning for your product. Rather than generating images directly, it acts as an <strong>AI creative director</strong> — ranking ads by effectiveness, recommending specific AI image models for each, and providing detailed adaptation strategies.</p>' +
        '<p>It considers effectiveness signals (long running time, emotional hooks, strong CTAs), your brand context, and the visual style of each ad to recommend the ideal AI model: NanoBanana, DALL-E, Midjourney, Stable Diffusion, Ideogram, Flux, or NanoGPT.</p>',
      howItWorks: [
        'Gathers competitor ads — either all scraped ads or a user-selected subset',
        'Collects container context (curated insights), competitor analysis intel, and the latest proposal\'s creative briefs',
        'Sends everything to Claude with curation criteria: effectiveness signals, adaptation potential, visual feasibility',
        'For each of 5-10 top ads, AI determines: why it\'s worth cloning, how to adapt it, which AI model to use, and visual direction',
        'Produces model-specific prompts optimized for each tool\'s syntax',
        'Includes psychology hooks, A/B testing suggestions, and creative guidelines',
        'Generates a ranked list of curated ads with detailed recommendations'
      ],
      prerequisites: [
        'Scraped competitor ads (AG-001)',
        'Recommended: competitor analyses (AG-003) and a completed proposal (AG-005) for richer curation'
      ],
      outputs: '<p>Creates an <strong>image ad curation</strong> record containing:</p>' +
        '<ul><li><strong>Curation summary</strong> — overview of the competitive ad landscape</li>' +
        '<li><strong>Curated ads</strong> (5-10) — ranked by effectiveness with adaptation strategies, model recommendations, and visual direction</li>' +
        '<li><strong>Ad concepts</strong> — ready-to-use creative concepts with prompts</li>' +
        '<li><strong>Model recommendation summary</strong> — which AI models work best for which styles</li>' +
        '<li><strong>Creative guidelines</strong> — color palette, typography, and composition rules</li></ul>',
      downstream: [
        '<strong>Clone Ad</strong> — after reviewing curated ads, use "Clone This Ad" to generate the actual image via OpenRouter',
        '<strong>Container Context</strong> — curation findings can be pushed to context'
      ],
      uiGuide: '<p>The Image Ad Curator uses a <strong>3-step workflow</strong> on a dedicated page:</p>' +
        '<ol><li><strong>Select Ads</strong> — browse all scraped competitor ads with checkboxes. See context items and metadata as reference. Select by competitor or individually.</li>' +
        '<li><strong>Configure</strong> — set platform, objective, audience, tone, AI image models, color scheme, and ad count. Add custom instructions if needed.</li>' +
        '<li><strong>Report</strong> — view the AI curation report with ranked recommendations. Each section has a Push button for Container Context.</li></ol>' +
        '<p>After reviewing, click <strong>Clone This Ad</strong> on any curated ad to jump to the clone section with pre-selected model and format.</p>',
      tips: [
        'Select ads from multiple competitors for diverse creative directions',
        'The more context you push before running, the better the model recommendations',
        'NanoBanana and DALL-E work best for photographic styles; Midjourney for illustrated/artistic styles',
        'Use the "Custom Instructions" field to specify brand constraints (e.g., "no faces", "always include our logo")',
        'Old report links (<code>?cid=X&adId=Y</code>) still work for viewing past curations'
      ]
    },

    'quiz': {
      code: 'AG-011', name: 'Quiz Generator', category: 'generation',
      overview: '<p>The Quiz Generator creates interactive lead-generation quizzes as standalone HTML pages. Each quiz guides prospects through engaging questions that segment them by interest or need, then presents personalized product recommendations.</p>' +
        '<p>A unique feature is the <strong>two-pass generation process</strong>: after initial creation, the agent runs a quality check using a fast model to validate answer logic, HTML functionality, and content accuracy — fixing any issues before delivery.</p>',
      howItWorks: [
        'Builds a prompt with product context, container context (curated insights), and quiz configuration options',
        'Sends to Claude for quiz JSON generation: questions array + complete interactive HTML page',
        '<strong>Quality check phase:</strong> validates correct_answer IDs match option IDs, checks HTML structure and interactivity, verifies image prompt presence for visual quiz types',
        'If QA fails, sends the issues back to Claude for correction and gets a fixed version',
        'Injects tracking codes (Facebook Pixel, GA4, custom code) from container settings into the HTML',
        'Stores the full text, structured JSON with questions, and the complete standalone HTML file'
      ],
      prerequisites: [
        'Container with product info filled in',
        'Recommended: container context pushed for better quiz content relevance'
      ],
      outputs: '<p>Creates a <strong>quiz</strong> record containing:</p>' +
        '<ul><li><strong>Quiz metadata</strong> — title, description, type, difficulty</li>' +
        '<li><strong>Questions array</strong> — each with options, correct answer, explanation</li>' +
        '<li><strong>End page</strong> — personalized results/recommendations based on answers</li>' +
        '<li><strong>Complete HTML</strong> — fully functional, self-contained interactive quiz page with styling, logic, and tracking codes</li></ul>',
      downstream: [
        'No direct downstream consumers — the quiz is a deployable end product'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Quiz</strong> section. Configure:</p>' +
        '<ul><li><strong>Quiz type</strong> — text only, text + images, or text + images + video</li>' +
        '<li><strong>Number of questions</strong> and <strong>difficulty level</strong></li>' +
        '<li><strong>Topic</strong> and <strong>custom instructions</strong></li>' +
        '<li><strong>Redirect URL</strong> — where to send users after completing the quiz</li></ul>' +
        '<p>Click Generate. The resulting quiz is a standalone HTML file you can download and deploy on any web server.</p>',
      tips: [
        'Push container context before generating — it makes quiz questions much more relevant to your market',
        'Configure Facebook Pixel and GA4 in Settings to auto-inject tracking into the quiz HTML',
        'For "text + image" quizzes, the generated HTML includes styled image prompt cards — use these with an AI image tool to create the actual visuals',
        'The redirect URL feature lets you send quiz completers directly to your product page or landing page',
        'Quality is better with more container context — the AI understands your audience better'
      ]
    },

    'landing-page': {
      code: 'AG-012', name: 'Landing Page Generator', category: 'generation',
      overview: '<p>The Landing Page Generator creates complete, mobile-responsive HTML landing pages with conversion-focused design. It draws on SEO keywords from competitor analyses and container context to produce pages optimized for both search engines and conversions.</p>' +
        '<p>Generated pages include: hero section, features/benefits, social proof, FAQ, and CTA — all with semantic HTML, proper heading hierarchy, and responsive design. Tracking codes (Facebook Pixel, GA4) are automatically injected from container settings.</p>',
      howItWorks: [
        'Gathers SEO keywords from competitor SEO analyses and your own SEO position',
        'Collects SEO opportunities, quick-win keywords, and competitor ad messaging patterns',
        'Reads all container context items for product positioning and messaging',
        'Sends to Claude with page type, target keyword, goal, and tone configuration',
        'Claude generates complete HTML with: hero, features, social proof, FAQ, CTA sections',
        'Injects tracking codes (FB Pixel, GA4, custom code) from container settings',
        'Stores the full HTML, page metadata, SEO checklist, and conversion notes'
      ],
      prerequisites: [
        'Container with product info filled in',
        'Recommended: SEO analyses and competitor analyses pushed to container context'
      ],
      outputs: '<p>Creates a <strong>landing page</strong> record containing:</p>' +
        '<ul><li><strong>Complete HTML</strong> — mobile-responsive, self-contained landing page</li>' +
        '<li><strong>Page title and meta description</strong> — SEO-optimized</li>' +
        '<li><strong>Target keywords</strong> — keywords the page is optimized for</li>' +
        '<li><strong>Page structure</strong> — section breakdown</li>' +
        '<li><strong>Conversion notes</strong> — design decisions for conversion optimization</li>' +
        '<li><strong>SEO checklist</strong> — verification of SEO best practices</li></ul>',
      downstream: [
        'No direct downstream consumers — the landing page is a deployable end product'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Landing Page</strong> section. Configure:</p>' +
        '<ul><li><strong>Page type</strong> — product page, lead gen, webinar registration, etc.</li>' +
        '<li><strong>Target keyword</strong> — primary keyword to optimize for</li>' +
        '<li><strong>Page goal</strong> — what action you want visitors to take</li>' +
        '<li><strong>Tone</strong> and <strong>custom instructions</strong></li></ul>' +
        '<p>Click Generate. The HTML is ready to deploy — download it and host on any web server. Tracking codes are already injected if configured in Settings.</p>',
      tips: [
        'Run SEO analyses first and push to context — the Landing Page Generator uses these keywords',
        'Set up Facebook Pixel and GA4 in Settings before generating to get automatic tracking injection',
        'Use the "Target Keyword" field for your primary SEO keyword — the page will be optimized for it',
        'Generated pages are self-contained HTML — no external dependencies needed for deployment',
        'Review the SEO checklist in the output to verify optimization quality'
      ]
    },

    'test-planner': {
      code: 'AG-013', name: 'RPS Test Ideator', category: 'generation',
      overview: '<p>The RPS Test Ideator generates A/B test plans using a rigorous <strong>KNOWNS/UNKNOWNS framework</strong>. It first classifies all your container data into what you know for certain (proven metrics, confirmed audience data) versus what\'s still an assumption (untested messaging, unknown price sensitivity), then designs experiments to validate the unknowns.</p>' +
        '<p>Each test plan tests a maximum of 1-2 unknowns at a time, with all success criteria referencing specific known benchmarks. This prevents the common mistake of testing too many variables simultaneously.</p>',
      howItWorks: [
        '<strong>Classification phase:</strong> Walks through all container data and categorizes each piece as KNOWN or UNKNOWN',
        'KNOWNs include: product data, Google Ads metrics, competitor analysis findings, scrape data counts, SEO data, keyword strategies',
        'UNKNOWNs include: untested messaging angles, unvalidated audience segments, price sensitivity, channel effectiveness',
        'Sends the classified data to Claude (heavy model) with the KNOWNS/UNKNOWNS framework',
        'Claude produces 2-5 test plans, each testing maximum 1-2 unknowns',
        'Every test includes: hypothesis, channels, KNOWNs leveraged, unknowns tested, geo targeting, keywords, audience, creative direction, budget with sample size justification, and success criteria with benchmarks',
        'Produces a recommended test sequence (foundational assumptions first) and total budget estimate'
      ],
      prerequisites: [
        'Container with product info filled in',
        'Recommended: Google Ads data, competitor analyses, and container context for richer classification'
      ],
      outputs: '<p>Creates a <strong>test plan</strong> record containing:</p>' +
        '<ul><li><strong>Data classification</strong> — all container data categorized as KNOWN or UNKNOWN</li>' +
        '<li><strong>Test plans</strong> (2-5) — each with hypothesis, channels, audience, creative direction, budget, and success criteria</li>' +
        '<li><strong>Recommended sequence</strong> — which tests to run first (foundational assumptions before refinements)</li>' +
        '<li><strong>Total budget estimate</strong> — combined budget across all tests with sample size justification</li></ul>',
      downstream: [
        'No direct downstream consumers — test plans are strategic output for your execution'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Test Planner</strong> section. Optionally set:</p>' +
        '<ul><li><strong>Focus area</strong> — what aspect to prioritize testing</li>' +
        '<li><strong>Budget constraint</strong> — maximum budget for all tests</li>' +
        '<li><strong>Target channels</strong> — limit tests to specific platforms</li>' +
        '<li><strong>Custom instructions</strong></li></ul>' +
        '<p>Click Generate. Results open on a dedicated page with the KNOWNS/UNKNOWNS classification and detailed test plans.</p>',
      tips: [
        'The more data in your container, the better the KNOWN/UNKNOWN classification',
        'Connect Google Ads data for real performance benchmarks in success criteria',
        'Run the Proposal first — test plans reference it for messaging context',
        'Start with tests that validate foundational assumptions (does anyone want this?) before refinement tests (which headline works better?)',
        'Two modes: if you have a product, tests focus on optimization; if no product yet, tests focus on MVP validation'
      ]
    },

    'case-study': {
      code: 'AG-014', name: 'Case Study Analyzer', category: 'analysis',
      overview: '<p>The Case Study Analyzer extracts structured insights from marketing case studies in any format. Paste a URL, upload a PDF, provide an image, or enter raw text — the agent reads the case study and pulls out key metrics, strategies, channels, target audience, and actionable lessons.</p>' +
        '<p>It supports <strong>four input formats</strong>: plain text, PDF documents, images (using Claude\'s vision API), and web URLs. For each, it applies appropriate text extraction before running the AI analysis.</p>',
      howItWorks: [
        'Accepts case study content from one of four sources: text, PDF, image, or URL',
        '<strong>Text:</strong> Decodes base64-encoded content directly',
        '<strong>PDF:</strong> Uses pdf-parse library to extract text + count pages',
        '<strong>Image:</strong> Sends to Claude Vision API to read text from the image',
        '<strong>URL:</strong> Fetches the web page via HTTP and strips HTML to get clean text',
        'Truncates extracted text to 80,000 characters if needed',
        'Sends the extracted text to Claude for structured analysis',
        'Extracts: competitor name, summary, key metrics, strategies used, channels, target audience, timeline, strengths, weaknesses, lessons for your product, and notable quotes'
      ],
      prerequisites: [
        'A case study in any supported format (text, PDF, image, or URL)',
        'Container must exist (case study is stored per-container)'
      ],
      outputs: '<p>Creates a <strong>case study</strong> record containing:</p>' +
        '<ul><li><strong>Summary</strong> — what the case study is about</li>' +
        '<li><strong>Key metrics</strong> — numbers and results achieved</li>' +
        '<li><strong>Strategies used</strong> — marketing approaches applied</li>' +
        '<li><strong>Channels</strong> — platforms and mediums used</li>' +
        '<li><strong>Target audience</strong> — who was being reached</li>' +
        '<li><strong>Timeline</strong> — how long the campaign ran</li>' +
        '<li><strong>Strengths and weaknesses</strong> — what worked and what didn\'t</li>' +
        '<li><strong>Lessons for us</strong> — actionable takeaways for your product</li>' +
        '<li><strong>Notable quotes</strong> — key statements worth remembering</li></ul>',
      downstream: [
        '<strong>Container Context</strong> — case study insights can be pushed to context for downstream agents'
      ],
      uiGuide: '<p>From the container dashboard, find the <strong>Case Studies</strong> section. Choose an input method:</p>' +
        '<ul><li><strong>Text</strong> — paste case study content directly</li>' +
        '<li><strong>URL</strong> — enter the web page URL</li>' +
        '<li><strong>PDF</strong> — upload a PDF file</li>' +
        '<li><strong>Image</strong> — upload a screenshot or scan</li></ul>' +
        '<p>Optionally link it to a specific competitor. Click Analyze.</p>',
      tips: [
        'URLs work best for blog-style case studies; PDFs for formal reports',
        'Image input uses Claude Vision — works well for screenshots but not for multi-page documents',
        'Link the case study to a competitor if applicable — it adds context for the analysis',
        'Focus on the "Lessons for Us" section — this is where actionable insights live',
        'Push case study insights to Container Context for the Proposal agent to reference'
      ]
    },

    'container-chat': {
      code: 'AG-015', name: 'Container Chat', category: 'chat',
      overview: '<p>Container Chat is a conversational AI interface that lets you ask free-form questions about your container data. It reads all container context, competitor analyses, Google Ads data, keyword strategies, and scrape data to provide informed answers.</p>' +
        '<p>Unlike other agents, Container Chat is <strong>stateless</strong> — it doesn\'t persist data. It\'s designed for exploration, brainstorming, and quick analysis without running a full generation pipeline.</p>',
      howItWorks: [
        'Takes your message and conversation history (session-only, not persisted)',
        'Builds a comprehensive system prompt from all container data: product info, competitor list, metadata/notes',
        'Injects <strong>Container Context</strong> (curated insights) as the primary knowledge source',
        'Adds competitor analysis summaries (latest for each competitor), Google Ads performance, and keyword strategy highlights',
        'Caps the system prompt at 80,000 characters with intelligent truncation',
        'Sends message + history to Claude for a synchronous response',
        'Returns markdown-formatted response — no storage overhead'
      ],
      prerequisites: [
        'A container with some data (more context = better answers)',
        'Recommended: push analyses to Container Context before chatting'
      ],
      outputs: '<p>Returns a <strong>text response</strong> (markdown formatted). No data is persisted — this is a live conversation tool.</p>',
      downstream: [
        'No downstream consumers — chat is an interactive exploration tool'
      ],
      uiGuide: '<p>Access Container Chat from the <strong>Chat</strong> link in the top navigation bar on any page. Select a container from the dropdown, then type your question.</p>' +
        '<p>Example questions:</p>' +
        '<ul><li>"What messaging patterns do my competitors share?"</li>' +
        '<li>"Which competitor has the strongest value proposition?"</li>' +
        '<li>"Suggest three headline angles based on my competitor analysis"</li>' +
        '<li>"Summarize the key takeaways from all my analyses"</li></ul>',
      tips: [
        'Push as much context as possible before chatting — Container Context is the backbone of chat quality',
        'Use chat to test hypotheses before running full generations',
        'The conversation history is session-only — if you refresh, the context resets',
        'Ask specific questions for best results — "What are the top 3 weaknesses of Competitor X?" works better than "Tell me about competitors"',
        'Use chat to explore angles before running the Proposal — it\'s faster for iteration'
      ]
    },

    'desire-spring': {
      code: 'AG-016', name: 'DesireSpring', category: 'generation',
      overview: '<p>DesireSpring is a meta-tool — it helps you build <strong>Product Analyzer itself</strong>. It captures feature ideas for the app and generates structured implementation instructions that reference real files, routes, and architectural patterns from the codebase.</p>' +
        '<p>The agent reads the project\'s CLAUDE.md architecture document to understand the app\'s structure, then produces step-by-step instructions that can be saved as text files for future implementation sessions.</p>',
      howItWorks: [
        'Takes a plain-language feature idea description (e.g., "Add Semrush data integration")',
        'Reads the project\'s CLAUDE.md architecture document from the filesystem — this gives it full knowledge of the codebase structure, naming conventions, and patterns',
        'Sends the idea + architecture context to Claude with instructions to produce step-by-step implementation guidance',
        'Claude outputs structured JSON: title, suggested filename (NNN.txt), and full markdown instructions',
        'Instructions reference real file names and routes but contain NO code — they describe WHAT to build, not HOW to code it',
        'Stores in self-contained <code>data/desire-spring.json</code> (not via the main storage.js)',
        'Instructions can be reviewed, edited, and saved to the <code>instructions/</code> directory as numbered text files'
      ],
      prerequisites: [
        'The project\'s CLAUDE.md file must exist (it reads this for architectural context)',
        'No container needed — DesireSpring is a global tool'
      ],
      outputs: '<p>Creates a <strong>desire-spring idea</strong> record containing:</p>' +
        '<ul><li><strong>Title</strong> — concise name for the feature</li>' +
        '<li><strong>Filename suggestion</strong> — numbered .txt filename (e.g., "011.txt")</li>' +
        '<li><strong>Instructions</strong> — full markdown implementation guide referencing real files and patterns</li></ul>',
      downstream: [
        'No downstream consumers — instructions are for human developers or AI coding assistants'
      ],
      uiGuide: '<p>Access DesireSpring from the <strong>DesireSpring</strong> link in the top navigation bar. The page shows:</p>' +
        '<ul><li><strong>Idea input</strong> — describe the feature you want to add</li>' +
        '<li><strong>Generate button</strong> — triggers instruction generation</li>' +
        '<li><strong>Editable output</strong> — review and modify the generated instructions</li>' +
        '<li><strong>Save button</strong> — saves instructions to the <code>instructions/</code> folder</li>' +
        '<li><strong>Sidebar</strong> — lists all past ideas with status badges (generating, ready, saved)</li></ul>',
      tips: [
        'Be specific about what you want — "Add a button that exports proposals as PDF" generates better instructions than "PDF support"',
        'Instructions reference real files — they\'re a roadmap, not generic advice',
        'Review and edit instructions before saving — the AI may miss edge cases',
        'Saved instructions go to <code>instructions/NNN.txt</code> — keep them for future development sessions',
        'Ideas are stored globally, not per-container'
      ]
    },

    'research-web': {
      code: 'AG-017', name: 'ResearchWeb', category: 'research',
      overview: '<p>ResearchWeb is a two-phase web research tool. In <strong>Phase 1</strong>, it uses Claude\'s built-in web search to find 8-15 high-quality sources on any topic. In <strong>Phase 2</strong>, you select which sources to summarize — the agent fetches each page, extracts content, and produces AI summaries with key insights.</p>' +
        '<p>After summarization, results can be pushed to any container\'s Context system, feeding your web research directly into the knowledge base that downstream agents read. Unlike most agents, ResearchWeb operates globally — it\'s not tied to a specific container.</p>',
      howItWorks: [
        '<strong>Phase 1 — Search:</strong> Takes a research topic and sends it to Claude with web search enabled',
        'Claude performs multiple web searches, finding 8-15 diverse sources (articles, videos, PDFs, social posts)',
        'Returns a source list with URL, title, type, snippet, and relevance notes',
        '<strong>Phase 2 — Summarize:</strong> For each selected source, fetches page content via Puppeteer headless browser',
        'Strips HTML (removes scripts, styles, navigation, footers), truncates to 15,000 characters',
        'Sends cleaned text to Claude (fast model) for summary generation: summary, key insights, relevance to topic',
        'Saves summaries incrementally as they complete (not all at once — you see progress in real time)',
        'Generates a combined brief synthesizing all summaries into a unified overview'
      ],
      prerequisites: [
        'No prerequisites — ResearchWeb works independently of containers',
        'Server must be running with Puppeteer/Chromium available for page fetching'
      ],
      outputs: '<p>Creates a <strong>web research</strong> record containing:</p>' +
        '<ul><li><strong>Sources list</strong> (8-15) — URL, title, type, snippet, relevance note</li>' +
        '<li><strong>Search summary</strong> — overview of what was found</li>' +
        '<li><strong>Individual summaries</strong> — per-source summary, key insights, relevance assessment</li>' +
        '<li><strong>Combined brief</strong> — synthesis of all summaries into a unified overview</li></ul>',
      downstream: [
        '<strong>Container Context</strong> — individual summaries or the full brief can be pushed to any container\'s context',
        'Through context: any downstream agent (Proposal, Keyword Strategist, Chat, etc.)'
      ],
      uiGuide: '<p>Access ResearchWeb from the <strong>Research</strong> link in the top navigation bar. The page shows:</p>' +
        '<ul><li><strong>Topic input</strong> — enter any research topic</li>' +
        '<li><strong>Search button</strong> — triggers Phase 1 (finding sources)</li>' +
        '<li><strong>Source list</strong> — checkboxes to select which sources to summarize</li>' +
        '<li><strong>Summarize button</strong> — triggers Phase 2 (fetching + summarizing)</li>' +
        '<li><strong>Container dropdown + Push buttons</strong> — push summaries to any container\'s context</li>' +
        '<li><strong>Sidebar</strong> — lists all past research sessions for easy retrieval</li></ul>',
      tips: [
        'Use specific research topics for better source quality — "Facebook ad strategies for DTC skincare brands 2025" beats "marketing strategies"',
        'Don\'t select all sources for summarization — pick the most relevant 5-8 for focused insights',
        'Push the combined brief to Container Context for the most efficient downstream impact',
        'Research sessions persist globally — you can revisit them anytime from the sidebar',
        'YouTube and PDF sources are skipped during page fetching — the source list will note this'
      ]
    }
  };

  // ── Render functions ──

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderSidebar(activeId) {
    var sidebar = document.getElementById('ag-sidebar');
    var categories = {};

    AGENT_ORDER.forEach(function (id) {
      var g = AGENT_GUIDES[id];
      if (!g) return;
      var cat = g.category;
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ id: id, code: g.code, name: g.name });
    });

    var catLabels = {
      scraping: 'Data Collection',
      validation: 'Validation',
      analysis: 'Analysis',
      generation: 'Generation',
      api: 'Integrations',
      chat: 'Interactive',
      research: 'Research'
    };

    var html = '';
    var catOrder = ['scraping', 'validation', 'analysis', 'api', 'generation', 'chat', 'research'];

    catOrder.forEach(function (cat) {
      if (!categories[cat]) return;
      html += '<h4>' + esc(catLabels[cat] || cat) + '</h4>';
      categories[cat].forEach(function (agent) {
        var cls = agent.id === activeId ? ' class="active"' : '';
        html += '<a href="/agent-guide.html?agent=' + agent.id + '"' + cls + '>' + esc(agent.code + ' ' + agent.name) + '</a>';
      });
    });

    sidebar.innerHTML = html;
  }

  function renderAgent(id) {
    var g = AGENT_GUIDES[id];
    var content = document.getElementById('ag-content');

    if (!g) {
      content.innerHTML = '<div class="ag-placeholder"><h2>Agent Not Found</h2><p>No guide found for agent "' + esc(id) + '".</p><p><a href="/guide.html">Back to Guide</a></p></div>';
      return;
    }

    var catClass = CAT_CLASS[g.category] || '';

    var html = '';

    // Back link
    html += '<a href="/guide.html" class="ag-back">&larr; Back to Guide</a>';

    // Header
    html += '<div class="ag-header">';
    html += '<div class="ag-badges">';
    html += '<span class="ag-badge code">' + esc(g.code) + '</span>';
    html += '<span class="ag-badge ' + catClass + '">' + esc(g.category) + '</span>';
    html += '</div>';
    html += '<h2>' + esc(g.name) + '</h2>';
    html += '</div>';

    // Overview
    html += '<div class="ag-section">';
    html += '<h3>Overview</h3>';
    html += g.overview;
    html += '</div>';

    // How It Works
    html += '<div class="ag-section">';
    html += '<h3>How It Works</h3>';
    html += '<ol class="ag-steps">';
    g.howItWorks.forEach(function (step) {
      html += '<li>' + step + '</li>';
    });
    html += '</ol>';
    html += '</div>';

    // Prerequisites
    html += '<div class="ag-section">';
    html += '<h3>Prerequisites</h3>';
    html += '<ul>';
    g.prerequisites.forEach(function (p) {
      html += '<li>' + p + '</li>';
    });
    html += '</ul>';
    html += '</div>';

    // What It Produces
    html += '<div class="ag-section">';
    html += '<h3>What It Produces</h3>';
    html += g.outputs;
    html += '</div>';

    // Downstream Usage
    html += '<div class="ag-section">';
    html += '<h3>Downstream Usage</h3>';
    html += '<ul>';
    g.downstream.forEach(function (d) {
      html += '<li>' + d + '</li>';
    });
    html += '</ul>';
    html += '</div>';

    // UI Guide
    html += '<div class="ag-section">';
    html += '<h3>How to Use It</h3>';
    html += g.uiGuide;
    html += '</div>';

    // Tips
    html += '<div class="ag-section">';
    html += '<h3>Tips & Best Practices</h3>';
    html += '<ul>';
    g.tips.forEach(function (t) {
      html += '<li>' + t + '</li>';
    });
    html += '</ul>';
    html += '</div>';

    // Prev/Next navigation
    var idx = AGENT_ORDER.indexOf(id);
    html += '<div class="ag-nav">';
    if (idx > 0) {
      var prev = AGENT_GUIDES[AGENT_ORDER[idx - 1]];
      html += '<a href="/agent-guide.html?agent=' + AGENT_ORDER[idx - 1] + '">&larr; ' + esc(prev.code + ' ' + prev.name) + '</a>';
    } else {
      html += '<span></span>';
    }
    if (idx < AGENT_ORDER.length - 1) {
      var next = AGENT_GUIDES[AGENT_ORDER[idx + 1]];
      html += '<a href="/agent-guide.html?agent=' + AGENT_ORDER[idx + 1] + '">' + esc(next.code + ' ' + next.name) + ' &rarr;</a>';
    } else {
      html += '<span></span>';
    }
    html += '</div>';

    html += '<div style="height:60px;"></div>';

    content.innerHTML = html;
    document.title = g.code + ' ' + g.name + ' — Agent Guide — Product Analyzer';
    window.scrollTo(0, 0);
  }

  function renderIndex() {
    var content = document.getElementById('ag-content');

    var html = '<a href="/guide.html" class="ag-back">&larr; Back to Guide</a>';
    html += '<div class="ag-header"><h2>Agent Guide</h2></div>';
    html += '<p style="color:var(--text-dim);margin-bottom:24px;">Select an agent from the sidebar or click one below to view detailed documentation.</p>';

    var catLabels = {
      scraping: 'Data Collection', validation: 'Validation', analysis: 'Analysis',
      api: 'Integrations', generation: 'Generation', chat: 'Interactive', research: 'Research'
    };
    var catOrder = ['scraping', 'validation', 'analysis', 'api', 'generation', 'chat', 'research'];
    var categories = {};

    AGENT_ORDER.forEach(function (id) {
      var g = AGENT_GUIDES[id];
      if (!g) return;
      if (!categories[g.category]) categories[g.category] = [];
      categories[g.category].push({ id: id, code: g.code, name: g.name });
    });

    catOrder.forEach(function (cat) {
      if (!categories[cat]) return;
      html += '<h3 style="margin:20px 0 10px;font-size:14px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">' + esc(catLabels[cat]) + '</h3>';
      categories[cat].forEach(function (agent) {
        html += '<a href="/agent-guide.html?agent=' + agent.id + '" style="display:block;padding:10px 16px;background:var(--surface);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;color:var(--text);text-decoration:none;">';
        html += '<strong style="color:var(--primary);">' + esc(agent.code) + '</strong> ' + esc(agent.name);
        html += '</a>';
      });
    });

    html += '<div style="height:60px;"></div>';
    content.innerHTML = html;
    document.title = 'Agent Guide — Product Analyzer';
  }

  // ── Init ──
  var params = new URLSearchParams(window.location.search);
  var agentId = params.get('agent');

  if (agentId && AGENT_GUIDES[agentId]) {
    renderSidebar(agentId);
    renderAgent(agentId);
  } else if (agentId) {
    renderSidebar(null);
    renderAgent(agentId); // will show "not found"
  } else {
    renderSidebar(null);
    renderIndex();
  }

})();
