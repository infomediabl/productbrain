/**
 * Agent: Quick Questions
 * Route: routes/questions.js → POST /api/containers/:id/questions
 * Deps: config, storage, logger, parse-json, gather-data (gatherContainerContext)
 * Stores: storage.questions[]
 *
 * Answers user questions about the project using container context, product info,
 * competitors, and notes. Returns short, concise answers.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');

const SRC = 'QuestionsAgent';

const AGENT_META = {
  id: 'questions',
  name: 'Quick Questions',
  code: 'ag0025',
  description: 'Ask questions about your project and get concise AI answers using container context.',
  category: 'chat',
  model: 'AI_MODEL_FAST',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'question', type: 'string', required: true, from: null },
  ],
  consumes: [
    { agent: 'container-context', dataKey: 'container_context', description: 'Curated context items' },
  ],
  outputs: { storageKey: 'questions', dataType: 'json', schema: 'QuestionAnswer' },
  ui: { visible: true },
  prompt_summary: 'Takes a user question + all container context (product, competitors, notes, curated insights) and returns a short, concise answer. Uses the fast model for quick responses.',
  prompt_template: `SYSTEM: You are a concise marketing analyst. Answer the question using ONLY the provided context. Be specific, reference actual data. If you don't have enough information, say so. Keep answers under 3-4 sentences.

USER:
## Product
[product name, website, type, unique angle, target audience]

## Competitors
[competitor names and websites]

## Notes
[user-added metadata/notes]

## Context Items ([count])
[curated context items: source_type, section_name, brief]

## Question
[user's question]

Return JSON: { "answer": "...", "confidence": "high|medium|low", "sources_used": ["which context items informed the answer"] }`,
};

async function askQuestion(containerId, question) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');
  if (!question || !question.trim()) throw new Error('Question is required');

  const record = await storage.addQuestion(containerId, question.trim());

  // Fire-and-forget
  (async () => {
    try {
      const contextItems = gatherContainerContext(container);
      const product = container.my_product;
      const competitors = container.competitors || [];
      const metadata = container.metadata || [];

      const productSection = product
        ? `Name: ${product.name}\nWebsite: ${product.website || 'N/A'}\nType: ${product.site_type || 'N/A'}\nUnique Angle: ${product.unique_angle || 'N/A'}\nTarget Audience: ${product.target_audience || 'N/A'}`
        : 'No product defined.';

      const compSection = competitors.length > 0
        ? competitors.map(c => `- ${c.name}${c.website ? ' (' + c.website + ')' : ''}`).join('\n')
        : 'None.';

      const notesSection = metadata.length > 0
        ? metadata.slice(0, 10).map(m => `- [${m.type}] ${m.content?.substring(0, 200) || ''}`).join('\n')
        : 'None.';

      const contextSection = contextItems.length > 0
        ? contextItems.map(c => `[${c.source_type}] ${c.section_name}: ${c.text_brief?.substring(0, 300) || ''}`).join('\n\n')
        : 'No curated context available.';

      const prompt = `## Product
${productSection}

## Competitors (${competitors.length})
${compSection}

## Notes (${metadata.length})
${notesSection}

## Context Items (${contextItems.length})
${contextSection}

## Question
${question.trim()}

Answer the question concisely using the above context. Be specific and reference actual data points. Keep your answer under 3-4 sentences.

Return JSON: { "answer": "your concise answer", "confidence": "high|medium|low", "sources_used": ["brief description of what context informed the answer"] }`;

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic();

      const message = await client.messages.create({
        model: config.AI_MODEL_FAST,
        max_tokens: 512,
        system: 'You are a concise marketing analyst. Answer questions using ONLY the provided context. Be specific. If you lack information, say so. Always respond with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = message.content[0].text;
      const parsed = parseJsonFromResponse(raw);

      if (parsed && parsed.answer) {
        parsed.prompt_sent = prompt;
        await storage.updateQuestion(containerId, record.id, 'completed', parsed);
        log.info(SRC, 'Question answered', { containerId, questionId: record.id });
      } else {
        await storage.updateQuestion(containerId, record.id, 'completed', {
          answer: raw.slice(0, 1000),
          confidence: 'low',
          sources_used: [],
          prompt_sent: prompt,
        });
      }
    } catch (err) {
      log.error(SRC, 'Question answering failed', { containerId, questionId: record.id, err: err.message });
      await storage.updateQuestion(containerId, record.id, 'failed', { error: err.message });
    }
  })();

  return record;
}

module.exports = { askQuestion, AGENT_META };
