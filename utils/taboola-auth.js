/**
 * Taboola Backstage API — OAuth 2.0 Token Manager
 * Used by: agents/taboola-agent.js, routes/taboola.js
 *
 * Handles client credentials flow against the Taboola token endpoint.
 * Caches tokens in memory and refreshes only when expired.
 * Accepts optional per-container credentials, falling back to global config.
 *
 * Token endpoint: https://backstage.taboola.com/backstage/oauth/token
 */
const log = require('../logger');

const SRC = 'TaboolaAuth';

// In-memory token cache keyed by client_id
const tokenCache = new Map();

/**
 * Get a valid Taboola bearer token.
 * @param {Object} [credentials] - Optional per-container credentials override
 * @param {string} credentials.client_id
 * @param {string} credentials.client_secret
 * @returns {Promise<string>} Bearer token string
 */
async function getTaboolaToken(credentials = {}) {
  const config = require('../config');
  const clientId = credentials.client_id || config.TABOOLA_CLIENT_ID;
  const clientSecret = credentials.client_secret || config.TABOOLA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Taboola credentials not configured — set TABOOLA_CLIENT_ID and TABOOLA_CLIENT_SECRET');
  }

  // Check cache
  const cached = tokenCache.get(clientId);
  if (cached && cached.expires_at > Date.now() + 60000) {
    return cached.access_token;
  }

  log.info(SRC, 'Fetching new Taboola access token', { clientId: clientId.substring(0, 8) + '...' });

  const res = await fetch('https://backstage.taboola.com/backstage/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    log.error(SRC, 'Token request failed', { status: res.status, body });
    throw new Error(`Taboola auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const expiresIn = data.expires_in || 3600; // default 1 hour

  tokenCache.set(clientId, {
    access_token: data.access_token,
    expires_at: Date.now() + expiresIn * 1000,
  });

  log.info(SRC, 'Token acquired', { expiresIn });
  return data.access_token;
}

module.exports = { getTaboolaToken };
