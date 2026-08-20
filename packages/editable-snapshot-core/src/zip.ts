import type { VirtualFile } from "./contracts.js";

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Store-only ZIP keeps the implementation dependency-free and deterministic in MV3. */
export function createZip(files: VirtualFile[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const checksum = crc32(file.content);
    const localHeader = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(checksum), u32(file.content.length), u32(file.content.length), u16(name.length), u16(0), name,
    ]);
    localParts.push(localHeader, file.content);
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(checksum), u32(file.content.length), u32(file.content.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), name,
    ]));
    localOffset += localHeader.length + file.content.length;
  }

  const central = concat(centralParts);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(localOffset), u16(0),
  ]);
  return concat([...localParts, central, end]);
}
