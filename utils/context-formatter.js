/**
 * Context Formatter
 * Used by: routes/container-context.js (at push time), utils/gather-data.js (fallback)
 * Exports: formatBrief(sourceType, content, sectionName)
 *
 * Converts raw JSON content objects into concise natural-language briefs
 * optimized for AI agent prompt injection. Each context item stored in
 * container_context has a `content` (JSON) and a `text_brief` (string).
 * Agents consume text_brief, not raw JSON.
 *
 * Handles: competitor_analysis, seo_analysis, gads_analysis, keyword_strategy
 */

// ========== Main entry ==========

function formatBrief(sourceType, content, sectionName) {
  if (!content) return '';
  if (typeof content === 'string') return content;

  switch (sourceType) {
    case 'competitor_analysis': return formatCompetitorAnalysis(content, sectionName);
    case 'seo_analysis':        return formatSeoAnalysis(content, sectionName);
    case 'gads_analysis':       return formatGadsAnalysis(content);
    case 'keyword_strategy':    return formatKeywordStrategy(content);
    default:                    return formatGeneric(content);
  }
}

// ========== Competitor Analysis ==========

function formatCompetitorAnalysis(c, sectionName) {
  // Per-item: single finding
  if (c.finding && !c.key_findings) {
    let t = `Finding: ${c.finding}`;
    if (c.evidence) t += ` — Evidence: ${c.evidence}`;
    if (c.ad_links?.length) t += ` (${c.ad_links.length} ad link${c.ad_links.length > 1 ? 's' : ''})`;
    return t;
  }

  // Per-item: messaging pattern
  if (c.pattern && !c.messaging_patterns) {
    let t = `Messaging pattern: ${c.pattern}`;
    if (c.frequency) t += ` (frequency: ${c.frequency})`;
    if (c.examples?.length) t += `. Examples: ${c.examples.map(e => `"${e}"`).join(', ')}`;
    return t;
  }

  // Per-item: long-running ad
  if (c.headline && c.days_running !== undefined) {
    let t = `Long-running ad (${c.days_running} days): "${c.headline}"`;
    if (c.why_its_working) t += `. Why it works: ${c.why_its_working}`;
    return t;
  }

  // Per-item: opportunity
  if (c.opportunity && !c.opportunities_for_us) {
    let t = `Opportunity: ${c.opportunity}`;
    if (c.based_on) t += `. Based on: ${c.based_on}`;
    return t;
  }

  // Section: summary
  if (c.summary && Object.keys(c).length <= 2) {
    return c.summary;
  }

  // Section: creative_formats
  if (c.creative_formats || c.dominant_format) {
    const cf = c.creative_formats || c;
    let t = `Creative formats — dominant: ${cf.dominant_format || 'N/A'}`;
    if (cf.format_breakdown) {
      const fb = cf.format_breakdown;
      t += `. Breakdown: image ${fb.image || 0}, video ${fb.video || 0}, text ${fb.text || 0}`;
    }
    if (cf.notable_creative_approaches?.length) {
      t += `. Notable approaches: ${cf.notable_creative_approaches.join('; ')}`;
    }
    return t;
  }

  // Section: targeting_insights
  if (c.targeting_insights || c.platforms_used) {
    const ti = c.targeting_insights || c;
    const parts = [];
    if (ti.platforms_used?.length) parts.push(`Platforms: ${ti.platforms_used.join(', ')}`);
    if (ti.eu_demographics) {
      const d = ti.eu_demographics;
      if (d.primary_age_groups?.length) parts.push(`Age groups: ${d.primary_age_groups.join(', ')}`);
      if (d.gender_split) parts.push(`Gender: ${d.gender_split}`);
      if (d.top_countries?.length) parts.push(`Top countries: ${d.top_countries.join(', ')}`);
    }
    if (ti.estimated_spend_level) parts.push(`Spend level: ${ti.estimated_spend_level}`);
    return `Targeting insights — ${parts.join('. ')}`;
  }

  // Push-all bulk sections: { key_findings: [...] }, { messaging_patterns: [...] }, etc.
  if (c.key_findings && Array.isArray(c.key_findings)) {
    return c.key_findings.map(f => {
      let t = `- ${f.finding || f}`;
      if (f.evidence) t += ` (evidence: ${f.evidence})`;
      return t;
    }).join('\n');
  }

  if (c.messaging_patterns && Array.isArray(c.messaging_patterns)) {
    return c.messaging_patterns.map(p => {
      let t = `- Pattern: ${p.pattern || p}`;
      if (p.frequency) t += ` [${p.frequency}]`;
      if (p.examples?.length) t += ` — e.g. ${p.examples.map(e => `"${e}"`).join(', ')}`;
      return t;
    }).join('\n');
  }

  if (c.long_running_ads && Array.isArray(c.long_running_ads)) {
    return c.long_running_ads.map(ad => {
      let t = `- "${ad.headline || 'Untitled'}" (${ad.days_running || '?'} days)`;
      if (ad.why_its_working) t += `: ${ad.why_its_working}`;
      return t;
    }).join('\n');
  }

  if (c.opportunities_for_us && Array.isArray(c.opportunities_for_us)) {
    return c.opportunities_for_us.map(o => {
      const text = typeof o === 'string' ? o : o.opportunity || '';
      let t = `- ${text}`;
      if (o.based_on) t += ` (based on: ${o.based_on})`;
      return t;
    }).join('\n');
  }

  return formatGeneric(c);
}

