/**
 * Route: Container Context
 * Mount: /api/containers/:id/context (via server.js)
 * Agent: None
 * Deps: express, storage, utils/gather-data (gatherGadsData), utils/context-formatter (formatBrief), logger
 *
 * GET    /          — List all context items for a container
 * POST   /          — Push a single context item (requires section_name, content)
 * DELETE /:itemId   — Delete a single context item
 * DELETE /          — Clear all context items
 * POST   /push-all  — Push all analysis data (competitor, SEO, Google Ads, keyword strategy) into context
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { gatherGadsData } = require('../utils/gather-data');
const { formatBrief } = require('../utils/context-formatter');
const log = require('../logger');

const SRC = 'ContainerContextRoute';

// List all context items
router.get('/', (req, res) => {
  const items = storage.getContainerContext(req.params.id);
  if (items === null) return res.status(404).json({ error: 'Container not found' });
  res.json(items);
});

// Push a single context item
router.post('/', async (req, res) => {
  const { source_type, source_id, section_name, content } = req.body;
  if (!section_name || !content) {
    return res.status(400).json({ error: 'section_name and content are required' });
  }
  try {
    const text_brief = formatBrief(source_type, content, section_name);
    const item = await storage.addContainerContext(req.params.id, {
      source_type, source_id, section_name, content, text_brief,
    });
    if (!item) return res.status(404).json({ error: 'Container not found' });
    res.status(201).json(item);
  } catch (err) {
    log.error(SRC, 'Failed to push context', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Delete a single context item
router.delete('/:itemId', async (req, res) => {
  try {
    const result = await storage.deleteContainerContext(req.params.id, req.params.itemId);
    if (!result) return res.status(404).json({ error: 'Context item not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all context items
router.delete('/', async (req, res) => {
  try {
    const result = await storage.clearContainerContext(req.params.id);
    if (!result) return res.status(404).json({ error: 'Container not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push ALL analysis data into context
router.post('/push-all', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  try {
    const items = [];

    // Push competitor analyses (each section separately)
    for (const comp of (container.competitors || [])) {
      const analyses = (container.competitor_analyses || {})[comp.id] || [];
      const latest = [...analyses].reverse().find(a => a.status === 'completed');
      if (!latest || !latest.result?.json_data) continue;
      const json = latest.result.json_data;

      const sections = [
        { key: 'summary', content: { summary: json.summary } },
        { key: 'key_findings', content: { key_findings: json.key_findings } },
        { key: 'messaging_patterns', content: { messaging_patterns: json.messaging_patterns } },
        { key: 'creative_formats', content: { creative_formats: json.creative_formats } },
        { key: 'targeting_insights', content: { targeting_insights: json.targeting_insights } },
        { key: 'long_running_ads', content: { long_running_ads: json.long_running_ads } },
        { key: 'opportunities', content: { opportunities_for_us: json.opportunities_for_us } },
      ];

      for (const sec of sections) {
        const val = sec.content[Object.keys(sec.content)[0]];
        if (!val || (Array.isArray(val) && val.length === 0)) continue;
        const sectionName = `${comp.name} - ${sec.key}`;
        const item = await storage.addContainerContext(req.params.id, {
          source_type: 'competitor_analysis',
          source_id: comp.id,
          section_name: sectionName,
          content: sec.content,
          text_brief: formatBrief('competitor_analysis', sec.content, sectionName),
        });
        if (item) items.push(item);
      }
    }

    // Push SEO analyses
    for (const comp of (container.competitors || [])) {
      const seoAnalyses = (container.seo_analyses || {})[comp.id] || [];
      const latest = [...seoAnalyses].reverse().find(a => a.status === 'completed');
      if (!latest || !latest.result?.json_data) continue;
      const seoName = `SEO: ${comp.name}`;
      const item = await storage.addContainerContext(req.params.id, {
        source_type: 'seo_analysis',
        source_id: comp.id,
        section_name: seoName,
        content: latest.result.json_data,
        text_brief: formatBrief('seo_analysis', latest.result.json_data, seoName),
      });
      if (item) items.push(item);
    }

    // Push own-product SEO
    const ownSeo = (container.seo_analyses || {})['_own_product'] || [];
    const latestOwnSeo = [...ownSeo].reverse().find(a => a.status === 'completed');
    if (latestOwnSeo && latestOwnSeo.result?.json_data) {
      const item = await storage.addContainerContext(req.params.id, {
        source_type: 'seo_analysis',
        source_id: '_own_product',
        section_name: 'SEO: My Product',
        content: latestOwnSeo.result.json_data,
        text_brief: formatBrief('seo_analysis', latestOwnSeo.result.json_data, 'SEO: My Product'),
      });
      if (item) items.push(item);
    }

    // Push Google Ads data
    const gadsData = gatherGadsData(container);
    if (gadsData) {
      const item = await storage.addContainerContext(req.params.id, {
        source_type: 'gads_analysis',
        source_id: null,
        section_name: 'Google Ads Performance',
        content: gadsData,
        text_brief: formatBrief('gads_analysis', gadsData, 'Google Ads Performance'),
      });
      if (item) items.push(item);
    }

    // Push latest keyword strategy
    const latestKw = [...(container.keyword_strategies || [])].reverse().find(s => s.status === 'completed');
    if (latestKw && latestKw.result?.json_data) {
      const item = await storage.addContainerContext(req.params.id, {
        source_type: 'keyword_strategy',
        source_id: latestKw.id,
        section_name: 'Keyword Strategy',
        content: latestKw.result.json_data,
        text_brief: formatBrief('keyword_strategy', latestKw.result.json_data, 'Keyword Strategy'),
      });
      if (item) items.push(item);
    }

    res.json({ pushed: items.length, items });
  } catch (err) {
    log.error(SRC, 'Push-all failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
