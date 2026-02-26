const path = require('path');
const log = require('../logger');
const { getBrowser, randomUserAgent } = require('./browser');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (base, jitter) => sleep(base + Math.floor(Math.random() * jitter));
const SRC = 'Google';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 8000; // longer retry delay

const BLOCK_SIGNALS = [
  { pattern: /unusual traffic/i, reason: 'Google detected unusual traffic — likely rate-limited' },
  { pattern: /automated queries/i, reason: 'Google detected automated queries' },
  { pattern: /captcha/i, reason: 'CAPTCHA detected' },
  { pattern: /verify you're a human/i, reason: 'Human verification required' },
  { pattern: /access denied/i, reason: 'Access denied' },
  { pattern: /too many requests/i, reason: 'Too many requests — rate limited' },
  { pattern: /service unavailable/i, reason: 'Service unavailable' },
];

const EMPTY_SIGNALS = [
  /no ads match/i,
  /no results found/i,
  /this advertiser has not run any ads/i,
  /no creatives found/i,
  /hasn't run any ads/i,
];

async function scrapeGoogleAds(url, analysisId) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAY_MS * attempt;
      log.warn(SRC, `Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`, { reason: lastError });
      await sleep(delay);
    }

    try {
      const result = await attemptScrape(url, analysisId, attempt);
      return result;
    } catch (err) {
      lastError = err.message;
      log.error(SRC, `Attempt ${attempt + 1} failed`, { err: err.message });

      if (err.message.includes('BLOCKED:') || err.message.includes('EMPTY_RESULTS:')) {
        throw err;
      }
    }
  }

  throw new Error(`All ${MAX_RETRIES + 1} attempts failed. Last error: ${lastError}`);
}

