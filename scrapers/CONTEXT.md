# scrapers/ — Puppeteer Scraping Modules

Browser automation modules that scrape ad data from public ad transparency platforms.

## Files

### `browser.js`
Shared Puppeteer browser instance manager. Uses `puppeteer-extra` with stealth plugin to avoid detection. Provides `getBrowser()` which returns a singleton browser instance.

### `facebookAdsLibrary.js`
Scrapes the Facebook Ads Library (https://www.facebook.com/ads/library/). Extracts: ad headlines, body text, CTA, media URLs, media type, start dates, EU audience demographics (age, gender, countries, reach), and ad IDs.

### `googleAdsTransparency.js`
Scrapes Google Ads Transparency Center (https://adstransparency.google.com/). Extracts: ad headlines, body text, destination URLs, creative IDs, media URLs, format types, and impression data.

## Key Notes

- Both scrapers return arrays of ad objects with a common schema: `{ headline, ad_text, cta_text, media_url, media_type, destination_url, started_running, platform, extra_data, ocr_text }`
- OCR is handled by the scraper-agent (not the scrapers themselves) using Tesseract.js
- The Facebook scraper extracts EU audience data into `extra_data.eu_audience`
- Both scrapers handle pagination and scrolling for large ad libraries
- 15-minute timeout is enforced by `scraper-agent.js`
