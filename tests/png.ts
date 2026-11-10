import zlib from 'node:zlib';

/** PNG válido (blanco con un trazo) generado sin dependencias. */
export function makePng(w = 600, h = 200): string {
  const crcTable = (buf: Buffer) => zlib.crc32(buf);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crcTable(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0; // escala de grises
  const raw = Buffer.alloc((w + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    const x = Math.floor((y / h) * (w - 40)) + 20;
    for (let k = 0; k < 4; k++) raw[y * (w + 1) + 1 + x + k] = 0;
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

