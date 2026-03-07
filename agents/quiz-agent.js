/**
 * Agent: Quiz Generator
 * Route: routes/quiz.js → POST /api/containers/:id/quiz
 * Deps: config, storage, logger, parse-json, gather-data (gatherContainerContext), inject-tracking
 * Stores: storage.quizzes[]
 *
 * Generates interactive quiz HTML with configurable questions, scoring, and
 * redirect. Auto-injects tracking codes from container settings.
 */

const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { injectTrackingCodes } = require('../utils/inject-tracking');
const { gatherContainerContext } = require('../utils/gather-data');

const SRC = 'QuizAgent';

const AGENT_META = {
  code: 'ag0011',
  id: 'quiz',
  name: 'Quiz Generator',
  description: 'Interactive HTML quizzes with QA validation.',
  category: 'generation',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'options', type: 'object', required: false, from: null },
  ],
  consumes: [],
  outputs: { storageKey: 'quizzes', dataType: 'html', schema: 'Quiz' },
  ui: { visible: true },
  prompt_summary: 'Creates interactive HTML quizzes with question navigation, scoring, and image prompt cards. Runs a QA validation pass for correctness.',
  prompt_template: `SYSTEM:
You are an expert quiz designer and web developer. You create engaging, interactive quizzes with clean modern HTML, CSS, and JavaScript.

CRITICAL RULES:
1. Output ONLY valid JSON with the structure specified.
2. The HTML must be complete, self-contained (inline CSS and JS), and mobile-responsive.
3. Quiz logic must be fully functional: question navigation, answer selection, score calculation.
4. Design should be modern, visually appealing, and professional.
5. Each question should be educational and relevant to the topic.
6. The end page must show the score and include the redirect button if a URL is provided.
7. All interactive elements must work without any external dependencies.
8. For image types, do NOT use gray placeholder boxes or invisible alt text. Instead, render each image prompt as a styled "Image Prompt" card in the HTML — a visible box with a heading, the full DALL-E/Midjourney prompt text, and a "Copy Prompt" button that copies the text to the clipboard using navigator.clipboard.writeText().
9. For video types, render video descriptions as styled "Video Description" prompt cards in the same fashion (visible, copyable).

USER:
## Quiz Generation Request
### Product Context (from container)
### Container Context (Curated Insights)
### Quiz Configuration: Topic, Quiz Type, Number of Questions, Difficulty
### Custom Instructions (if provided)
### End Page Configuration (redirect URL or score summary)

## Output Format: JSON with title, description, questions[], end_page, full_html (complete self-contained quiz page with inline CSS/JS)

QA VALIDATION PASS (second call):
Checks: correct_answer matches option IDs, 4 unique options per question, non-empty explanations, working JS in full_html, image prompt cards for image types. Returns {"status":"pass"} or corrected JSON.`,
};

async function generateQuiz(containerId, options = {}) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');

  const quiz = await storage.addQuiz(containerId);
  if (!quiz) throw new Error('Failed to create quiz record');

  executeQuiz(containerId, quiz.id, container, options).catch(async (err) => {
    log.error(SRC, 'Quiz generation crashed', { err: err.message });
    try {
      await storage.updateQuiz(containerId, quiz.id, 'failed', { error: err.message });
    } catch (e) {}
  });

  return quiz;
}

