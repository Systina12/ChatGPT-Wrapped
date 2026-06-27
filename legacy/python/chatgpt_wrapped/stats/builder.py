from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from chatgpt_wrapped.overview import compute_overview
from chatgpt_wrapped.text import (
    code_block_count,
    excerpt,
    frequent_terms,
    language_bucket,
    language_counts,
    punctuation_counts,
    url_count,
    visible_char_count,
)
from chatgpt_wrapped.timeutils import (
    day_key,
    day_period,
    hour_key,
    iso_or_none,
    longest_gap,
    longest_streak,
    month_key,
    to_datetime,
    weekday_key,
    year_key,
)


TOP_N = 20


def build_web_data(db_path: str | Path) -> dict[str, Any]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conversations = _load_conversations(conn)
        messages = _load_messages(conn)
        assets = _load_assets(conn)
        feedback = _load_feedback(conn)
        shares = _load_shares(conn)
        table_counts = _table_counts(conn)
        warning_count = table_counts.get("parse_warnings", 0)

    context = {
        "conversations": conversations,
        "messages": messages,
        "assets": assets,
        "feedback": feedback,
        "shares": shares,
    }

    return {
        "meta": _meta(table_counts, warning_count),
        "overview": compute_overview(db_path),
        "timeline": _timeline(context),
        "activity": _activity(messages),
        "conversations": _conversation_stats(context),
        "messages": _message_stats(messages),
        "models": _model_stats(messages),
        "assets": _asset_stats(context),
        "language": _language_stats(messages),
        "frequent_words": _frequent_words(messages),
        "quality": _quality_stats(context),
        "highlights": _highlights(context),
    }


def _load_conversations(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in conn.execute(
            """
            select id, conversation_id, source, title, create_time, update_time,
                   create_time_text, update_time_text, current_node, default_model_slug,
                   is_archived, is_starred, is_shared
            from conversations
            """
        )
    ]


