from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from .overview import compute_overview
from .parser import parse_export
from .stats import build_web_data
from .stats.builder import write_web_data


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

    inspect_parser = subparsers.add_parser("inspect", help="show parser table counts")
    inspect_parser.add_argument("db_path", type=Path)

    overview_parser = subparsers.add_parser("overview", help="compute overview metrics")
    overview_parser.add_argument("db_path", type=Path)

    export_parser = subparsers.add_parser("export-data", help="write Web-ready wrapped data JSON")
    export_parser.add_argument("db_path", type=Path)
    export_parser.add_argument("--out", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "parse":
        result = parse_export(args.export_dir, args.out)
        _print_json({"db_path": str(result.db_path), "counts": result.counts})
        return 0
    if args.command == "inspect":
        _print_json({"db_path": str(args.db_path), "counts": _inspect(args.db_path)})
        return 0
    if args.command == "overview":
        _print_json(compute_overview(args.db_path))
        return 0
    if args.command == "export-data":
        data = write_web_data(args.db_path, args.out)
        _print_json({
            "out": str(args.out),
            "top_level_keys": list(data.keys()),
            "table_counts": data["meta"]["table_counts"],
        })
        return 0
    return 2


def _inspect(db_path: Path) -> dict[str, int]:
    with sqlite3.connect(db_path) as conn:
        return {
            table: conn.execute(f"select count(*) from {table}").fetchone()[0]
            for table in TABLES
        }


def _print_json(value: object) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))
