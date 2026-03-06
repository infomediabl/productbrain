/**
 * Agent: DesireSpring
 * Route: routes/desire-spring.js → POST /api/desire-spring
 * Deps: config, logger, parse-json, fs
 * Stores: data/desire-spring.json (self-contained, not via storage.js)
 *
 * Reads CLAUDE.md architecture doc + user idea, generates structured
 * step-by-step implementation instructions via Claude API.
 */
const fs = require('fs');
const path = require('path');
const log = require('../logger');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');

const SRC = 'DesireSpringAgent';

const AGENT_META = {
  code: 'ag0016',
  id: 'desire-spring',
  name: 'DesireSpring',
  description: 'Generates plain-language step-by-step instructions for feature ideas — what to build, not how to code it.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'idea_text', type: 'string', required: true, from: null },
  ],
  consumes: [],
  outputs: { storageKey: 'ideas', dataType: 'json', schema: 'DesireSpringIdea' },
  ui: { visible: true },
  prompt_summary: 'Generates plain-language step-by-step implementation instructions for feature ideas, referencing real file names and routes from the app architecture.',
  prompt_template: `SYSTEM:
You are a product owner for the ProductBrain application. You write clear, human-readable step-by-step instructions that describe WHAT to build — not HOW to code it.

You have the app's architecture document below for context so you understand the existing structure, naming conventions, and patterns. Use this knowledge to make your instructions accurate and specific, but do NOT include code snippets, function signatures, or implementation details.

Your instructions should:
1. Describe each step in plain language a developer can follow.
2. Reference real file names and routes from the architecture (e.g. "Add a new route at /api/containers/:id/clone-ad") but never show code.
3. Explain WHAT each component should do, what data it needs, and what the user-facing result looks like.
4. Cover the full scope: backend (agent behavior, data storage, API endpoints), frontend (UI layout, user interactions, what the user sees), and documentation updates.
5. Be numbered and grouped logically (e.g. "Step 1 — Backend", "Step 2 — Frontend", etc.).
6. Include a short summary at the top explaining the feature's purpose and value.

Do NOT include: code blocks, function bodies, JSON schemas, prompt templates, or any raw code. Write instructions, not a coding tutorial.

Output ONLY valid JSON with this exact structure:
{
  "title": "Short descriptive title for this feature",
  "filename_suggestion": "NNN.txt (next sequential number based on existing files)",
  "instructions_md": "The full step-by-step instructions in markdown format"
}

ARCHITECTURE DOCUMENT: [contents of CLAUDE.md]

USER:
Write step-by-step instructions for this feature idea:
[user's idea text]`,
};

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? '/tmp/data' : path.join(__dirname, '..', 'data');
const DATA_PATH = path.join(DATA_DIR, 'desire-spring.json');
const INSTRUCTIONS_DIR = path.join(__dirname, '..', 'instructions');

// ========== Self-contained CRUD ==========

function readData() {
  try {
    if (!fs.existsSync(DATA_PATH)) return { ideas: [] };
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.ideas)) return { ideas: [] };
    return data;
  } catch {
    return { ideas: [] };
  }
}

function writeData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  // Sync to Postgres when available
  try {
    const { syncGlobalToDb } = require('../storage');
    syncGlobalToDb('desire-spring', data);
  } catch (e) { /* storage not ready yet */ }
}

function addIdea(ideaText) {
  const data = readData();
  const idea = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: null,
    idea_text: ideaText,
    created_at: new Date().toISOString(),
    status: 'generating',
    result: null,
    saved_as: null,
  };
  data.ideas.push(idea);
  writeData(data);
  return idea;
}

function updateIdea(ideaId, updates) {
  const data = readData();
  const idea = data.ideas.find(i => i.id === ideaId);
  if (!idea) return null;
  Object.assign(idea, updates);
  writeData(data);
  return idea;
}

function getIdea(ideaId) {
  const data = readData();
  return data.ideas.find(i => i.id === ideaId) || null;
}

function deleteIdea(ideaId) {
  const data = readData();
  const idx = data.ideas.findIndex(i => i.id === ideaId);
  if (idx === -1) return false;
  data.ideas.splice(idx, 1);
  writeData(data);
  return true;
}

