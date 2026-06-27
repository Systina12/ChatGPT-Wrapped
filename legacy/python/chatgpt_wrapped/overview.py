from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def compute_overview(db_path: str | Path) -> dict[str, Any]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conversation_count = _scalar(
            conn,
            "select count(*) from conversations where source = 'conversation'",
        )
        user_message_count = _scalar(
            conn,
            "select count(*) from messages where role = 'user'",
        )
        assistant_message_count = _scalar(
            conn,
            "select count(*) from messages where role = 'assistant'",
        )
        user_character_count = _character_count(conn, "user")
        assistant_character_count = _character_count(conn, "assistant")
        first_seen_at, last_seen_at, known_days = _known_period(conn)
        asset_counts = _asset_counts(conn)

    return {
        "conversation_count": conversation_count,
        "user_message_count": user_message_count,
        "assistant_message_count": assistant_message_count,
        "image_count": asset_counts["image"],
        "file_count": asset_counts["file"],
        "voice_count": asset_counts["voice"],
        "user_character_count": user_character_count,
        "assistant_character_count": assistant_character_count,
        "total_character_count": user_character_count + assistant_character_count,
        "first_seen_at": first_seen_at.isoformat() if first_seen_at else None,
        "last_seen_at": last_seen_at.isoformat() if last_seen_at else None,
        "known_days": known_days,
    }


def _scalar(conn: sqlite3.Connection, sql: str) -> int:
    return int(conn.execute(sql).fetchone()[0])


def _character_count(conn: sqlite3.Connection, role: str) -> int:
    total = 0
    for row in conn.execute("select text from messages where role = ?", (role,)):
        text = row[0]
        if isinstance(text, str):
            total += len(re.sub(r"\s+", "", text))
    return total


def _known_period(conn: sqlite3.Connection) -> tuple[datetime | None, datetime | None, int | None]:
    instants: list[datetime] = []
    for row in conn.execute(
        """
        select create_time, update_time, create_time_text, update_time_text
        from conversations
        union all
        select create_time, update_time, create_time_text, update_time_text
        from messages
        """
    ):
        for value in row:
            instant = _to_datetime(value)
            if instant:
                instants.append(instant)

    if not instants:
        return None, None, None

    first = min(instants)
    last = max(instants)
    known_days = (last.date() - first.date()).days + 1
    return first, last, known_days


def _to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


def _asset_counts(conn: sqlite3.Connection) -> dict[str, int]:
    seen: dict[str, set[str]] = {"image": set(), "voice": set(), "file": set()}
    for row in conn.execute(
        """
        select local_path, display_name, mime_type, file_extension, source, message_id
        from assets
        """
    ):
        if row["source"] == "library_file":
            continue
        local_path = row["local_path"]
        if not local_path:
            continue
        category = _asset_category(
            mime_type=row["mime_type"],
            file_extension=row["file_extension"],
            display_name=row["display_name"],
            local_path=local_path,
        )
        if category not in seen:
            continue
        identity = _asset_identity(row)
        seen[category].add(identity)

    return {category: len(values) for category, values in seen.items()}


def _asset_identity(row: sqlite3.Row) -> str:
    local_path = row["local_path"]
    source = row["source"]
    message_id = row["message_id"]
    if source == "library_file":
        return f"library:{local_path}"
    if message_id:
        return f"message:{message_id}:{local_path}"
    return f"asset:{local_path}"


def _asset_category(
    *,
    mime_type: str | None,
    file_extension: str | None,
    display_name: str | None,
    local_path: str,
) -> str:
    mime = (mime_type or "").lower()
    suffixes = {
        _extension(file_extension),
        _path_suffix(display_name),
        _path_suffix(local_path),
    }
    suffixes.discard("")

    if mime.startswith("image/") or suffixes & {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "heic"}:
        return "image"
    if mime.startswith("audio/") or suffixes & {"mp3", "m4a", "wav", "ogg", "opus", "flac", "aac"}:
        return "voice"
    if mime.startswith("video/") or suffixes & {"mp4", "mov", "webm", "mkv"}:
        return "file"
    return "file"


def _extension(value: str | None) -> str:
    if not value:
        return ""
    return value.lower().lstrip(".")


def _path_suffix(value: str | None) -> str:
    if not value or "." not in value:
        return ""
    return value.rsplit(".", 1)[-1].lower()
