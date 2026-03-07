/**
 * Agent: Case Study Analyzer
 * Route: routes/case-study.js → POST /api/containers/:id/case-studies
 * Deps: config, storage, logger, parse-json
 * Stores: storage.case_studies[]
 *
 * Processes competitor case studies from multiple sources (PDF, TXT, image, URL)
 * and extracts structured insights including strategies, metrics, and takeaways.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');

const SRC = 'CaseStudyAgent';

const AGENT_META = {
  code: 'ag0014',
  id: 'case-study',
  name: 'Case Study Analyzer',
  description: 'Processes competitor case studies (PDF, TXT, image, URL) into structured insights.',
  category: 'analysis',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: true, from: null },
  ],
  consumes: [],
  outputs: { storageKey: 'case_studies', dataType: 'json', schema: 'CaseStudy' },
  ui: { visible: true },
  prompt_summary: 'Extracts structured insights from case studies (PDF, text, image, URL): metrics, strategies, channels, strengths, weaknesses, lessons, and quotes.',
  prompt_template: `SYSTEM:
You are an expert competitive intelligence analyst. You analyze case studies and extract structured, actionable insights.

CRITICAL RULES:
1. Output ONLY valid JSON with the exact structure specified.
2. Be specific — cite numbers, quotes, and concrete details from the text.
3. If a field has no data available, use null rather than making things up.
4. Focus on actionable intelligence that a marketing or product team can use.
5. Identify both what worked AND what didn't.

USER:
## Case Study Analysis Request
### Our Product Context (name, website, target audience, unique angle)
### Associated Competitor (if linked)
### Source: [PDF|TXT|IMAGE|URL] — [source name]
### Extracted Case Study Text: [full extracted text content]

## Output Format: JSON with competitor_name, summary, key_metrics[] (metric/value/context), strategies_used[] (strategy/description/effectiveness), channels_used[], target_audience, timeline, strengths[], weaknesses[], lessons_for_us[], quotes[]`,
};

async function analyzeCaseStudy(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const study = await storage.addCaseStudy(containerId, {
    source_type: options.source_type,
    source_name: options.source_name,
    competitor_id: options.competitor_id,
  });
  if (!study) throw new Error('Failed to create case study record');

  executeAnalysis(containerId, study.id, container, options).catch(async (err) => {
    log.error(SRC, 'Case study analysis crashed', { err: err.message });
    try {
      await storage.updateCaseStudy(containerId, study.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return study;
}

async function executeAnalysis(containerId, studyId, container, options) {
  try {
    let extractedText = '';

    // --- Text extraction by source type ---
    if (options.source_type === 'txt') {
      extractedText = Buffer.from(options.content, 'base64').toString('utf8');
      log.info(SRC, 'Extracted text from TXT', { length: extractedText.length });

    } else if (options.source_type === 'pdf') {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = Buffer.from(options.content, 'base64');
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = pdfData.text;
      log.info(SRC, 'Extracted text from PDF', { pages: pdfData.numpages, length: extractedText.length });

    } else if (options.source_type === 'image') {
      // Use Claude vision API to read image content
      extractedText = await extractTextFromImage(options.content);
      log.info(SRC, 'Extracted text from image via vision', { length: extractedText.length });

    } else if (options.source_type === 'url') {
      extractedText = await fetchUrlContent(options.content);
      log.info(SRC, 'Extracted text from URL', { url: options.content, length: extractedText.length });

    } else {
      throw new Error(`Unsupported source type: ${options.source_type}`);
    }

    if (!extractedText || extractedText.trim().length < 20) {
      throw new Error('Could not extract enough text from the provided source');
    }

    // Truncate very long texts to avoid token limits
    const maxChars = 80000;
    if (extractedText.length > maxChars) {
      extractedText = extractedText.substring(0, maxChars) + '\n\n[... truncated for analysis ...]';
    }

    // --- AI Analysis ---
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ timeout: config.API_TIMEOUT_MS });

    const prompt = buildAnalysisPrompt(container, extractedText, options);

    log.info(SRC, 'Sending case study to Claude for analysis', {
      containerId,
      studyId,
      sourceType: options.source_type,
      textLength: extractedText.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 8192,
      system: `${config.APP_CONTEXT}

You are an expert competitive intelligence analyst. You analyze case studies and extract structured, actionable insights.

CRITICAL RULES:
1. Output ONLY valid JSON with the exact structure specified.
2. Be specific — cite numbers, quotes, and concrete details from the text.
3. If a field has no data available, use null rather than making things up.
4. Focus on actionable intelligence that a marketing or product team can use.
5. Identify both what worked AND what didn't.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try { jsonData = parseJsonFromResponse(fullText); } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      source_type: options.source_type,
      source_name: options.source_name,
      extracted_text_length: extractedText.length,
      analyzed_at: new Date().toISOString(),
      prompt_sent: prompt,
    };

    await storage.updateCaseStudy(containerId, studyId, 'completed', result);
    log.info(SRC, 'Case study analysis completed', { studyId });
  } catch (err) {
    log.error(SRC, 'Analysis error', { err: err.message });
    await storage.updateCaseStudy(containerId, studyId, 'failed', { error: err.message });
  }
}

async function extractTextFromImage(base64Content) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ timeout: config.API_TIMEOUT_MS });

  // Detect media type from base64 header or default to jpeg
  let mediaType = 'image/jpeg';
  if (base64Content.startsWith('/9j/')) mediaType = 'image/jpeg';
  else if (base64Content.startsWith('iVBOR')) mediaType = 'image/png';
  else if (base64Content.startsWith('R0lGO')) mediaType = 'image/gif';
  else if (base64Content.startsWith('UklGR')) mediaType = 'image/webp';

  const message = await client.messages.create({
    model: config.AI_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Content },
        },
        {
          type: 'text',
          text: 'Extract ALL text content from this image. Include every heading, paragraph, caption, label, number, and data point visible. Preserve the structure and hierarchy of the content as much as possible. Output only the extracted text, nothing else.',
        },
      ],
    }],
  });

  return message.content.map(c => c.text || '').join('\n');
}

async function fetchUrlContent(url) {
  const protocol = url.startsWith('https') ? require('https') : require('http');

  return new Promise((resolve, reject) => {
    const req = protocol.get(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CaseStudyBot/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        fetchUrlContent(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching URL`));
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // Strip HTML tags to get text content
        const text = data
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        resolve(text);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('URL fetch timed out')); });
  });
}

function buildAnalysisPrompt(container, extractedText, options) {
  const parts = [];

  parts.push('## Case Study Analysis Request');

  if (container.my_product) {
    parts.push(`\n### Our Product Context`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
  }

  if (options.competitor_id) {
    const comp = (container.competitors || []).find(c => c.id === options.competitor_id);
    if (comp) {
      parts.push(`\n### Associated Competitor: ${comp.name}${comp.website ? ` (${comp.website})` : ''}`);
    }
  }

  parts.push(`\n### Source: ${options.source_type.toUpperCase()} — ${options.source_name || 'Unknown'}`);

  parts.push(`\n### Extracted Case Study Text:\n${extractedText}`);

  parts.push(`\n## Output Format
Analyze the case study above and output a JSON object with this exact structure:

{
  "competitor_name": "Name of the company/brand the case study is about",
  "summary": "2-3 sentence overview of what this case study covers",
  "key_metrics": [
    { "metric": "metric name", "value": "value/number", "context": "what it means" }
  ],
  "strategies_used": [
    { "strategy": "strategy name", "description": "how they used it", "effectiveness": "high|medium|low|unknown" }
  ],
  "channels_used": ["list of marketing/distribution channels mentioned"],
  "target_audience": "Who they targeted — demographics, psychographics, segments",
  "timeline": "Any timeline, phases, or duration mentioned (null if not mentioned)",
  "strengths": ["What worked well — be specific with data points"],
  "weaknesses": ["What didn't work or gaps identified — be specific"],
  "lessons_for_us": ["Actionable takeaways we can apply to our own product/marketing"],
  "quotes": ["Notable direct quotes from the case study text"]
}`);

  return parts.join('\n');
}

module.exports = { analyzeCaseStudy, run: analyzeCaseStudy, AGENT_META };
