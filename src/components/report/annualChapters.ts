export const ANNUAL_CHAPTERS = [
  {
    id: "opening",
    zh: "好奇心，有迹可循。",
    en: "Curiosity leaves a trace.",
    theme: 0,
  },
  {
    id: "questions",
    zh: "问题，连接了可能。",
    en: "One question opens a world.",
    theme: 1,
  },
  {
    id: "hours",
    zh: "灵感有自己的时区。",
    en: "Inspiration keeps its own time.",
    theme: 2,
  },
  {
    id: "week",
    zh: "一周，也有你的节奏。",
    en: "Every week has your rhythm.",
    theme: 3,
  },
  {
    id: "streak",
    zh: "每一次出现，都算数。",
    en: "You kept showing up.",
    theme: 0,
  },
  {
    id: "months",
    zh: "这一年，起伏成风景。",
    en: "A year with its own horizons.",
    theme: 2,
  },
  {
    id: "models",
    zh: "一起，把想法走得更远。",
    en: "A little further, together.",
    theme: 1,
  },
  {
    id: "dialogues",
    zh: "有些对话，值得聊很久。",
    en: "Some conversations go further.",
    theme: 0,
  },
  {
    id: "expression",
    zh: "短短长长，都是表达。",
    en: "A few words. Or a whole world.",
    theme: 3,
  },
  {
    id: "attachments",
    zh: "想法，也有很多种形状。",
    en: "Ideas come in many forms.",
    theme: 1,
  },
  {
    id: "words",
    zh: "这些词，是你的坐标。",
    en: "Your words. Your coordinates.",
    theme: 2,
  },
  {
    id: "saved",
    zh: "有些灵感，你想留下。",
    en: "Some ideas are worth keeping.",
    theme: 0,
  },
  {
    id: "feedback",
    zh: "你的反馈，也有回响。",
    en: "Your feedback has an echo.",
    theme: 3,
  },
  {
    id: "closing",
    zh: "把这一页，留给自己。",
    en: "Keep a little of this year.",
    theme: 0,
  },
] as const;

export type AnnualChapterId = (typeof ANNUAL_CHAPTERS)[number]["id"];
