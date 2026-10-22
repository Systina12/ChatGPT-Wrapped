#!/usr/bin/env python3
"""Archive the committed frontend, verify its inventory, and record provenance."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--commit", default="HEAD")
parser.add_argument("--require-annual", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
commit = subprocess.check_output(["git", "rev-parse", args.commit], cwd=root, text=True).strip()
excluded = ["legacy", "data", "node_modules", "dist", "test-results", "playwright-report", ".env*", "*.zip", "*.pem", "*.key", "*.tsbuildinfo"]
command = ["git", "archive", "--format=zip", commit, "."] + [f":(exclude){path}" for path in excluded]
content = subprocess.check_output(command, cwd=root)
required = {"src/lib/report/engine.ts", "src/lib/report/restore.ts", "src/lib/report/storage.ts", "src/lib/report/i18n.tsx", "src/lib/report/share.ts", "src/lib/stats/scope.ts", "src/types/options.ts", "src/components/report/ReportControls.tsx", "src/components/report/ShareCard.tsx", "src/styles/features.css", "tests/data.test.ts", "tests/features.test.ts", "tests/import.spec.ts", "tests/features.spec.ts", "playwright.config.ts", ".github/workflows/checks.yml", "package-lock.json"}
if args.require_annual:
    required.update({"src/components/report/ActivityCalendar.tsx", "src/components/report/PagedList.tsx", "src/lib/stats/calendarCache.ts", "tests/second-review.test.ts", "tests/second-review.spec.ts", "tsconfig.checks.json", "docs/review-fixes-2026-10-22.md"})
    required.update({"src/components/report/AnnualReport.tsx", "src/components/ui/CuriosityMark.tsx", "src/styles/annual.css", "tests/annual.spec.ts"})
    required.update({"src/components/report/AnnualChapterDetails.tsx", "src/components/report/annualChapters.ts", "src/styles/annual-chapters.css", "docs/annual-report-14-pages.md"})
with ZipFile(io.BytesIO(content)) as archive:
    names = set(archive.namelist())
    missing = required - names
    if missing:
        raise SystemExit(f"Missing source files: {sorted(missing)}")
    if archive.testzip() is not None:
        raise SystemExit("ZIP integrity check failed")
    for name in names:
        parts = Path(name).parts
        if any(part in {".git", "node_modules", "data", "dist", "test-results", "playwright-report", "__pycache__", ".aws", ".codex"} for part in parts):
            raise SystemExit(f"Excluded content detected: {name}")
        if Path(name).name.startswith(".env") or Path(name).suffix in {".pem", ".key", ".tsbuildinfo"}:
            raise SystemExit(f"Sensitive/cache file detected: {name}")
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_bytes(content)
digest = hashlib.sha256(content).hexdigest()
manifest = {"commit": commit, "archive": args.output.name, "sha256": digest, "bytes": len(content), "files": len([name for name in names if not name.endswith("/")]), "required_files_verified": sorted(required), "excluded": excluded}
args.output.with_suffix(".manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
args.output.with_suffix(".sha256").write_text(f"{digest}  {args.output.name}\n")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