function listIdeas() {
  const data = readData();
  return data.ideas
    .map(i => ({
      id: i.id,
      title: i.title,
      idea_text: i.idea_text,
      created_at: i.created_at,
      status: i.status,
      saved_as: i.saved_as,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ========== AI Generation ==========

function readClaudeMd() {
  const claudePath = path.join(__dirname, '..', 'CLAUDE.md');
  try {
    return fs.readFileSync(claudePath, 'utf8');
  } catch {
    return '(CLAUDE.md not found)';
  }
}

async function generateInstructions(ideaText) {
  const idea = addIdea(ideaText);

  executeGeneration(idea.id, ideaText).catch(async (err) => {
    log.error(SRC, 'Generation crashed', { err: err.message });
    try {
      updateIdea(idea.id, { status: 'failed', result: { error: err.message } });
    } catch (e) {}
  });

  return idea;
}

async function executeGeneration(ideaId, ideaText) {
  try {
    const claudeMd = readClaudeMd();
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ timeout: config.API_TIMEOUT_MS });

    log.info(SRC, 'Generating instructions for idea', { ideaId, textLength: ideaText.length });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: config.DEFAULT_MAX_TOKENS,
      system: `You are a product owner for the ProductBrain application. You write clear, human-readable step-by-step instructions that describe WHAT to build — not HOW to code it.

You have the app's architecture document below for context so you understand the existing structure, naming conventions, and patterns. Use this knowledge to make your instructions accurate and specific, but do NOT include code snippets, function signatures, or implementation details.

Your instructions should:
1. Describe each step in plain language a developer can follow.
2. Reference real file names and routes from the architecture (e.g. "Add a new route at /api/containers/:id/clone-ad") but never show code.
3. Explain WHAT each component should do, what data it needs, and what the user-facing result looks like.
4. Cover the full scope: backend (agent behavior, data storage, API endpoints), frontend (UI layout, user interactions, what the user sees), and documentation updates.
5. Be numbered and grouped logically (e.g. "Step 1 — Backend", "Step 2 — Frontend", etc.).
6. Include a short summary at the top explaining the feature's purpose and value.

Do NOT include: code blocks, function bodies, JSON schemas, prompt templates, or any raw code. Write instructions, not a coding tutorial.

Output ONLY valid JSON with this exact structure:
{
  "title": "Short descriptive title for this feature",
  "filename_suggestion": "NNN.txt (next sequential number based on existing files)",
  "instructions_md": "The full step-by-step instructions in markdown format"
}

ARCHITECTURE DOCUMENT:
${claudeMd}`,
      messages: [{
        role: 'user',
        content: `Write step-by-step instructions for this feature idea:\n\n${ideaText}`,
      }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try {
      jsonData = parseJsonFromResponse(fullText);
    } catch (e) {
      log.warn(SRC, 'JSON parse failed, saving raw text', { err: e.message });
    }

    const title = jsonData?.title || ideaText.slice(0, 60);
    const result = {
      full_text: fullText,
      json_data: jsonData,
      generated_at: new Date().toISOString(),
    };

    updateIdea(ideaId, { status: 'completed', title, result });
    log.info(SRC, 'Instructions generated', { ideaId, title });
  } catch (err) {
    log.error(SRC, 'Generation error', { err: err.message });
    updateIdea(ideaId, { status: 'failed', result: { error: err.message } });
  }
}

// ========== Save to instructions/ ==========

function saveInstructions(ideaId, filename, content) {
  if (IS_VERCEL) {
    throw new Error('Cannot save instructions to filesystem on Vercel (read-only). Use the local dev environment.');
  }

  // Path-traversal protection
  const safeName = path.basename(filename);
  if (safeName !== filename || filename.includes('..')) {
    throw new Error('Invalid filename');
  }

  if (!fs.existsSync(INSTRUCTIONS_DIR)) {
    fs.mkdirSync(INSTRUCTIONS_DIR, { recursive: true });
  }

  const filePath = path.join(INSTRUCTIONS_DIR, safeName);
  const cleaned = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  fs.writeFileSync(filePath, cleaned, 'utf8');

  updateIdea(ideaId, { saved_as: safeName });
  log.info(SRC, 'Instructions saved to file', { ideaId, filename: safeName });
  return safeName;
}

module.exports = {
  generateInstructions,
  getIdea,
  listIdeas,
  deleteIdea,
  saveInstructions,
  AGENT_META,
};
