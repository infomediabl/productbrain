/**
 * Agent Registry — Central index of all subagents.
 *
 * Every agent is registered by its AGENT_META.id.
 * Provides lookup by ID and a standardized interface for
 * inter-agent communication and introspection.
 */

const agents = {};

function register(agentModule) {
  const meta = agentModule.AGENT_META;
  if (!meta || !meta.id) throw new Error('Agent module missing AGENT_META.id');
  agents[meta.id] = { meta, module: agentModule };
}

// --- Register all agents ---
register(require('./scraper-agent'));
register(require('./scrape-validator-agent'));
register(require('./analyzer-agent'));
register(require('./seo-agent'));
register(require('./proposal-agent'));
register(require('./prompt-agent'));
register(require('./product-ideator-agent'));
register(require('./keyword-ideator-agent'));
register(require('./google-ads-agent'));
register(require('./image-ad-agent'));
register(require('./quiz-agent'));
register(require('./landing-page-agent'));
register(require('./test-planner-agent'));
register(require('./case-study-agent'));
register(require('./container-chat-agent'));
register(require('./desire-spring-agent'));
register(require('./research-web-agent'));
register(require('./taboola-agent'));
register(require('./spinoff-ideas-agent'));
register(require('./folder-scraper-agent'));
register(require('./hooks-agent'));
register(require('./content-validator-agent'));
register(require('./project-overview-agent'));
register(require('./data-feed-agent'));
register(require('./questions-agent'));

/**
 * Get an agent by its AGENT_META.id.
 * Returns { meta, run } for single-function agents,
 * or { meta, operations } for multi-operation agents (seo, google-ads).
 */
function getAgent(id) {
  const entry = agents[id];
  if (!entry) return null;

  const { meta, module: mod } = entry;

  // Multi-operation agents return their operations map
  if (meta.operations) {
    const ops = {};
    for (const opName of Object.keys(meta.operations)) {
      if (typeof mod[opName] === 'function') {
        ops[opName] = mod[opName];
      }
    }
    return { meta, operations: ops };
  }

  // Standard single-function agents
  const run = mod.run || null;
  return { meta, run };
}

/**
 * List all registered agents with their metadata.
 */
function listAgents() {
  return Object.values(agents).map(a => a.meta);
}

/**
 * Get the dependency graph: which agents consume which.
 * Returns { agentId: [dependencyAgentIds] }
 */
function getDependencyGraph() {
  const graph = {};
  for (const [id, entry] of Object.entries(agents)) {
    graph[id] = (entry.meta.consumes || []).map(c => c.agent);
  }
  return graph;
}

module.exports = { getAgent, listAgents, getDependencyGraph };
