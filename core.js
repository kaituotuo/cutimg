(function attachCutimgCore(root, factory) {
  var api = factory(root);

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CutimgCore = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function createCutimgCore(root) {
  'use strict';

  var DEFAULT_MIN_HEIGHT = 40;
  var MAX_UINT32 = 0xffffffff;
  var DOS_DATE_EPOCH = 0x0021; // 1980-01-01

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function toPositiveInteger(value, fallback) {
    if (!isFiniteNumber(value)) {
      return fallback;
    }
    var rounded = Math.round(value);
    return rounded > 0 ? rounded : fallback;
  }

  function toNonNegativeInteger(value, fallback) {
    if (!isFiniteNumber(value)) {
      return fallback;
    }
    var rounded = Math.round(value);
    return rounded >= 0 ? rounded : fallback;
  }

  function normalizeTotal(totalHeight) {
    return toPositiveInteger(totalHeight, 0);
  }

  function normalizeMinHeight(minHeight) {
    return toNonNegativeInteger(minHeight, DEFAULT_MIN_HEIGHT);
  }

  function normalizeGuideValue(value) {
    return isFiniteNumber(value) ? Math.round(value) : NaN;
  }

  function uniqueSorted(values) {
    var sorted = values.slice().sort(function sortNumbers(a, b) {
      return a - b;
    });
    var result = [];
    for (var i = 0; i < sorted.length; i += 1) {
      if (i === 0 || sorted[i] !== sorted[i - 1]) {
        result.push(sorted[i]);
      }
    }
    return result;
  }

  function normalizedGuides(guides, totalHeight) {
    if (!Array.isArray(guides)) {
      return [];
    }
    var total = normalizeTotal(totalHeight);
    var values = [];
    for (var i = 0; i < guides.length; i += 1) {
      var guide = normalizeGuideValue(guides[i]);
      if (!Number.isFinite(guide)) {
        continue;
      }
      if (guide > 0 && guide < total) {
        values.push(guide);
      }
    }
    return uniqueSorted(values);
  }

  function equalBoundaries(total, count) {
    var boundaries = [];
    for (var i = 1; i < count; i += 1) {
      // Floor keeps every boundary monotonic and leaves the remainder at the end.
      boundaries.push(Math.floor((total * i) / count));
    }
    return boundaries;
  }

  /**
   * Return the internal y positions for equally sized slices.
   *
   * In height mode targetValue is the approximate maximum height of one
   * slice. The number of slices is ceil(totalHeight / targetValue), after
   * which the full image is distributed evenly across that count.
   */
  function equalCuts(totalHeight, mode, targetValue) {
    var total = normalizeTotal(totalHeight);
    if (!total || (mode !== 'height' && mode !== 'count')) {
      return [];
    }

    var target = toPositiveInteger(targetValue, 0);
    if (!target) {
      return [];
    }

    var count = mode === 'height' ? Math.ceil(total / target) : target;
    if (!count || count <= 1) {
      return [];
    }
    // Integer pixel boundaries cannot represent more than one positive slice
    // per pixel. Clamping keeps the returned guides unique and internal.
    count = Math.min(count, total);
    if (count <= 1) {
      return [];
    }
    return equalBoundaries(total, count);
  }

  /**
   * Turn internal y positions into contiguous image segments.
   */
  function segments(totalHeight, guides) {
    var total = normalizeTotal(totalHeight);
    if (!total) {
      return [];
    }

    var boundaries = normalizedGuides(guides, total);
    var result = [];
    var start = 0;
    for (var i = 0; i < boundaries.length; i += 1) {
      var end = boundaries[i];
      result.push({ start: start, end: end, height: end - start });
      start = end;
    }
    result.push({ start: start, end: total, height: total - start });
    return result;
  }

  function validGuideSet(guides, total, minHeight) {
    if (!Array.isArray(guides)) {
      return false;
    }
    var previous = 0;
    for (var i = 0; i < guides.length; i += 1) {
      var guide = normalizeGuideValue(guides[i]);
      if (!Number.isFinite(guide) || guide <= previous || guide >= total) {
        return false;
      }
      if (guide - previous < minHeight) {
        return false;
      }
      previous = guide;
    }
    return total - previous >= minHeight;
  }

  /**
   * Add one internal guide. Invalid positions are rejected without changing
   * the caller's array; valid output is sorted and duplicate-free.
   */
  function addGuide(guides, y, totalHeight, minHeight) {
    var original = Array.isArray(guides) ? guides.slice() : [];
    var total = normalizeTotal(totalHeight);
    var minimum = normalizeMinHeight(minHeight);
    var candidate = normalizeGuideValue(y);

    if (!total || !Number.isFinite(candidate)) {
      return original;
    }

    var existing = [];
    if (Array.isArray(guides)) {
      for (var i = 0; i < guides.length; i += 1) {
        var current = normalizeGuideValue(guides[i]);
        if (!Number.isFinite(current)) {
          return original;
        }
        existing.push(current);
      }
    }

    var sortedExisting = uniqueSorted(existing);
    if (!validGuideSet(sortedExisting, total, minimum)) {
      return original;
    }
    if (candidate <= 0 || candidate >= total || sortedExisting.indexOf(candidate) !== -1) {
      return original;
    }

    var next = sortedExisting.concat(candidate).sort(function sortNumbers(a, b) {
      return a - b;
    });
    if (!validGuideSet(next, total, minimum)) {
      return original;
    }
    return uniqueSorted(next);
  }

  /**
   * Move one existing guide while preserving order and the minimum slice
   * height. The requested y is clamped to the available interval.
   */
  function moveGuide(guides, index, y, totalHeight, minHeight) {
    var original = Array.isArray(guides) ? guides.slice() : [];
    var total = normalizeTotal(totalHeight);
    var minimum = normalizeMinHeight(minHeight);
    var requested = normalizeGuideValue(y);
    var numericIndex = isFiniteNumber(index) ? Math.trunc(index) : -1;

    if (!total || !Number.isFinite(requested) || !Array.isArray(guides)) {
      return original;
    }

    var current = [];
    for (var i = 0; i < guides.length; i += 1) {
      var guide = normalizeGuideValue(guides[i]);
      if (!Number.isFinite(guide)) {
        return original;
      }
      current.push(guide);
    }
    current = uniqueSorted(current);
    if (!validGuideSet(current, total, minimum) || numericIndex < 0 || numericIndex >= current.length) {
      return original;
    }

    var lower = numericIndex === 0 ? minimum : current[numericIndex - 1] + minimum;
    var upper = numericIndex === current.length - 1 ? total - minimum : current[numericIndex + 1] - minimum;
    if (lower > upper) {
      return original;
    }

    var clamped = Math.max(lower, Math.min(upper, requested));
    current[numericIndex] = clamped;
    return uniqueSorted(current);
  }

  // CRC-32 table for ZIP stored entries. This is small and avoids a runtime
  // dependency in both the browser and Node.
  var CRC_TABLE = (function createCrcTable() {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i += 1) {
      var value = i;
      for (var bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeU16(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeU32(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
    target[offset + 2] = (value >>> 16) & 0xff;
    target[offset + 3] = (value >>> 24) & 0xff;
  }

  function concatBytes(parts, totalLength) {
    var output = new Uint8Array(totalLength);
    var offset = 0;
    for (var i = 0; i < parts.length; i += 1) {
      output.set(parts[i], offset);
      offset += parts[i].length;
    }
    return output;
  }

  function encodeName(name) {
    var value = String(name == null ? '' : name);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(value);
    }
    if (root && typeof root.TextEncoder !== 'undefined') {
      return new root.TextEncoder().encode(value);
    }
    // Modern browsers and supported Node versions provide TextEncoder. This
    // fallback keeps the classic script usable in older environments.
    var encoded = unescape(encodeURIComponent(value));
    var bytes = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i += 1) {
      bytes[i] = encoded.charCodeAt(i);
    }
    return bytes;
  }

  async function toBytes(value) {
    if (value && typeof value.arrayBuffer === 'function') {
      return new Uint8Array(await value.arrayBuffer());
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new TypeError('buildZip expects each file blob to be Blob or ArrayBuffer data');
  }

  function resolveBlobCtor() {
    if (root && typeof root.Blob === 'function') {
      return root.Blob;
    }
    if (typeof Blob === 'function') {
      return Blob;
    }
    if (typeof require === 'function') {
      try {
        return require('buffer').Blob;
      } catch (error) {
        // Fall through to the explicit error below.
      }
    }
    return null;
  }

  /**
   * Build a ZIP archive containing stored (uncompressed) entries.
   */
  async function buildZip(files) {
    if (!Array.isArray(files)) {
      throw new TypeError('buildZip expects an array of files');
    }

    var entries = [];
    for (var i = 0; i < files.length; i += 1) {
      var file = files[i] || {};
      var nameBytes = encodeName(file.name);
      if (!nameBytes.length || nameBytes.length > 0xffff) {
        throw new RangeError('ZIP file names must contain between 1 and 65535 UTF-8 bytes');
      }
      var data = await toBytes(file.blob);
      if (data.length > MAX_UINT32) {
        throw new RangeError('ZIP entries larger than 4 GiB are not supported');
      }
      entries.push({
        nameBytes: nameBytes,
        data: data,
        crc: crc32(data)
      });
    }

    var localParts = [];
    var centralParts = [];
    var localOffset = 0;
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      var entry = entries[entryIndex];
      var localHeader = new Uint8Array(30 + entry.nameBytes.length);
      writeU32(localHeader, 0, 0x04034b50);
      writeU16(localHeader, 4, 20); // version needed to extract
      writeU16(localHeader, 6, 0x0800); // UTF-8 filename flag
      writeU16(localHeader, 8, 0); // stored method
      writeU16(localHeader, 10, 0); // DOS time, deterministic output
      writeU16(localHeader, 12, DOS_DATE_EPOCH); // DOS date, deterministic output
      writeU32(localHeader, 14, entry.crc);
      writeU32(localHeader, 18, entry.data.length);
      writeU32(localHeader, 22, entry.data.length);
      writeU16(localHeader, 26, entry.nameBytes.length);
      writeU16(localHeader, 28, 0);
      localHeader.set(entry.nameBytes, 30);
      localParts.push(localHeader, entry.data);
      localOffset += localHeader.length + entry.data.length;

      var centralHeader = new Uint8Array(46 + entry.nameBytes.length);
      writeU32(centralHeader, 0, 0x02014b50);
      writeU16(centralHeader, 4, 20); // made by (DOS/20)
      writeU16(centralHeader, 6, 20); // version needed to extract
      writeU16(centralHeader, 8, 0x0800);
      writeU16(centralHeader, 10, 0);
      writeU16(centralHeader, 12, 0);
      writeU16(centralHeader, 14, DOS_DATE_EPOCH);
      writeU32(centralHeader, 16, entry.crc);
      writeU32(centralHeader, 20, entry.data.length);
      writeU32(centralHeader, 24, entry.data.length);
      writeU16(centralHeader, 28, entry.nameBytes.length);
      writeU16(centralHeader, 30, 0); // extra length
      writeU16(centralHeader, 32, 0); // comment length
      writeU16(centralHeader, 34, 0); // disk number
      writeU16(centralHeader, 36, 0); // internal attributes
      writeU32(centralHeader, 38, 0); // external attributes
      writeU32(centralHeader, 42, localOffset - localHeader.length - entry.data.length);
      centralHeader.set(entry.nameBytes, 46);
      centralParts.push(centralHeader);
    }

    var centralLength = 0;
    for (var centralIndex = 0; centralIndex < centralParts.length; centralIndex += 1) {
      centralLength += centralParts[centralIndex].length;
    }
    if (entries.length > 0xffff || localOffset > MAX_UINT32 || centralLength > MAX_UINT32) {
      throw new RangeError('ZIP archive exceeds classic ZIP limits');
    }

    var end = new Uint8Array(22);
    writeU32(end, 0, 0x06054b50);
    writeU16(end, 4, 0);
    writeU16(end, 6, 0);
    writeU16(end, 8, entries.length);
    writeU16(end, 10, entries.length);
    writeU32(end, 12, centralLength);
    writeU32(end, 16, localOffset);
    writeU16(end, 20, 0);

    var allParts = localParts.concat(centralParts, [end]);
    var totalLength = 0;
    for (var partIndex = 0; partIndex < allParts.length; partIndex += 1) {
      totalLength += allParts[partIndex].length;
    }
    var archive = concatBytes(allParts, totalLength);
    var BlobCtor = resolveBlobCtor();
    if (!BlobCtor) {
      throw new Error('This environment does not provide Blob');
    }
    return new BlobCtor([archive], { type: 'application/zip' });
  }

  return {
    equalCuts: equalCuts,
    segments: segments,
    addGuide: addGuide,
    moveGuide: moveGuide,
    buildZip: buildZip
  };
});