def _load_messages(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = []
    for row in conn.execute(
        """
        select message_id, conversation_id, source, role, content_type, text,
               create_time, update_time, create_time_text, update_time_text, model_slug
        from messages
        """
    ):
        item = dict(row)
        item["character_count"] = visible_char_count(item.get("text"))
        item["created_at"] = _first_datetime(item, "create_time", "create_time_text")
        rows.append(item)
    return rows


def _load_assets(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = []
    for row in conn.execute(
        """
        select source, local_path, display_name, mime_type, file_extension, size_bytes,
               width, height, conversation_id, message_id
        from assets
        """
    ):
        item = dict(row)
        item["category"] = _asset_category(item)
        rows.append(item)
    return rows


def _load_feedback(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute("select * from feedback")]


def _load_shares(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute("select * from shares")]


def _table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    tables = (
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
    return {table: int(conn.execute(f"select count(*) from {table}").fetchone()[0]) for table in tables}


def _meta(table_counts: dict[str, int], warning_count: int) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": 1,
        "table_counts": table_counts,
        "parse_warning_count": warning_count,
    }


def _timeline(context: dict[str, Any]) -> dict[str, Any]:
    buckets = {
        "years": defaultdict(_metric_bucket),
        "months": defaultdict(_metric_bucket),
        "days": defaultdict(_metric_bucket),
    }

    for conversation in context["conversations"]:
        if conversation["source"] != "conversation":
            continue
        dt = _first_datetime(conversation, "create_time", "create_time_text")
        if dt:
            _add_bucket_metric(buckets, dt, "conversation_count", 1)

    for message in context["messages"]:
        dt = message.get("created_at")
        if not dt:
            continue
        role = message.get("role") or "unknown"
        chars = int(message.get("character_count") or 0)
        _add_bucket_metric(buckets, dt, "message_count", 1)
        _add_bucket_metric(buckets, dt, f"{role}_message_count", 1)
        _add_bucket_metric(buckets, dt, "character_count", chars)
        _add_bucket_metric(buckets, dt, f"{role}_character_count", chars)

    message_times = {
        message["message_id"]: message.get("created_at")
        for message in context["messages"]
        if message.get("message_id")
    }
    for asset in context["assets"]:
        if asset.get("source") == "library_file":
            continue
        dt = message_times.get(asset.get("message_id"))
        if not dt:
            continue
        _add_bucket_metric(buckets, dt, f"{asset['category']}_count", 1)

    days = sorted(buckets["days"].keys())
    return {
        "years": _sorted_bucket(buckets["years"]),
        "months": _sorted_bucket(buckets["months"]),
        "days": _sorted_bucket(buckets["days"]),
        "most_active_day": _max_bucket(buckets["days"], "message_count"),
        "most_active_month": _max_bucket(buckets["months"], "message_count"),
        "most_active_year": _max_bucket(buckets["years"], "message_count"),
        "longest_active_streak": longest_streak(days),
        "longest_inactive_gap": longest_gap(days),
    }


def _activity(messages: list[dict[str, Any]]) -> dict[str, Any]:
    by_hour = {f"{i:02d}": 0 for i in range(24)}
    by_weekday = {str(i): 0 for i in range(7)}
    by_period = {"late_night": 0, "morning": 0, "afternoon": 0, "evening": 0}
    weekday_vs_weekend = {"weekday": 0, "weekend": 0}
    for message in messages:
        dt = message.get("created_at")
        if not dt:
            continue
        by_hour[hour_key(dt)] += 1
        by_weekday[weekday_key(dt)] += 1
        by_period[day_period(dt)] += 1
        weekday_vs_weekend["weekend" if dt.weekday() >= 5 else "weekday"] += 1
    return {
        "by_hour": by_hour,
        "by_weekday": by_weekday,
        "by_day_period": by_period,
        "weekday_vs_weekend": weekday_vs_weekend,
        "most_active_hour": _max_mapping(by_hour),
        "most_active_weekday": _max_mapping(by_weekday),
    }


def _conversation_stats(context: dict[str, Any]) -> dict[str, Any]:
    aggregates = _conversation_aggregates(context)
    ordinary = [item for item in aggregates.values() if item["source"] == "conversation"]
    return {
        "message_count_distribution": _distribution([item["message_count"] for item in ordinary]),
        "character_count_distribution": _distribution([item["character_count"] for item in ordinary]),
        "short_conversation_count": sum(1 for item in ordinary if item["message_count"] <= 2),
        "long_conversation_count": sum(1 for item in ordinary if item["message_count"] >= 30),
        "archived_count": sum(1 for item in ordinary if item.get("is_archived")),
        "starred_count": sum(1 for item in ordinary if item.get("is_starred")),
        "shared_count": sum(1 for item in ordinary if item.get("is_shared")),
        "longest_by_messages": _top_conversations(ordinary, "message_count"),
        "longest_by_characters": _top_conversations(ordinary, "character_count"),
        "most_assets": _top_conversations(ordinary, "asset_count"),
        "earliest": _first_conversation(ordinary),
        "latest": _last_conversation(ordinary),
    }


def _message_stats(messages: list[dict[str, Any]]) -> dict[str, Any]:
    user = [message for message in messages if message.get("role") == "user"]
    assistant = [message for message in messages if message.get("role") == "assistant"]
    punctuation = Counter()
    urls = 0
    code_blocks = 0
    for message in messages:
        text = message.get("text")
        punctuation.update(punctuation_counts(text))
        urls += url_count(text)
        code_blocks += code_block_count(text)
    return {
        "user_length_distribution": _distribution([m["character_count"] for m in user]),
        "assistant_length_distribution": _distribution([m["character_count"] for m in assistant]),
        "all_length_distribution": _distribution([m["character_count"] for m in messages]),
        "user_to_assistant_character_ratio": _safe_ratio(
            sum(m["character_count"] for m in user),
            sum(m["character_count"] for m in assistant),
        ),
        "question_marks": punctuation["question_marks"],
        "exclamation_marks": punctuation["exclamation_marks"],
        "url_count": urls,
        "code_block_count": code_blocks,
        "longest_user_messages": _top_messages(user),
        "longest_assistant_messages": _top_messages(assistant),
    }


def _model_stats(messages: list[dict[str, Any]]) -> dict[str, Any]:
    assistant_messages = [message for message in messages if message.get("role") == "assistant"]
    by_model: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "message_count": 0,
        "character_count": 0,
        "first_seen_at": None,
        "last_seen_at": None,
    })
    monthly: dict[str, Counter[str]] = defaultdict(Counter)
    for message in assistant_messages:
        model = message.get("model_slug") or "unknown"
        dt = message.get("created_at")
        stats = by_model[model]
        stats["message_count"] += 1
        stats["character_count"] += int(message.get("character_count") or 0)
        if dt:
            stats["first_seen_at"] = min(filter(None, [stats["first_seen_at"], dt]), default=dt)
            stats["last_seen_at"] = max(filter(None, [stats["last_seen_at"], dt]), default=dt)
            monthly[month_key(dt)][model] += 1
    models = [
        {
            "model": model,
            "message_count": stats["message_count"],
            "character_count": stats["character_count"],
            "first_seen_at": iso_or_none(stats["first_seen_at"]),
            "last_seen_at": iso_or_none(stats["last_seen_at"]),
        }
        for model, stats in by_model.items()
    ]
    return {
        "models": sorted(models, key=lambda item: item["message_count"], reverse=True),
        "most_used_model": max(models, key=lambda item: item["message_count"], default=None),
        "monthly_primary_model": {
            month: counter.most_common(1)[0][0]
            for month, counter in sorted(monthly.items())
            if counter
        },
    }


