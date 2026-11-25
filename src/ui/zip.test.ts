import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip.ts';

// Reads a stored ZIP back through its central directory, as an unzip program
// does, and checks each local header against it.
async function readZip(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const endAt = bytes.length - 22;
  expect(view.getUint32(endAt, true)).toBe(0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const decoder = new TextDecoder();
  const files: { name: string; text: string; flags: number; crc: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const flags = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0);
    expect(view.getUint32(offset + 14, true)).toBe(crc);
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.push({ name, text: decoder.decode(data), flags, crc });
    at += 46 + nameLength;
  }
  return files;
}

describe('crc32', () => {
  it('gives the check value of the standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('makeZip', () => {
  it('stores each file under its UTF-8 name', async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const zip = makeZip([
      { name: 'pagina 1.jpg', data: encode('prima') },
      { name: 'Ștefan – pagina 2.png', data: encode('a doua') },
    ]);
    expect(zip.type).toBe('application/zip');
    const files = await readZip(zip);
    expect(files.map((file) => [file.name, file.text])).toEqual([
      ['pagina 1.jpg', 'prima'],
      ['Ștefan – pagina 2.png', 'a doua'],
    ]);
    expect(files.every((file) => file.flags === 0x0800)).toBe(true);
  });

  it('makes an empty archive with no file', async () => {
    const zip = makeZip([]);
    expect(zip.size).toBe(22);
    expect(await readZip(zip)).toEqual([]);
  });

  it('keeps a date before 1980 inside the format', async () => {
    const zip = makeZip([{ name: 'a.txt', data: new Uint8Array([1]), modified: new Date(1970, 0, 1) }]);
    const view = new DataView(await zip.arrayBuffer());
    // Year 0 of the DOS date is 1980: January 1st.
    expect(view.getUint16(12, true)).toBe((1 << 5) | 1);
  });
});
