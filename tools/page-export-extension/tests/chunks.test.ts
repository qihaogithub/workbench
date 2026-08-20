import { describe, expect, it } from "vitest";
import { acceptCaptureChunk, assembleCaptureChunks } from "../src/shared/chunks.js";
import { CAPTURE_CHUNK_BYTES, checksumChunk, safeBundleFilename } from "../src/shared/protocol.js";

function roundTrip(sizeInMb: number): string {
  const source = "x".repeat(sizeInMb * 1024 * 1024 - 7) + "结束标记";
  const chunks = new Map<number, string>();
  const total = Math.ceil(source.length / CAPTURE_CHUNK_BYTES);
  for (let sequence = total - 1; sequence >= 0; sequence -= 1) {
    const chunk = source.slice(sequence * CAPTURE_CHUNK_BYTES, (sequence + 1) * CAPTURE_CHUNK_BYTES);
    acceptCaptureChunk(chunks, sequence, checksumChunk(chunk), chunk);
  }
  return assembleCaptureChunks(chunks, total);
}

describe("capture chunk protocol", () => {
  it.each([10, 50])("round-trips a %dMB capture out of order", (size) => {
    const result = roundTrip(size);
    expect(result.length).toBe(size * 1024 * 1024 - 7 + 4);
    expect(result.endsWith("结束标记")).toBe(true);
  });

  it("rejects corruption and gaps", () => {
    expect(() => acceptCaptureChunk(new Map(), 0, "00000000", "content")).toThrow(/校验失败/);
    expect(() => assembleCaptureChunks(new Map([[1, "late"]]), 2)).toThrow(/不完整/);
  });

  it("creates a safe deterministic filename", () => {
    expect(safeBundleFilename("https://app.example.test/a", "/项目/详情", "2026-08-20T10:11:12.000Z"))
      .toBe("editable-snapshot-app.example.test-root-2026-08-20T10-11-12-000Z.zip");
  });
});
