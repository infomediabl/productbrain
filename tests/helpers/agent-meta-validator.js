/**
 * Validates AGENT_META has all required fields.
 */
function validateAgentMeta(meta) {
  expect(meta).toBeDefined();
  expect(typeof meta.id).toBe('string');
  expect(meta.id.length).toBeGreaterThan(0);
  expect(typeof meta.name).toBe('string');
  expect(meta.name.length).toBeGreaterThan(0);

  // code must match /^ag\d{4}$/
  expect(typeof meta.code).toBe('string');
  expect(meta.code).toMatch(/^ag\d{4}$/);

  expect(typeof meta.description).toBe('string');
  expect(meta.description.length).toBeGreaterThan(0);

  expect(['scraping', 'validation', 'analysis', 'generation', 'api', 'chat', 'collection', 'research'])
    .toContain(meta.category);

  expect(meta.outputs).toBeDefined();
  expect(typeof meta.outputs.storageKey === 'string' || meta.outputs.storageKey === null).toBe(true);
}

module.exports = { validateAgentMeta };