async function executeQuiz(containerId, quizId, container, options) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ timeout: config.API_TIMEOUT_MS });

    const prompt = buildQuizPrompt(container, options);

    log.info(SRC, 'Sending quiz request to Claude', {
      containerId,
      quizType: options.quiz_type || 'text_only',
      numQuestions: options.num_questions || 5,
      difficulty: options.difficulty || 'medium',
      promptLength: prompt.length,
    });

    const message = await client.messages.create({
      model: config.AI_MODEL,
      max_tokens: 32000,
      system: `${config.APP_CONTEXT}

You are an expert quiz designer and web developer. You create engaging, interactive quizzes with clean modern HTML, CSS, and JavaScript.

CRITICAL RULES:
1. Output ONLY valid JSON with the structure specified.
2. The HTML must be complete, self-contained (inline CSS and JS), and mobile-responsive.
3. Quiz logic must be fully functional: question navigation, answer selection, score calculation.
4. Design should be modern, visually appealing, and professional.
5. Each question should be educational and relevant to the topic.
6. The end page must show the score and include the redirect button if a URL is provided.
7. All interactive elements must work without any external dependencies.
8. For image types, do NOT use gray placeholder boxes or invisible alt text. Instead, render each image prompt as a styled "Image Prompt" card in the HTML — a visible box with a heading, the full DALL-E/Midjourney prompt text, and a "Copy Prompt" button that copies the text to the clipboard using navigator.clipboard.writeText().
9. For video types, render video descriptions as styled "Video Description" prompt cards in the same fashion (visible, copyable).`,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullText = message.content.map(c => c.text || '').join('\n');
    let jsonData = null;
    try { jsonData = parseJsonFromResponse(fullText); } catch (e) {
      log.warn(SRC, 'JSON parse failed', { err: e.message });
    }

    // Quality check step
    if (jsonData) {
      await storage.updateQuiz(containerId, quizId, 'quality_check', { progress: 'Running quality check...' });
      log.info(SRC, 'Running quality check', { quizId });
      try {
        jsonData = await qualityCheckQuiz(jsonData, options);
        log.info(SRC, 'Quality check passed', { quizId });
      } catch (qaErr) {
        log.warn(SRC, 'Quality check failed, using original', { err: qaErr.message, stack: qaErr.stack?.split('\n')[1]?.trim() });
      }
    }

    // Inject tracking codes from container settings
    if (jsonData && jsonData.full_html) {
      const settings = storage.getSettings(containerId);
      if (settings) {
        jsonData.full_html = injectTrackingCodes(jsonData.full_html, settings);
      }
    }

    const result = {
      full_text: fullText,
      json_data: jsonData,
      quiz_type: options.quiz_type || 'text_only',
      num_questions: options.num_questions || 5,
      difficulty: options.difficulty || 'medium',
      topic: options.topic || '',
      generated_at: new Date().toISOString(),
      prompt_sent: prompt,
    };

    await storage.updateQuiz(containerId, quizId, 'completed', result);
    log.info(SRC, 'Quiz generated', { quizId });
  } catch (err) {
    log.error(SRC, 'Claude API error', { err: err.message });
    await storage.updateQuiz(containerId, quizId, 'failed', { error: err.message });
  }
}

function buildQuizPrompt(container, options) {
  const parts = [];

  parts.push('## Quiz Generation Request');

  if (container.my_product) {
    parts.push(`\n### Product Context`);
    parts.push(`Name: ${container.my_product.name}`);
    if (container.my_product.website) parts.push(`Website: ${container.my_product.website}`);
    if (container.my_product.target_audience) parts.push(`Target Audience: ${container.my_product.target_audience}`);
    if (container.my_product.unique_angle) parts.push(`Unique Angle: ${container.my_product.unique_angle}`);
  }

  // Container Context (curated insights)
  const contextData = gatherContainerContext(container);
  if (contextData && contextData.length > 0) {
    parts.push('\n### Container Context (Curated Insights)');
    for (const item of contextData) {
      parts.push(`**[${item.source_type}] ${item.section_name}**`);
      parts.push(item.brief);
    }
  }

  parts.push(`\n### Quiz Configuration`);
  parts.push(`Topic: ${options.topic || 'General knowledge related to the product'}`);
  parts.push(`Quiz Type: ${options.quiz_type || 'text_only'}`);
  parts.push(`Number of Questions: ${options.num_questions || 5}`);
  parts.push(`Difficulty: ${options.difficulty || 'medium'}`);

  if (options.quiz_type === 'text_and_image') {
    parts.push(`\nIMAGE PROMPT INSTRUCTIONS:
For each question, include an "image_prompt" field with a detailed, high-quality image generation prompt (DALL-E / Midjourney style) and an "image_description" field.
In the full_html, render each image prompt as a visually distinct styled card — NOT a gray placeholder or hidden alt text. The card should have:
  - A small "Image Prompt" heading
  - The full prompt text displayed in a styled box (light background, border, rounded corners)
  - A "Copy Prompt" button that copies the prompt text to the clipboard via navigator.clipboard.writeText()
Options may also have optional image_prompts.`);
  } else if (options.quiz_type === 'text_image_video') {
    parts.push(`\nIMAGE & VIDEO PROMPT INSTRUCTIONS:
For each question, include "image_prompt", "image_description", "video_url" (placeholder), and "video_description" fields.
In the full_html:
  - Render each image prompt as a styled "Image Prompt" card with the full prompt text and a "Copy Prompt" button (navigator.clipboard.writeText). Do NOT use gray placeholders.
  - Render each video description as a styled "Video Description" card with the description text and a copy button.
Both card types should be visually distinct, readable, and professional.`);
  }

  if (options.custom_instructions) {
    parts.push(`\n### Custom Instructions:\n${options.custom_instructions}`);
  }

  parts.push(`\n### End Page Configuration`);
  if (options.redirect_url) {
    parts.push(`Redirect URL: ${options.redirect_url}`);
    parts.push(`Redirect Button Text: ${options.redirect_button_text || 'Continue'}`);
  } else {
    parts.push(`No redirect URL — just show the score summary.`);
  }

  parts.push(`\n## Output Format
Generate a JSON object with this exact structure:

{
  "title": "Quiz Title",
  "description": "Short description of the quiz",
  "questions": [
    {
      "id": 1,
      "question": "Question text",
      "type": "${options.quiz_type || 'text_only'}",
      ${options.quiz_type === 'text_and_image' || options.quiz_type === 'text_image_video' ? `"image_prompt": "Detailed DALL-E prompt for question image",
      "image_description": "Description of what image should show",` : ''}
      ${options.quiz_type === 'text_image_video' ? `"video_url": "placeholder URL for video",
      "video_description": "What the short video should show",` : ''}
      "options": [
        { "id": "a", "text": "Option A" },
        { "id": "b", "text": "Option B" },
        { "id": "c", "text": "Option C" },
        { "id": "d", "text": "Option D" }
      ],
      "correct_answer": "a",
      "explanation": "Why this is the correct answer"
    }
  ],
  "end_page": {
    "title": "Quiz Complete!",
    "show_score": true,
    "redirect_url": "${options.redirect_url || ''}",
    "redirect_button_text": "${options.redirect_button_text || 'Continue'}"
  },
  "full_html": "<!DOCTYPE html>...(complete self-contained quiz page with inline CSS and JS)..."
}

The full_html must be a COMPLETE working quiz page with:
- Modern, clean design with a cohesive color scheme
- Mobile-responsive layout
- Inline CSS (no external stylesheets)
- Inline JavaScript for: question navigation (next/prev), answer selection with visual feedback, score tracking, progress bar, end page with score display
${options.quiz_type === 'text_and_image' || options.quiz_type === 'text_image_video' ? '- Styled "Image Prompt" cards for each question showing the full DALL-E/Midjourney prompt text in a visible, readable box with a "Copy Prompt" button (navigator.clipboard.writeText). Do NOT use gray placeholder boxes or hidden alt text.' : ''}
${options.quiz_type === 'text_image_video' ? '- Styled "Video Description" cards showing the video description text with a copy button. Do NOT use empty embed placeholders.' : ''}
- End page showing: score (X out of Y correct), percentage, per-question review with correct/incorrect indicators
${options.redirect_url ? `- Redirect button linking to: ${options.redirect_url}` : ''}
- Smooth transitions between questions
- Answer explanation shown after selection`);

  return parts.join('\n');
}

