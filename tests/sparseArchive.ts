import { closeSync, ftruncateSync, openSync, writeSync } from "node:fs";
import { crc32 } from "node:zlib";

/** A real ZIP64 file with a sparse zero-filled attachment, not a mocked size.
 * Its CRC covers the zero bytes. Creating it never allocates the whole file. */
export function writeSparseArchive(
  path: string,
  binaryBytes: number,
  entries: { name: string; text: string }[],
) {
  const fd = openSync(path, "w");
  let position = 0;
  const central: Buffer[] = [];
  const write = (bytes: Buffer) => {
    let offset = 0;
    while (offset < bytes.length)
      offset += writeSync(fd, bytes, offset, bytes.length - offset, position + offset);
    position += bytes.length;
  };
  const add = (name: string, size: number, crc: number, data?: Buffer) => {
    const filename = Buffer.from(name);
    const localOffset = position;
    const header = Buffer.alloc(30 + filename.length + 20);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(45, 4);
    header.writeUInt16LE(0x21, 12); // 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(0xffffffff, 18);
    header.writeUInt32LE(0xffffffff, 22);
    header.writeUInt16LE(filename.length, 26);
    header.writeUInt16LE(20, 28);
    filename.copy(header, 30);
    const extra = 30 + filename.length;
    header.writeUInt16LE(1, extra);
    header.writeUInt16LE(16, extra + 2);
    header.writeBigUInt64LE(BigInt(size), extra + 4);
    header.writeBigUInt64LE(BigInt(size), extra + 12);
    write(header);
    if (data) write(data);
    else { position += size; ftruncateSync(fd, position); }

    const directory = Buffer.alloc(46 + filename.length + 28);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(45, 4);
    directory.writeUInt16LE(45, 6);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(0xffffffff, 20);
    directory.writeUInt32LE(0xffffffff, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt16LE(28, 30);
    directory.writeUInt32LE(0xffffffff, 42);
    filename.copy(directory, 46);
    const dirExtra = 46 + filename.length;
    directory.writeUInt16LE(1, dirExtra);
    directory.writeUInt16LE(24, dirExtra + 2);
    directory.writeBigUInt64LE(BigInt(size), dirExtra + 4);
    directory.writeBigUInt64LE(BigInt(size), dirExtra + 12);
    directory.writeBigUInt64LE(BigInt(localOffset), dirExtra + 20);
    central.push(directory);
  };
  try {
    const zeros = Buffer.alloc(1024 * 1024);
    let crc = 0;
    for (let remaining = binaryBytes; remaining > 0; remaining -= zeros.length)
      crc = crc32(zeros.subarray(0, Math.min(remaining, zeros.length)), crc);
    add("attachment.bin", binaryBytes, crc);
    for (const entry of entries) {
      const data = Buffer.from(entry.text);
      add(entry.name, data.length, crc32(data), data);
    }
    const centralOffset = position;
    for (const record of central) write(record);
    const centralSize = position - centralOffset;
    const zip64Offset = position;
    const end = Buffer.alloc(56);
    end.writeUInt32LE(0x06064b50, 0);
    end.writeBigUInt64LE(44n, 4);
    end.writeUInt16LE(45, 12);
    end.writeUInt16LE(45, 14);
    end.writeBigUInt64LE(BigInt(central.length), 24);
    end.writeBigUInt64LE(BigInt(central.length), 32);
    end.writeBigUInt64LE(BigInt(centralSize), 40);
    end.writeBigUInt64LE(BigInt(centralOffset), 48);
    write(end);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(zip64Offset), 8);
    locator.writeUInt32LE(1, 16);
    write(locator);
    const legacyEnd = Buffer.alloc(22);
    legacyEnd.writeUInt32LE(0x06054b50, 0);
    legacyEnd.writeUInt16LE(0xffff, 8);
    legacyEnd.writeUInt16LE(0xffff, 10);
    legacyEnd.writeUInt32LE(0xffffffff, 12);
    legacyEnd.writeUInt32LE(0xffffffff, 16);
    write(legacyEnd);
    return position;
  } finally { closeSync(fd); }
}
