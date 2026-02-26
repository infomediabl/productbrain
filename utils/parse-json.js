/**
 * JSON Parsing Utility
 * Used by: ALL 14 agents in agents/*.js
 * Exports: parseJsonFromResponse(text)
 *
 * Extracts structured JSON from Claude responses. Tries 4 strategies:
 * raw parse → fence extraction → brace extraction → bracket extraction (arrays).
 */

function parseJsonFromResponse(text) {
  if (!text) return null;
  const trimmed = text.trim();

  try { return JSON.parse(trimmed); } catch (e) { /* continue */ }

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (e) { /* continue */ }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.substring(firstBrace, lastBrace + 1)); } catch (e) { /* continue */ }
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try { return JSON.parse(trimmed.substring(firstBracket, lastBracket + 1)); } catch (e) { /* give up */ }
  }

  return null;
}

module.exports = { parseJsonFromResponse };
