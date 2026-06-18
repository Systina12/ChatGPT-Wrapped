from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from .parser import parse_export


TABLES = (
    "source_files",
    "metadata",
    "conversations",
    "messages",
    "assets",
    "asset_name_map",
    "library_files",
    "feedback",
    "shares",
    "group_chats",
    "users",
    "settings",
    "parse_warnings",
)


def main() -> int:
    parser = argparse.ArgumentParser(prog="chatgpt_wrapped")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse", help="parse a ChatGPT export directory into SQLite")
    parse_parser.add_argument("export_dir", type=Path)
    parse_parser.add_argument("--out", type=Path, required=True)

    inspect_parser = subparsers.add_parser("inspect", help="show parser table counts without printing content")
    inspect_parser.add_argument("db_path", type=Path)

    args = parser.parse_args()
    if args.command == "parse":
        result = parse_export(args.export_dir, args.out)
        print(json.dumps({"db_path": str(result.db_path), "counts": result.counts}, indent=2, sort_keys=True))
        return 0
    if args.command == "inspect":
        print(json.dumps({"db_path": str(args.db_path), "counts": _inspect(args.db_path)}, indent=2, sort_keys=True))
        return 0
    return 2


def _inspect(db_path: Path) -> dict[str, int]:
    with sqlite3.connect(db_path) as conn:
        return {
            table: conn.execute(f"select count(*) from {table}").fetchone()[0]
            for table in TABLES
        }


if __name__ == "__main__":
    raise SystemExit(main())
