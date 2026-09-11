# ChatGPT-Wrapped

Build a personal ChatGPT report from an official OpenAI export — entirely in your browser.

ChatGPT-Wrapped reads the export locally, computes the statistics in a Web Worker, and presents a visual report without a backend or upload service. Your conversations stay on your device.

## What it shows

- Conversation, message, character, asset, and date-span totals
- Monthly message rhythm and hourly activity
- Most-used assistant models
- Language buckets and time-of-day patterns
- Longest conversations and frequently repeated words
- Parse warnings and the complete raw `WrappedData` JSON

The generated report is available immediately in the page, and the normalized JSON can be downloaded for further analysis.

## Run locally

```bash
npm ci
npm run dev
```

Open the Vite URL, then choose either:

- a ChatGPT export `.zip`
- an extracted ChatGPT export folder

## Build

```bash
npm run typecheck
npm run build
```

## Privacy

The app has no backend, analytics, account system, or upload endpoint. The selected files are passed to a local Web Worker for parsing and statistics. Nothing is sent to OpenAI or any other service.

## Project structure

- `src/lib/export/`: browser-side file loading and ChatGPT export parsing
- `src/lib/stats/`: statistics builder for report-ready wrapped data
- `src/workers/`: Web Worker entry for parsing and computation
- `src/types/`: export and wrapped-data types
- `docs/export-data-schema.md`: notes about official export files
- `legacy/python/`: previous Python parser and tests, kept as a migration reference

