import JSZip from "jszip";
import { resolve } from "node:path";
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
const root = resolve(process.argv[2] || "/tmp/chatgpt-wrapped-synthetic");
mkdirSync(`${root}/data`, { recursive: true });
const models = [
  "gpt-4o",
  "gpt-4o",
  "gpt-4o",
  "o3",
  "o3",
  "gpt-4.1",
  "gpt-4.1-mini",
];
const terms = [
  "人工智能",
  "编程",
  "数据分析",
  "机器学习",
  "大模型",
  "提示词",
  "深度学习",
  "设计",
  "测试",
  "代码",
  "模型",
  "学习",
];
const titles = [
  "测试对话 A",
  "测试对话 B",
  "占位记录 C",
  "测试项目 D",
  "随机样本 E",
  "占位任务 F",
];
const feedback = [],
  shares = [],
  entries = [];
const expected = {
  all: { messages: 510000, conversations: 5100, users: 255000, assets: 25000 },
  2024: { messages: 155000, conversations: 1550, users: 77500, assets: 7500 },
  2025: { messages: 355000, conversations: 3550, users: 177500, assets: 17500 },
};
function day(year, index) {
  return Date.UTC(year, 0, 1) / 1000 + (index % 365) * 86400;
}
function text(index, reply) {
  return (
    (reply ? "占位回复 " : "占位输入 ") +
    terms[index % terms.length] +
    " " +
    terms[(index * 7 + 1) % terms.length] +
    " " +
    terms[(index * 3 + 2) % terms.length] +
    " sample placeholder " +
    (index % 10000)
  );
}
for (let shard = 0; shard < 4; shard++) {
  const name =
    shard === 0 ? "conversations.json" : `conversations-${shard}.json`;
  const stream = createWriteStream(`${root}/data/${name}`);
  stream.write("[");
  for (let index = shard * 1250; index < (shard + 1) * 1250; index++) {
    const id = `synthetic-${index}`;
    const year = index < 1500 ? 2024 : 2025;
    const start = day(year, index) + (index % 5 === 0 ? 9 : 19) * 3600;
    const mapping = { root: { id: "root", parent: null, message: null } };
    for (let j = 0; j < 100; j++) {
      const key = `n${j}`,
        messageId = `${id}-m${j}`;
      const metadata =
        j % 2 ? { model_slug: models[index % models.length] } : {};
      if (j % 20 === 0) {
        const kind = (index + j / 20) % 3;
        const extension = ["png", "mp3", "pdf"][kind];
        metadata.attachments = [
          {
            id: `asset-${index}-${j}`,
            name: `sample-${index}-${j}.${extension}`,
            mime_type: ["image/png", "audio/mpeg", "application/pdf"][kind],
            size_bytes: 1024 + ((index * 73 + j * 17) % 8000000),
            ...(kind === 0 ? { width: 1920, height: 1080 } : {}),
          },
        ];
      }
      mapping[key] = {
        id: key,
        parent: j ? `n${j - 1}` : "root",
        message: {
          id: messageId,
          author: { role: j % 2 ? "assistant" : "user" },
          create_time: start + j * 39,
          content: {
            content_type: "text",
            parts: [text(index * 100 + j, Boolean(j % 2))],
          },
          metadata,
        },
      };
    }
    const conversation = {
      id,
      title: `${titles[index % titles.length]} / ${String(index).padStart(4, "0")}`,
      create_time: start,
      update_time: start + 99 * 39,
      current_node: "n99",
      is_archived: index % 5 === 0,
      is_starred: index % 7 === 0,
      default_model_slug: models[index % models.length],
      mapping,
    };
    const chunk =
      (index === shard * 1250 ? "" : ",") + JSON.stringify(conversation);
    if (!stream.write(chunk)) await once(stream, "drain");
    feedback.push({
      id: `f-${index}`,
      conversation_id: id,
      message_id: `${id}-m1`,
      rating: index % 6 ? "thumbsUp" : "thumbsDown",
      create_time: start + 39,
    });
    if (index % 5 === 0)
      shares.push({
        id: `s-${index}`,
        conversation_id: id,
        title: conversation.title,
        is_anonymous: true,
        create_time: new Date(start * 1000).toISOString(),
      });
  }
  stream.end("]");
  await once(stream, "finish");
  entries.push({ name, bytes: statSync(`${root}/data/${name}`).size });
  console.log(JSON.stringify(entries.at(-1)));
}
const chats = Array.from({ length: 100 }, (_, i) => {
  const year = i < 50 ? 2024 : 2025,
    start = day(year, i * 7) + 13 * 3600;
  return {
    id: `group-${i}`,
    name: `测试群聊 ${i}`,
    created_at: new Date(start * 1000).toISOString(),
    messages: Array.from({ length: 100 }, (_, j) => ({
      id: `g-${i}-${j}`,
      role: j % 2 ? "assistant" : "user",
      created_at: new Date((start + j * 51) * 1000).toISOString(),
      content: {
        content_type: "text",
        parts: [text(i * 100 + j, Boolean(j % 2))],
      },
      model_slug: j % 2 ? models[i % models.length] : undefined,
    })),
  };
});
for (const [name, value] of [
  ["group_chats.json", { chats }],
  ["message_feedback.json", feedback],
  ["shared_conversations.json", shares],
]) {
  writeFileSync(`${root}/data/${name}`, JSON.stringify(value));
  entries.push({ name, bytes: statSync(`${root}/data/${name}`).size });
}
const zip = new JSZip();
for (const entry of entries)
  zip.file(
    `synthetic-export/${entry.name}`,
    readFileSync(`${root}/data/${entry.name}`),
    { date: new Date("2026-01-01T00:00:00Z") },
  );
await pipeline(
  zip.generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  }),
  createWriteStream(`${root}/synthetic-510000-messages.zip`),
);
const archive = readFileSync(`${root}/synthetic-510000-messages.zip`);
const manifest = {
  synthetic: true,
  description: "Placeholder messages only; no real conversations or files.",
  ordinary_messages: 500000,
  group_messages: 10000,
  ordinary_conversations: 5000,
  group_conversations: 100,
  years: [2024, 2025],
  expected,
  entries,
  total_json_bytes: entries.reduce((n, e) => n + e.bytes, 0),
  zip_bytes: archive.length,
  zip_sha256: createHash("sha256").update(archive).digest("hex"),
};
writeFileSync(
  `${root}/dataset-manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest, null, 2));
