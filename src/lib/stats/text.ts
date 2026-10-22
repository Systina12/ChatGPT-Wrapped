import type { ParsedMessage } from "../../types/export";
import { topK } from "./topK";
const URL_RE = /https?:\/\/[^\s<>)"']+/g;
const EN_WORD_RE = /[A-Za-z][A-Za-z0-9_'-]*/g;
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/g;
const DIGIT_RE = /\d/g;

const EN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "with",
  "you",
  "your",
  "class",
  "com",
  "const",
  "data",
  "div",
  "false",
  "function",
  "html",
  "http",
  "https",
  "id",
  "img",
  "info",
  "let",
  "name",
  "null",
  "span",
  "string",
  "true",
  "type",
  "var",
  "www",
]);

const CJK_STOP_BIGRAMS = new Set([
  "这个",
  "那个",
  "什么",
  "一下",
  "一个",
  "可以",
  "就是",
  "如果",
  "但是",
  "然后",
  "所以",
  "因为",
  "我们",
  "你们",
  "他们",
  "它们",
]);

export function visibleCharCount(text: string | null | undefined): number {
  return text ? text.replace(/\s+/g, "").length : 0;
}

export function excerpt(
  text: string | null | undefined,
  limit = 240,
): string | null {
  if (!text) {
    return null;
  }
  // Retain only the preview prefix. Normalizing the entire message can create
  // a multi-megabyte parent string retained by a tiny sliced-string excerpt.
  const nextNonWhitespace = /\S/g;
  const parts: string[] = [];
  for (let i = 0; i < text.length; ) {
    if (/\s/.test(text[i])) {
      nextNonWhitespace.lastIndex = i;
      const next = nextNonWhitespace.exec(text);
      if (!next) break;
      if (parts.length) parts.push(" ");
      i = next.index;
    } else {
      parts.push(text[i++]);
    }
    if (parts.length > limit)
      return `${parts.join("").slice(0, Math.max(0, limit - 1))}...`;
  }
  const compact = parts.join("");
  return compact.length <= limit ? compact : "...";
}

export function urlCount(text: string | null | undefined): number {
  return text ? countMatches(text, URL_RE) : 0;
}

export function codeBlockCount(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }
  const fenced = Math.floor(countMatches(text, /```/g) / 2);
  const inlineLike = countMatches(text, /`[^`\n]{3,}`/g);
  return fenced + inlineLike;
}

export function punctuationCounts(text: string | null | undefined) {
  if (!text) {
    return { question_marks: 0, exclamation_marks: 0 };
  }
  let question_marks = 0,
    exclamation_marks = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    if (char === 63 || char === 0xff1f) question_marks++;
    if (char === 33 || char === 0xff01) exclamation_marks++;
  }
  return { question_marks, exclamation_marks };
}

export function languageCounts(text: string | null | undefined) {
  if (!text) {
    return { chinese_characters: 0, english_words: 0, digit_characters: 0 };
  }
  return {
    chinese_characters: countMatches(text, CJK_RE, true),
    english_words: countMatches(text, EN_WORD_RE),
    digit_characters: countMatches(text, DIGIT_RE),
  };
}

export function languageBucket(text: string | null | undefined): string {
  return bucketForCounts(languageCounts(text));
}
function bucketForCounts(counts: Record<string, number>): string {
  const hasCjk = counts.chinese_characters > 0;
  const hasEnglish = counts.english_words > 0;
  if (hasCjk && hasEnglish) return "mixed";
  if (hasCjk) return "chinese";
  if (hasEnglish) return "english";
  return "other";
}

export function frequentTerms(
  texts: Iterable<string | null | undefined>,
  limit = 50,
): Array<{ term: string; count: number }> {
  const counter = new Map<string, number>();
  for (const text of texts) {
    if (!text) {
      continue;
    }
    forEachTermCount(text, (term, count) => increment(counter, term, count));
  }
  return topTerms(counter, limit);
}

export function textTerms(text: string): Iterable<string> {
  const terms = iterateTerms(text);
  // Small messages keep eager iteration cheap; long messages never retain a
  // complete token array in addition to the frequency maps.
  return text.length <= 4096 ? [...terms] : terms;
}
function* iterateTerms(text: string): Generator<string> {
  yield* englishTerms(text);
  yield* iterateChineseTerms(text);
}

/** Batch repeated long-message terms while bounding extra vocabulary storage.
 * High-cardinality messages switch to direct counting after 2,048 unique terms. */
export function forEachTermCount(
  text: string,
  visit: (term: string, count: number) => void,
): void {
  if (text.length <= 4096) {
    for (const term of textTerms(text)) visit(term, 1);
    return;
  }
  const batch = new Map<string, number>();
  let direct = false;
  const flush = () => {
    for (const [term, count] of batch) visit(term, count);
    batch.clear();
  };
  for (const term of textTerms(text)) {
    if (direct) {
      visit(term, 1);
      continue;
    }
    const count = batch.get(term);
    if (count === undefined && batch.size >= 2048) {
      flush();
      direct = true;
      visit(term, 1);
    } else batch.set(term, (count || 0) + 1);
  }
  flush();
}

export function topTerms(counter: Map<string, number>, limit: number) {
  return topK(
    counter.entries(),
    limit,
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  ).map(([term, count]) => ({ term, count }));
}

function* englishTerms(text: string): Generator<string> {
  for (const match of text.matchAll(EN_WORD_RE)) {
    const term = match[0].toLowerCase().replace(/^['_-]+|['_-]+$/g, "");
    if (term.length >= 2 && !EN_STOPWORDS.has(term)) {
      yield term;
    }
  }
}