def _asset_stats(context: dict[str, Any]) -> dict[str, Any]:
    message_times = {
        message["message_id"]: message.get("created_at")
        for message in context["messages"]
        if message.get("message_id")
    }
    usable_assets = [asset for asset in context["assets"] if asset.get("source") != "library_file"]
    mime = Counter(asset.get("mime_type") or "unknown" for asset in usable_assets)
    extensions = Counter(asset.get("file_extension") or _suffix(asset.get("display_name")) or "unknown" for asset in usable_assets)
    monthly = defaultdict(Counter)
    for asset in usable_assets:
        dt = message_times.get(asset.get("message_id"))
        if dt:
            monthly[month_key(dt)][asset["category"]] += 1
    return {
        "total_count": len(usable_assets),
        "by_category": dict(Counter(asset["category"] for asset in usable_assets)),
        "by_mime_type": _counter_items(mime),
        "by_extension": _counter_items(extensions),
        "size_distribution": _distribution([asset.get("size_bytes") or 0 for asset in usable_assets]),
        "monthly": {month: dict(counter) for month, counter in sorted(monthly.items())},
        "largest_assets": _largest_assets(context["assets"]),
    }


def _language_stats(messages: list[dict[str, Any]]) -> dict[str, Any]:
    total = Counter()
    buckets = Counter()
    for message in messages:
        text = message.get("text")
        total.update(language_counts(text))
        buckets[language_bucket(text)] += 1
    return {
        "totals": dict(total),
        "message_buckets": dict(buckets),
    }


def _frequent_words(messages: list[dict[str, Any]]) -> dict[str, Any]:
    user_texts = [message.get("text") for message in messages if message.get("role") == "user"]
    assistant_texts = [message.get("text") for message in messages if message.get("role") == "assistant"]
    monthly_texts: dict[str, list[str | None]] = defaultdict(list)
    for message in messages:
        dt = message.get("created_at")
        if dt:
            monthly_texts[month_key(dt)].append(message.get("text"))
    return {
        "all": frequent_terms((message.get("text") for message in messages), limit=50),
        "user": frequent_terms(user_texts, limit=50),
        "assistant": frequent_terms(assistant_texts, limit=50),
        "monthly": {
            month: frequent_terms(texts, limit=10)
            for month, texts in sorted(monthly_texts.items())
        },
    }


def _quality_stats(context: dict[str, Any]) -> dict[str, Any]:
    feedback = context["feedback"]
    shares = context["shares"]
    feedback_by_rating = Counter(item.get("rating") or "unknown" for item in feedback)
    aggregates = _conversation_aggregates(context)
    ordinary = [item for item in aggregates.values() if item["source"] == "conversation"]
    return {
        "feedback_count": len(feedback),
        "feedback_by_rating": dict(feedback_by_rating),
        "shared_conversation_count": len({item.get("conversation_id") for item in shares if item.get("conversation_id")}),
        "conversations_with_feedback_count": len({item.get("conversation_id") for item in feedback if item.get("conversation_id")}),
        "high_interaction_conversations": _top_conversations(ordinary, "message_count"),
        "high_asset_conversations": _top_conversations(ordinary, "asset_count"),
        "high_character_conversations": _top_conversations(ordinary, "character_count"),
    }


