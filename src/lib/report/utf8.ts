const CHUNK_UNITS = 8192;
const encoder = new TextEncoder();
let buffer: Uint8Array | undefined;

/** Exact UTF-8 size threshold without allocating a Blob/byte array of the text. */
export function exceedsUtf8Bytes(text: string, limit: number): boolean {
  // UTF-8 needs between one and three bytes per UTF-16 code unit. Unpaired
  // surrogates become U+FFFD, matching Blob and TextEncoder behavior.
  if (text.length > limit) return true;
  if (text.length * 3 <= limit) return false;
  buffer ??= new Uint8Array(CHUNK_UNITS * 3);
  let bytes = 0;
  for (let offset = 0; offset < text.length; ) {
    let end = Math.min(offset + CHUNK_UNITS, text.length);
    // Do not encode the two halves of a valid surrogate pair separately.
    const last = text.charCodeAt(end - 1),
      next = text.charCodeAt(end);
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)
      end--;
    const result = encoder.encodeInto(text.slice(offset, end), buffer);
    bytes += result.written;
    if (bytes > limit) return true;
    offset += result.read;
  }
  return false;
}
