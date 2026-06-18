# ChatGPT-Wrapped
Build your own ChatGPT Wrapped from OpenAI exports.

## Parser

Parse a ChatGPT export directory into a local SQLite database:

```bash
python3 -m chatgpt_wrapped parse data/<export-directory> --out workspace/export.sqlite
```

Inspect parser table counts without printing message content:

```bash
python3 -m chatgpt_wrapped inspect workspace/export.sqlite
```

Parser outputs may contain private export data. Keep them under `workspace/` or another ignored path.
