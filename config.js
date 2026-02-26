/**
 * Central Configuration (SHARED — do not edit from multiple sessions)
 * Used by: ALL 14 agents in agents/*.js, routes/clone-ad.js
 *
 * Exports: AI_MODEL, AI_MODEL_HEAVY, AI_MODEL_FAST, DEFAULT_MAX_TOKENS,
 *          API_TIMEOUT_MS, CONCISENESS_INSTRUCTION, OPENROUTER_API_KEY
 */

module.exports = {
  AI_MODEL: 'claude-sonnet-4-6',
  AI_MODEL_HEAVY: 'claude-opus-4-6',
  AI_MODEL_FAST: 'claude-haiku-4-5-20251001',
  DEFAULT_MAX_TOKENS: 8192,
  API_TIMEOUT_MS: 600000,
  CONCISENESS_INSTRUCTION: 'Be extremely concise. Max 1-2 sentences per text field. No filler, no generic advice. Reference specific data points only.',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
};
