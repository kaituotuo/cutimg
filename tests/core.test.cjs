'use strict';

const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const core = require('../core.js');
const runI18nTests = require('./i18n.test.cjs');

function assertPartition(total, guides) {
  const pieces = core.segments(total, guides);
  assert.ok(pieces.length >= 1);
  assert.equal(pieces[0].start, 0);
  assert.equal(pieces.at(-1).end, total);
  let cursor = 0;
  let covered = 0;
  for (const piece of pieces) {
    assert.equal(piece.start, cursor);
    assert.equal(piece.height, piece.end - piece.start);
    assert.ok(piece.height > 0);
    cursor = piece.end;
    covered += piece.height;
  }
  assert.equal(covered, total);
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

async function unzipStored(blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const files = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = readU16(bytes, offset + 8);
    const flags = readU16(bytes, offset + 6);
    const dosDate = readU16(bytes, offset + 12);
    const crc = readU32(bytes, offset + 14);
    const size = readU32(bytes, offset + 18);
    const nameLength = readU16(bytes, offset + 26);
    const extraLength = readU16(bytes, offset + 28);
    assert.equal(method, 0);
    assert.ok(flags & 0x0800);
    assert.equal(dosDate, 0x0021);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + size;
    files.push({
      name: decodeUtf8(bytes.subarray(nameStart, nameStart + nameLength)),
      data: bytes.subarray(dataStart, dataEnd),
      crc,
      size
    });
    offset = dataEnd;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  assert.equal(readU16(bytes, offset + 14), 0x0021);
  const endOffset = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(endOffset), 0x06054b50);
  const centralSize = readU32(bytes, endOffset + 12);
  const count = readU16(bytes, endOffset + 10);
  assert.equal(readU32(bytes, endOffset + 16), offset);
  assert.equal(offset + centralSize, endOffset);
  assert.equal(count, files.length);
  return files;
}

async function run() {
  await runI18nTests();

  assert.deepEqual(core.equalCuts(30000, 'height', 2000), [
    2000, 4000, 6000, 8000, 10000, 12000, 14000,
    16000, 18000, 20000, 22000, 24000, 26000, 28000
  ]);
  assert.deepEqual(core.equalCuts(1000, 'count', 2), [500]);
  assert.deepEqual(core.equalCuts(1000, 'count', 1), []);
  assert.deepEqual(core.equalCuts(3, 'count', 5), [1, 2]);
  assert.equal(core.equalCuts(1000, 'height', 0).length, 0);
  assert.equal(core.equalCuts(1000, 'other', 2).length, 0);

  const unevenGuides = core.equalCuts(10, 'count', 3);
  assert.deepEqual(unevenGuides, [3, 6]);
  const unevenPieces = core.segments(10, unevenGuides);
  assert.deepEqual(unevenPieces.map((piece) => piece.height), [3, 3, 4]);
  assert.ok(Math.max(...unevenPieces.map((piece) => piece.height)) -
    Math.min(...unevenPieces.map((piece) => piece.height)) <= 1);
  assertPartition(30000, core.equalCuts(30000, 'height', 2300));
  assertPartition(997, core.equalCuts(997, 'count', 7));
  assert.deepEqual(core.segments(100, [80, 20, 80, 0, 100]), [
    { start: 0, end: 20, height: 20 },
    { start: 20, end: 80, height: 60 },
    { start: 80, end: 100, height: 20 }
  ]);

  assert.deepEqual(core.addGuide([200, 100], 150, 400, 40), [100, 150, 200]);
  assert.deepEqual(core.addGuide([100, 200], 200, 400, 40), [100, 200]);
  assert.deepEqual(core.addGuide([100, 200], 120, 400, 40), [100, 200]);
  assert.deepEqual(core.addGuide([100, 200], 20, 400, 40), [100, 200]);
  assert.deepEqual(core.addGuide([100, 200], 150, 400, 40), [100, 150, 200]);
  const beforeAdd = [200, 100];
  core.addGuide(beforeAdd, 150, 400, 40);
  assert.deepEqual(beforeAdd, [200, 100]);

  assert.deepEqual(core.moveGuide([100, 200, 300], 1, 250, 500, 40), [100, 250, 300]);
  assert.deepEqual(core.moveGuide([100, 200, 300], 1, 20, 500, 40), [100, 140, 300]);
  assert.deepEqual(core.moveGuide([100, 200, 300], 1, 490, 500, 40), [100, 260, 300]);
  assert.deepEqual(core.moveGuide([100, 200], 0, -20, 500, 40), [40, 200]);
  assert.deepEqual(core.moveGuide([100, 200], 1, 999, 500, 40), [100, 460]);
  assert.deepEqual(core.moveGuide([100, 200], 99, 250, 500, 40), [100, 200]);

  const zip = await core.buildZip([
    { name: 'slice-01.png', blob: new Blob([Buffer.from([0, 1, 2, 3])], { type: 'image/png' }) },
    { name: '中文-02.png', blob: Buffer.from('cutimg', 'utf8') }
  ]);
  assert.equal(zip.type, 'application/zip');
  const entries = await unzipStored(zip);
  assert.deepEqual(entries.map((entry) => entry.name), ['slice-01.png', '中文-02.png']);
  assert.deepEqual(Buffer.from(entries[0].data), Buffer.from([0, 1, 2, 3]));
  assert.deepEqual(Buffer.from(entries[1].data), Buffer.from('cutimg', 'utf8'));
  for (const entry of entries) {
    assert.equal(entry.size, entry.data.length);
    assert.notEqual(entry.crc, 0);
  }

  console.log('core tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