async function qualityCheckQuiz(jsonData, options) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ timeout: config.API_TIMEOUT_MS });

  const quizType = options.quiz_type || 'text_only';
  const isImageType = quizType === 'text_and_image' || quizType === 'text_image_video';

  const qaPrompt = `You are a QA validator for interactive quiz JSON. Analyze the following quiz data and fix any issues.

CHECK LIST:
1. Each question's "correct_answer" MUST match one of its options[].id values (a, b, c, or d).
2. Each question must have exactly 4 options with unique IDs: "a", "b", "c", "d".
3. Each question must have a non-empty "explanation" field.
4. The "full_html" must contain working JavaScript for: answer selection with visual feedback, score tracking, question navigation (next/prev or next), and an end page showing the score.
5. The HTML must have event listeners or onclick handlers that actually select answers and track correctness.
6. The end page must display the final score (X out of Y).
${isImageType ? `7. Each question must have a non-empty "image_prompt" field with a detailed image generation prompt.
8. The full_html must render image prompts as visible styled cards with copy buttons — NOT as gray placeholders or hidden alt text.` : ''}

QUIZ JSON:
${JSON.stringify(jsonData, null, 2)}

If everything passes, respond with EXACTLY: {"status":"pass"}
If there are issues, respond with a corrected version of the FULL quiz JSON (same structure). Only fix what is broken — do not change content that is correct.`;

  const message = await client.messages.create({
    model: config.AI_MODEL_FAST,
    max_tokens: 32000,
    messages: [{ role: 'user', content: qaPrompt }],
  });

  const responseText = message.content.map(c => c.text || '').join('\n').trim();

  // If QA says it passes, return original
  if (responseText.includes('"status"') && responseText.includes('"pass"')) {
    return jsonData;
  }

  // Try to parse the fixed JSON
  const fixed = parseJsonFromResponse(responseText);
  if (fixed && fixed.questions && fixed.full_html) {
    log.info(SRC, 'Quality check returned fixes, applying them');
    return fixed;
  }

  // Could not parse fix — return original
  return jsonData;
}

module.exports = { generateQuiz, run: generateQuiz, AGENT_META };
