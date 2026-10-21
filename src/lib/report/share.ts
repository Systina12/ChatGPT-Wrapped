import type { WrappedData } from "../../types/wrapped";
export interface ShareOptions {
  keywords: boolean;
  titles: boolean;
  language: "zh" | "en";
}
export function escapeXml(value: string): string {
  const clean = Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      );
    })
    .join("");
  return clean.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
}
export function shareSvg(data: WrappedData, options: ShareOptions): string {
  const zh = options.language === "zh";
  const number = (n: number) =>
    escapeXml(new Intl.NumberFormat(zh ? "zh-CN" : "en-US").format(n));
  const words = options.keywords
    ? data.frequent_words.user
        .slice(0, 5)
        .map((w) => w.term)
        .join(" · ")
    : "";
  const title = options.titles
    ? data.conversations.longest_by_messages[0]?.title || ""
    : "";
  const year = data.options?.year || "all";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#cec1ff"/><circle cx="1010" cy="290" r="270" fill="none" stroke="#1d1b21" stroke-width="2"/><circle cx="1010" cy="290" r="200" fill="#d6ff43"/><g fill="#19171c" font-family="system-ui,sans-serif"><text x="80" y="105" font-size="28" letter-spacing="5">CHATGPT / WRAPPED</text><text x="80" y="270" font-size="92" font-weight="800" textLength="920" lengthAdjust="spacingAndGlyphs">${zh ? "每个问题，都算数。" : "Every question counts."}</text><text x="80" y="350" font-size="28">${escapeXml(year === "all" ? (zh ? "我的对话档案" : "My conversation archive") : year)}</text><text x="75" y="605" font-size="190" font-weight="900">${number(data.meta.table_counts.messages)}</text><text x="85" y="670" font-size="36">${zh ? "条消息，连接好奇与可能" : "messages. A world of possibility."}</text><path d="M80 740H1000" stroke="#19171c"/><text x="80" y="830" font-size="60" font-weight="800">${number(data.overview.conversation_count)}</text><text x="80" y="885" font-size="28">${zh ? "次对话" : "conversations"}</text><text x="590" y="830" font-size="60" font-weight="800">${number(data.timeline.longest_active_streak.days)}</text><text x="590" y="885" font-size="28">${zh ? "天连续探索" : "day streak"}</text><text x="80" y="1000" font-size="25">${escapeXml(words.slice(0, 70))}</text><text x="80" y="1070" font-size="25">${escapeXml(title.slice(0, 50))}</text><text x="80" y="1240" font-size="22">${zh ? "浏览器本地生成 · 由我选择分享" : "Made locally. Shared by choice."}</text></g></svg>`;
}
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("PNG generation failed / PNG 生成失败"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable / 浏览器不支持画布");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG generation failed")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
