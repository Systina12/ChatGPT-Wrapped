# React-Only Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the project into a pure frontend React app that parses ChatGPT exports and computes wrapped statistics in the browser.

**Architecture:** Vite + React + TypeScript is the main project. Legacy Python remains under `legacy/python/` for reference. Export parsing and statistics run in a Web Worker and return a `WrappedData` object for the UI to display or download.

**Tech Stack:** React, TypeScript, Vite, JSZip, Web Workers.

---

### Task 1: Project Structure

**Files:**
- Move: `chatgpt_wrapped/` to `legacy/python/chatgpt_wrapped/`
- Move: `tests/` to `legacy/python/tests/`
- Move: `doc/export-data-schema.md` to `docs/export-data-schema.md`
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Modify: `.gitignore`, `README.md`

- [ ] Keep Python available as a legacy reference.
- [ ] Make the repository root a Vite React app.
- [ ] Keep `data/`, `workspace/`, build output, and dependency folders ignored.

### Task 2: Browser Export Parser

**Files:**
- Create: `src/types/export.ts`
- Create: `src/lib/export/fileInput.ts`
- Create: `src/lib/export/parser.ts`

- [ ] Accept either a ChatGPT export zip or a selected export folder.
- [ ] Normalize nested zip/folder paths so official filenames can be found by basename.
- [ ] Parse conversations, group chats, assets, feedback, shares, user, settings, and manifest.
- [ ] Preserve enough raw text and metadata for later report highlights.

### Task 3: Statistics Builder

**Files:**
- Create: `src/types/wrapped.ts`
- Create: `src/lib/stats/text.ts`
- Create: `src/lib/stats/time.ts`
- Create: `src/lib/stats/builder.ts`

- [ ] Port the existing web-ready metrics from Python to TypeScript.
- [ ] Keep simple statistics only: counts, distributions, timelines, rankings, high-frequency terms, language buckets, and raw excerpts.
- [ ] Keep the JSON shape stable for future frontend report pages.

### Task 4: Worker and UI

**Files:**
- Create: `src/workers/wrappedWorker.ts`
- Create: `src/App.tsx`
- Create: `src/main.tsx`
- Create: `src/styles.css`

- [ ] Run parse/stat work in a worker.
- [ ] Show upload controls for zip and folder.
- [ ] Show status, warnings, overview cards, JSON preview, and download action.

### Task 5: Verification

**Commands:**
- `npm install`
- `npm run build`

- [ ] Confirm the TypeScript app builds.
- [ ] Confirm no ignored private data is staged.

