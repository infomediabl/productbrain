/**
 * JSON Parsing Utility
 * Used by: ALL 16 agents in agents/*.js
 * Exports: parseJsonFromResponse(text)
 *
 * Extracts structured JSON from Claude responses. Tries 6 strategies:
 * raw parse → fence extraction → fence + repair → brace extraction →
 * brace + repair → bracket extraction.
 */

function parseJsonFromResponse(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // Strategy 1: Raw parse
  try { return JSON.parse(trimmed); } catch (e) { /* continue */ }

  // Strategy 2: Fence extraction
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    const fenced = fenceMatch[1].trim();
    try { return JSON.parse(fenced); } catch (e) { /* continue */ }

    // Strategy 3: Fence + repair (handles unescaped quotes, trailing commas)
    const repaired = repairJson(fenced);
    if (repaired) {
      try { return JSON.parse(repaired); } catch (e) { /* continue */ }
    }
  }

  // Strategy 4: Brace extraction
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const braced = trimmed.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(braced); } catch (e) { /* continue */ }

    // Strategy 5: Brace + repair
    const repaired = repairJson(braced);
    if (repaired) {
      try { return JSON.parse(repaired); } catch (e) { /* continue */ }
    }
  }

  // Strategy 6: Bracket extraction (arrays)
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try { return JSON.parse(trimmed.substring(firstBracket, lastBracket + 1)); } catch (e) { /* give up */ }
  }

  return null;
}

/**
 * Attempts to repair common JSON issues from AI responses:
 * - Unescaped double quotes inside string values
 * - Trailing commas before } or ]
 * Returns repaired string or null if repair seems unsafe.
 */
function repairJson(str) {
  if (!str) return null;

  // Fix trailing commas: ,] or ,}
  let fixed = str.replace(/,(\s*[}\]])/g, '$1');

  // Fix unescaped quotes inside string values using a state machine
  const chars = [...fixed];
  const out = [];
  let inString = false;
  let stringStart = -1;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = i > 0 ? chars[i - 1] : '';

    if (ch === '"' && prev !== '\\') {
      if (!inString) {
        // Opening a string
        inString = true;
        stringStart = i;
        out.push(ch);
      } else {
        // This could be the closing quote or an unescaped interior quote.
        // Look ahead to decide: if the next non-whitespace char is a structural
        // JSON character (:, ,, }, ]) then this is the real closing quote.
        let j = i + 1;
        while (j < chars.length && (chars[j] === ' ' || chars[j] === '\t' || chars[j] === '\n' || chars[j] === '\r')) j++;
        const next = j < chars.length ? chars[j] : '';

        if (next === ':' || next === ',' || next === '}' || next === ']' || next === '') {
          // Closing quote
          inString = false;
          out.push(ch);
        } else {
          // Interior quote — escape it
          out.push('\\', '"');
        }
      }
    } else {
      out.push(ch);
    }
  }

  const result = out.join('');
  return result !== str ? result : null;
}

module.exports = { parseJsonFromResponse };