async function attemptScrape(url, analysisId, attempt) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const ads = [];
  const interceptedData = [];
  let got429 = false;

  try {
    await page.setUserAgent(randomUserAgent());

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    // Intercept API responses — these contain structured ad data
    page.on('response', async (response) => {
      try {
        const status = response.status();
        const rUrl = response.url();

        if (status === 429) {
          got429 = true;
          log.warn(SRC, 'HTTP 429 detected on API call', { url: rUrl.substring(0, 100) });
        }

        if (rUrl.includes('SearchCreatives') || rUrl.includes('GetCreatives')) {
          if (status === 429) {
            log.warn(SRC, 'SearchCreatives returned 429 — rate limited');
            return;
          }
          const text = await response.text();
          if (text.length > 100) {
            interceptedData.push({ url: rUrl, data: text });
            log.debug(SRC, 'Intercepted SearchCreatives', { size: text.length });
          }
        }
      } catch (e) {}
    });

    log.info(SRC, `Navigating (attempt ${attempt + 1})`, { url });

    let mainStatus = 0;
    const responseHandler = (res) => {
      if (res.url() === url || res.url().includes('adstransparency.google.com')) {
        mainStatus = res.status();
      }
    };
    page.on('response', responseHandler);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // --- PAGE HEALTH CHECK ---
    const healthCheck = await checkPageHealth(page, mainStatus);
    if (healthCheck.blocked) {
      const screenshotFile = `${analysisId}_google_blocked_${attempt}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotFile), fullPage: true }).catch(() => {});
      throw new Error(`BLOCKED: ${healthCheck.reason} (screenshot: ${screenshotFile})`);
    }
    if (healthCheck.empty) {
      log.info(SRC, 'No ads found — advertiser has no ads', { reason: healthCheck.reason });
      return [];
    }

    await randomDelay(5000, 2000); // 5-7s initial wait (was 3s)

    // Click "See all ads"
    try {
      const clicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, button, [role="link"], [role="button"]')) {
          const t = (el.textContent || '').trim().toLowerCase();
          if (t.includes('see all') || t.includes('sve oglase') || t.includes('all ads')) {
            el.click(); return el.textContent.trim();
          }
        }
        return null;
      });
      if (clicked) { log.info(SRC, 'Clicked see all', { text: clicked }); await randomDelay(6000, 2000); } // 6-8s (was 4s)
    } catch (e) {}

    if (got429) {
      log.warn(SRC, 'Got 429 during page load — may have partial data');
    }

    // Smart scroll — SLOWER: 3.5-5s between scrolls, max 12 scrolls
    let prevHeight = 0;
    let staleScrolls = 0;
    const MAX_SCROLLS = 12;
    for (let i = 0; i < MAX_SCROLLS; i++) {
      const newHeight = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return document.body.scrollHeight;
      });
      await randomDelay(3500, 1500); // 3.5-5s (was 2s)

      if (newHeight === prevHeight) {
        staleScrolls++;
        if (staleScrolls >= 2) {
          log.info(SRC, `Scroll finished after ${i + 1} scrolls (no new content)`);
          break;
        }
      } else {
        staleScrolls = 0;
      }
      prevHeight = newHeight;

      if (got429) {
        log.warn(SRC, `Stopping scroll — 429 detected at scroll ${i + 1}`);
        break;
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await randomDelay(1500, 1000);

    // Full page screenshot
    const fullScreenPath = path.join(SCREENSHOTS_DIR, `${analysisId}_google_full.png`);
    await page.screenshot({ path: fullScreenPath, fullPage: true });

    // --- Parse intercepted API data ---
    const apiAds = [];
    for (const item of interceptedData) {
      try {
        let text = item.data;
        if (text.startsWith(')]}\'')) text = text.substring(text.indexOf('\n') + 1);
        const parsed = JSON.parse(text);
        log.debug(SRC, 'Parsed API response', {
          isArray: Array.isArray(parsed),
          topLength: Array.isArray(parsed) ? parsed.length : 'N/A',
          sample: JSON.stringify(parsed).substring(0, 400),
        });
        extractFromApiResponse(parsed, apiAds);
      } catch (e) {
        log.debug(SRC, 'API parse failed', { err: e.message, sample: item.data.substring(0, 200) });
      }
    }
    log.info(SRC, `API extraction yielded ${apiAds.length} ads`);
    for (let i = 0; i < Math.min(3, apiAds.length); i++) {
      log.debug(SRC, `API ad sample ${i}`, apiAds[i]);
    }

    // --- DOM extraction for creative links + images ---
    const domData = await page.evaluate(() => {
      const results = [];
      const creativeLinks = Array.from(document.querySelectorAll('a[href*="/creative/"]'));
      const seen = new Set();

      for (const link of creativeLinks) {
        if (seen.has(link.href)) continue;
        seen.add(link.href);

        const match = link.href.match(/creative\/([^/?]+)/);
        const creativeId = match ? match[1] : '';

        let container = link;
        for (let i = 0; i < 10; i++) {
          if (!container.parentElement) break;
          const parent = container.parentElement;
          if (parent.querySelectorAll('a[href*="/creative/"]').length > 1) break;
          container = parent;
        }

        const text = container.innerText || '';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        const imgs = Array.from(container.querySelectorAll('img'))
          .filter(i => { const r = i.getBoundingClientRect(); return r.width > 30 && r.height > 30; })
          .map(i => i.src);

        const linkText = link.textContent?.trim() || '';
        const hasVideo = text.includes('videocam') || container.querySelector('video') !== null;

        const advertiserName = lines.find(l =>
          l.length > 2 && l.length < 60 && l !== linkText
          && !['text','image','video','potvrđeno','verified','videocam'].includes(l.toLowerCase())
        ) || '';

        const r = container.getBoundingClientRect();

        results.push({
          creative_id: creativeId, ad_link: link.href,
          link_text: linkText, advertiser_name: advertiserName,
          media_url: imgs[0] || '', all_media: imgs,
          has_video: hasVideo,
          media_type: hasVideo ? 'video' : (imgs.length > 0 ? 'image' : ''),
          raw_text: text.substring(0, 500),
          container_rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        });
      }
      return results;
    });

    log.info(SRC, `DOM extracted ${domData.length} creative cards`);

    if (apiAds.length === 0 && domData.length === 0) {
      const diag = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        bodyLength: document.body.innerText.length,
        bodySnippet: document.body.innerText.substring(0, 500),
        creativeLinksCount: document.querySelectorAll('a[href*="/creative/"]').length,
      }));
      log.warn(SRC, 'Zero ads from both API and DOM — page diagnostics', diag);

      if (got429) {
        throw new Error('BLOCKED: HTTP 429 rate limit — Google blocked API responses');
      }
    }

    // Build API lookup map by creative ID
    const apiMap = new Map();
    for (const a of apiAds) {
      if (a.creative_id) apiMap.set(a.creative_id, a);
    }

    // Merge DOM + API and build final ads
    const seen = new Set();
    for (let i = 0; i < domData.length && i < 50; i++) {
      const dom = domData[i];
      if (seen.has(dom.creative_id)) continue;
      seen.add(dom.creative_id);

      const api = apiMap.get(dom.creative_id) || {};

      // Per-card screenshot — SLOWER: 500ms settle (was 200ms)
      let screenshotPath = `screenshots/${analysisId}_google_full.png`;
      if (dom.container_rect.width > 0 && dom.container_rect.height > 0) {
        try {
          const cardFile = `${analysisId}_google_card_${i}.png`;
          await page.evaluate((y) => window.scrollTo(0, y - 100), dom.container_rect.y);
          await sleep(500); // 500ms settle (was 200ms)

          const rect = await page.evaluate((cid) => {
            for (const lnk of document.querySelectorAll('a[href*="/creative/"]')) {
              if (!lnk.href.includes(cid)) continue;
              let c = lnk;
              for (let j = 0; j < 10; j++) {
                if (!c.parentElement) break;
                if (c.parentElement.querySelectorAll('a[href*="/creative/"]').length > 1) break;
                c = c.parentElement;
              }
              const r = c.getBoundingClientRect();
              if (r.width > 30) return { x: r.x, y: r.y, width: r.width, height: r.height };
            }
            return null;
          }, dom.creative_id);

          if (rect && rect.width > 30 && rect.height > 30) {
            const clip = {
              x: Math.max(0, rect.x), y: Math.max(0, rect.y),
              width: Math.min(rect.width, 1920 - Math.max(0, rect.x)),
              height: Math.min(rect.height, 1080),
            };
            await page.screenshot({ path: path.join(SCREENSHOTS_DIR, cardFile), clip });
            screenshotPath = `screenshots/${cardFile}`;
          }
        } catch (e) {
          log.error(SRC, `Card screenshot ${i} failed`, { err: e.message });
        }
      }

      const advertiser = api.advertiser_name || dom.advertiser_name || null;
      const domHeadline = (dom.link_text && dom.link_text !== advertiser && dom.link_text !== 'videocam')
        ? dom.link_text : null;
      const headline = api.headline || domHeadline || null;
      const adText = api.ad_text || null;

      const mergedMedia = [...new Set([...(api.all_media || []), ...dom.all_media])];
      const processedMedia = [];
      for (const url of mergedMedia) {
        const ytThumbMatch = url.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
        if (ytThumbMatch) {
          processedMedia.push(`https://www.youtube.com/watch?v=${ytThumbMatch[1]}`);
          processedMedia.push(url);
        } else {
          processedMedia.push(url);
        }
      }

      let primaryMedia = api.media_url || dom.media_url || null;
      let mediaType = api.media_type || dom.media_type || null;
      if (dom.has_video || api.format === 'Video') {
        mediaType = 'video';
        const ytLink = processedMedia.find(u => u.includes('youtube.com/watch'));
        if (ytLink) primaryMedia = ytLink;
      }

      ads.push({
        advertiser_name: advertiser,
        ad_text: adText,
        headline: headline,
        cta_text: api.cta_text || null,
        media_url: primaryMedia,
        media_type: mediaType,
        destination_url: api.destination_url || null,
        started_running: api.first_shown || null,
        screenshot_path: screenshotPath,
        platform: api.format || (dom.has_video ? 'Video' : (dom.media_url ? 'Image' : 'Text')),
        raw_html: dom.raw_text || null,
        extra_data: {
          creative_id: dom.creative_id,
          ad_link: dom.ad_link,
          all_media: [...new Set(processedMedia)],
          last_shown: api.last_shown || null,
          advertiser_id: api.advertiser_id || null,
        },
      });
    }

    // Also add API-only ads that weren't found in DOM
    for (const apiAd of apiAds) {
      if (!apiAd.creative_id || seen.has(apiAd.creative_id)) continue;
      seen.add(apiAd.creative_id);

      ads.push({
        advertiser_name: apiAd.advertiser_name || null,
        ad_text: apiAd.ad_text || null,
        headline: apiAd.headline || null,
        cta_text: apiAd.cta_text || null,
        media_url: apiAd.media_url || null,
        media_type: apiAd.media_type || null,
        destination_url: apiAd.destination_url || null,
        started_running: apiAd.first_shown || null,
        screenshot_path: `screenshots/${analysisId}_google_full.png`,
        platform: apiAd.format || null,
        raw_html: null,
        extra_data: {
          creative_id: apiAd.creative_id,
          ad_link: `https://adstransparency.google.com/advertiser/creative/${apiAd.creative_id}`,
          all_media: apiAd.all_media || [],
          last_shown: apiAd.last_shown || null,
          advertiser_id: apiAd.advertiser_id || null,
        },
      });
    }

    if (ads.length === 0) {
      log.error(SRC, 'No ads — fallback');
      ads.push({
        advertiser_name: null, ad_text: 'Could not extract individual ads.', headline: null,
        cta_text: null, media_url: null, media_type: null, destination_url: null,
        started_running: null, screenshot_path: `screenshots/${analysisId}_google_full.png`,
        platform: null, raw_html: null, extra_data: { note: 'Full page capture only' },
      });
    }

    log.info(SRC, `Done: ${ads.length} ads (${got429 ? 'partial — 429 detected' : 'full'})`);
  } catch (err) {
    log.error(SRC, 'Scraping exception', { err: err.message, stack: err.stack });
    try { await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${analysisId}_google_error.png`), fullPage: true }); } catch (e) {}
    throw err;
  } finally {
    await page.close();
  }
  return ads;
}

async function checkPageHealth(page, httpStatus) {
  if (httpStatus === 403) return { blocked: true, reason: 'HTTP 403 Forbidden — IP may be blocked' };
  if (httpStatus === 429) return { blocked: true, reason: 'HTTP 429 Too Many Requests — rate limited' };
  if (httpStatus >= 500) return { blocked: true, reason: `HTTP ${httpStatus} Server Error` };

  const pageInfo = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    const title = document.title || '';
    const url = location.href;
    return { text: text.substring(0, 3000), title, url, textLength: text.length };
  });

  const hasCaptcha = await page.evaluate(() => {
    return !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha, .captcha, .g-recaptcha');
  });
  if (hasCaptcha) return { blocked: true, reason: 'CAPTCHA/reCAPTCHA detected' };

  for (const signal of BLOCK_SIGNALS) {
    if (signal.pattern.test(pageInfo.text) || signal.pattern.test(pageInfo.title)) {
      return { blocked: true, reason: signal.reason };
    }
  }

  for (const pattern of EMPTY_SIGNALS) {
    if (pattern.test(pageInfo.text)) {
      return { empty: true, reason: 'Advertiser has no ads' };
    }
  }

  if (pageInfo.textLength < 100) {
    return { blocked: true, reason: `Page appears empty (${pageInfo.textLength} chars) — possible ghost block` };
  }

  return { blocked: false, empty: false };
}

// Parse Google's protobuf-JSON API response
function extractFromApiResponse(data, results) {
  if (!data || typeof data !== 'object') return;

  const creatives = data['1'] || data[1];
  if (!Array.isArray(creatives)) {
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        extractFromApiResponse({ '1': val }, results);
      }
    }
    return;
  }

  for (const entry of creatives) {
    if (!entry || typeof entry !== 'object') continue;
    try {
      const ad = parseProtobufCreative(entry);
      if (ad && ad.creative_id) results.push(ad);
    } catch (e) {
      log.debug(SRC, 'Failed to parse creative entry', { err: e.message });
    }
  }
}

function parseProtobufCreative(entry) {
  const advertiserId = entry['1'] || '';
  const creativeId = entry['2'] || '';
  const creativeData = entry['3'] || {};

  const advertiserName = entry['12'] || '';
  const destDomain = entry['14'] || '';

  let firstShown = '', lastShown = '';
  if (entry['6'] && entry['6']['1']) {
    try { firstShown = new Date(parseInt(entry['6']['1']) * 1000).toISOString().split('T')[0]; } catch (e) {}
  }
  if (entry['7'] && entry['7']['1']) {
    try { lastShown = new Date(parseInt(entry['7']['1']) * 1000).toISOString().split('T')[0]; } catch (e) {}
  }

  let mediaUrl = '', videoUrl = '', headline = '', adText = '', destinationUrl = '';
  const allMedia = [];

  if (creativeData['1']) {
    const videoData = creativeData['1'];
    if (videoData['4']) {
      mediaUrl = videoData['4'];
      allMedia.push(mediaUrl);
    }
    const videoJson = JSON.stringify(videoData);
    const ytMatch = videoJson.match(/youtube\.com\/watch\?v=([^"&]+)|youtu\.be\/([^"&]+)|\/vi\/([^/"]+)/);
    if (ytMatch) {
      const videoId = ytMatch[1] || ytMatch[2] || ytMatch[3];
      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      allMedia.push(videoUrl);
    }
  }

  if (creativeData['3'] && creativeData['3']['2']) {
    const imgHtml = creativeData['3']['2'];
    const srcMatch = imgHtml.match(/src="([^"]+)"/);
    if (srcMatch) {
      mediaUrl = srcMatch[1];
      allMedia.push(mediaUrl);
    }
  }

  const strings = [];
  function collectStrings(obj) {
    if (typeof obj === 'string') strings.push(obj);
    else if (Array.isArray(obj)) obj.forEach(collectStrings);
    else if (obj && typeof obj === 'object') Object.values(obj).forEach(collectStrings);
  }
  collectStrings(creativeData);

  for (const s of strings) {
    if (s.includes('<') && s.includes('>')) {
      const textContent = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (textContent.length > 5 && textContent.length < 100 && !headline) headline = textContent;
      else if (textContent.length >= 100 && !adText) adText = textContent;

      const hrefMatch = s.match(/href="([^"]+)"/);
      if (hrefMatch && !hrefMatch[1].includes('google') && hrefMatch[1].startsWith('http')) {
        if (!destinationUrl) destinationUrl = hrefMatch[1];
      }

      const allSrcs = [...s.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
      allMedia.push(...allSrcs.filter(u => !allMedia.includes(u)));
    } else if (s.startsWith('http') && !s.includes('google') && !s.includes('gstatic')) {
      if (!destinationUrl) destinationUrl = s;
    }
  }

  if (destDomain && !destinationUrl) {
    destinationUrl = `https://${destDomain}`;
  }

  let format = '';
  const formatNum = entry['4'];
  if (creativeData['1'] || videoUrl) format = 'Video';
  else if (creativeData['3']) format = 'Image';
  else if (formatNum === 1) format = 'Text';
  else format = 'Image';

  return {
    creative_id: creativeId,
    advertiser_id: advertiserId,
    advertiser_name: advertiserName,
    headline, ad_text: adText,
    destination_url: destinationUrl,
    media_url: videoUrl || mediaUrl,
    all_media: [...new Set(allMedia)],
    first_shown: firstShown, last_shown: lastShown,
    format, cta_text: '',
    media_type: (format === 'Video' || videoUrl) ? 'video' : (mediaUrl ? 'image' : ''),
  };
}

module.exports = { scrapeGoogleAds };
