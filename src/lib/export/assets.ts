import type { ParsedAsset } from "../../types/export";
import type { AssetCategory } from "../../types/wrapped";

const generic = (value: string | null) =>
  !value || value === "application/octet-stream";
const maxKnown = (left: number | null, right: number | null): number | null =>
  left == null ? (right ?? null) : right == null ? left : Math.max(left, right);
export function mergeAssets(assets: ParsedAsset[]): ParsedAsset[] {
  const output = new Map<string, ParsedAsset>();
  for (const item of assets) {
    const key = JSON.stringify([
      item.source === "library_file" ? "library" : "message",
      item.conversationId,
      item.messageId,
      item.localPath,
    ]);
    const previous = output.get(key);
    if (!previous) {
      output.set(key, { ...item });
      continue;
    }
    const raw: Record<string, unknown> = {
      ...(previous.raw && typeof previous.raw === "object" ? previous.raw : {}),
      ...(item.raw && typeof item.raw === "object" ? item.raw : {}),
    };
    const previousRaw =
      previous.raw && typeof previous.raw === "object"
        ? (previous.raw as Record<string, unknown>)
        : {};
    const nextRaw =
      item.raw && typeof item.raw === "object"
        ? (item.raw as Record<string, unknown>)
        : {};
    const specialized = (value: unknown) =>
      /image|audio|video/.test(String(value || ""));
    if (
      specialized(previousRaw.content_type) &&
      !specialized(nextRaw.content_type)
    )
      raw.content_type = previousRaw.content_type;
    output.set(key, {
      ...previous,
      raw,
      categoryHint:
        previous.categoryHint && previous.categoryHint !== "file"
          ? previous.categoryHint
          : (item.categoryHint ?? previous.categoryHint),
      displayName: item.displayName || previous.displayName,
      mimeType:
        generic(previous.mimeType) && !generic(item.mimeType)
          ? item.mimeType
          : previous.mimeType || item.mimeType,
      fileExtension:
        item.fileExtension ||
        previous.fileExtension ||
        assetExtension(previous) ||
        null,
      width: maxKnown(previous.width, item.width),
      height: maxKnown(previous.height, item.height),
      sizeBytes: maxKnown(previous.sizeBytes, item.sizeBytes),
    });
  }
  return [...output.values()];
}
export function classifyAsset(asset: ParsedAsset): AssetCategory {
  if (asset.categoryHint) return asset.categoryHint;
  const mime = (asset.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "voice";
  if (mime.startsWith("video/")) return "file";
  const raw =
    asset.raw && typeof asset.raw === "object"
      ? (asset.raw as Record<string, unknown>)
      : {};
  const type = String(raw.content_type || "").toLowerCase();
  const names = [
    asset.fileExtension?.toLowerCase().replace(/^\./, ""),
    pathExtension(asset.displayName),
    pathExtension(asset.localPath),
  ];
  if (
    mime.startsWith("audio/") ||
    type.includes("audio") ||
    raw.audio_asset_pointer === asset.localPath ||
    raw.audio ||
    names.some((v) =>
      ["mp3", "m4a", "wav", "ogg", "opus", "flac", "aac"].includes(v || ""),
    )
  )
    return "voice";
  if (
    mime.startsWith("image/") ||
    type.includes("image") ||
    names.some((v) =>
      [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "bmp",
        "tiff",
        "heic",
        "svg",
        "avif",
      ].includes(v || ""),
    )
  )
    return "image";
  return "file";
}

export function assetExtension(asset: ParsedAsset): string {
  const explicit = asset.fileExtension?.toLowerCase().replace(/^\./, "");
  return (
    explicit ||
    pathExtension(asset.displayName) ||
    pathExtension(asset.localPath)
  );
}

export function pathExtension(value: string | null | undefined): string {
  const name =
    (value || "").split(/[?#]/)[0].replace(/\\/g, "/").split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? name.slice(dot + 1).toLowerCase()
    : "";
}
