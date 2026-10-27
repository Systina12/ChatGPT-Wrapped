import { describe, expect, it } from "vitest";
import { closeSync, mkdtempSync, openSync, readSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filesToExportEntries } from "../src/lib/export/fileInput";
import { parseExportEntries } from "../src/lib/export/parser";
import { buildReport } from "../src/lib/report/engine";
import { conversation } from "./fixtures";
import { writeSparseArchive } from "./sparseArchive";

describe("large local archive import", () => {
  it("reads a real 5 GiB ZIP64 by ranges without loading its attachment", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapped-zip64-"));
    const path = join(directory, "large.zip");
    let fd: number | undefined;
    try {
      writeSparseArchive(path, 5 * 1024 ** 3, [
        { name: "conversations.json", text: JSON.stringify([conversation()]) },
      ]);
      const size = statSync(path).size;
      expect(size).toBeGreaterThan(5 * 1024 ** 3);
      fd = openSync(path, "r");
      let readBytes = 0;
      const file = {
        name: "large.zip", type: "application/zip", size,
        arrayBuffer: () => { throw new Error("whole-file read forbidden"); },
        slice(start = 0, end = size) {
          const count = end - start;
          if (count > 1024 * 1024) throw new Error("archive-sized read forbidden");
          const bytes = Buffer.alloc(count);
          readBytes += readSync(fd!, bytes, 0, count, start);
          return new Blob([bytes]);
        },
      } as unknown as File;
      const entries = await filesToExportEntries([file]);
      expect(entries.find((e) => e.name === "attachment.bin")?.size).toBe(5 * 1024 ** 3);
      expect(entries.every((e) => e.text === undefined)).toBe(true);
      const parsed = await parseExportEntries(entries);
      expect(parsed.messages).toHaveLength(3);
      expect(buildReport(parsed).meta.table_counts.messages).toBe(2);
      expect(readBytes).toBeLessThan(1024 * 1024);
    } finally {
      if (fd !== undefined) closeSync(fd);
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
