/**
 * Route: Quiz Generator
 * Mount: /api/containers/:id/quiz (via server.js)
 * Agent: quiz-agent.generateQuiz()
 * Deps: express, storage, quiz-agent, logger
 *
 * POST /        — Trigger quiz generation (accepts quiz_type, num_questions, difficulty, topic, custom_instructions, redirect_url, redirect_button_text)
 * GET  /:quizId — Get a specific quiz
 * GET  /        — List all quizzes
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const storage = require('../storage');
const { generateQuiz } = require('../agents/quiz-agent');
const log = require('../logger');

const SRC = 'QuizRoute';

// Trigger quiz generation
router.post('/', async (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });

  const options = {
    quiz_type: req.body.quiz_type || 'text_only',
    num_questions: parseInt(req.body.num_questions) || 5,
    difficulty: req.body.difficulty || 'medium',
    topic: req.body.topic || '',
    custom_instructions: req.body.custom_instructions || '',
    redirect_url: req.body.redirect_url || '',
    redirect_button_text: req.body.redirect_button_text || 'Continue',
  };

  try {
    const quiz = await generateQuiz(req.params.id, options);
    res.status(202).json({ quiz_id: quiz.id, status: 'generating' });
  } catch (err) {
    log.error(SRC, 'Failed to start quiz generation', { err: err.message });
    res.status(400).json({ error: err.message });
  }
});

// Get specific quiz
router.get('/:quizId', (req, res) => {
  const quiz = storage.getQuiz(req.params.id, req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json(quiz);
});

// List all quizzes
router.get('/', (req, res) => {
  const container = storage.readContainer(req.params.id);
  if (!container) return res.status(404).json({ error: 'Container not found' });
  const quizzes = (container.quizzes || []).map(q => ({
    id: q.id, created_at: q.created_at, status: q.status,
    quiz_type: q.result?.quiz_type || null,
    topic: q.result?.topic || null,
  }));
  res.json(quizzes);
});

module.exports = router;
