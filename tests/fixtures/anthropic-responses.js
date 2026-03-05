/**
 * AI response factories matching Anthropic SDK response shape.
 */

function makeAnthropicResponse(text) {
  return {
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'test-model',
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function makeJsonResponse(jsonObj) {
  return makeAnthropicResponse(JSON.stringify(jsonObj));
}

function makeFencedJsonResponse(jsonObj) {
  return makeAnthropicResponse('```json\n' + JSON.stringify(jsonObj, null, 2) + '\n```');
}

function makeWebSearchResponse(text, citations = []) {
  const content = [];
  // web_search tool uses may appear in responses
  for (const cite of citations) {
    content.push({ type: 'web_search', source: cite });
  }
  content.push({ type: 'text', text });
  return {
    id: 'msg_test_ws',
    type: 'message',
    role: 'assistant',
    content,
    model: 'test-model',
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

module.exports = {
  makeAnthropicResponse,
  makeJsonResponse,
  makeFencedJsonResponse,
  makeWebSearchResponse,
};
