import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CONVERT_MS, dockerTools, STAMP_MS } from '../printTask.ts';

const FOLDER = path.resolve(import.meta.dirname);
const IMAGE = 'quickeval-print-test';

// The smallest Word file: one paragraph.
const WORD_PARTS: Record<string, string> = {
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml"' +
    ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1"' +
    ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"' +
    ' Target="word/document.xml"/></Relationships>',
  'word/document.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>Test de evaluare</w:t></w:r></w:p></w:body></w:document>',
};

// A zip archive whose files are stored, not compressed.
function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// Builds the print image and runs the Python tests inside it. Slow, so it runs
// only when QE_PRINT_IMAGE_TESTS=1.
describe.skipIf(process.env.QE_PRINT_IMAGE_TESTS !== '1')('print container', () => {
  it('builds the image and passes its Python tests', { timeout: 20 * 60_000 }, () => {
    const build = spawnSync('docker', ['build', '-t', IMAGE, FOLDER], { encoding: 'utf8', timeout: 15 * 60_000 });
    expect(build.status, build.stderr).toBe(0);
    const run = spawnSync(
      'docker',
      [
        'run', '--rm', '-v', `${FOLDER}:/tests:ro`, IMAGE, 'sh', '-c',
        'pip3 install --break-system-packages opencv-python-headless && python3 -m unittest discover -s /tests -p test_print.py -v',
      ],
      { encoding: 'utf8', timeout: 5 * 60_000, env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });

  it('has no DejaVu or Noto font outside LibreOffice', { timeout: 15 * 60_000 }, () => {
    const build = spawnSync('docker', ['build', '-t', IMAGE, FOLDER], { encoding: 'utf8', timeout: 15 * 60_000 });
    expect(build.status, build.stderr).toBe(0);
    const list = spawnSync('docker', ['run', '--rm', IMAGE, 'fc-list', ':', 'file'], { encoding: 'utf8', timeout: 60_000 });
    expect(list.status, list.stderr).toBe(0);
    // LibreOffice's own fonts under /opt/libreoffice<version>/ may include
    // either family; every other font that fontconfig finds is checked.
    const fonts = list.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('/opt/libreoffice'));
    expect(fonts.some((line) => /liberation/i.test(line))).toBe(true);
    expect(fonts.filter((line) => /dejavu|noto/i.test(line))).toEqual([]);
  });

  it('converts and stamps a Word file exactly as the robot runs the container', { timeout: 15 * 60_000 }, async () => {
    const tools = dockerTools(FOLDER);
    await tools.prepare();
    const folder = mkdtempSync(path.join(tmpdir(), 'qe-print-container-'));
    try {
      writeFileSync(path.join(folder, 'in.docx'), storedZip(WORD_PARTS));
      // The robot's own limits: a cold container must convert in time.
      await tools.run(['python3', '/app/docx_to_pdf.py', '/work/in.docx', '-o', '/work/converted.pdf'], folder, CONVERT_MS);
      const link = 'https://quickeval.test/u/abcdefghijklmnop';
      await tools.run(['python3', '/app/stamp_qr.py', '/work/converted.pdf', '/work/out.pdf', link, 'quickeval.test/u/abcdefghijklmnop'], folder, STAMP_MS);
      const out = path.join(folder, 'out.pdf');
      expect(readFileSync(out).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // On Linux the container wrote as this user, so the robot can remove it.
      const uid = process.getuid?.();
      if (uid !== undefined) expect(statSync(out).uid).toBe(uid);
    } finally {
      rmSync(folder, { recursive: true });
    }
    expect(existsSync(folder)).toBe(false);
  });
});
