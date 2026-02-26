/**
 * Route: Container Chat
 * Mount: /api/containers/:id/chat (via server.js)
 * Agent: container-chat-agent.chat()
 * Deps: express, container-chat-agent, logger
 *
 * POST / — Send a chat message (synchronous; requires message, optional history)
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const { chat } = require('../agents/container-chat-agent');
const log = require('../logger');

const SRC = 'ContainerChatRoute';

// Synchronous chat — waits for Claude response
router.post('/', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const response = await chat(req.params.id, { message, history: history || [] });
    res.json({ response });
  } catch (err) {
    log.error(SRC, 'Chat failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
