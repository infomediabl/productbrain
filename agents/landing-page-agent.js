/**
 * Agent: Landing Page Generator
 * Route: routes/landing-page.js → POST /api/containers/:id/landing-page
 * Deps: storage, logger, gather-data (gatherContainerContext), inject-tracking
 * Stores: storage.landing_pages[]
 *
 * Generates complete landing page HTML from SEO data, keyword strategy, and
 * product context. Auto-injects tracking codes from container settings.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { injectTrackingCodes } = require('../utils/inject-tracking');
const { gatherContainerContext } = require('../utils/gather-data');

const SRC = 'LandingPageAgent';

const AGENT_META = {
  code: 'ag0012',
  id: 'landing-page',
  name: 'Landing Page Generator',
  description: 'Complete HTML landing pages from SEO and keyword data.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [
    { agent: 'seo', dataKey: 'seo_analyses', description: 'SEO keyword gaps and opportunities' },
    { agent: 'keyword-ideator', dataKey: 'keyword_strategies', description: 'Keyword strategy quick wins' },
    { agent: 'scraper', dataKey: 'scrape_results', description: 'Competitor ad messaging' },
  ],
  outputs: { storageKey: 'landing_pages', dataType: 'html', schema: 'LandingPage' },
  ui: { visible: true },
};

async function generateLandingPage(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const page = await storage.addLandingPage(containerId);
  if (!page) throw new Error('Failed to create landing page record');

  executeLandingPage(containerId, page.id, container, options).catch(async (err) => {
    log.error(SRC, 'Landing page generation crashed', { err: err.message });
    try {
      await storage.updateLandingPage(containerId, page.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return page;
}

async function executeLandingPage(containerId, pageId, container, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const prompt = buildPrompt(container, options);

    log.info(SRC, 'Sending landing page request to Claude', {
      containerId,
      pageType: options.page_type || 'general',
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: `${config.APP_CONTEXT}

You are an expert web designer and conversion optimization specialist. You create high-converting landing pages with clean, modern HTML and CSS.

CRITICAL RULES:
1. Output ONLY valid JSON with the structure specified.
2. The HTML must be complete, self-contained (inline CSS), and mobile-responsive.
3. Design for conversion: clear CTA, benefit-focused copy, social proof sections.
4. Use modern design patterns: hero section, features grid, testimonials, FAQ, CTA.
5. Apply SEO best practices: proper heading hierarchy, meta description, semantic HTML.
6. Include placeholder areas for images with descriptive alt text.
7. Make the design professional and visually appealing with a cohesive color scheme.
8. Target keywords should appear naturally in headings, body text, and meta tags.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try { jsonData = parseJson(fullText); } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    // Inject tracking codes from container settings
    if (jsonData && jsonData.full_html) {
      const settings = storage.getSettings(containerId);
      if (settings) {
        jsonData.full_html = injectTrackingCodes(jsonData.full_html, settings);
      }
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      page_type: options.page_type || 'general',
      target_keyword: options.target_keyword || null,
      generated_at: new Date().toISOString(),
    };

    await storage.updateLandingPage(containerId, pageId, 'completed', result);
    log.info(SRC, 'Landing page generated', { pageId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateLandingPage(containerId, pageId, 'failed', { error: err.message });
  }
}

function buildPrompt(container, options) {
  const parts = [];

  parts.push('## Landing Page Generation Request');

  if (container.my_product) {
    parts.push(`\n### Product`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
    if (container.my_product.site_type) parts.push(`Site Type: ${container.my_product.site_type}`);
  }

  if (options.page_type) parts.push(`\n### Page Type: ${options.page_type}`);
  if (options.target_keyword) parts.push(`### Target Keyword: ${options.target_keyword}`);
  if (options.page_goal) parts.push(`### Page Goal: ${options.page_goal}`);
  if (options.tone) parts.push(`### Tone: ${options.tone}`);
  if (options.custom_instructions) parts.push(`### Custom Instructions:\n${options.custom_instructions}`);

  // Container Context (curated insights)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    parts.push('\n### Container Context (Curated Insights)');
    for (const item of contextData) {
      parts.push(`**[${item.source_type}] ${item.section_name}**`);
      parts.push(item.brief);
    }
  }

  // Gather SEO insights for keyword targeting
  const seoKeywords = [];
  const seoOpportunities = [];
  for (const comp of container.competitors) {
    const seoAnalyses = (container.seo_analyses || {})[comp.id] || [];
    const latest = [...seoAnalyses].reverse().find(a => a.status === 'completed');
    if (latest?.result?.json_data) {
      const s = latest.result.json_data;
      if (s.keyword_strategy?.keyword_gaps) seoKeywords.push(...s.keyword_strategy.keyword_gaps);
      if (s.keyword_strategy?.content_opportunities) seoOpportunities.push(...s.keyword_strategy.content_opportunities);
      if (s.competitive_seo_insights?.opportunities_for_us) {
        seoOpportunities.push(...s.competitive_seo_insights.opportunities_for_us.map(o => ({
          topic: o.opportunity,
          rationale: o.details,
          priority: o.impact,
        })));
      }
    }
  }

  if (seoKeywords.length > 0) {
    parts.push(`\n### SEO Keywords to Target`);
    parts.push(seoKeywords.slice(0, 15).join(', '));
  }

  if (seoOpportunities.length > 0) {
    parts.push(`\n### SEO Opportunities to Address`);
    for (const opp of seoOpportunities.slice(0, 8)) {
      parts.push(`- ${opp.topic || opp.opportunity}: ${opp.rationale || opp.details || ''} (${opp.priority || ''})`);
    }
  }

  // Get keyword strategy insights
  const strategies = container.keyword_strategies || [];
  const latestStrategy = [...strategies].reverse().find(s => s.status === 'completed');
  if (latestStrategy?.result?.json_data) {
    const ks = latestStrategy.result.json_data;
    if (ks.quick_wins) {
      parts.push(`\n### Quick Win Keywords`);
      ks.quick_wins.slice(0, 5).forEach(qw => parts.push(`- ${qw.keyword}: ${qw.why}`));
    }
  }

  // Get competitor ad messaging for inspiration
  const adExamples = [];
  const scrapes = (container.scrape_results || []).filter(s => s.status === 'completed');
  for (const scrape of scrapes.slice(-2)) {
    for (const [compId, compData] of Object.entries(scrape.scraped_data?.competitors || {})) {
      const comp = container.competitors.find(c => c.id === compId);
      for (const ad of [...(compData.facebook || []), ...(compData.google || [])].slice(0, 3)) {
        if (ad.headline || ad.cta_text) {
          adExamples.push({ competitor: comp?.name, headline: ad.headline, cta: ad.cta_text });
        }
      }
    }
  }

  if (adExamples.length > 0) {
    parts.push(`\n### Competitor Ad Messaging (for CTA inspiration)`);
    adExamples.slice(0, 8).forEach(a => {
      parts.push(`- [${a.competitor}] "${a.headline || ''}" CTA: "${a.cta || ''}"`);
    });
  }

  parts.push(`\n## Output Format
Generate a JSON object with:

{
  "page_title": "SEO-optimized page title (50-60 chars)",
  "meta_description": "compelling meta description (150-160 chars)",
  "target_keywords": ["primary keyword", "secondary keywords"],
  "page_structure": {
    "hero": {
      "headline": "main headline",
      "subheadline": "supporting text",
      "cta_text": "button text",
      "cta_url": "#signup"
    },
    "features": [
      { "title": "feature name", "description": "benefit-focused description", "icon_suggestion": "emoji or icon name" }
    ],
    "social_proof": {
      "headline": "section headline",
      "testimonials": [
        { "quote": "testimonial text", "author": "name", "role": "title/company" }
      ],
      "stats": [
        { "number": "100+", "label": "description" }
      ]
    },
    "faq": [
      { "question": "common question", "answer": "helpful answer" }
    ],
    "final_cta": {
      "headline": "closing headline",
      "text": "urgency/value text",
      "cta_text": "button text"
    }
  },
  "full_html": "<!DOCTYPE html>...(complete self-contained HTML with inline CSS, responsive design, modern layout)...",
  "conversion_notes": ["specific tips for optimizing this page's conversion rate"],
  "seo_checklist": ["SEO elements included in this page"]
}`);

  return parts.join('\n');
}

function parseJson(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch (e) {}
  const fenceMatch = trimmed.match(/\`\`\`(?:json)?\s*\n?([\s\S]*?)\n?\s*\`\`\`/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch (e) {} }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(trimmed.substring(first, last + 1)); } catch (e) {} }
  return null;
}

module.exports = { generateLandingPage, run: generateLandingPage, AGENT_META };