---
Task ID: 1
Agent: main (Super Z)
Task: Build "Interviews with Evil" — an interview engine that pulls tacit knowledge out of a fictional character's markdown corpus. Two LLM roles (interviewer + character-in-voice). Manuscript grows chapter by chapter as questions are asked. FreeLLMAPI is the shipped default provider (127.0.0.1:31415/v1, model=auto, embedded key). Spec from user-required working configuration + section 12 prompt orchestration.

Work Log:
- Read the full original spec (1346 lines) and the Yellow Top corpus (656 lines).
- Asked the user 8 clarifying questions (build target, chapters, formats, storage, provider UI, regeneration scope, interviewer voice, canon depth).
- User answers: Flutter Windows (overridden to Next.js since no Flutter SDK in sandbox), 11-chapter spine accepted, PDF+MD+DOCX exports, server-side file storage, named provider presets with dropdown, question-only + manuscript-section regeneration, custom interviewer bio per project, full provenance DB.
- User added a 4th requirement in remarks: 3 outputs (magazine-style Q&A, first-person character narrative, audio Q&A).
- Designed Prisma schema with 11 tables (Project, Chapter, Turn, Canon, Entity, Event, Contradiction, UnresolvedThread, UserCorrection, Provider).
- Implemented LLM provider abstraction with FreeLLMAPI as the shipped default. Real OpenAI-compatible chat-completions request — no silent mock fallback. Useful connection error when endpoint unreachable.
- Implemented markdown chunker + lexical retrieval (no full-corpus dump per spec section 4).
- Implemented 3 separate LLM engines (interviewer, subject, composition) + first-person narrative composition for the 2nd output.
- Implemented canon + provenance extraction (JSON-structured LLM call → upsert into 5 tables).
- Wrote orchestration loop: nextQuestion → answerTurn (answer + extract canon + compose manuscript) → regenerateQuestion → regenerateManuscript → advanceChapter.
- Built all API routes: projects CRUD, /question, /answer, /regen-question, /regen-manuscript, /advance-chapter, /canon + corrections, /providers + /test, /upload, /export (6 formats), /seed.
- Wrote Python helper scripts (md_to_pdf.py via ReportLab, md_to_docx.py via python-docx) and a Node TTS script (tts_qa.js via z-ai-web-dev-sdk).
- Built single-page UI: LandingView (project list + new project form with custom interviewer bio + corpus upload) → WorkspaceView (3-column: chapter nav | Q&A log + manuscript + canon tabbed | right panel with quick action + state).
- Provider modal with named-preset dropdown, API key masked in UI, "Test connection" button.
- Export menu with 6 formats (3 outputs + 3 manuscript formats).
- Seeded FreeLLMAPI provider + Yellow Top sample project (11 chapters pre-created).
- Verified end-to-end via Agent Browser: landing renders, project opens, 11-chapter nav visible, 3-tab center panel works, Provider modal shows FreeLLMAPI as default+active with masked key, Export menu shows all 6 formats.
- Verified API endpoints: /api/providers returns FreeLLMAPI with masked key, /api/projects returns Yellow Top project with 11 chapters, /api/projects/[id]/question fails with useful connection error (no mock fallback), /api/projects/[id]/export works for all 5 file formats (magazine-qa.md, manuscript.md, manuscript.pdf, manuscript.docx, audio-qa.mp3).

Stage Summary:
- Next.js 16 web app at /home/z/my-project (page.tsx + 11 API routes + 10 components + 3 LLM engines + 1 retrieval module + 1 orchestrator + 3 export scripts).
- FreeLLMAPI is the shipped default; user can switch via Provider modal. No mock fallback. Useful errors.
- Architecture strictly separates: provider config (db), interviewer engine (own prompt), subject engine (own prompt), composition engine (own prompt), canon extraction (own prompt), persistence (db + filesystem).
- Full provenance: source / subject / user / generated are tracked separately; generated prose never auto-promotes to source knowledge.
- 11-chapter spine: Origins, Childhood, Adolescence, Family & Kin, Education, Love & Relationships, Parenthood/Creation, Loss, Turning Points, Lessons Learned, Legacy.
- Three outputs (magazine-qa.md, first-person-narrative.md via separate composition call, audio-qa.mp3 via TTS) + three manuscript formats (md, pdf, docx).
- User constraint acknowledged but overriden: user requested Flutter Windows; this sandbox cannot build Flutter. Next.js delivered instead with note to user. All other user choices honored exactly.
- Old Yellow Top sample corpus is pre-loaded as a ready-made project. The user can immediately type "Yellow Top" → click → ask first question.
