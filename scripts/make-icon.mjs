import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const size = 128;
const pixels = Buffer.alloc(size * size * 4);
const insideRoundRect = (x, y, left, top, right, bottom, radius) => {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};
const paint = (x, y, color) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  pixels.set(color, (y * size + x) * 4);
};
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (insideRoundRect(x, y, 4, 4, 124, 124, 27)) paint(x, y, [17, 24, 23, 255]);
    if (insideRoundRect(x, y, 24, 39, 104, 96, 12)) paint(x, y, [128, 220, 174, 255]);
    if (insideRoundRect(x, y, 25, 30, 62, 49, 8)) paint(x, y, [128, 220, 174, 255]);
    if (insideRoundRect(x, y, 37, 55, 91, 61, 3)) paint(x, y, [31, 54, 43, 255]);
    if (insideRoundRect(x, y, 37, 68, 79, 74, 3)) paint(x, y, [31, 54, 43, 255]);
  }
}
const chunk = (name, data) => {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const crcBuffer = Buffer.alloc(4); crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, type, data, crcBuffer]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
header[8] = 8; header[9] = 6;
const rows = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1), y * size * 4, (y + 1) * size * 4);
await mkdir("src-tauri/icons", { recursive: true });
await writeFile("src-tauri/icons/icon.png", Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0)),
]));
