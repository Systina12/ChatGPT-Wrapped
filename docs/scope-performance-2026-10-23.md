# Scope and aggregate allocation, 2026-10-23

Baseline: `8967f09190e431e8b03576ad9ae2d67ccd849fc8`. This continues the frontend-only [large-export](performance-2026-10-22.md) and [long-message](long-message-performance-2026-10-22.md) work. All measurements use synthetic data.

## Changes

- Scope filtering collects selected conversation IDs during its existing message traversal. It no longer creates message-sized mapped arrays, a composite-string message-key set and an unconditional global message-ID set.
- The attachment/feedback/library join indexes the smaller side: referenced IDs when related records are sparse, or selected messages when a narrow selection has many historical references. Conversation-only records use the selected-conversation set. Unscoped references still match a selected message ID in any conversation. Duplicate related records remain present; only lookup keys are shared. With no message references, the message-ID index is omitted entirely.
- Scope joins and attachment-time lookups use nested maps for exact conversation/message pairs. This avoids composite-key allocation and fixes collisions when IDs themselves contain the previous delimiter. Attachment timeline and monthly statistics reuse one index, populated only for referenced messages.
- Message-length distributions, character totals and punctuation/code/URL counters update in one traversal. Longest-message selection consumes role iterators rather than retaining user/assistant message arrays. Model aggregation also skips the intermediate assistant array. All distributions, role semantics, stable ranking ties and full output remain available.

The join's auxiliary ID storage scales with the smaller of selected messages and eligible message references, plus selected conversations. This describes the join, not total application memory: normalized messages, date/text caches, vocabulary maps and report data still consume memory.

## Paired measurements

Node 24, three samples per variant; table values are medians. The no-reference and sparse-reference inputs contain 500,000 messages in 5,000 conversations; the sparse case has 5,000 feedback rows. The dense case has 150,000 messages and feedback rows. The narrow case places all 150,000 messages/references in one conversation and selects a single UTC day.

| Scope probe | Baseline | Optimized |
| --- | ---: | ---: |
| 500,000 messages, no message references | 678.39 ms | 216.18 ms |
| Live heap delta at the measurement boundary | 50.25 MiB | 5.84 MiB |
| 500,000 messages, sparse references | 833.42 ms | 251.93 ms |
| 150,000 messages, dense references | 219.52 ms | 207.01 ms |
| Dense-reference live heap delta | 17.43 MiB | 7.94 MiB |
| Single-day selection from dense history | 64.00 ms | 68.61 ms |
| Single-day live heap delta | 15.79 KiB | 15.12 KiB |

No-reference live-heap deltas were consistent across the three samples. The baseline sparse-reference heap samples varied from 5.22 to 50.24 MiB, while the optimized samples ranged from 6.47 to 6.53 MiB. The single-day case retains small indexes in both implementations; its additional reference-counting pass trades a few milliseconds for avoiding a reference-sized index. These observations do not establish a fixed speedup for every shape.

Complete-statistics probes use 150,000 messages with short repeated text, mixed lengths/roles, or 15,000 attachments. Both implementations are warmed before measurements, and their execution order alternates. Every complete report matches, excluding generation time.

| Complete statistics | Baseline median (range) | Optimized median (range) |
| --- | ---: | ---: |
| Short repeated messages | 1031.01 ms (987.09–1076.45) | 1034.95 ms (997.79–1598.10) |
| Mixed lengths and roles | 1132.28 ms (1120.03–1283.59) | 1150.21 ms (1095.78–1284.78) |
| Attachment-heavy input | 1257.42 ms (1156.67–1299.97) | 1195.94 ms (1191.79–1756.73) |

The aggregate changes remove role-sized temporary arrays; these whole-build timings do not show a consistent overall CPU improvement. An earlier exploratory mixed-length run also had a slower optimized median, 1587.59 ms versus 1143.18 ms. The final warmed/alternating results and their outliers are retained rather than substituting a guaranteed speedup claim. The repeatable scope allocation reduction is the main benefit.

## Verification

The suite contains 151 data cases and 56 browser cases per project. New cases cover both sparse/dense reference paths, duplicate feedback, repeated message IDs across conversations, scoped versus unscoped references, missing targets, orphan messages, recalculation, delimiter-containing IDs and attachment dates. Message-statistics tests cover all length boundaries, roles outside user/assistant, stable ties and empty-role ratios.

```sh
npm run typecheck
npm test
npm run build:pages
npm run test:e2e
node scripts/generate-large-export.mjs /tmp/chatgpt-wrapped-synthetic
```

The paired probes import frozen baseline modules and current modules in the same Node process, with prefilled UTC date caches. Scope outputs are checked for identical selected message objects/order and identical associated data. Complete report comparisons ignore only generation time. The ID-collision fixtures intentionally have corrected output.

Scope memory observations force GC at the asset-filter boundary. They are instrumented live-heap snapshots at that boundary, including selected arrays/conversation copies; they are not browser peak-memory measurements or a RAM guarantee. Timings exclude the GC injected by that instrument. Complete-build measurements warm both implementations and alternate their execution order. Individual wall-clock results can vary, as recorded in the earlier performance notes.

Parsing still processes each individual JSON file in full. Original normalized text remains available for local recalculation. Input limits, report reopening limits, cancellation, worker identity checks and privacy choices are unchanged.
