/**
 * Route: Clone Ad (Image Generation)
 * Mount: /api/containers/:id/clone-ad (via server.js)
 * Agent: None (direct OpenRouter API call for image ad cloning)
 * Deps: express, fs, path, config, logger
 *
 * GET  /models — List available OpenRouter image models and API key status
 * POST /       — Clone a scraped ad via OpenRouter (requires model; accepts headline, ad_text, cta, image_url, product_context, format, network)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const fs = require('fs');
const path = require('path');
const config = require('../config');
const log = require('../logger');

const SRC = 'CloneAdRoute';

const OPENROUTER_IMAGE_MODELS = [
  { id: 'google/gemini-2.5-flash-image', label: 'Nano Banana — cheapest' },
  { id: 'google/gemini-3-pro-image-preview', label: 'Nano Banana Pro — best quality' },
  { id: 'openai/gpt-5-image', label: 'GPT-5 Image' },
  { id: 'openai/gpt-5-image-mini', label: 'GPT-5 Image Mini' },
  { id: 'openrouter/auto', label: 'Auto (best available)' },
];

// GET /api/openrouter/models — list available image models + key status
router.get('/models', (req, res) => {
  res.json({
    configured: !!config.OPENROUTER_API_KEY,
    models: OPENROUTER_IMAGE_MODELS,
  });
});

// POST /api/containers/:id/clone-ad — clone a scraped ad via OpenRouter
router.post('/', async (req, res) => {
  if (!config.OPENROUTER_API_KEY) {
    return res.status(400).json({ error: 'OPENROUTER_API_KEY not set in .env. Get one at https://openrouter.ai/settings/keys' });
  }

  const { headline, ad_text, cta, image_url, screenshot_path, source_competitor, product_context, format, network, model } = req.body;

  if (!model) return res.status(400).json({ error: 'Missing model parameter' });

  // Build the prompt
  const formatMap = { '1:1': '1080x1080 square feed', '9:16': '1080x1920 vertical story', '16:9': '1200x628 horizontal banner' };
  const formatDesc = formatMap[format] || format || '1:1 square';

  const prompt = `You are an expert ad creative director. Clone and adapt this competitor ad for a different product.

ORIGINAL AD (from ${source_competitor || 'competitor'}):
- Headline: ${headline || 'N/A'}
- Ad Text: ${ad_text || 'N/A'}
- CTA: ${cta || 'N/A'}

OUR PRODUCT:
${product_context || 'No product context provided'}

TARGET:
- Network: ${network || 'facebook'}
- Image Format: ${formatDesc}

INSTRUCTIONS:
1. Generate a visually compelling ad image adapted for our product in ${formatDesc} format for ${network || 'facebook'}.
2. The image should capture the same creative strategy and visual appeal as the original ad but be completely original and tailored to our product.
3. Include any text overlays that would appear on the ad image (headline, CTA).
4. Also provide adapted ad copy as text.

Respond with the generated image AND the following text:
HEADLINE: [adapted headline]
AD_TEXT: [adapted ad text]
CTA: [adapted call to action]`;

  try {
    log.info(SRC, 'Calling OpenRouter', { model, format, network });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3100',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
        image_config: { aspect_ratio: format || '1:1' },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      log.error(SRC, 'OpenRouter API error', { status: response.status, body: errBody });
      return res.status(502).json({ error: `OpenRouter API error: ${response.status} — ${errBody.substring(0, 200)}` });
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) {
      return res.status(502).json({ error: 'No response from OpenRouter' });
    }

    // Extract image (base64 data URL)
    let imagePath = null;
    const images = choice.images || [];
    // Also check content array format
    const contentParts = Array.isArray(choice.content) ? choice.content : [];
    for (const part of contentParts) {
      if (part.type === 'image_url' && part.image_url?.url) {
        images.push(part);
      }
    }

    if (images.length > 0) {
      const imgData = images[0].image_url?.url || images[0].url || '';
      if (imgData.startsWith('data:image/')) {
        const match = imgData.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          const buffer = Buffer.from(match[2], 'base64');
          const filename = `clone_${Date.now()}.${ext}`;
          const screenshotsDir = path.join(__dirname, '..', 'screenshots');
          if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
          fs.writeFileSync(path.join(screenshotsDir, filename), buffer);
          imagePath = `/screenshots/${filename}`;
          log.info(SRC, 'Image saved', { filename });
        }
      }
    }

    // Extract adapted copy from text response
    const textContent = typeof choice.content === 'string' ? choice.content : '';
    const adaptedCopy = parseAdaptedCopy(textContent);

    res.json({
      image_path: imagePath,
      adapted_copy: adaptedCopy,
      ai_text: textContent.substring(0, 500),
      model_used: model,
    });
  } catch (err) {
    log.error(SRC, 'Clone ad error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

function parseAdaptedCopy(text) {
  const result = { headline: '', ad_text: '', cta: '' };
  if (!text) return result;

  const headlineMatch = text.match(/HEADLINE:\s*(.+)/i);
  const adTextMatch = text.match(/AD_TEXT:\s*(.+)/i);
  const ctaMatch = text.match(/CTA:\s*(.+)/i);

  if (headlineMatch) result.headline = headlineMatch[1].trim();
  if (adTextMatch) result.ad_text = adTextMatch[1].trim();
  if (ctaMatch) result.cta = ctaMatch[1].trim();

  return result;
}

module.exports = router;
