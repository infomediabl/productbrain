/**
 * Ad Summarization Utility
 * Used by: agents/analyzer-agent.js (unlimited), agents/proposal-agent.js (maxAds:20)
 * Exports: summarizeAds(ads, options)
 *
 * Formats scraped ads into a concise text representation for prompt injection.
 *
 * @param {Array} ads
 * @param {object} [options]
 * @param {number} [options.maxAds] - Max ads to include (default 30)
 * @param {number} [options.textLimit] - Char limit for ad_text (default 500)
 * @param {number} [options.ocrLimit] - Char limit for ocr_text (default 300)
 * @param {boolean} [options.includeLastShown] - Include last_shown field (default false)
 */
function summarizeAds(ads, options = {}) {
  const maxAds = options.maxAds || 30;
  const textLimit = options.textLimit || 500;
  const ocrLimit = options.ocrLimit || 300;
  const includeLastShown = options.includeLastShown || false;
  const now = new Date();

  return ads.slice(0, maxAds).map((ad, i) => {
    const extra = ad.extra_data || {};
    const lines = [`**Ad ${i + 1}:**`];

    if (extra.ad_link) lines.push(`Ad Link: ${extra.ad_link}`);
    else if (extra.fb_ad_id) lines.push(`Ad Link: https://www.facebook.com/ads/library/?id=${extra.fb_ad_id}`);
    else if (extra.creative_id) lines.push(`Ad Link: https://adstransparency.google.com/advertiser/creative/${extra.creative_id}`);

    const allMedia = extra.all_media || [];
    if (allMedia.length > 0) {
      lines.push(`Media: ${allMedia.slice(0, 3).join(' , ')}`);
    } else if (ad.media_url) {
      lines.push(`Media: ${ad.media_url}`);
    }

    if (ad.headline) lines.push(`Headline: ${ad.headline}`);
    if (ad.ad_text) lines.push(`Text: ${ad.ad_text.substring(0, textLimit)}`);
    if (ad.ocr_text) lines.push(`OCR Text: ${ad.ocr_text.substring(0, ocrLimit)}`);
    if (ad.cta_text) lines.push(`CTA: ${ad.cta_text}`);
    if (ad.media_type) lines.push(`Format: ${ad.media_type}`);
    if (ad.destination_url) lines.push(`Destination: ${ad.destination_url}`);
    if (ad.platform) lines.push(`Platform: ${ad.platform}`);

    if (ad.started_running) {
      const startDate = new Date(ad.started_running);
      if (!isNaN(startDate.getTime())) {
        const days = Math.round((now - startDate) / (1000 * 60 * 60 * 24));
        lines.push(`Running: ${ad.started_running} (${days} days)${days > 30 ? ' ★ LONG-RUNNING' : ''}`);
      }
    }

    if (extra.impressions) lines.push(`Impressions: ${extra.impressions}`);
    if (includeLastShown && extra.last_shown) lines.push(`Last Shown: ${extra.last_shown}`);

    if (extra.eu_audience) {
      const eu = extra.eu_audience;
      const euParts = [];
      if (eu.total_reach) euParts.push(`reach: ${eu.total_reach}`);
      if (eu.countries && eu.countries.length > 0) euParts.push(`countries: ${eu.countries.slice(0, 3).map(c => `${c.name}(${c.reach})`).join(', ')}`);
      if (eu.genders && eu.genders.length > 0) euParts.push(`gender: ${eu.genders.map(g => `${g.name}(${g.reach})`).join(', ')}`);
      if (eu.age_groups && eu.age_groups.length > 0) euParts.push(`age: ${eu.age_groups.slice(0, 3).map(a => `${a.name}(${a.reach})`).join(', ')}`);
      if (euParts.length > 0) lines.push(`EU: ${euParts.join(' | ')}`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

module.exports = { summarizeAds };
