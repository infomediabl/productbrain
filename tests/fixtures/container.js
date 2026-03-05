/**
 * Container fixture factories for tests.
 */
const { v4: uuidv4 } = require('uuid');

function makeCompetitor(overrides = {}) {
  const id = overrides.id || uuidv4();
  return {
    id,
    name: 'Competitor A',
    website: 'https://competitor-a.com',
    facebook_url: 'https://facebook.com/competitorA',
    google_domain: 'competitor-a.com',
    ...overrides,
  };
}

function makeContainer(overrides = {}) {
  const id = overrides.id || uuidv4();
  return {
    id,
    name: 'Test Container',
    created_at: '2025-01-01T00:00:00.000Z',
    my_product: {
      name: 'Test Product',
      website: 'https://test-product.com',
      description: 'A test product for unit tests',
      site_type: 'ecommerce',
      unique_angle: 'Best test product ever',
      target_audience: 'Developers',
    },
    competitors: [makeCompetitor()],
    metadata: [],
    scrape_results: [],
    competitor_analyses: {},
    seo_analyses: {},
    proposals: [],
    generated_prompts: [],
    product_ideas: [],
    keyword_strategies: [],
    landing_pages: [],
    image_ads: [],
    quizzes: [],
    test_plans: [],
    case_studies: [],
    gads_analyses: [],
    keyword_ideas: [],
    taboola_campaigns: [],
    spinoff_ideas: [],
    hooks_results: [],
    validations: [],
    container_context: [],
    settings: {},
    ...overrides,
  };
}

function makeFacebookAd(overrides = {}) {
  return {
    advertiser_name: 'Competitor A',
    headline: 'Amazing Product - Buy Now',
    ad_text: 'Get our amazing product today with 50% off. Limited time offer.',
    cta_text: 'Shop Now',
    media_url: 'https://example.com/ad-image.jpg',
    media_type: 'image',
    destination_url: 'https://competitor-a.com/product',
    started_running: '2025-01-01',
    screenshot_path: null,
    ...overrides,
  };
}

function makeGoogleAd(overrides = {}) {
  return {
    headline: 'Best Product Online',
    description: 'Shop our top-rated products. Free shipping on all orders.',
    destination_url: 'https://competitor-a.com/shop',
    display_url: 'competitor-a.com',
    ...overrides,
  };
}

function makeScrapeResult(overrides = {}) {
  return {
    id: overrides.id || uuidv4(),
    started_at: '2025-01-01T00:00:00.000Z',
    completed_at: '2025-01-01T00:05:00.000Z',
    status: 'completed',
    error_message: null,
    trigger: 'manual',
    new_ads_count: 5,
    scrape_meta: {},
    scraped_data: {
      my_product: { facebook: [], google: [] },
      competitors: {},
    },
    ...overrides,
  };
}

function makeContainerWithAds(overrides = {}) {
  const comp = makeCompetitor(overrides.competitorOverrides);
  const fbAds = [makeFacebookAd(), makeFacebookAd({ headline: 'Sale Today' })];
  const googleAds = [makeGoogleAd()];

  const scrape = makeScrapeResult({
    scraped_data: {
      my_product: { facebook: [makeFacebookAd({ advertiser_name: 'Test Product' })], google: [] },
      competitors: {
        [comp.id]: { facebook: fbAds, google: googleAds },
      },
    },
  });

  return makeContainer({
    competitors: [comp],
    scrape_results: [scrape],
    ...overrides,
  });
}

function makeContainerWithAnalyses(overrides = {}) {
  const container = makeContainerWithAds(overrides);
  const comp = container.competitors[0];
  container.competitor_analyses = {
    [comp.id]: [{
      id: uuidv4(),
      created_at: '2025-01-02T00:00:00.000Z',
      status: 'completed',
      result: {
        full_text: 'Analysis text',
        json_data: {
          summary: 'Competitor uses aggressive pricing',
          key_findings: [{ finding: 'Heavy discounting' }],
          opportunities_for_us: [{ opportunity: 'Premium positioning' }],
          messaging_patterns: [{ pattern: 'Urgency-based CTAs' }],
        },
      },
    }],
  };
  return container;
}

function makeContainerWithFullData(overrides = {}) {
  const container = makeContainerWithAnalyses(overrides);
  const comp = container.competitors[0];

  container.seo_analyses = {
    [comp.id]: [{
      id: uuidv4(),
      created_at: '2025-01-03T00:00:00.000Z',
      status: 'completed',
      result: { full_text: 'SEO text', json_data: { overall_effectiveness: 75 } },
    }],
  };

  container.container_context = [{
    id: uuidv4(),
    source_type: 'competitor_analysis',
    source_id: comp.id,
    section_name: 'Key Findings',
    content: { summary: 'Test summary' },
    text_brief: 'Competitor uses aggressive pricing strategies.',
    pushed_at: '2025-01-02T01:00:00.000Z',
  }];

  container.proposals = [{
    id: uuidv4(),
    created_at: '2025-01-04T00:00:00.000Z',
    status: 'completed',
    result: {
      full_text: 'Proposal text',
      json_data: { creative_briefs: [{ brief_name: 'Test Brief' }] },
    },
  }];

  container.keyword_strategies = [{
    id: uuidv4(),
    created_at: '2025-01-05T00:00:00.000Z',
    status: 'completed',
    result: {
      full_text: 'KW text',
      json_data: { summary: 'Focus on long-tail', quick_wins: ['buy test product'] },
    },
  }];

  return container;
}

function makeProposal(overrides = {}) {
  return {
    id: uuidv4(),
    created_at: '2025-01-01T00:00:00.000Z',
    status: 'completed',
    result: {
      full_text: 'Proposal result text',
      json_data: {
        creative_briefs: [
          { brief_name: 'Social Proof Campaign', target_audience: 'Developers' },
        ],
      },
    },
    ...overrides,
  };
}

module.exports = {
  makeContainer,
  makeContainerWithAds,
  makeContainerWithAnalyses,
  makeContainerWithFullData,
  makeCompetitor,
  makeProposal,
  makeFacebookAd,
  makeGoogleAd,
  makeScrapeResult,
};
