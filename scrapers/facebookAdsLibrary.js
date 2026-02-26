const path = require('path');
const fs = require('fs');
const log = require('../logger');
const { getBrowser, randomUserAgent } = require('./browser');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (base, jitter) => sleep(base + Math.floor(Math.random() * jitter));
const SRC = 'FB';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 8000; // longer retry delay

// Signals that indicate the page is blocked, rate-limited, or requires login
const BLOCK_SIGNALS = [
  { pattern: /you must log in/i, reason: 'Login required — Facebook is requiring authentication' },
  { pattern: /please log in/i, reason: 'Login wall detected' },
  { pattern: /create new account/i, reason: 'Login/signup page — likely IP flagged' },
  { pattern: /confirm your identity/i, reason: 'Identity verification required — account flagged' },
  { pattern: /security check/i, reason: 'Security check / CAPTCHA detected' },
  { pattern: /rate limit/i, reason: 'Rate limited by Facebook' },
  { pattern: /something went wrong/i, reason: 'Facebook error page' },
  { pattern: /content isn.*available/i, reason: 'Content not available — possible geo-block or ban' },
  { pattern: /try again later/i, reason: 'Temporary block — try again later' },
];

// Signals that mean "no ads exist" (not a block, just empty results)
const EMPTY_SIGNALS = [
  /no ads match/i,
  /no results/i,
  /didn't find any ads/i,
  /0 results/i,
];

