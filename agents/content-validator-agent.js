/**
 * Agent: Content Validator (AG-022)
 * Route: routes/content-validator.js → POST /api/containers/:id/content-validator
 * Deps: config, storage, logger, parse-json, gather-data (gatherContainerContext)
 * Stores: storage.validations[]
 *
 * Validates marketing assets against the container's curated context and notes.
 * Provides a brutally honest audit of whether the asset makes sense for the product.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');

const SRC = 'ContentValidatorAgent';

const VALIDATE_TYPES = ['landing_page', 'image_ad', 'video_transcript', 'hook', 'angle'];

const TYPE_LENS = {
  landing_page: `You just clicked an ad and landed on this page. First impression? Will you stay? Understand the offer? Trust it? Take action?
Evaluate: engagement, retention, CTA clarity, visual flow, message-product fit, trust signals, conversion likelihood.`,
  image_ad: `You're scrolling your feed. Will this stop you? Will you click? Does the message match what the product actually does?
Evaluate: scroll-stopping power, click likelihood, message clarity, visual impact, brand alignment, ad fatigue risk.`,
  video_transcript: `First 3 seconds — are you hooked? Will you watch to the end? Is the CTA clear? Does the message match the product?
Evaluate: hook strength (first 3 seconds), retention arc, message clarity, CTA placement, emotional pacing.`,
  hook: `Does this hook grab the right audience? Does it nail a real pain point? Would you actually stop and read?
Evaluate: audience targeting accuracy, pain point precision, emotional resonance, uniqueness, scroll-stopping potential.`,
  angle: `Is this angle differentiated? Does it target a real segment? Can it scale across ad formats?
Evaluate: strategic fit, audience targeting, differentiation from competitors, emotional leverage, scalability across formats.`,
};

const AGENT_META = {
  id: 'content-validator',
  name: 'Content Validator',
  code: 'ag0022',
  description: 'Validates marketing assets against product context with brutally honest feedback',
  category: 'validation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'validate_type', type: 'string', required: true, from: null },
    { name: 'content', type: 'string', required: true, from: null },
    { name: 'comment', type: 'string', required: false, from: null },
  ],
  consumes: [
    { agent: 'container-context', dataKey: 'container_context', description: 'Curated insights for validation alignment' },
  ],
  outputs: { storageKey: 'validations', dataType: 'json', schema: 'ValidationResult' },
  ui: { visible: true },
  prompt_summary: 'Product-first validation: dumps all product info, context briefs, and notes, then applies a type-specific evaluation lens (different prompt per content type). Returns verdict, score, strengths, weaknesses, recommendations, and user perspective.',
  prompt_template: `You are a senior direct-response marketer reviewing this [type] for [product name].

PRODUCT:
[name, website, description, target audience, unique angle — ALL fields]

WHAT THE TEAM KNOWS:
[all container context briefs]
[all metadata/notes]

CONTENT TO VALIDATE:
[the content]

[Type-specific lens — completely different per type, e.g. "You just clicked an ad..." for landing pages]

[Optional user comment]

Be brief, specific, reference the product. Return JSON: {verdict, score, summary, strengths[], weaknesses[], recommendations[], user_perspective_notes}`,
};

async function validateContent(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const { validate_type, content, comment } = options;
  if (!validate_type || !VALIDATE_TYPES.includes(validate_type)) {
    throw new Error(`Invalid validate_type. Must be one of: ${VALIDATE_TYPES.join(', ')}`);
  }
  if (!content || !content.trim()) {
    throw new Error('Content is required for validation');
  }

  const record = await storage.addValidation(containerId, { validate_type, comment });
  if (!record) throw new Error('Failed to create validation record');

  // Fire and forget
  (async () => {
    try {
      const contextItems = gatherContainerContext(container) || [];
      const prod = container.my_product || {};
      const productName = prod.name || container.name || 'Unknown';
      const typeLabel = validate_type.replace(/_/g, ' ');

      // Product info — dump everything, fall back to container name
      const productLines = [
        `Name: ${productName}`,
        `Website: ${prod.website || 'N/A'}`,
        `Description: ${prod.description || 'N/A'}`,
        `Target Audience: ${prod.target_audience || 'N/A'}`,
        `Unique Angle: ${prod.unique_angle || 'N/A'}`,
      ];

      // Context briefs — gatherContainerContext returns { brief }, not { text_brief }
      const contextBrief = contextItems.length > 0
        ? contextItems.map(c => `- ${c.brief}`).join('\n')
        : 'None yet.';

      // Notes from metadata
      const notesList = (container.metadata || [])
        .map(m => `- [${m.type || 'note'}] ${m.title || ''}: ${m.content || ''}`.trim())
        .filter(n => n.length > 3);
      const notesBlock = notesList.length > 0 ? notesList.join('\n') : 'None.';

      // Type-specific lens
      const lens = TYPE_LENS[validate_type] || '';

      const prompt = `You are a senior direct-response marketer reviewing this ${typeLabel} for ${productName}.

PRODUCT:
${productLines.join('\n')}

WHAT THE TEAM KNOWS:
${contextBrief}

NOTES:
${notesBlock}

CONTENT TO VALIDATE (${typeLabel}):
${content}

YOUR LENS:
${lens}
${comment ? `\nUSER COMMENT: ${comment}` : ''}

Be brief, specific, brutally honest. Reference the product by name. Every point must tie back to the product context above.

Return JSON only:
{"verdict":"pass|needs_work|fail","score":1-10,"summary":"2-3 sentences","strengths":["..."],"weaknesses":["..."],"recommendations":["..."],"user_perspective_notes":"one paragraph"}`;

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic();

      const response = await client.messages.create({
        model: config.AI_MODEL,
        max_tokens: config.DEFAULT_MAX_TOKENS || 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      });

      const rawContent = response.content?.[0]?.text || '';
      const parsed = parseJsonFromResponse(rawContent);

      if (!parsed || !parsed.verdict) {
        throw new Error('Failed to parse validation result from AI response');
      }

      parsed._meta = {
        validate_type,
        context_items_used: contextItems.length,
        notes_used: (container.metadata || []).length,
        product_name: productName,
        model_used: config.AI_MODEL,
        prompt_sent: prompt,
      };

      storage.updateValidation(containerId, record.id, 'completed', parsed);
      log.info(SRC, `Validation complete: ${parsed.verdict} (${parsed.score}/10)`, { containerId, validate_type });
    } catch (err) {
      log.error(SRC, 'Validation failed', { err: err.message, containerId });
      storage.updateValidation(containerId, record.id, 'failed', { error: err.message });
    }
  })();

  return record;
}

module.exports = { validateContent, AGENT_META };
