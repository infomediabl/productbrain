/**
 * Route: Quick Questions
 * Mount: /api/containers/:id/questions (via server.js)
 * Agent: questions-agent.askQuestion()
 * Deps: express, storage, questions-agent, logger
 *
 * POST /           — Ask a question (returns 202)
 * GET  /:questionId — Get specific answer
 * GET  /           — List all questions
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { askQuestion } = require('../agents/questions-agent');
const log = require('../logger');

const SRC = 'QuestionsRoute';

router.post('/', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const record = await askQuestion(req.params.id, question);
    res.status(202).json({ question_id: record.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Ask question failed', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:questionId', (req, res) => {
  const q = storage.getQuestion(req.params.id, req.params.questionId);
  if (!q) return res.status(404).json({ error: 'Question not found' });
  res.json(q);
});

router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const questions = (container.questions || []).map(q => ({
    id: q.id,
    created_at: q.created_at,
    status: q.status,
    question: q.question,
    answer: q.result?.answer || null,
  }));
  res.json(questions);
});

module.exports = router;
