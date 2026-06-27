from __future__ import annotations

import re
from collections import Counter
from typing import Iterable


URL_RE = re.compile(r"https?://[^\s<>)\"']+")
EN_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9_'-]*")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]+")
DIGIT_RE = re.compile(r"\d")

EN_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "have", "i", "in", "is", "it", "of", "on", "or", "that",
    "the", "this", "to", "was", "were", "with", "you", "your",
    "class", "com", "const", "data", "div", "false", "function", "html",
    "http", "https", "id", "img", "info", "let", "name", "null", "span",
    "string", "true", "type", "var", "www",
}

CJK_STOP_BIGRAMS = {
    "这个", "那个", "什么", "一下", "一个", "可以", "就是", "如果",
    "但是", "然后", "所以", "因为", "我们", "你们", "他们", "它们",
}


def visible_char_count(text: str | None) -> int:
    if not text:
        return 0
    return len(re.sub(r"\s+", "", text))


def excerpt(text: str | None, limit: int = 240) -> str | None:
    if not text:
        return None
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: max(0, limit - 1)] + "…"


def url_count(text: str | None) -> int:
    if not text:
        return 0
    return len(URL_RE.findall(text))


def code_block_count(text: str | None) -> int:
    if not text:
        return 0
    fenced = text.count("```") // 2
    inline_like = len(re.findall(r"`[^`\n]{3,}`", text))
    return fenced + inline_like


def punctuation_counts(text: str | None) -> dict[str, int]:
    if not text:
        return {"question_marks": 0, "exclamation_marks": 0}
    return {
        "question_marks": text.count("?") + text.count("？"),
        "exclamation_marks": text.count("!") + text.count("！"),
    }


def language_counts(text: str | None) -> dict[str, int]:
    if not text:
        return {"chinese_characters": 0, "english_words": 0, "digit_characters": 0}
    return {
        "chinese_characters": sum(len(match.group(0)) for match in CJK_RE.finditer(text)),
        "english_words": len(EN_WORD_RE.findall(text)),
        "digit_characters": len(DIGIT_RE.findall(text)),
    }


def language_bucket(text: str | None) -> str:
    counts = language_counts(text)
    has_cjk = counts["chinese_characters"] > 0
    has_en = counts["english_words"] > 0
    if has_cjk and has_en:
        return "mixed"
    if has_cjk:
        return "chinese"
    if has_en:
        return "english"
    return "other"


def frequent_terms(texts: Iterable[str | None], *, limit: int = 50) -> list[dict[str, int | str]]:
    counter: Counter[str] = Counter()
    for text in texts:
        if not text:
            continue
        counter.update(_english_terms(text))
        counter.update(_cjk_bigrams(text))
    return [
        {"term": term, "count": count}
        for term, count in counter.most_common(limit)
    ]


def _english_terms(text: str) -> list[str]:
    terms = []
    for match in EN_WORD_RE.finditer(text):
        term = match.group(0).lower().strip("'_-")
        if len(term) >= 2 and term not in EN_STOPWORDS:
            terms.append(term)
    return terms


def _cjk_bigrams(text: str) -> list[str]:
    terms: list[str] = []
    for match in CJK_RE.finditer(text):
        seq = match.group(0)
        if len(seq) == 2 and seq not in CJK_STOP_BIGRAMS:
            terms.append(seq)
        elif len(seq) > 2:
            for i in range(len(seq) - 1):
                term = seq[i : i + 2]
                if term not in CJK_STOP_BIGRAMS:
                    terms.append(term)
    return terms
