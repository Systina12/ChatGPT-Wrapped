# ChatGPT Wrapped

[Live demo](https://systina12.github.io/ChatGPT-Wrapped/) · React + TypeScript + Vite · runs entirely in your browser.

**Rebuilt functionality:** the earlier session's uncommitted changes were not found. This implementation was rebuilt from the requirements on top of `main` at `02977878b63d7d0a527d59f169bbc85bae5f57c3`. See [reconstruction evidence](docs/rebuild-2026-10-21.md). This is not a recovered original diff.

The retired Python application and its tests were removed from `main` on 2026-10-22. The application and CI use React, TypeScript and Vite. `scripts/archive-source.py` is a standalone source-packaging utility; it is not needed to install, run, test or build the application.

## Use / 使用

1. In ChatGPT, open **Settings → Data Controls → Export Data**. [Official instructions](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data).
2. Choose the official ZIP or its extracted folder. Folder selection depends on browser support; ZIP is the compatible alternative.
3. Explore the report, change scope locally, or export a summary/share card. 中英文可随时切换；所有统计按所选时区计算。

ZIP limit: **512 MiB**. Relevant export JSON: **128 MiB per file**, **512 MiB combined after decompression**. Only recognized export JSON is inflated, sequentially, with actual output limits. Missing/damaged main conversation files are errors; an empty array is valid. Partial shards retain visible warnings. Non-null malformed message nodes are also reported; a main file containing only damaged message data fails.

A saved/exported summary report has a separate **20 MiB import limit**, is validated in full using Zod, and accepts schema versions 1 and 2. Version 1 is migrated with a notice while preserving its original parse-warning count. Summary reports contain no original archive and cannot be filtered again; share cards still work. Reimport the original ZIP/folder to change scope.

**Download report JSON** creates a report within that reopening limit. If necessary, it omits the full conversation ranking and retains a visible notice, main rankings and summary statistics. **Download full data JSON** preserves the complete report; files above 20 MiB cannot be reopened here. Both downloads require a sensitive-content confirmation. If the remaining summary itself exceeds the limit, the reopenable download fails with an explanation instead of producing an unusable file.

## Scope

- IANA timezone; all years, a concrete year, or an inclusive custom date range.
- User messages, user + assistant dialogue, or all roles.
- Current branch (traversing message-free mapping nodes) or all branches; group chats optional.
- Missing/dangling current nodes retain usable history with a warning. Cycles terminate safely.
- All derived statistics and linked attachments, feedback, shares, and group data follow the scope. Undated messages are excluded with a warning when a range is selected.
- Concrete years compare with the previous year using the same scope. Zero baselines produce no infinite percentages.
- Zero months are filled up to 1,200 months. Abnormal spans show active months with a warning; month lists are paginated.
- Enabled group chats participate in conversation totals, timelines, highlights and rankings.
- New reports sort the entire selected conversation ranking, with 25 rows per expanded page. Older or compact summaries explicitly identify when the full ranking is unavailable.
- Overlapping conversation shards merge by conversation ID and retain their combined mapping history. Duplicate/conflicting data produces visible warnings; later usable nodes take precedence, while damaged duplicates cannot replace valid history.
- Missing model metadata remains in an unknown-attribution bucket and is excluded from the known model count and most-used-model selection.

## Privacy and persistence

No backend, analytics, account, uploads or remote fonts. Parsing and calculation run in a retained Web Worker. Recalculation reuses parsed input and calendar conversions for the selected timezone; changing timezone replaces that cache. Keywords are segmented once per message for total, role and month statistics. Statistics progress covers intermediate stages and keyword batches. Cancellation, reset and replacement terminate the worker. Request IDs and worker identity isolate stale results.

Nothing is automatically saved. **Save locally / 保存到本地** explicitly stores the validated summary in this browser under `chatgpt-wrapped.saved-report.v2`. Open and clear are explicit actions; storage failures are visible. Reset removes in-memory data, while clearing the saved report removes the persistent copy.

Ordinary report JSON may include conversation titles, message excerpts, keywords and attachment names; downloading it requires a sensitive-content confirmation. SVG/PNG share cards include summary metrics by default. Keywords and titles require explicit checkboxes; cards never include message excerpts or attachment filenames. SVG content is XML-escaped, illegal XML characters are removed, and Blob URLs are released.

## Development and verification

Node.js 24 recommended.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run build:pages
npx playwright install chromium
npm run test:e2e
```

Browser tests build and serve `/ChatGPT-Wrapped/`, using Chromium desktop and mobile viewports by default. Set `CHROMIUM_PATH` for an installed executable; otherwise Playwright's Chromium is used (Linux `/usr/bin/chromium` is detected). Firefox/WebKit projects require their browsers and `PLAYWRIGHT_ALL_BROWSERS=1`. Their local success must be verified separately; it is not implied by Chromium results. The typecheck command also checks tests and tooling configuration.

Unit tests use synthetic data, including 150,000 messages, corrupt/empty input, ZIP/folder limits, attachment merging, DST, branch cycles/missing nodes, filtering, comparison, schema validation, storage failure and share privacy. Browser checks cover real import/recalculation, cancellation/stale worker responses, persistence, downloads, keyboard focus, responsive layouts and automated accessibility across all fourteen chapters at 320px. GitHub Actions checks Chromium, Firefox and WebKit on branches/PRs. Pages deploys only from `main`, after those checks succeed for the same commit.

Source archives must come from committed files (`git archive`), include newly added modules and tests, and exclude dependencies, caches, real exports and secrets. Archive SHA256 and the corresponding commit are recorded alongside each delivery.

## Annual report presentation

The first report screen is a cream/black/lime data overview. **Enter my annual report / 进入我的年度报告** opens fourteen pages in purple/lime/ink/paper, with live statistics rather than example numbers. Use previous/next buttons, chapter markers, left/right arrows, Page Up/Down, Home/End, or a horizontal swipe. Escape closes the report and returns focus to the opener. Vertical gestures scroll normally. The native modal contains focus; decorative and entrance animations respect `prefers-reduced-motion`.

The story covers message totals, your questions, active hours, weekly rhythm, active streaks, monthly activity, models, longest conversations, message lengths, attachments, keywords, saved conversation states, feedback and sharing. The weekly bars, calendar, monthly skyline, conversation tickets, length ladder, file cards, keepsake and feedback receipt use selected report values. Empty scopes and older summaries remain supported. Titles stay local; attachment filenames and message excerpts are excluded from the story.

See the [fourteen-page design and data mapping](docs/annual-report-14-pages.md).

Complete statistics, warnings and JSON remain available from the report's utility buttons. The final page opens the share-card controls, retaining their default privacy settings. The locally generated card's own preview is independent of the report's page navigation.

Complete statistics mount only when expanded. Long model, category, keyword and warning lists are paginated, retaining all values in the report. The story calendar has a keyboard-accessible daily data table; chapter markers scroll locally on narrow screens without reducing their touch target size.

The frontend review fixes and regression coverage are documented in [review-fixes-2026-10-21.md](docs/review-fixes-2026-10-21.md).
The second review's data-integrity, performance and accessibility changes are documented in [review-fixes-2026-10-22.md](docs/review-fixes-2026-10-22.md).
