/**
 * Utility to flush fire-and-forget promises in agent tests.
 * Agents start async work and return immediately — this helper
 * lets tests wait for that async work to complete.
 */
function waitForAsync(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { waitForAsync };
