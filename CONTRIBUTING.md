# Development

Use Node.js 24 and install dependencies with `npm ci`.

```sh
npm run typecheck
npm test
npm run test:compatibility
npx playwright install chromium
npm run test:e2e
npm run build:pages
```

Browser tests build a fresh preview at `/ChatGPT-Wrapped/`. Stop any preview on port 4173 first. Chromium desktop and mobile run by default; set `CHROMIUM_PATH` for a custom binary. Firefox/WebKit require their browsers and `PLAYWRIGHT_ALL_BROWSERS=1`. CI checks all three engines before deploying `main` to Pages. A Chromium result does not imply local Firefox/WebKit success.

Keep synthetic fixtures free of real chat exports. Performance changes must preserve complete reports, ordering, privacy, cancellation and all supported user flows. Follow [the compatibility contract](docs/performance-compatibility.md); do not regenerate its frozen baseline to hide a regression. User-authorized functional changes need their own regression coverage.

Source archives must use committed files, include new modules and exclude dependencies, caches, real exports and credentials. `scripts/archive-source.py` verifies the archive and records its commit and SHA256.

Historical reconstruction, reviews and performance measurements remain in `docs/`. They are engineering records, not product documentation or guarantees for every input.