def _highlights(context: dict[str, Any]) -> dict[str, Any]:
    aggregates = _conversation_aggregates(context)
    ordinary = [item for item in aggregates.values() if item["source"] == "conversation"]
    messages = context["messages"]
    timeline = _timeline(context)
    activity = _activity(messages)
    models = _model_stats(messages)
    return {
        "most_active_day": timeline["most_active_day"],
        "most_active_month": timeline["most_active_month"],
        "longest_conversation_by_messages": _top_conversations(ordinary, "message_count", limit=1)[0] if ordinary else None,
        "longest_conversation_by_characters": _top_conversations(ordinary, "character_count", limit=1)[0] if ordinary else None,
        "most_asset_conversation": _top_conversations(ordinary, "asset_count", limit=1)[0] if ordinary else None,
        "most_used_model": models["most_used_model"],
        "most_active_hour": activity["most_active_hour"],
        "most_active_weekday": activity["most_active_weekday"],
        "longest_user_message": _top_messages([m for m in messages if m.get("role") == "user"], limit=1)[0] if messages else None,
        "longest_assistant_message": _top_messages([m for m in messages if m.get("role") == "assistant"], limit=1)[0] if messages else None,
        "first_conversation": _first_conversation(ordinary),
        "latest_conversation": _last_conversation(ordinary),
    }


def _conversation_aggregates(context: dict[str, Any]) -> dict[str, dict[str, Any]]:
    aggregates: dict[str, dict[str, Any]] = {}
    for conversation in context["conversations"]:
        key = str(conversation["id"])
        dt = _first_datetime(conversation, "create_time", "create_time_text")
        aggregates[key] = {
            "row_id": conversation["id"],
            "conversation_id": conversation["conversation_id"],
            "source": conversation["source"],
            "title": conversation.get("title"),
            "created_at": dt,
            "created_at_text": iso_or_none(dt),
            "message_count": 0,
            "user_message_count": 0,
            "assistant_message_count": 0,
            "character_count": 0,
            "user_character_count": 0,
            "assistant_character_count": 0,
            "asset_count": 0,
            "is_archived": bool(conversation.get("is_archived")),
            "is_starred": bool(conversation.get("is_starred")),
            "is_shared": bool(conversation.get("is_shared")),
        }
    by_conversation_id = defaultdict(list)
    for key, item in aggregates.items():
        by_conversation_id[item["conversation_id"]].append(key)
    for message in context["messages"]:
        keys = by_conversation_id.get(message.get("conversation_id"), [])
        if not keys:
            continue
        key = keys[0]
        item = aggregates[key]
        chars = int(message.get("character_count") or 0)
        role = message.get("role")
        item["message_count"] += 1
        item["character_count"] += chars
        if role == "user":
            item["user_message_count"] += 1
            item["user_character_count"] += chars
        elif role == "assistant":
            item["assistant_message_count"] += 1
            item["assistant_character_count"] += chars
    for asset in context["assets"]:
        if asset.get("source") == "library_file":
            continue
        keys = by_conversation_id.get(asset.get("conversation_id"), [])
        if keys:
            aggregates[keys[0]]["asset_count"] += 1
    return aggregates


def _metric_bucket() -> dict[str, int]:
    return {
        "conversation_count": 0,
        "message_count": 0,
        "user_message_count": 0,
        "assistant_message_count": 0,
        "character_count": 0,
        "user_character_count": 0,
        "assistant_character_count": 0,
        "image_count": 0,
        "file_count": 0,
        "voice_count": 0,
    }


def _add_bucket_metric(buckets: dict[str, Any], dt: datetime, metric: str, amount: int) -> None:
    for name, key in (("years", year_key(dt)), ("months", month_key(dt)), ("days", day_key(dt))):
        buckets[name][key][metric] = buckets[name][key].get(metric, 0) + amount


def _sorted_bucket(bucket: dict[str, dict[str, int]]) -> list[dict[str, Any]]:
    return [{"key": key, **bucket[key]} for key in sorted(bucket)]


def _max_bucket(bucket: dict[str, dict[str, int]], metric: str) -> dict[str, Any] | None:
    if not bucket:
        return None
    key, value = max(bucket.items(), key=lambda item: item[1].get(metric, 0))
    return {"key": key, **value}


def _max_mapping(values: dict[str, int]) -> dict[str, int | str] | None:
    if not values:
        return None
    key, value = max(values.items(), key=lambda item: item[1])
    return {"key": key, "count": value}