async function scrapeFacebookAds(url, analysisId) {
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

      // Don't retry on definitive blocks
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

  try {
    await page.setUserAgent(randomUserAgent());

    // Add extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    const parsedUrl = new URL(url);
    if (!parsedUrl.searchParams.has('sort_data[direction]')) parsedUrl.searchParams.set('sort_data[direction]', 'desc');
    if (!parsedUrl.searchParams.has('sort_data[mode]')) parsedUrl.searchParams.set('sort_data[mode]', 'total_count_descending');
    if (!parsedUrl.searchParams.has('active_status')) parsedUrl.searchParams.set('active_status', 'all');
    const targetUrl = parsedUrl.toString();

    log.info(SRC, `Navigating (attempt ${attempt + 1})`, { url: targetUrl });

    // Track HTTP response status
    let responseStatus = 0;
    page.on('response', (res) => {
      if (res.url() === targetUrl || res.url().includes('ads/library')) {
        responseStatus = res.status();
      }
    });

    // Navigate with context-destroyed recovery
    let contextRecoveryAttempts = 0;
    const navigateAndCheck = async () => {
      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (navErr) {
        if (navErr.message.includes('context') || navErr.message.includes('destroyed') || navErr.message.includes('detached')) {
          log.warn(SRC, 'Navigation context destroyed — waiting for page to settle');
          await randomDelay(5000, 3000);
          try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }); } catch (e) {}
        } else {
          throw navErr;
        }
      }

      try {
        return await checkPageHealth(page, responseStatus);
      } catch (healthErr) {
        if (contextRecoveryAttempts < 2 && (healthErr.message.includes('context') || healthErr.message.includes('destroyed') || healthErr.message.includes('detached'))) {
          contextRecoveryAttempts++;
          log.warn(SRC, `Health check context destroyed (recovery ${contextRecoveryAttempts}) — waiting and retrying`);
          await randomDelay(5000, 3000);
          try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }); } catch (e) {}
          return await checkPageHealth(page, responseStatus);
        }
        throw healthErr;
      }
    };

    const healthCheck = await navigateAndCheck();
    if (healthCheck.blocked) {
      const screenshotFile = `${analysisId}_fb_blocked_${attempt}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotFile), fullPage: true }).catch(() => {});
      throw new Error(`BLOCKED: ${healthCheck.reason} (screenshot: ${screenshotFile})`);
    }
    if (healthCheck.empty) {
      const emptyScreenFile = `${analysisId}_fb_empty_${attempt}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, emptyScreenFile), fullPage: true }).catch(() => {});
      log.info(SRC, 'No ads found — advertiser has no active ads', { reason: healthCheck.reason, screenshot: emptyScreenFile, url: page.url() });
      return [];
    }

    // Dismiss cookie consent (slower)
    try {
      for (const sel of [
        'button[data-cookiebanner="accept_button"]', 'button[title="Allow all cookies"]',
        'button[title="Accept All"]', 'button[title="Allow essential and optional cookies"]',
      ]) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); log.info(SRC, 'Cookie dismissed'); await randomDelay(3000, 1500); break; }
      }
    } catch (e) {}

    // Wait for Library IDs to appear (most reliable indicator)
    let hasLibraryIds = false;
    try {
      await page.waitForFunction(
        () => /Library ID:\s*\d+/.test(document.body.innerText),
        { timeout: 25000 }
      );
      hasLibraryIds = true;
      log.info(SRC, 'Library IDs detected');
    } catch (e) {
      log.warn(SRC, 'No Library IDs after 25s — checking page state');
      const recheck = await checkPageHealth(page, responseStatus);
      if (recheck.blocked) {
        const screenshotFile = `${analysisId}_fb_blocked_late_${attempt}.png`;
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotFile), fullPage: true }).catch(() => {});
        throw new Error(`BLOCKED: ${recheck.reason} (late detection, screenshot: ${screenshotFile})`);
      }
      if (recheck.empty) {
        log.info(SRC, 'No ads found after wait', { reason: recheck.reason });
        return [];
      }
      await randomDelay(5000, 3000);
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
      await randomDelay(3500, 1500); // 3.5-5s between scrolls

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
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await randomDelay(1500, 1000);

    // Full page screenshot
    const fullScreenPath = path.join(SCREENSHOTS_DIR, `${analysisId}_fb_full.png`);
    await page.screenshot({ path: fullScreenPath, fullPage: true });

    // --- Extract individual ads ---
    const adData = await page.evaluate(() => {
      const results = [];
      const _log = [];

      const bodyText = document.body.innerText;
      const idMatches = bodyText.match(/Library ID:\s*\d+/g) || [];
      _log.push('Total Library ID occurrences: ' + idMatches.length);

      const allIds = idMatches.map(m => m.match(/\d+/)[0]);
      const uniqueIds = [...new Set(allIds)];
      _log.push('Unique IDs: ' + uniqueIds.length);

      for (const adId of uniqueIds) {
        const searchStr = 'Library ID: ' + adId;

        let bestEl = null;
        let bestSize = Infinity;

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent || '';
          if (!text.includes(searchStr)) continue;
          const idCount = (text.match(/Library ID:\s*\d+/g) || []).length;
          if (idCount !== 1) continue;
          const rect = node.getBoundingClientRect();
          const size = rect.width * rect.height;
          if (size > 0 && size < bestSize && rect.height > 50) {
            bestEl = node;
            bestSize = size;
          }
        }

        if (!bestEl) {
          const allEls = document.querySelectorAll('*');
          for (const el of allEls) {
            const ownText = Array.from(el.childNodes)
              .filter(n => n.nodeType === Node.TEXT_NODE)
              .map(n => n.textContent).join('');
            if (ownText.includes(searchStr)) {
              bestEl = el;
              break;
            }
          }
        }

        if (!bestEl) continue;

        let container = bestEl;
        for (let i = 0; i < 20; i++) {
          if (!container.parentElement) break;
          const parent = container.parentElement;
          const parentIds = (parent.textContent.match(/Library ID:\s*\d+/g) || []).length;
          if (parentIds > 1) break;
          const rect = parent.getBoundingClientRect();
          if (rect.height > 800 && parentIds === 1) {
            const curRect = container.getBoundingClientRect();
            if (curRect.height > 200) break;
          }
          container = parent;
        }

        const card = extractCard(container, adId);
        if (card) results.push(card);
      }

      _log.push('Cards extracted: ' + results.length);

      function extractCard(container, adId) {
        const text = container.innerText || '';
        if (text.length < 10) return null;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        const startMatch = text.match(/Started running on\s+(.+?)(?:\n|$)/i);
        const platformMatch = text.match(/Platforms?[:\s]*(.+?)(?:\n|$)/i);
        const impressionMatch = text.match(/Impressions?[:\s]*([^\n]+)/i);

        let adLink = '';
        for (const a of container.querySelectorAll('a[href]')) {
          const t = (a.textContent || '').trim().toLowerCase();
          if (t.includes('see ad details') || t.includes('ad details')) { adLink = a.href; break; }
        }
        if (!adLink) {
          for (const a of container.querySelectorAll('a[href]')) {
            if (a.href.includes('/ads/library') && a.href.includes(adId)) { adLink = a.href; break; }
          }
        }
        if (!adLink) {
          for (const a of container.querySelectorAll('a[href]')) {
            if (a.href.includes('/ads/library/?id=')) { adLink = a.href; break; }
          }
        }
        if (!adLink && adId) {
          adLink = 'https://www.facebook.com/ads/library/?id=' + adId;
        }

        const images = Array.from(container.querySelectorAll('img'))
          .filter(img => {
            const r = img.getBoundingClientRect();
            const src = img.src || '';
            return r.width > 60 && r.height > 60
              && !src.includes('emoji') && !src.includes('rsrc.php')
              && !src.includes('/cp0/')
              && src.startsWith('http');
          }).map(img => img.src);

        const videos = Array.from(container.querySelectorAll('video source, video'))
          .map(v => v.src || v.currentSrc).filter(Boolean);
        const videoPosters = Array.from(container.querySelectorAll('video[poster]'))
          .map(v => v.poster).filter(Boolean);

        const metaPattern = /^(Library ID|Started running|Platform|See ad|Active|Inactive|Impressions|CheaterScanner|Meta Ad Library|Sponsored|Ad Library)/i;
        const ctaPatterns = ['Learn More','Shop Now','Sign Up','Download','Apply Now','Book Now','Contact Us','Get Offer','Subscribe','Watch More','Install Now','Use App','Play Game','Listen Now','Send Message','Get Quote'];

        const contentLines = lines.filter(l =>
          l.length > 15 && !metaPattern.test(l) && !ctaPatterns.includes(l)
        );
        const adText = contentLines.sort((a, b) => b.length - a.length)[0] || '';

        const headlineCandidates = contentLines.filter(l =>
          l.length > 3 && l.length < 100 && l !== adText
        );
        const headline = headlineCandidates[0] || '';

        let ctaText = '';
        for (const cta of ctaPatterns) { if (text.includes(cta)) { ctaText = cta; break; } }

        let destinationUrl = '';
        for (const a of container.querySelectorAll('a[href]')) {
          const href = a.href || '';
          if (href && !href.includes('facebook.com') && !href.includes('#') && href.startsWith('http')) {
            destinationUrl = href; break;
          }
        }

        const r = container.getBoundingClientRect();

        return {
          ad_id: adId, ad_link: adLink,
          ad_text: adText, headline, cta_text: ctaText,
          started_running: startMatch ? startMatch[1].trim() : '',
          platform: platformMatch ? platformMatch[1].trim() : '',
          impressions: impressionMatch ? impressionMatch[1].trim() : '',
          destination_url: destinationUrl,
          media_url: videos[0] || videoPosters[0] || images[0] || '',
          all_media: [...new Set([...videos, ...videoPosters, ...images])],
          media_type: videos.length > 0 ? 'video' : (images.length > 0 ? 'image' : ''),
          raw_text: text.substring(0, 3000),
          container_rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        };
      }

      return { results, _log };
    });

    log.info(SRC, 'Extraction log', adData._log);
    log.info(SRC, `Extracted ${adData.results.length} cards`);
    for (let i = 0; i < adData.results.length; i++) {
      const c = adData.results[i];
      log.debug(SRC, `Card ${i}`, {
        ad_id: c.ad_id, headline: c.headline?.substring(0, 60),
        ad_text: c.ad_text?.substring(0, 80), media_count: c.all_media?.length,
        impressions: c.impressions, started: c.started_running,
        rect_h: Math.round(c.container_rect.height),
      });
    }

    // Diagnostics if extraction failed
    if (adData.results.length === 0 && hasLibraryIds) {
      log.warn(SRC, 'Library IDs found but 0 cards extracted — possible DOM change');
      const diag = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        bodyLength: document.body.innerText.length,
        bodySnippet: document.body.innerText.substring(0, 500),
        libraryIdCount: (document.body.innerText.match(/Library ID:\s*\d+/g) || []).length,
      }));
      log.warn(SRC, 'Page diagnostics', diag);
    }

    // Dedup
    const seen = new Set();
    const uniqueAds = [];
    for (const ad of adData.results) {
      if (seen.has(ad.ad_id)) continue;
      seen.add(ad.ad_id);
      uniqueAds.push(ad);
    }
    log.info(SRC, `${uniqueAds.length} unique after dedup`);

    // Per-card screenshots — SLOWER: 500ms settle time, 30s timeout
    for (let i = 0; i < uniqueAds.length && i < 30; i++) {
      const ad = uniqueAds[i];
      let screenshotPath = `screenshots/${analysisId}_fb_full.png`;

      try {
        const cardScreenFile = `${analysisId}_fb_card_${i}.png`;
        const screenshotTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CARD_SCREENSHOT_TIMEOUT')), 30000)
        );
        const screenshotWork = (async () => {
          const rect = await page.evaluate((adId) => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
            const searchStr = 'Library ID: ' + adId;
            let node, bestEl = null, bestSize = Infinity;
            while (node = walker.nextNode()) {
              const text = node.textContent || '';
              if (!text.includes(searchStr)) continue;
              if ((text.match(/Library ID:\s*\d+/g) || []).length !== 1) continue;
              const r = node.getBoundingClientRect();
              const sz = r.width * r.height;
              if (sz > 0 && sz < bestSize && r.height > 50) { bestEl = node; bestSize = sz; }
            }
            if (!bestEl) return null;

            let container = bestEl;
            for (let i = 0; i < 20; i++) {
              if (!container.parentElement) break;
              const parent = container.parentElement;
              if ((parent.textContent.match(/Library ID:\s*\d+/g) || []).length > 1) break;
              const pr = parent.getBoundingClientRect();
              if (pr.height > 800) { const cr = container.getBoundingClientRect(); if (cr.height > 200) break; }
              container = parent;
            }
            container.scrollIntoView({ block: 'center' });
            const r = container.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }, ad.ad_id);

          if (rect && rect.width > 50 && rect.height > 50) {
            await sleep(500); // longer settle time
            const clip = {
              x: Math.max(0, rect.x), y: Math.max(0, rect.y),
              width: Math.min(rect.width, 1920 - Math.max(0, rect.x)),
              height: Math.min(rect.height, 1080),
            };
            await page.screenshot({ path: path.join(SCREENSHOTS_DIR, cardScreenFile), clip });
            return `screenshots/${cardScreenFile}`;
          }
          return null;
        })();

        const result = await Promise.race([screenshotWork, screenshotTimeout]);
        if (result) screenshotPath = result;
      } catch (e) {
        log.warn(SRC, `Card screenshot ${i} skipped`, { err: e.message });
      }

      ads.push({
        advertiser_name: null, ad_text: ad.ad_text || null, headline: ad.headline || null,
        cta_text: ad.cta_text || null, media_url: ad.media_url || null,
        media_type: ad.media_type || null, destination_url: ad.destination_url || null,
        started_running: ad.started_running || null, screenshot_path: screenshotPath,
        platform: ad.platform || null, raw_html: ad.raw_text || null,
        extra_data: {
          fb_ad_id: ad.ad_id, ad_link: ad.ad_link,
          impressions: ad.impressions, all_media: ad.all_media,
        },
      });
    }

    // Deep scrape: visit each ad's detail page for EU audience demographics — SLOWER
    await scrapeAdDetails(browser, ads, analysisId);

    // Sort: impressions desc, then oldest first
    ads.sort((a, b) => {
      const impA = parseImpressions(a.extra_data?.impressions);
      const impB = parseImpressions(b.extra_data?.impressions);
      if (impA !== impB) return impB - impA;
      const dateA = a.started_running ? new Date(a.started_running) : new Date();
      const dateB = b.started_running ? new Date(b.started_running) : new Date();
      return dateA - dateB;
    });

    if (ads.length === 0 && hasLibraryIds) {
      const pageText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
      log.error(SRC, 'No ads extracted despite Library IDs — page may have changed structure');
      ads.push({
        advertiser_name: null, ad_text: 'Could not extract individual ads. Page structure may have changed.', headline: null,
        cta_text: null, media_url: null, media_type: null, destination_url: null,
        started_running: null, screenshot_path: `screenshots/${analysisId}_fb_full.png`,
        platform: null, raw_html: pageText, extra_data: { note: 'Extraction failed — Library IDs found but cards could not be parsed' },
      });
    }

    log.info(SRC, `Done: ${ads.length} ads`);
  } catch (err) {
    log.error(SRC, 'Scraping exception', { err: err.message, stack: err.stack });
    try { await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${analysisId}_fb_error.png`), fullPage: true }); } catch (e) {}
    throw err;
  } finally {
    await page.close();
  }
  return ads;
}

async function checkPageHealth(page, httpStatus) {
  if (httpStatus === 403) return { blocked: true, reason: 'HTTP 403 Forbidden — IP may be banned' };
  if (httpStatus === 429) return { blocked: true, reason: 'HTTP 429 Too Many Requests — rate limited' };
  if (httpStatus >= 500) return { blocked: true, reason: `HTTP ${httpStatus} Server Error` };

  const pageInfo = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    const title = document.title || '';
    const url = location.href;
    return { text: text.substring(0, 3000), title, url, textLength: text.length };
  });

  if (pageInfo.url.includes('/login') || pageInfo.url.includes('/checkpoint')) {
    return { blocked: true, reason: `Redirected to ${pageInfo.url} — login/checkpoint required` };
  }

  const hasCaptcha = await page.evaluate(() => {
    return !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha, .captcha');
  });
  if (hasCaptcha) return { blocked: true, reason: 'CAPTCHA detected on page' };

  for (const signal of BLOCK_SIGNALS) {
    if (signal.pattern.test(pageInfo.text) || signal.pattern.test(pageInfo.title)) {
      return { blocked: true, reason: signal.reason };
    }
  }

  for (const pattern of EMPTY_SIGNALS) {
    if (pattern.test(pageInfo.text)) {
      return { empty: true, reason: 'Advertiser has no matching ads' };
    }
  }

  if (pageInfo.textLength < 200) {
    return { blocked: true, reason: `Page appears empty (${pageInfo.textLength} chars) — possible ghost block` };
  }

  return { blocked: false, empty: false };
}

async function scrapeAdDetails(browser, ads, analysisId) {
  const MAX_DETAIL_PAGES = 30;
  const DETAIL_DELAY_MS = 5000; // 5s base between detail pages (was 2.5s)
  const DETAIL_JITTER_MS = 2000; // +0-2s jitter
  const TIMEOUT_MS = 30000;

  const adsWithLinks = ads.filter(a => a.extra_data?.ad_link);
  const toScrape = adsWithLinks.slice(0, MAX_DETAIL_PAGES);
  log.info(SRC, `Deep scraping ${toScrape.length} ad detail pages for EU audience data`);

  let consecutiveFailures = 0;

  for (let i = 0; i < toScrape.length; i++) {
    if (consecutiveFailures >= 3) {
      log.warn(SRC, `Stopping deep scrape after ${consecutiveFailures} consecutive failures (likely rate-limited). Scraped ${i} of ${toScrape.length}.`);
      break;
    }

    const ad = toScrape[i];
    const detailPage = await browser.newPage();
    try {
      await detailPage.setUserAgent(randomUserAgent());
      log.debug(SRC, `Detail page ${i + 1}/${toScrape.length}`, { ad_id: ad.extra_data.fb_ad_id });

      let detailHttpStatus = 0;
      detailPage.on('response', (res) => {
        if (res.url().includes('ads/library')) detailHttpStatus = res.status();
      });

      await detailPage.goto(ad.extra_data.ad_link, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS });

      if (detailHttpStatus === 429) {
        log.warn(SRC, `Detail page ${i + 1} returned 429 — stopping deep scrape`);
        consecutiveFailures = 3;
        continue;
      }

      // Dismiss cookies if present
      try {
        for (const sel of [
          'button[data-cookiebanner="accept_button"]', 'button[title="Allow all cookies"]',
          'button[title="Accept All"]', 'button[title="Allow essential and optional cookies"]',
        ]) {
          const btn = await detailPage.$(sel);
          if (btn) { await btn.click(); await randomDelay(1500, 1000); break; }
        }
      } catch (e) {}

      await randomDelay(3000, 1500); // longer wait after page load (was 1.5s)

      // Scroll down and try to expand EU transparency section
      await detailPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await randomDelay(1500, 1000);
      try {
        await detailPage.evaluate(() => {
          for (const el of document.querySelectorAll('span, div, a, button, [role="button"]')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t === 'eu transparency' || t.includes('see eu transparency') || t.includes('audience in european')) {
              el.click(); return;
            }
          }
        });
        await randomDelay(3500, 1500); // longer wait for EU section (was 2s)
      } catch (e) {}

      // Extract EU audience data and impressions from the detail page
      const detailData = await detailPage.evaluate(() => {
        const text = document.body.innerText || '';
        const eu = {
          total_reach: 0,
          top_country: null,
          top_gender: null,
          top_age_group: null,
          countries: [],
          genders: [],
          age_groups: [],
          is_gender_limited: false,
          status: 'Unknown',
        };

        if (/\bActive\b/i.test(text)) eu.status = 'Active';
        else if (/\bInactive\b/i.test(text)) eu.status = 'Inactive';
        else if (/\bLimited\b/i.test(text)) eu.status = 'Limited';

        let impressions = '';
        const impMatch = text.match(/(?:Impressions?|Number of times)[\s:]*([^\n]{1,50})/i);
        if (impMatch) impressions = impMatch[1].trim();
        if (!impressions) {
          const impMatch2 = text.match(/(\d[\d,KMkm. ]*\s*[-–]\s*\d[\d,KMkm. ]*)\s*impression/i);
          if (impMatch2) impressions = impMatch2[1].trim();
        }

        let euSection = '';
        const euStart = text.match(/(?:European Union|EU transparency|Audience in European)/i);
        if (euStart) {
          const startIdx = euStart.index;
          const remaining = text.substring(startIdx, startIdx + 5000);
          const stopMatch = remaining.match(/\n(?:About this ad|Ad details|Related Pages|Additional info|Why am I seeing|Page transparency)/i);
          euSection = stopMatch ? remaining.substring(0, stopMatch.index) : remaining;
        }

        if (euSection) {
          const reachMatch = euSection.match(/(?:(\d[\d,. ]+)\s*[-–]\s*(\d[\d,. ]+)|(\d[\d,. ]+)\s*(?:people|reach|impressions))/i);
          if (reachMatch) {
            const numStr = reachMatch[2] || reachMatch[3] || reachMatch[1] || '0';
            eu.total_reach = parseInt(numStr.replace(/[^0-9]/g, ''), 10) || 0;
          }
          if (!eu.total_reach) {
            const nums = euSection.match(/\d[\d,. ]+/g);
            if (nums) {
              const values = nums.map(n => parseInt(n.replace(/[^0-9]/g, ''), 10)).filter(v => v > 100);
              if (values.length > 0) eu.total_reach = Math.max(...values);
            }
          }

          function extractDemographics(heading, stopHeadings) {
            const stopRe = stopHeadings.map(h => `\\n${h}`).join('|');
            const pattern = new RegExp(`\\b${heading}\\b[\\s\\S]{0,3000}?(?=${stopRe}|$)`, 'i');
            const match = euSection.match(pattern);
            if (!match) return [];
            const section = match[0];
            const pairs = [];
            const pairRegex = /([A-Z][a-zA-Z\s-]+?)\s+([\d,. ]+)(?:\s*%|\s*people|\s*reach)?/g;
            let m;
            const junk = /^(started|running|library|platform|sponsored|active|inactive|see\s|about|open|dropdown|ad\s|this\s)/i;
            while ((m = pairRegex.exec(section)) !== null) {
              const label = m[1].trim();
              const value = parseInt(m[2].replace(/[^0-9]/g, ''), 10);
              if (value > 0 && label.length > 1 && label.length < 40 && !junk.test(label)) {
                pairs.push({ name: label, reach: value });
              }
            }
            pairs.sort((a, b) => b.reach - a.reach);
            return pairs;
          }

          const knownCountries = new Set(['Germany','France','Italy','Spain','Netherlands','Poland','Belgium','Sweden','Austria','Denmark','Finland','Ireland','Portugal','Greece','Czech Republic','Czechia','Romania','Hungary','Croatia','Bulgaria','Slovakia','Slovenia','Lithuania','Latvia','Estonia','Luxembourg','Malta','Cyprus']);
          const knownGenders = new Set(['Male','Female','Unknown']);

          const rawCountries = extractDemographics('Countr', ['Gender', 'Age']);
          eu.countries = rawCountries.filter(c => {
            return knownCountries.has(c.name) || /^[A-Z][a-z]{2,}$/.test(c.name);
          }).slice(0, 10);

          const rawGenders = extractDemographics('Gender', ['Country', 'Countr', 'Age']);
          eu.genders = rawGenders.filter(g => knownGenders.has(g.name)).slice(0, 5);

          const rawAges = extractDemographics('Age', ['Country', 'Countr', 'Gender']);
          eu.age_groups = rawAges.filter(a => /^\d{2}\s*[-–]\s*\d{2,3}$/.test(a.name) || /^\d{2}\+$/.test(a.name)).slice(0, 10);
        }

        eu.top_country = eu.countries[0] || null;
        eu.top_gender = eu.genders[0] || null;
        eu.top_age_group = eu.age_groups[0] || null;
        if (eu.genders.length === 1) eu.is_gender_limited = true;

        return { eu, impressions };
      });

      if (detailData.impressions && !ad.extra_data.impressions) {
        ad.extra_data.impressions = detailData.impressions;
      }

      const euData = detailData.eu;
      if (euData && (euData.total_reach > 0 || euData.top_country || euData.top_gender || euData.top_age_group)) {
        ad.extra_data.eu_audience = euData;
        log.debug(SRC, `EU audience extracted for ad ${ad.extra_data.fb_ad_id}`, {
          reach: euData.total_reach, country: euData.top_country?.name, status: euData.status,
          countries: euData.countries?.length, genders: euData.genders?.length,
        });
      } else {
        const pageText = await detailPage.evaluate(() => document.body.innerText);
        const fallback = parseFallbackEuAudience(pageText);
        if (fallback) {
          ad.extra_data.eu_audience = fallback;
          log.debug(SRC, `EU audience (fallback) for ad ${ad.extra_data.fb_ad_id}`, {
            reach: fallback.total_reach, status: fallback.status,
          });
        }
      }

      consecutiveFailures = 0; // reset on success
    } catch (err) {
      consecutiveFailures++;
      log.warn(SRC, `Detail page ${i + 1} failed (${consecutiveFailures} consecutive)`, { err: err.message, ad_id: ad.extra_data.fb_ad_id });
    } finally {
      await detailPage.close();
    }

    // Rate limiting delay — SLOWER
    if (i < toScrape.length - 1) {
      await randomDelay(DETAIL_DELAY_MS, DETAIL_JITTER_MS); // 5-7s between detail pages
    }
  }
}

function parseFallbackEuAudience(text) {
  const result = {
    total_reach: 0,
    top_country: null,
    top_gender: null,
    top_age_group: null,
    is_gender_limited: false,
    status: 'Unknown',
  };

  if (/\bActive\b/i.test(text)) result.status = 'Active';
  else if (/\bInactive\b/i.test(text)) result.status = 'Inactive';

  const euNearby = text.match(/European Union[\s\S]{0,300}/i);
  if (euNearby) {
    const nums = euNearby[0].match(/\d[\d,. ]+/g);
    if (nums && nums.length > 0) {
      const values = nums.map(n => parseInt(n.replace(/[^0-9]/g, ''), 10)).filter(v => v > 100);
      if (values.length > 0) {
        result.total_reach = Math.max(...values);
      }
    }
  }

  const countries = ['Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Belgium', 'Sweden', 'Austria', 'Denmark', 'Finland', 'Ireland', 'Portugal', 'Greece', 'Czech Republic', 'Romania', 'Hungary', 'Croatia', 'Bulgaria'];
  for (const country of countries) {
    const countryMatch = text.match(new RegExp(country + '\\s+(\\d[\\d,. ]+)', 'i'));
    if (countryMatch) {
      const reach = parseInt(countryMatch[1].replace(/[^0-9]/g, ''), 10);
      if (reach > 0 && (!result.top_country || reach > result.top_country.reach)) {
        result.top_country = { name: country, reach };
      }
    }
  }

  const femaleMatch = text.match(/Female\s+([\d,. ]+)/i);
  const maleMatch = text.match(/Male\s+([\d,. ]+)/i);
  if (femaleMatch || maleMatch) {
    const femaleReach = femaleMatch ? parseInt(femaleMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
    const maleReach = maleMatch ? parseInt(maleMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
    if (femaleReach > maleReach) result.top_gender = { name: 'Female', reach: femaleReach };
    else if (maleReach > 0) result.top_gender = { name: 'Male', reach: maleReach };
    if ((femaleReach > 0 && maleReach === 0) || (maleReach > 0 && femaleReach === 0)) {
      result.is_gender_limited = true;
    }
  }

  const ageMatch = text.match(/((?:18|25|35|45|55|65)[-–]\d+)\s+([\d,. ]+)/);
  if (ageMatch) {
    result.top_age_group = { name: ageMatch[1], reach: parseInt(ageMatch[2].replace(/[^0-9]/g, ''), 10) };
  }

  if (result.total_reach > 0 || result.top_country || result.top_gender || result.top_age_group) {
    return result;
  }
  return null;
}

function parseImpressions(str) {
  if (!str) return 0;
  return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
}

module.exports = { scrapeFacebookAds };
