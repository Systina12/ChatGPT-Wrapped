from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable


def to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
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


def iso_or_none(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def year_key(value: datetime) -> str:
    return f"{value.year:04d}"


def month_key(value: datetime) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def day_key(value: datetime) -> str:
    return value.date().isoformat()


def hour_key(value: datetime) -> str:
    return f"{value.hour:02d}"


def weekday_key(value: datetime) -> str:
    return str(value.weekday())


def day_period(value: datetime) -> str:
    hour = value.hour
    if 0 <= hour < 6:
        return "late_night"
    if 6 <= hour < 12:
        return "morning"
    if 12 <= hour < 18:
        return "afternoon"
    return "evening"


def longest_streak(day_keys: Iterable[str]) -> dict[str, Any]:
    dates = sorted({datetime.fromisoformat(day).date() for day in day_keys})
    if not dates:
        return {"days": 0, "start": None, "end": None}
    best_start = current_start = dates[0]
    best_end = current_end = dates[0]
    for date in dates[1:]:
        if (date - current_end).days == 1:
            current_end = date
        else:
            if (current_end - current_start).days > (best_end - best_start).days:
                best_start, best_end = current_start, current_end
            current_start = current_end = date
    if (current_end - current_start).days > (best_end - best_start).days:
        best_start, best_end = current_start, current_end
    return {
        "days": (best_end - best_start).days + 1,
        "start": best_start.isoformat(),
        "end": best_end.isoformat(),
    }


def longest_gap(day_keys: Iterable[str]) -> dict[str, Any]:
    dates = sorted({datetime.fromisoformat(day).date() for day in day_keys})
    if len(dates) < 2:
        return {"days": 0, "start": None, "end": None}
    best_start = dates[0]
    best_end = dates[1]
    best_days = (best_end - best_start).days - 1
    for left, right in zip(dates, dates[1:]):
        gap_days = (right - left).days - 1
        if gap_days > best_days:
            best_days = gap_days
            best_start = left
            best_end = right
    return {
        "days": max(best_days, 0),
        "start": best_start.isoformat(),
        "end": best_end.isoformat(),
    }


def empty_count_map(keys: Iterable[str]) -> dict[str, int]:
    return {key: 0 for key in keys}


def increment(counter: dict[str, int], key: str, amount: int = 1) -> None:
    counter[key] = counter.get(key, 0) + amount


def nested_counter() -> defaultdict[str, dict[str, int]]:
    return defaultdict(dict)