// ========== SEO Analysis ==========

function formatSeoAnalysis(c, sectionName) {
  // Per-item: summary with score
  if (c.summary && (c.overall_score !== undefined || c.overall_effectiveness !== undefined)) {
    const score = c.overall_score ?? c.overall_effectiveness;
    return `SEO score: ${score}/100. ${c.summary}`;
  }

  // Per-item: takeaway
  if (c.takeaway && c.section) {
    return `${c.section} takeaway: ${c.takeaway}`;
  }

  // Per-item: content strength
  if (c.strength && Object.keys(c).length <= 1) {
    return `Content strength: ${c.strength}`;
  }

  // Per-item: weakness
  if (c.weakness && Object.keys(c).length <= 1) {
    return `Competitor weakness: ${c.weakness}`;
  }

  // Per-item: quick win
  if (c.action && c.impact && !c.learning) {
    let t = `Quick win (${c.impact} impact): ${c.action}`;
    if (c.details) t += `. ${c.details}`;
    return t;
  }

  // Per-item: priority learning
  if (c.learning) {
    let t = `Priority learning (${c.impact || '?'} impact): ${c.learning}`;
    if (c.how_to_apply) t += `. How to apply: ${c.how_to_apply}`;
    if (c.category) t += ` [${c.category}]`;
    return t;
  }

  // Per-item: priority action (own-product SEO)
  if (c.action && c.category) {
    return `Priority action (${c.impact || '?'} impact, ${c.category}): ${c.action}`;
  }

  // Per-item: keyword
  if (c.keyword) {
    return `${c.type === 'gap' ? 'Keyword gap' : 'Primary keyword'}: ${c.keyword}`;
  }

  // Per-item: content opportunity
  if (c.topic && c.rationale) {
    return `Content opportunity (${c.priority || '?'} priority): ${c.topic}. Rationale: ${c.rationale}`;
  }

  // Per-item: SEO opportunity (legacy)
  if (c.opportunity && c.impact && c.effort) {
    let t = `SEO opportunity (impact: ${c.impact}, effort: ${c.effort}): ${c.opportunity}`;
    if (c.details) t += `. ${c.details}`;
    return t;
  }

  // Per-item: on-page/technical finding or issue
  if (c.finding && Object.keys(c).length <= 1) {
    return `SEO finding: ${c.finding}`;
  }
  if (c.issue && Object.keys(c).length <= 1) {
    return `SEO issue: ${c.issue}`;
  }

  // Full SEO json_data (from push-all) — summarize the most important parts
  if (c.overall_effectiveness !== undefined || c.overall_score !== undefined) {
    return formatFullSeoReport(c);
  }

  return formatGeneric(c);
}

