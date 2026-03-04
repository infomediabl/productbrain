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
  { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash — cheapest, ~7s', tier: 'budget' },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash — newest, ~10s', tier: 'budget' },
  { id: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro — best Gemini, ~4s', tier: 'mid' },
  { id: 'openai/gpt-5-image-mini', label: 'GPT-5 Image Mini — fast, good text, ~1s', tier: 'mid' },
  { id: 'openai/gpt-5-image', label: 'GPT-5 Image — premium quality', tier: 'premium' },
  { id: 'openrouter/auto', label: 'Auto (best available)', tier: 'auto' },
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

  const { headline, ad_text, cta, image_url, screenshot_path, source_competitor, product_context, format, network, model, save_dir, save_filename, custom_instructions } = req.body;

  if (!model) return res.status(400).json({ error: 'Missing model parameter' });

  // Build the prompt
  const formatMap = { '1:1': '1080x1080 square feed', '9:16': '1080x1920 vertical story', '16:9': '1200x628 horizontal banner' };
  const formatDesc = formatMap[format] || format || '1:1 square';

  const prompt = `${config.APP_CONTEXT}

You are an expert ad creative director. Clone and adapt this competitor ad for a different product.

ORIGINAL AD (from ${source_competitor || 'competitor'}):
- Headline: ${headline || 'N/A'}
- Ad Text: ${ad_text || 'N/A'}
- CTA: ${cta || 'N/A'}

OUR PRODUCT:
${product_context || 'No product context provided'}

TARGET:
- Network: ${network || 'facebook'}
- Image Format: ${formatDesc}

${custom_instructions ? `ADDITIONAL CONTEXT:\n${custom_instructions}\n\n` : ''}INSTRUCTIONS:
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

    // Log full response structure for debugging
    log.info(SRC, 'OpenRouter response structure', {
      hasImages: !!(choice.images?.length),
      contentType: typeof choice.content,
      contentIsArray: Array.isArray(choice.content),
      contentLength: Array.isArray(choice.content) ? choice.content.length : (typeof choice.content === 'string' ? choice.content.length : 0),
      contentPartTypes: Array.isArray(choice.content) ? choice.content.map(p => p.type) : [],
    });

    // Extract image from all possible response formats
    let imagePath = null;
    let base64Raw = null;

    // Format 1: choice.images array
    const images = choice.images || [];

    // Format 2: content array with image_url or image parts
    const contentParts = Array.isArray(choice.content) ? choice.content : [];
    for (const part of contentParts) {
      if (part.type === 'image_url' && part.image_url?.url) {
        images.push(part);
      } else if (part.type === 'image' && part.image_url?.url) {
        images.push(part);
      } else if (part.type === 'image_url' && part.url) {
        images.push({ image_url: { url: part.url } });
      } else if (part.b64_json) {
        base64Raw = part.b64_json;
      }
    }

    // Try to extract and save image
    if (images.length > 0 || base64Raw) {
      let imgData = '';
      if (images.length > 0) {
        imgData = images[0].image_url?.url || images[0].url || images[0].b64_json || '';
      }
      if (!imgData && base64Raw) {
        imgData = 'data:image/png;base64,' + base64Raw;
      }

      log.info(SRC, 'Image data found', { prefix: imgData.substring(0, 60), length: imgData.length });

      // Determine save directory and filename
      let targetDir, urlPrefix;
      if (save_dir === 'clonedAd') {
        targetDir = path.join(__dirname, '..', 'clonedAd');
        urlPrefix = '/clonedAd';
      } else {
        targetDir = path.join(__dirname, '..', 'screenshots');
        urlPrefix = '/screenshots';
      }
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      let filename;
      if (save_filename) {
        const sanitized = save_filename.replace(/[^a-zA-Z0-9_-]/g, '');
        filename = `${sanitized || 'clone'}`;
      } else {
        filename = `clone_${Date.now()}`;
      }

      if (imgData.startsWith('data:image/')) {
        // data:image/png;base64,xxxx format — use flexible regex (no $ anchor, trim whitespace)
        const match = imgData.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,\s*(.+)/s);
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          const buffer = Buffer.from(match[2].trim(), 'base64');
          const fullFilename = `${filename}.${ext}`;
          fs.writeFileSync(path.join(targetDir, fullFilename), buffer);
          imagePath = `${urlPrefix}/${fullFilename}`;
          log.info(SRC, 'Image saved (data URL)', { filename: fullFilename });
        } else {
          log.warn(SRC, 'data:image prefix found but regex failed', { prefix: imgData.substring(0, 80) });
        }
      } else if (imgData.startsWith('http')) {
        // Direct URL — return as image_url for frontend to display
        imagePath = imgData;
        log.info(SRC, 'Image URL returned directly', { url: imgData.substring(0, 100) });
      } else if (imgData.length > 100) {
        // Raw base64 without data: prefix — assume PNG
        try {
          const buffer = Buffer.from(imgData.trim(), 'base64');
          if (buffer.length > 100) {
            const fullFilename = `${filename}.png`;
            fs.writeFileSync(path.join(targetDir, fullFilename), buffer);
            imagePath = `${urlPrefix}/${fullFilename}`;
            log.info(SRC, 'Image saved (raw base64)', { filename: fullFilename, size: buffer.length });
          }
        } catch (e) {
          log.warn(SRC, 'Raw base64 decode failed', { err: e.message });
        }
      }
    } else {
      log.warn(SRC, 'No image found in response', {
        choiceKeys: Object.keys(choice),
        contentSample: typeof choice.content === 'string' ? choice.content.substring(0, 200) : JSON.stringify(choice.content)?.substring(0, 200),
      });
    }

    // Extract text content from either string or array format
    let textContent = '';
    if (typeof choice.content === 'string') {
      textContent = choice.content;
    } else if (Array.isArray(choice.content)) {
      textContent = choice.content
        .filter(p => p.type === 'text' && p.text)
        .map(p => p.text)
        .join('\n');
    }
    const adaptedCopy = parseAdaptedCopy(textContent);

    res.json({
      image_path: imagePath,
      adapted_copy: adaptedCopy,
      ai_text: textContent.substring(0, 500),
      model_used: model,
      prompt_sent: prompt,
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
