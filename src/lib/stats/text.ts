const URL_RE = /https?:\/\/[^\s<>)"']+/g;
const EN_WORD_RE = /[A-Za-z][A-Za-z0-9_'-]*/g;
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/g;
const DIGIT_RE = /\d/g;

const EN_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "have", "i", "in", "is", "it", "of", "on", "or", "that",
  "the", "this", "to", "was", "were", "with", "you", "your",
  "class", "com", "const", "data", "div", "false", "function", "html",
  "http", "https", "id", "img", "info", "let", "name", "null", "span",
  "string", "true", "type", "var", "www",
]);

const CJK_STOP_BIGRAMS = new Set([
  "这个", "那个", "什么", "一下", "一个", "可以", "就是", "如果",
  "但是", "然后", "所以", "因为", "我们", "你们", "他们", "它们",
]);

export function visibleCharCount(text: string | null | undefined): number {
  return text ? text.replace(/\s+/g, "").length : 0;
}

export function excerpt(text: string | null | undefined, limit = 240): string | null {
  if (!text) {
    return null;
  }
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 1))}...`;
}

export function urlCount(text: string | null | undefined): number {
  return text ? [...text.matchAll(URL_RE)].length : 0;
}

export function codeBlockCount(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }
  const fenced = Math.floor((text.match(/```/g) || []).length / 2);
  const inlineLike = (text.match(/`[^`\n]{3,}`/g) || []).length;
  return fenced + inlineLike;
}

export function punctuationCounts(text: string | null | undefined): Record<string, number> {
  if (!text) {
    return { question_marks: 0, exclamation_marks: 0 };
  }
  return {
    question_marks: countChars(text, "?") + countChars(text, "？"),
    exclamation_marks: countChars(text, "!") + countChars(text, "！"),
  };
}

export function languageCounts(text: string | null | undefined): Record<string, number> {
  if (!text) {
    return { chinese_characters: 0, english_words: 0, digit_characters: 0 };
  }
  return {
    chinese_characters: [...text.matchAll(CJK_RE)].reduce((total, match) => total + match[0].length, 0),
    english_words: [...text.matchAll(EN_WORD_RE)].length,
    digit_characters: [...text.matchAll(DIGIT_RE)].length,
  };
}

export function languageBucket(text: string | null | undefined): string {
  const counts = languageCounts(text);
  const hasCjk = counts.chinese_characters > 0;
  const hasEnglish = counts.english_words > 0;
  if (hasCjk && hasEnglish) return "mixed";
  if (hasCjk) return "chinese";
  if (hasEnglish) return "english";
  return "other";
}

export function frequentTerms(texts: Iterable<string | null | undefined>, limit = 50): Array<{ term: string; count: number }> {
  const counter = new Map<string, number>();
  for (const text of texts) {
    if (!text) {
      continue;
    }
    englishTerms(text).forEach((term) => increment(counter, term));
    cjkBigrams(text).forEach((term) => increment(counter, term));
  }
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function englishTerms(text: string): string[] {
  const terms: string[] = [];
  for (const match of text.matchAll(EN_WORD_RE)) {
    const term = match[0].toLowerCase().replace(/^['_-]+|['_-]+$/g, "");
    if (term.length >= 2 && !EN_STOPWORDS.has(term)) {
      terms.push(term);
    }
  }
  return terms;
}

function cjkBigrams(text: string): string[] {
  const terms: string[] = [];
  for (const match of text.matchAll(CJK_RE)) {
    const seq = match[0];
    if (seq.length === 2 && !CJK_STOP_BIGRAMS.has(seq)) {
      terms.push(seq);
    } else if (seq.length > 2) {
      for (let index = 0; index < seq.length - 1; index += 1) {
        const term = seq.slice(index, index + 2);
        if (!CJK_STOP_BIGRAMS.has(term)) {
          terms.push(term);
        }
      }
    }
  }
  return terms;
}

function countChars(text: string, char: string): number {
  return text.split(char).length - 1;
}

function increment(counter: Map<string, number>, key: string, amount = 1): void {
  counter.set(key, (counter.get(key) || 0) + amount);
}