function formatFullSeoReport(c) {
  const parts = [];
  const score = c.overall_effectiveness ?? c.overall_score ?? 0;
  parts.push(`Overall SEO score: ${score}/100`);
  if (c.summary) parts.push(c.summary);

  // Sub-scores
  const subs = [];
  if (c.keyword_targeting?.effectiveness) subs.push(`keyword targeting: ${c.keyword_targeting.effectiveness}`);
  if (c.content_strategy?.effectiveness) subs.push(`content strategy: ${c.content_strategy.effectiveness}`);
  if (c.technical_seo_practices?.effectiveness) subs.push(`technical SEO: ${c.technical_seo_practices.effectiveness}`);
  if (c.on_page_patterns?.effectiveness) subs.push(`on-page: ${c.on_page_patterns.effectiveness}`);
  if (c.on_page_seo?.score) subs.push(`on-page SEO: ${c.on_page_seo.score}`);
  if (c.technical_seo?.score) subs.push(`technical SEO: ${c.technical_seo.score}`);
  if (c.keyword_strategy?.score) subs.push(`keyword strategy: ${c.keyword_strategy.score}`);
  if (subs.length) parts.push(`Sub-scores: ${subs.join(', ')}`);

  // Takeaways
  for (const key of ['keyword_targeting', 'content_strategy', 'technical_seo_practices', 'on_page_patterns']) {
    if (c[key]?.takeaway_for_us) parts.push(`${key.replace(/_/g, ' ')} takeaway: ${c[key].takeaway_for_us}`);
  }

  // Quick wins
  if (c.competitive_advantages?.quick_wins_for_us?.length) {
    parts.push('Quick wins: ' + c.competitive_advantages.quick_wins_for_us
      .map(w => `${w.action} (${w.impact} impact)`).join('; '));
  }

  // Priority learnings
  if (c.priority_learnings?.length) {
    parts.push('Priority learnings: ' + c.priority_learnings
      .map(l => `${l.learning} (${l.impact} impact)`).join('; '));
  }

  // Priority actions (own product)
  if (c.priority_actions?.length) {
    parts.push('Priority actions: ' + c.priority_actions
      .map(a => `${a.action} (${a.impact} impact, ${a.category || ''})`).join('; '));
  }

  // Keywords
  if (c.keyword_strategy?.primary_keywords?.length) {
    parts.push(`Primary keywords: ${c.keyword_strategy.primary_keywords.join(', ')}`);
  }
  if (c.keyword_strategy?.keyword_gaps?.length) {
    parts.push(`Keyword gaps: ${c.keyword_strategy.keyword_gaps.join(', ')}`);
  }

  return parts.join('. ');
}

// ========== Google Ads Analysis ==========

function formatGadsAnalysis(c) {
  const parts = [];

  if (c.analysis?.summary) {
    parts.push(c.analysis.summary);
  }

  if (c.campaigns?.length) {
    const active = c.campaigns.filter(camp => camp.impressions > 0);
    parts.push(`${active.length} active campaign${active.length !== 1 ? 's' : ''} of ${c.campaigns.length} total`);
    const totalSpend = c.campaigns.reduce((s, camp) => s + (camp.cost_micros || 0), 0);
    if (totalSpend > 0) parts.push(`Total spend: $${(totalSpend / 1000000).toFixed(2)}`);
  }

  if (c.analysis?.findings?.length) {
    parts.push('Key findings: ' + c.analysis.findings
      .map(f => typeof f === 'string' ? f : f.finding || f.insight || JSON.stringify(f))
      .slice(0, 5).join('; '));
  }

  if (c.analysis?.action_items?.length) {
    parts.push('Action items: ' + c.analysis.action_items
      .map(a => typeof a === 'string' ? a : a.action || a.recommendation || JSON.stringify(a))
      .slice(0, 5).join('; '));
  }

  return parts.join('. ') || formatGeneric(c);
}

// ========== Keyword Strategy ==========

function formatKeywordStrategy(c) {
  const parts = [];

  if (c.summary || c.executive_summary) {
    parts.push(c.summary || c.executive_summary);
  }

  if (c.primary_keywords?.length) {
    parts.push(`Primary keywords: ${c.primary_keywords.slice(0, 10).join(', ')}`);
  }

  if (c.keyword_clusters?.length) {
    parts.push(`${c.keyword_clusters.length} keyword cluster${c.keyword_clusters.length !== 1 ? 's' : ''}: ` +
      c.keyword_clusters.slice(0, 5).map(cl => cl.theme || cl.name || cl.cluster).join(', '));
  }

  if (c.quick_wins?.length) {
    parts.push('Quick wins: ' + c.quick_wins.slice(0, 5)
      .map(w => typeof w === 'string' ? w : w.keyword || w.term || JSON.stringify(w)).join(', '));
  }

  if (c.content_gaps?.length) {
    parts.push('Content gaps: ' + c.content_gaps.slice(0, 5)
      .map(g => typeof g === 'string' ? g : g.topic || g.gap || JSON.stringify(g)).join(', '));
  }

  if (c.long_tail_opportunities?.length) {
    parts.push('Long-tail opportunities: ' + c.long_tail_opportunities.slice(0, 5)
      .map(lt => typeof lt === 'string' ? lt : lt.keyword || lt.term || JSON.stringify(lt)).join(', '));
  }

  return parts.join('. ') || formatGeneric(c);
}

// ========== Generic fallback ==========

function formatGeneric(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map(item => {
      if (typeof item === 'string') return `- ${item}`;
      const vals = Object.values(item).filter(v => typeof v === 'string').slice(0, 2);
      return `- ${vals.join(': ') || JSON.stringify(item)}`;
    }).join('\n');
  }
  // Object: extract meaningful text fields, skip nested objects
  const textFields = Object.entries(c)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .slice(0, 8);
  if (textFields.length > 0) return textFields.join('. ');
  // Last resort: compact JSON
  return JSON.stringify(c);
}

module.exports = { formatBrief };
