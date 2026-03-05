/**
 * Creates a mock Anthropic SDK class and its messages.create fn.
 * Usage:
 *   const { setupAnthropicMock } = require('../helpers/mock-anthropic');
 *   const { mockCreate } = setupAnthropicMock({ hooks: [], angle_summary: 'test' });
 *
 * By default wraps the given object as JSON text in a standard response shape.
 */
const { makeJsonResponse, makeAnthropicResponse } = require('../fixtures/anthropic-responses');

function setupAnthropicMock(responseData, options = {}) {
  const Anthropic = require('@anthropic-ai/sdk');

  let response;
  if (typeof responseData === 'string') {
    response = makeAnthropicResponse(responseData);
  } else {
    response = makeJsonResponse(responseData);
  }

  const mockCreate = jest.fn().mockResolvedValue(response);
  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));

  return { mockCreate, Anthropic };
}

module.exports = { setupAnthropicMock };
