# Long-message and report-JSON performance, 2026-10-22

Baseline: `3f2bcc59ee4cf7954f44b6c157aacbf93a4102ec`. This continues the earlier [large-export work](performance-2026-10-22.md), using synthetic data only.

## Changes

- Message previews collect only the normalized prefix needed for display. They preserve whitespace normalization, UTF-16 truncation and existing output, while avoiding a full normalized copy of a multi-megabyte message. Tiny preview strings no longer retain that large temporary parent string.
- Messages longer than 4,096 UTF-16 units expose a token iterator instead of constructing a complete token array. Repeated terms are counted in a bounded batch. After 2,048 distinct terms, counting switches to direct updates; every subsequent term is still counted. Short messages keep a small eager array and avoid batch maps/callbacks in the report's hot path.
- Chinese segmentation retains `Intl.Segmenter`, technical terms, stopwords and the compatibility fallback. Technical-term replacement avoids split arrays. CJK runs use the same character ranges as before, without regex match objects or a transformed message retained as the regex's last input. Cache entries own detached string keys and values; LRU hits reuse those owned keys. Both the estimated 4 MiB/4,096-entry cache budget and the individual-entry budget remain in place.
- UTF-8 size checks use safe length bounds and, when needed, a reusable 24 KiB encoding buffer. Chunk boundaries preserve surrogate pairs, and lone-surrogate handling matches Blob/TextEncoder. Report import and reopenable-export limits remain exactly 20 MiB. Size preflight no longer allocates a whole-report Blob just to read its size.
- A conservative lower bound identifies rankings that alone exceed the reopening limit. Those exports immediately create the same compact report as before, without first serializing the enormous ranking. When the bound fits, native JSON serialization and exact UTF-8 checking remain authoritative. Full-data JSON export continues to include the complete ranking, and the source report is never mutated.

## Paired probes

The Node 24 probes import frozen baseline modules and current modules in the same process. Inputs for retained-string measurements are flattened before the initial GC. Results remain live across GC. Token creation and consumption are timed separately: constructing an iterator is not equivalent to completing token analysis, and its creation-time memory is not the overall analysis peak.

| Probe                                                          |   Baseline |                               Optimized |
| -------------------------------------------------------------- | ---------: | --------------------------------------: |
| 10 previews, each input about 4.5 million UTF-16 units         |  640.89 ms |                                 1.33 ms |
| Additional retained heap for those previews                    |  37.19 MiB |                                4.03 KiB |
| Retained token-creation heap, 900,000 tokens                   |  22.73 MiB | 1.90 KiB (iterator, before consumption) |
| Complete report with a 4.2-million-unit mixed-language message |  648.13 ms |                               503.97 ms |
| Reopenable export, 60,000 long-title ranking rows              |  411.75 ms |                                14.79 ms |
| Retained Chinese cache backing, 20 large inputs / 10 phrases   |  45.81 MiB |                               26.88 KiB |
| Chinese cache probe elapsed time                               |  504.82 ms |                               586.92 ms |
| Guard: 100,000 short messages                                  | 1189.73 ms |                              1103.72 ms |
| Guard: 50,000 distinct terms in one message                    |  117.49 ms |                               121.82 ms |

The mostly-ASCII cache-isolation probe trades some scanning/detachment CPU for bounded retained backing storage; its slower elapsed time is included rather than hidden. The ordinary-message and vocabulary guards showed no material slowdown in these paired runs.

All paired output checks passed: preview strings, token frequencies, complete statistics (except generation time), compact JSON text and UTF-8 size decisions. The cache-retention probe includes both initial cache admission and LRU hits on different large backing strings. Microbenchmarks describe those specific paths; they do not establish a fixed whole-import speedup or browser RAM limit.

The 510,000-message Chromium fixture also produced complete reports equal to the retained pre-optimization snapshots. One run measured 11.82 s import and 9.06 s recalculation. The earlier [timing-variability notes](performance-2026-10-22.md) still apply.

## Verification

`tests/long-text.test.ts` covers preview equivalence, whitespace and surrogate boundaries, eager/streaming thresholds, complete repeated/high-cardinality term counts, exact CJK ranges and fallback segmentation, randomized UTF-8 size comparisons, Unicode-heavy oversized exports and large rankings that still fit. A browser case exercises long-message ZIP import, role filtering, exact keyword counts, preview text and downloaded JSON.

```sh
npm run typecheck
npm test
npm run build:pages
npm run test:e2e
```

The suite contains 141 data cases and 56 browser cases per project: Chromium desktop/mobile locally, with Firefox and WebKit additionally checked by CI. All three browser engines gate Pages deployment. The existing synthetic large-export generator remains available:

```sh
node scripts/generate-large-export.mjs /tmp/chatgpt-wrapped-synthetic
```

Individual data JSON files and imported report JSON are still parsed in full. Summary parsing/Zod validation and explicitly requested full JSON serialization can still occupy the main thread; this work reduces their size-check allocations rather than making those operations asynchronous. Keyword frequency maps still scale with unique vocabulary, and normalized message text remains available for local recalculation. No statistics are sampled or silently truncated.