def _top_conversations(items: list[dict[str, Any]], metric: str, limit: int = TOP_N) -> list[dict[str, Any]]:
    output = []
    for item in sorted(items, key=lambda entry: entry.get(metric) or 0, reverse=True)[:limit]:
        output.append({
            "conversation_id": item["conversation_id"],
            "title": item.get("title"),
            "created_at": item.get("created_at_text"),
            "message_count": item["message_count"],
            "user_message_count": item["user_message_count"],
            "assistant_message_count": item["assistant_message_count"],
            "character_count": item["character_count"],
            "asset_count": item["asset_count"],
            "value": item.get(metric),
        })
    return output


def _top_messages(messages: list[dict[str, Any]], limit: int = TOP_N) -> list[dict[str, Any]]:
    output = []
    for message in sorted(messages, key=lambda item: item.get("character_count") or 0, reverse=True)[:limit]:
        output.append({
            "message_id": message.get("message_id"),
            "conversation_id": message.get("conversation_id"),
            "role": message.get("role"),
            "created_at": iso_or_none(message.get("created_at")),
            "character_count": message.get("character_count") or 0,
            "text_excerpt": excerpt(message.get("text"), limit=360),
        })
    return output


def _largest_assets(assets: list[dict[str, Any]], limit: int = TOP_N) -> list[dict[str, Any]]:
    sized = [asset for asset in assets if asset.get("size_bytes")]
    output = []
    for asset in sorted(sized, key=lambda item: item.get("size_bytes") or 0, reverse=True)[:limit]:
        output.append({
            "local_path": asset.get("local_path"),
            "display_name": asset.get("display_name"),
            "category": asset.get("category"),
            "mime_type": asset.get("mime_type"),
            "file_extension": asset.get("file_extension"),
            "size_bytes": asset.get("size_bytes"),
            "conversation_id": asset.get("conversation_id"),
            "message_id": asset.get("message_id"),
        })
    return output


def _first_conversation(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    dated = [item for item in items if item.get("created_at")]
    if not dated:
        return None
    return _conversation_summary(min(dated, key=lambda item: item["created_at"]))


def _last_conversation(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    dated = [item for item in items if item.get("created_at")]
    if not dated:
        return None
    return _conversation_summary(max(dated, key=lambda item: item["created_at"]))


def _conversation_summary(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "conversation_id": item["conversation_id"],
        "title": item.get("title"),
        "created_at": item.get("created_at_text"),
        "message_count": item.get("message_count"),
        "character_count": item.get("character_count"),
    }


def _distribution(values: list[int]) -> dict[str, int]:
    buckets = {
        "zero": 0,
        "one_to_two": 0,
        "three_to_five": 0,
        "six_to_ten": 0,
        "eleven_to_thirty": 0,
        "thirty_one_to_one_hundred": 0,
        "over_one_hundred": 0,
    }
    for value in values:
        if value <= 0:
            buckets["zero"] += 1
        elif value <= 2:
            buckets["one_to_two"] += 1
        elif value <= 5:
            buckets["three_to_five"] += 1
        elif value <= 10:
            buckets["six_to_ten"] += 1
        elif value <= 30:
            buckets["eleven_to_thirty"] += 1
        elif value <= 100:
            buckets["thirty_one_to_one_hundred"] += 1
        else:
            buckets["over_one_hundred"] += 1
    return buckets


def _asset_category(asset: dict[str, Any]) -> str:
    mime = (asset.get("mime_type") or "").lower()
    suffixes = {
        _suffix(asset.get("file_extension")),
        _suffix(asset.get("display_name")),
        _suffix(asset.get("local_path")),
    }
    suffixes.discard("")
    if mime.startswith("image/") or suffixes & {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "heic"}:
        return "image"
    if mime.startswith("audio/") or suffixes & {"mp3", "m4a", "wav", "ogg", "opus", "flac", "aac"}:
        return "voice"
    return "file"


def _suffix(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower().lstrip(".")
    if "." in text:
        return text.rsplit(".", 1)[-1]
    return text


def _counter_items(counter: Counter[str]) -> list[dict[str, int | str]]:
    return [{"key": key, "count": count} for key, count in counter.most_common()]


def _first_datetime(row: dict[str, Any], numeric_key: str, text_key: str) -> datetime | None:
    return to_datetime(row.get(numeric_key)) or to_datetime(row.get(text_key))


def _safe_ratio(left: int, right: int) -> float | None:
    if right == 0:
        return None
    return round(left / right, 4)


def write_web_data(db_path: str | Path, out_path: str | Path) -> dict[str, Any]:
    data = build_web_data(db_path)
    target = Path(out_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    return data
