# Performance compatibility requirements

The user's standing requirement is to preserve all existing frontend behavior during performance work. Scope is the React + TypeScript + Vite application; legacy Python application work is excluded.

- Treat commit `429eedcd6dc29fa02c061257c2e418d764f3ee40` as the pinned pre-optimization report baseline. `tests/compatibility/baseline-v2.json` was generated from that committed source, with synthetic fixtures and a fixed clock.
- Performance changes must preserve complete report fields, counts, dates, warnings, stable array/tie order, options, schema compatibility, limits, errors, privacy defaults and existing user flows. Do not sample, silently truncate or omit data to obtain a benchmark gain.
- Run `npm run test:compatibility`, `npm run typecheck`, `npm test` and the required browser checks. Existing CI checks all three browser engines and gates Pages deployment. Validate large-data changes with the synthetic 510,000-message fixture and full report comparisons.
- Do not regenerate or relax the baseline, delete assertions, mask fields, reorder arrays or increase limits to silence a performance regression. A failure blocks the optimization until it preserves the contract; an explicitly authorized feature change must be separate and documented.
- Keep functional fixes separate from performance-only changes. Previously authorized functional corrections, including special-ID association, remain separately protected by existing regression tests; they are not performance benefits.
- Measure the affected path before and after under comparable conditions. Report scope, variability, memory/CPU tradeoffs and slower cases. Test success is evidence within its coverage, not proof for every possible input.

The user has authorized ordinary implementation, verification, commits and synchronization to `main`; these requirements do not add a confirmation step.

On 2026-10-27 the user explicitly superseded the original fixed raw-export import limits. Normal ZIP/folder imports must not reject archives, individual export JSON files or their combined size at the old 512/128/512 MiB thresholds. Keep selective lazy reads, sequential JSON processing, cancellation, CRC and size-consistency validation. Optional explicit caller budgets remain testable. The separate 20 MiB summary-report import limit is unchanged. This authorized input-policy change must not be disguised as a performance optimization or used to rewrite the pinned report baseline.
