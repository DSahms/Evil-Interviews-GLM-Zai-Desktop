# Interviews with Evil — Local Run Guide

An interview engine that pulls tacit knowledge out of a fictional character's
markdown corpus. The interviewer asks; the character answers in voice; a
manuscript grows chapter by chapter.

## Quick start (run locally)

### Prerequisites

1. **Node.js 18+** and **bun** (or just bun — it bundles Node)
2. **Python 3.9+** with `reportlab` and `python-docx` for PDF/DOCX exports:
   ```
   pip install reportlab python-docx
   ```
3. **FreeLLMAPI running locally** at `http://127.0.0.1:31415/v1`
   (model `auto`, your API key). The app calls this endpoint server-side.

### Install + run

```bash
# 1. Unpack the archive
tar xzf interviews-with-evil.tar.gz
cd interviews-with-evil

# 2. Install dependencies
bun install

# 3. Initialize the SQLite database
bun run db:push

# 4. Seed the FreeLLMAPI default provider + Old Yellow Top sample project
bun run scripts/seed.ts

# 5. Start the dev server
bun run dev
```

Open `http://localhost:3000` in your browser. You'll see:

- The "Interviews with Evil" landing page
- An "Old Yellow Top" project card (pre-loaded sample)
- Click it → the 3-column workspace (chapter nav | Q&A + manuscript + canon | quick action)
- Click "Ask the first question" — this calls your local FreeLLMAPI and the
  interviewer generates the first question for Chapter 1 (Origins)
- Click "Get answer" — the character answers in voice, canon is extracted,
  and the manuscript section for that chapter is composed and appended

## Configuration

### LLM provider (default: FreeLLMAPI)

The app ships with FreeLLMAPI preconfigured. To change or add another
OpenAI-compatible provider (OpenAI, Ollama, LM Studio, etc.):

1. Click the **Provider** button (top right of the workspace)
2. Select the "LLM provider" tab
3. Click "New LLM provider" or edit the existing one
4. Set Base URL, API key, model — click "Save & activate"
5. Click "Test connection" to verify

The API key is stored in the local SQLite database only. It is never
committed to Git, never printed to logs, and masked in the UI.

### TTS provider (optional — unconfigured by default)

TTS is a first-class application capability, but **no TTS provider is
required**. The application works normally without one — audio is simply
unavailable until you configure one.

To enable Audio Q&A export:

1. Click the **Provider** button → "TTS provider" tab
2. Click "New TTS provider"
3. Choose a provider type:
   - **OpenAI-compatible TTS** (implemented) — calls `POST {baseUrl}/audio/speech`.
     Works with OpenAI's TTS API, Ollama, Gemini's OpenAI-compat shim, local
     OpenAI-compatible TTS servers, FreeLLMAPI if it implements the endpoint.
   - **Native Gemini TTS / Local Piper / Local Coqui / Custom** —
     architecture is ready, handlers not yet implemented.
4. Configure Base URL, voice, format (mp3/wav/ogg/flac), optional API key
5. Click "Save & activate" then "Test synthesis"

When no TTS provider is configured, the Audio Q&A menu item shows as
"configure TTS" and clicking it opens the provider settings. The manuscript
text remains the authoritative artifact — it lives in the database and
exports as Markdown/PDF/DOCX independently of TTS. Audio is a derived output
synthesized on demand from the manuscript text.

## The 11-chapter spine

1. Origins
2. Childhood
3. Adolescence
4. Family & Kin
5. Education / What Was Learned
6. Love & Relationships
7. Parenthood / Creation
8. Loss
9. Turning Points
10. Lessons Learned
11. Legacy

The interviewer is free to move organically within and across chapters —
the spine is a navigational frame, not a rigid sequence.

## Three outputs + three manuscript formats

### Three outputs (per user requirement)

1. **Magazine-style Q&A** (Markdown) — interviewer asks, character answers,
   flows like a magazine interview transcript
2. **First-person narrative** (Markdown) — the character tells their own
   story in continuous first-person prose, like the novel "Interview with the
   Vampire" (not the transcript)
3. **Audio Q&A** (MP3) — TTS-synthesized audio of the magazine-style Q&A,
   so somebody could listen to the interview

### Three manuscript formats

4. **Manuscript — Markdown** — the long-form prose written during the
   interview, exported as `.md`
5. **Manuscript — PDF** (literary styling, serif body, chapter pages)
6. **Manuscript — DOCX** (for handing to an editor)

All exports are available from the **Export** dropdown in the workspace.

## Architecture reference

```
src/
  app/
    page.tsx                       — single-page app (Landing → Workspace)
    api/
      projects/...                 — project CRUD + interview endpoints
      providers/...                — LLM provider CRUD + connectivity test
      tts-providers/...            — TTS provider CRUD + synthesis test
      upload/                      — markdown corpus upload
      seed/                        — idempotent seed (FreeLLMAPI + Yellow Top)
  components/interview/
    LandingView.tsx                — project list + new project form
    WorkspaceView.tsx              — 3-column workspace shell
    ChapterNav.tsx                 — left column (11 chapters + advance)
    QALog.tsx                      — center column Q&A tab
    ManuscriptView.tsx             — center column Manuscript tab
    CanonPanel.tsx                 — center column Canon tab
    ProviderModal.tsx              — LLM + TTS provider settings (tabbed)
    ExportMenu.tsx                 — 6-format export dropdown
  lib/
    llm/
      provider.ts                  — OpenAI-compatible chat completions client
      engines/interviewer.ts      — next-question engine
      engines/subject.ts          — in-character answer engine
      engines/composition.ts       — manuscript + first-person narrative engines
      extract/canon.ts             — JSON-structured canon extraction
    tts/
      provider.ts                  — TTS abstraction (getActiveTtsProvider + synthesize)
      registry.ts                  — pluggable handler layer (extension point)
    retrieval/
      chunker.ts                   — markdown chunker (split by headers)
      search.ts                    — lexical retrieval (no full-corpus dump)
    storage/paths.ts               — filesystem layout
    interview/
      chapters.ts                  — 11-chapter spine definitions
      orchestrator.ts              — the loop: question → answer → canon → compose
    export/exports.ts             — magazine-qa / narrative / manuscript helpers
scripts/
  seed.ts                          — idempotent seed (FreeLLMAPI + Yellow Top)
  md_to_pdf.py                     — ReportLab literary PDF generator
  md_to_docx.py                    — python-docx generator
prisma/
  schema.prisma                    — 11 tables (Project, Chapter, Turn, Canon,
                                     Entity, Event, Contradiction,
                                     UnresolvedThread, UserCorrection,
                                     Provider, TtsProvider)
data/
  corpus/                          — uploaded markdown corpus files
  projects/<id>/exports/           — generated export files
```

## Spec compliance notes

- **Section 12 — prompt orchestration:** interviewer, subject, composition,
  and canon extraction are SEPARATE prompt operations. No giant prompt.
- **Section 4 — knowledge corpus:** retrieved, never dumped wholesale.
- **Section 18 — regeneration:** question-only and manuscript-only
  regeneration scopes are supported; underlying state is never corrupted.
- **Section 20 — FreeLLMAPI:** ships as default-active LLM provider; no
  silent mock fallback; useful connection errors when unreachable.
- **Section 30 — credential handling:** key stored in DB only; never in
  Git; never in logs; masked in UI; user can change via Provider settings.
- **Manuscript/audio boundary:** manuscript text is the authoritative
  artifact (DB + Markdown/PDF/DOCX exports). Audio is a derived output
  synthesized on demand; no TTS provider is required.
