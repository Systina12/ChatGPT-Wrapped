# ChatGPT-Wrapped

Build a local ChatGPT Wrapped from official OpenAI ChatGPT exports.

This project is now a pure frontend React app. The export is parsed in the browser, statistics are computed on the user's device, and no backend or upload service is required.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL, then choose either:

- a ChatGPT export `.zip`
- an extracted ChatGPT export folder

The app generates a `WrappedData` JSON object with overview, timeline, activity, conversation, message, model, asset, language, frequent-word, quality, and highlight statistics.

## Build

```bash
npm run build
```

## Project Structure

- `src/lib/export/`: browser-side file loading and ChatGPT export parsing
- `src/lib/stats/`: statistics builder for report-ready wrapped data
- `src/workers/`: Web Worker entry for parsing and computation
- `src/types/`: export and wrapped-data types
- `docs/export-data-schema.md`: generic notes about official export files
- `legacy/python/`: previous Python parser and tests, kept as a migration reference

## Local Data

Keep real exports and generated output under ignored paths such as `data/` or `workspace/`.
