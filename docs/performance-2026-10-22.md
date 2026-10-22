# Large-export performance, 2026-10-22

Baseline: `429eedcd6dc29fa02c061257c2e418d764f3ee40`. This work concerns the React/TypeScript frontend only.

## Measurements

The same synthetic export contains 510,000 messages, 5,100 conversations and 25,000 conversation attachments. Its four conversation shards plus supporting JSON contain 136,769,375 uncompressed bytes; the original test ZIP is 11,267,469 bytes. It contains no real conversations or attachment contents.

| Chromium, same fixture and Pages subpath | Baseline | Round 1 | Round 2 | Round 3 |
| ---------------------------------------- | -------: | ------: | ------: | ------: |
| Import, UTC/all years                    |  31.49 s | 15.97 s | 14.22 s | 12.45 s |
| Recalculate, 2025/Asia/Shanghai          |  22.57 s |  9.58 s |  8.07 s |  7.51 s |

Each optimized browser run downloaded both complete reports and compared every field with the baseline reports, excluding only `meta.generated_at`. Counts, all distributions, ranking, keywords, warning lists and the previous-year comparison matched. The Shanghai selection contains 354,100 messages, 3,541 conversations and 17,455 attachments. Timings are individual local runs, not a cross-device guarantee.

A later final-build verification took **24.04 s to import and 118.92 s to recalculate**, also with identical complete reports. During that run, trivial shell commands in the same environment took 5–10 s. This is a material outlier; the observations do not establish its precise cause. The earlier faster runs must not be presented as a guaranteed percentage speedup. The work/retention reductions below are separate evidence, and the slow verification is retained alongside the faster runs.

A subsequent verification of the same build took **26.11 s to import and 11.98 s to recalculate**, again with identical complete reports. This further demonstrates why individual wall-clock runs should be reported with their variability.

Separate Node/V8 probes exercise the actual frontend data modules:

- After parsing and GC, retained normalized-data heap changed from approximately 358 MiB to 223 MiB. This excludes later report/date/text-analysis caches and is not a browser peak-memory measurement.
- A ZIP with a 128 MiB irrelevant stored binary and a two-byte `conversations.json` previously added approximately 256 MiB of ArrayBuffers during reading. Range reading added approximately 128 KiB in the corresponding probe. The input File's own storage is excluded from both deltas.
- Twenty partial shards for one conversation with 20,000 unique message attachments now insert 20,000 attachment records, instead of 210,000 repeated records.
- A 20,000-conversation probe now performs one conversation-sized sort, compared with ten conversation-sized and four message-sized sorts before. The complete conversation ranking remains available.
- The 200,000-term partial-ranking probe returns exactly the same top 50 as a full stable sort, including lexical ties.

The 100,000-entry irrelevant-directory probe still takes about 2.45 s to enumerate and 0.12 s to parse in Node. Reading central-directory metadata remains proportional to the number of archive entries. The new ZIP reader trades some directory-enumeration CPU for avoiding whole-archive binary copies.

## Changes

1. ZIP imports use `BlobReader` range access. They enumerate metadata first, then inflate and parse one relevant JSON shard at a time. They retain neither all decoded JSON strings nor an ArrayBuffer of the whole ZIP. Actual inflated bytes are checked in a streaming sink before decoding, including bytes from subsequently invalid JSON. Per-file and cumulative limit failures abort the import. CRC failures in partial shards remain visible warnings when usable main data exists.
2. Normalization releases original message/content/metadata graphs. Branch selection retains a compact parent mapping, including message-free and invalid nodes. Overlapping shards process only new or changed nodes; replacement messages discard obsolete IDs and attachments while damaged replacements preserve usable history.
3. Scalar text features are calculated once per immutable message and reused across scope and timezone changes. Chinese phrase segmentation uses an LRU with a 4 MiB estimated payload budget, at most 4,096 entries, and an individual-entry cap. Long or unique phrases still receive complete analysis; only caching is skipped. Technical terms, stopwords and the compatibility fallback retain their semantics.
4. Statistics use small message wrappers, cached calendar-day keys and available-year lists. Timeline metrics update each bucket once per message. Asset timelines share an index containing only referenced messages. Previous-year overview calculation and general overview aggregation avoid large intermediate message arrays.
5. Exact stable partial ranking replaces full sorts used only to select a few results. Quality and highlight sections reuse computed rankings and longest-message lists. Full ranking, counts and exported statistics are retained.
6. Path normalization no longer allocates a split-path array and copied entry object for every file. The parser orders only relevant JSON while preserving source-file inventory/counts. JSZip is a development dependency used for synthetic fixtures; production uses zip.js.

## Verification and reproduction

`tests/performance.test.ts` covers lazy range reads, actual output limits, aborts, chunked UTF-8, compact branch history, changed message/attachment replacement, stable ranking ties and bounded-cache correctness. Existing regression tests exercise the production streaming sink. Browser fixtures now use DEFLATE; a mixed STORE/DEFLATE test also verifies partial CRC failure and visible warnings.

Run the normal checks:

```sh
npm ci
npm run typecheck
npm test
npm run build:pages
npm run test:e2e
```

The suite contains 133 data tests and 55 browser cases per project. Local browser verification uses Chromium desktop and mobile; CI additionally runs Firefox and WebKit. Pages deployment waits for all browser projects. Firefox/WebKit results must be read from CI, not inferred from the local Chromium run.

Generate the same message/content distribution and expected-count manifest:

```sh
node scripts/generate-large-export.mjs /tmp/chatgpt-wrapped-synthetic
```

Import the generated `synthetic-510000-messages.zip`, then select 2025 and `Asia/Shanghai` and recalculate. The manifest's yearly counts are UTC; timezone changes can shift boundary-day messages. Generated files belong outside the source repository and source ZIP.

The application still retains normalized message text for local recalculation. It parses each individual JSON file in full; it does not stream arbitrary JSON records. The 512 MiB ZIP/total JSON and 128 MiB per-data-JSON limits are input limits, not RAM guarantees. Report JSON import retains its separate 20 MiB limit. Worker cancellation, stale-response isolation, privacy choices and complete accessible statistics remain in place.
