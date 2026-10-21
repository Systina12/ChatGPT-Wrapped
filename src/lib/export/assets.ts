import type { ParsedAsset } from "../../types/export";
import type { AssetCategory } from "../../types/wrapped";

const generic = (value: string | null) =>
  !value || value === "application/octet-stream";
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
    const raw = {
      ...(previous.raw && typeof previous.raw === "object" ? previous.raw : {}),
      ...(item.raw && typeof item.raw === "object" ? item.raw : {}),
    };
    output.set(key, {
      ...previous,
      raw,
      displayName: item.displayName || previous.displayName,
      mimeType:
        generic(previous.mimeType) && !generic(item.mimeType)
          ? item.mimeType
          : previous.mimeType || item.mimeType,
      fileExtension: item.fileExtension || previous.fileExtension,
      width: Math.max(previous.width || 0, item.width || 0) || null,
      height: Math.max(previous.height || 0, item.height || 0) || null,
      sizeBytes: Math.max(previous.sizeBytes || 0, item.sizeBytes || 0) || null,
    });
  }
  return [...output.values()];
}
export function classifyAsset(asset: ParsedAsset): AssetCategory {
  const mime = (asset.mimeType || "").toLowerCase();
  const raw =
    asset.raw && typeof asset.raw === "object"
      ? (asset.raw as Record<string, unknown>)
      : {};
  const type = String(raw.content_type || "").toLowerCase();
  const names = [asset.fileExtension, asset.displayName, asset.localPath].map(
    (v) => (v || "").toLowerCase().split(/[?#]/)[0].split(".").pop(),
  );
  if (
    mime.startsWith("audio/") ||
    type.includes("audio") ||
    raw.audio_asset_pointer ||
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
