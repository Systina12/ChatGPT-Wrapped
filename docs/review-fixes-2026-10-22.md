# Second frontend review fixes — 2026-10-22

Baseline: `21cacb3a2fed85a20200dc35b9888bf330ee594e`. This change addresses the eleven reproduced findings from the second frontend review and its performance, accessibility and release recommendations. No retired Python application code is involved.

## Data integrity

- MIME extension lookup only reads own dictionary properties. Attachments ending in `.constructor`, `.__proto__` or `.toString` remain ordinary files instead of aborting report generation.
- Dynamic report records validate every own key/value before reconstruction. A feedback key named `__proto__` survives JSON and local-storage round trips; strings, negative values and non-finite numbers under that key fail validation.
- Reopenable JSON exports use compact serialization and preflight the actual 20 MiB limit. Oversized reports omit the optional full conversation ranking, retain summary statistics and principal rankings, and include a visible warning. If that still exceeds the limit, export fails clearly. A separate full-data download preserves every field and warns that oversized files cannot be reopened here. Source reports are never mutated by compaction.
- Overlapping conversation shards merge by ID, retain the union of mapping nodes, and produce duplicate/conflict warnings. Later usable node records take precedence; damaged or empty duplicates cannot replace valid messages. Fallback IDs include the source path to distinguish same-named files in separate folders.
- Dormant dates cannot block fixed-year/all-year filtering. Custom ranges still require real, ordered dates; non-custom options normalize the unused range to empty strings.
- Unknown model attribution is retained for complete statistics but excluded from known-model counts and most-used-model selection. The story discloses missing metadata.
- Extensionless names such as `png` and `mp3` are ordinary files unless explicit MIME/content/extension metadata identifies media.
- Warnings added during month normalization update both metadata warning counters.

## Calculation and rendering

- A worker-owned, timezone-specific WeakMap reuses parsed message dates and calendar conversions across filtering, statistics, available years and recalculation. A new import or timezone replaces the cache.
- Each message is segmented once for all, role and monthly keyword totals. The comparison year computes its overview instead of generating an unused full report. Conversation aggregates are reused within a build.
- Statistics progress reports intermediate stages and keyword batches. Parsing totals include only relevant planned JSON reads; duplicate optional files warn and consistently select the first path.
- Complete statistics and ranking sorting are deferred until expansion. Model charts, count maps, keywords and warnings are paginated, without deleting values from the underlying report. Number formatters are cached with a bounded cache.

## Accessibility and mobile

- The visual calendar has a valid image summary and an adjacent keyboard-accessible daily table. Decorative day tiles no longer carry invalid ARIA labels.
- Chapter targets have a 28px minimum width and a 32px height. Narrow chapter navigation scrolls locally and follows the selected chapter instead of squeezing fourteen targets into one row.
- Ticket rank text has full opacity and a larger mobile size. Weekly value labels are also enlarged.
- Browser regression coverage includes axe-core checks for the overview and all fourteen chapters at 320px, plus actual calendar-table and long-list interaction.

## Verification and publication

`npm run typecheck` checks application code, tests and tooling configuration. Targeted regression tests cover report lifecycle, overlapping shards, reserved keys, large exports, date-mode switching, model attribution, progress, caching and lazy/paginated rendering.

The reusable checks workflow runs Chromium desktop/mobile, Firefox and WebKit projects. The main-branch Pages workflow depends on these checks for the same commit before building and deploying. Branch/PR checks remain available; no manual approval is introduced.

All fixtures are synthetic. Local Chromium, remote browser-matrix results and large-data timings must be recorded separately in delivery evidence. Adding a browser project does not establish that it has passed, and this document does not claim local Firefox/WebKit success.

The local large-data spot check imported 510,000 messages across 5,100 conversations with 25,000 attachments, then recalculated 2025 in Asia/Shanghai. Totals matched the fixture, with no browser errors. Observed import/recalculation times were 31.49s / 22.57s. A separate 10,000-message probe reduced segmentation calls from 30,000 to 10,000 and calendar formatting calls from 40,003 to 10,003. Timings are single-machine observations, not guaranteed performance or a controlled benchmark. Screenshot inspection led to compact localized weekly labels; precise values remain in accessible names and full statistics.
