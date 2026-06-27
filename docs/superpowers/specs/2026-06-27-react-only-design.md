# React-Only ChatGPT Wrapped Design

## Goal

Turn ChatGPT-Wrapped into a pure frontend React application. Users provide their official ChatGPT export in the browser, and all parsing, counting, and report-data generation happens locally on the user's device.

## Architecture

The root project is a Vite + React + TypeScript app. The old Python parser remains under `legacy/python/` as a reference implementation until the TypeScript parser reaches parity.

The browser app has four layers:

- `src/lib/export`: reads zip or folder uploads and normalizes official export files into an in-memory model.
- `src/lib/stats`: computes the wrapped statistics from the normalized model.
- `src/workers`: runs parsing and statistics off the main thread.
- `src/App.tsx`: minimal upload, progress, summary, preview, and download UI.

## Data Scope

The TypeScript parser handles the same useful export inputs as the Python version:

- `conversations.json` and `conversations-*.json`
- `conversation_asset_file_names.json`
- `library_files.json`
- `message_feedback.json`
- `shared_conversations.json`
- `group_chats.json`
- `user.json`
- `user_settings.json`
- `export_manifest.json`

The generated `WrappedData` keeps the existing top-level shape: `meta`, `overview`, `timeline`, `activity`, `conversations`, `messages`, `models`, `assets`, `language`, `frequent_words`, `quality`, and `highlights`.

## Non-Goals

This refactor does not build the final visual report yet. It also avoids clustering, LLM analysis, badges, or privacy-focused redaction features.