const TECH_TERMS = [
  "人工智能",
  "机器学习",
  "深度学习",
  "数据分析",
  "大模型",
  "提示词",
  "编程",
];
const ZH_STOP = new Set([
  ...CJK_STOP_BIGRAMS,
  "请问",
  "谢谢",
  "你好",
  "需要",
  "问题",
  "进行",
  "以及",
  "如何",
  "还是",
  "现在",
  "这里",
  "这样",
  "使用",
  "没有",
  "能够",
  "已经",
  "自己",
  "时候",
  "可能",
  "一些",
  "那么",
  "什么样",
]);
interface Segment {
  segment: string;
  isWordLike?: boolean;
}
const Segmenter = (
  Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: string },
    ) => { segment(text: string): Iterable<Segment> };
  }
).Segmenter;
const segmenter = Segmenter
  ? new Segmenter("zh", { granularity: "word" })
  : null;
// Repeated Chinese phrases are common even when message IDs/numbers differ.
// Bound both retained text/terms and entry count; never cache arbitrary long runs.
const chineseCache = new Map<
  string,
  { key: string; terms: string[]; bytes: number }
>();
const CHINESE_CACHE_BYTES = 4 * 1024 * 1024;
const cacheEncoder = new TextEncoder();
const cacheDecoder = new TextDecoder();
// CJK_RE matches valid BMP characters. A byte round trip owns its backing
// storage, unlike substring/slice copies that can retain an entire message.
const detachedCjk = (text: string): string =>
  cacheDecoder.decode(cacheEncoder.encode(text));
let chineseCacheBytes = 0;
function* segmentedTerms(sequence: string): Generator<string> {
  const cached = chineseCache.get(sequence);
  if (cached) {
    chineseCache.delete(sequence);
    chineseCache.set(cached.key, cached);
    yield* cached.terms;
    return;
  }
  const terms: string[] = [];
  let bytes = 128 + sequence.length * 2;
  let cacheable = bytes <= CHINESE_CACHE_BYTES / 16;
  for (const part of segmenter!.segment(sequence)) {
    if (
      part.isWordLike &&
      part.segment.length > 1 &&
      !ZH_STOP.has(part.segment)
    ) {
      if (cacheable) {
        bytes += 32 + part.segment.length * 2;
        if (bytes <= CHINESE_CACHE_BYTES / 16) terms.push(part.segment);
        else {
          cacheable = false;
          terms.length = 0;
        }
      }
      yield part.segment;
    }
  }
  if (cacheable) {
    while (
      chineseCache.size &&
      (chineseCacheBytes + bytes > CHINESE_CACHE_BYTES ||
        chineseCache.size >= 4096)
    ) {
      const key = chineseCache.keys().next().value!;
      chineseCacheBytes -= chineseCache.get(key)!.bytes;
      chineseCache.delete(key);
    }
    const key = detachedCjk(sequence);
    chineseCache.set(key, { key, terms: terms.map(detachedCjk), bytes });
    chineseCacheBytes += bytes;
  }
}
export function chineseTerms(text: string, useSegmenter = true): string[] {
  return [...iterateChineseTerms(text, useSegmenter)];
}
function* iterateChineseTerms(
  text: string,
  useSegmenter = true,
): Generator<string> {
  let remaining = text;
  for (const term of TECH_TERMS) {
    if (!remaining.includes(term)) continue;
    for (
      let at = remaining.indexOf(term);
      at !== -1;
      at = remaining.indexOf(term, at + term.length)
    )
      yield term;
    remaining = remaining.replaceAll(term, " ");
  }
  for (const sequence of cjkRuns(remaining)) {
    if (segmenter && useSegmenter) {
      yield* segmentedTerms(sequence);
    } else {
      for (let i = 0; i < sequence.length - 1; i++) {
        const term = sequence.slice(i, i + 2);
        if (!ZH_STOP.has(term)) yield term;
      }
    }
  }
}

/** Match CJK_RE's ranges without match objects or RegExp's retained last input. */
function* cjkRuns(text: string): Generator<string> {
  for (let cursor = 0; cursor < text.length; ) {
    // Keep long scans in an ordinary function; suspend only once per CJK run.
    const start = cjkBoundary(text, cursor, false);
    if (start === text.length) return;
    const end = cjkBoundary(text, start + 1, true);
    yield text.slice(start, end);
    cursor = end;
  }
}
function cjkBoundary(text: string, from: number, withinRun: boolean): number {
  for (; from < text.length; from++) {
    const code = text.charCodeAt(from);
    const cjk =
      code >= 0x3400 && (code <= 0x4dbf || (code >= 0x4e00 && code <= 0x9fff));
    if (cjk !== withinRun) break;
  }
  return from;
}

function countMatches(text: string, regex: RegExp, lengths = false): number {
  regex.lastIndex = 0;
  let count = 0,
    match: RegExpExecArray | null;
  while ((match = regex.exec(text))) count += lengths ? match[0].length : 1;
  return count;
}

function analyze(text: string | null) {
  const language = languageCounts(text);
  return {
    text,
    characterCount: visibleCharCount(text),
    ...punctuationCounts(text),
    ...language,
    bucket: bucketForCounts(language),
    urls: urlCount(text),
    codeBlocks: codeBlockCount(text),
  };
}
const messageFeatures = new WeakMap<
  ParsedMessage,
  ReturnType<typeof analyze>
>();
/** Fixed-size scalar features per message, independent of timezone and scope. */
export function messageTextStats(message: ParsedMessage) {
  let cached = messageFeatures.get(message);
  if (!cached || cached.text !== message.text) {
    cached = analyze(message.text);
    messageFeatures.set(message, cached);
  }
  return cached;
}

function increment(
  counter: Map<string, number>,
  key: string,
  amount = 1,
): void {
  counter.set(key, (counter.get(key) || 0) + amount);
}
