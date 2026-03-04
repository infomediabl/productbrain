/**
 * Route: DesireSpring
 * Mount: /api/desire-spring (via server.js)
 * Agent: desire-spring-agent
 * Deps: express, desire-spring-agent, logger
 *
 * POST /              — Submit idea → 202 { idea_id, status }
 * GET  /              — List all ideas (newest first)
 * GET  /:ideaId       — Get specific idea with result
 * POST /:ideaId/save  — Save instructions to file
 * DELETE /:ideaId     — Delete an idea
 */
const express = require('express');
const router = express.Router();
const {
  generateInstructions,
  getIdea,
  listIdeas,
  deleteIdea,
  saveInstructions,
} = require('../agents/desire-spring-agent');
const log = require('../logger');

const SRC = 'DesireSpringRoute';

// Submit a new idea
router.post('/', async (req, res) => {
  const { idea_text } = req.body;
  if (!idea_text || !idea_text.trim()) {
    return res.status(400).json({ error: 'idea_text is required' });
  }

  try {
    const idea = await generateInstructions(idea_text.trim());
    res.status(202).json({ idea_id: idea.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start generation', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// List all ideas
router.get('/', (req, res) => {
  res.json(listIdeas());
});

// Get specific idea
router.get('/:ideaId', (req, res) => {
  const idea = getIdea(req.params.ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });
  res.json(idea);
});

// Save instructions to file
router.post('/:ideaId/save', (req, res) => {
  const { filename, content } = req.body;
  if (!filename || !filename.trim()) {
    return res.status(400).json({ error: 'filename is required' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  const idea = getIdea(req.params.ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  try {
    const savedAs = saveInstructions(req.params.ideaId, filename.trim(), content.trim());
    res.json({ saved_as: savedAs });
  } catch (err) {
    log.error(SRC, 'Failed to save instructions', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Delete an idea
router.delete('/:ideaId', (req, res) => {
  const idea = getIdea(req.params.ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  deleteIdea(req.params.ideaId);
  res.json({ deleted: true });
});

module.exports = router;
