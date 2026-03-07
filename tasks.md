# Tasks from instructions/start.txt

## Completed
- [X] 1. Improve Project Overview Typography
- [X] 2.1-2.3 Agent Info & Prompt Transparency

---

## Task 3: Questions Box on Dashboard (New Agent AG-025)
- [ ] 3.1 Agent file: `agents/questions-agent.js` — uses container context to answer questions. Short concise answers. Fire-and-forget. Stores in `questions[]`.
- [ ] 3.2 Storage CRUD: `addQuestion()`, `updateQuestion()`, `getQuestion()` in storage.js
- [ ] 3.3 Route: `routes/questions.js` — POST / (ask), GET /:id (get answer), GET / (list)
- [ ] 3.4 Register: server.js + agents/registry.js
- [ ] 3.5 Dashboard UI: `public/js/questions.js` — textarea + "Answer" button, shows Q&A list with prompt_sent link
- [ ] 3.6 container.html: add script tag + HTML section card
- [ ] 3.7 Docs: CLAUDE.md + guide.html + agent-guide.js
- [ ] 3.8 Test: Add question in BustRadar container

## Task 4: Chat Page — Add Info/Prompt Transparency
- [ ] 4.1 Add agent info modal (i icon) + prompt template (P icon) + help bubble (?) to chat.html
- [ ] 4.2 Show system prompt used for each chat exchange (collapsible "View System Prompt" at bottom of each response)

## Task 5: Top Menu Pages
- [ ] 5.1 (empty — skip)
- [ ] 5.2 Add Research + DesireSpring to nav as "Other Tools" dropdown or direct links
- [ ] 5.3 research-web.html: add agent info (i), help (?), prompt template (P), prompt log on results
- [ ] 5.4 desire-spring.html: add to nav + add agent info (i), help (?), prompt template (P), prompt log

## Task 6: Universal Agent Info & Help Icons Audit
- [ ] 6.1 Every dashboard card and standalone page needs ? icon with short explanation
- [ ] 6.2 Every element needs green "i" icon for agent info modal (Code, Name, Category, Model, Inputs, Consumes, Outputs, Prompt Summary)
- [ ] 6.3 Every element needs "P" icon for prompt template + prompt log on completed runs
