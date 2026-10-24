/**
 * Minimal JPEG EXIF parsing + timeline-consistency check.
 *
 * The parser is intentionally small: it walks JPEG segments to the APP1
 * "Exif\0\0" segment, parses the TIFF header (both endiannesses), reads
 * IFD0 tag 0x0110 (Model) and, via the ExifIFD pointer tag 0x8769, tag
 * 0x9003 (DateTimeOriginal). It never throws on malformed input — broken
 * or absent metadata is a normal case for customer uploads, not an error.
 *
 * Honest limit (Research 06, §3, signal 2): this signal evaporates when
 * metadata is absent, and absence must score ~zero — WhatsApp, Instagram
 * and similar platforms strip EXIF from honest uploads too.
 */
import { makeSignal, type RiskSignal } from './types.js';

export interface ExifMeta {
  dateTimeOriginal?: string;
  model?: string;
}

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

interface TiffReader {
  littleEndian: boolean;
  view: DataView;
  base: number; // offset of TIFF header within the byte array
}

function u16(r: TiffReader, offset: number): number {
  return r.view.getUint16(r.base + offset, r.littleEndian);
}
function u32(r: TiffReader, offset: number): number {
  return r.view.getUint32(r.base + offset, r.littleEndian);
}

function readAscii(
  r: TiffReader,
  type: number,
  count: number,
  valueFieldOffset: number,
): string | undefined {
  if (type !== 2 || count === 0) return undefined;
  const size = TYPE_SIZES[type] ?? 1;
  const total = size * count;
  let start: number;
  if (total <= 4) {
    start = r.base + valueFieldOffset;
  } else {
    start = r.base + u32(r, valueFieldOffset);
  }
  if (start < 0 || start >= r.view.byteLength) return undefined;
  const bytes: number[] = [];
  for (let i = 0; i < count && start + i < r.view.byteLength; i++) {
    const b = r.view.getUint8(start + i);
    if (b === 0) break;
    bytes.push(b);
  }
  const text = String.fromCharCode(...bytes).trim();
  return text.length > 0 ? text : undefined;
}

/** Parse one IFD; returns its entries as tag -> raw info, plus nothing else. */
function parseIfd(
  r: TiffReader,
  ifdOffset: number,
): Map<number, { type: number; count: number; valueOffset: number }> {
  const entries = new Map<
    number,
    { type: number; count: number; valueOffset: number }
  >();
  if (ifdOffset < 0 || r.base + ifdOffset + 2 > r.view.byteLength) return entries;
  const count = u16(r, ifdOffset);
  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (r.base + entryOffset + 12 > r.view.byteLength) break;
    const tag = u16(r, entryOffset);
    const type = u16(r, entryOffset + 2);
    const num = u32(r, entryOffset + 4);
    entries.set(tag, { type, count: num, valueOffset: entryOffset + 8 });
  }
  return entries;
}

function parseTiff(bytes: Uint8Array, tiffStart: number): ExifMeta {
  const meta: ExifMeta = {};
  if (tiffStart + 8 > bytes.length) return meta;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const b0 = bytes[tiffStart] ?? 0;
  const b1 = bytes[tiffStart + 1] ?? 0;
  let littleEndian: boolean;
  if (b0 === 0x49 && b1 === 0x49) littleEndian = true; // "II"
  else if (b0 === 0x4d && b1 === 0x4d) littleEndian = false; // "MM"
  else return meta;

  const reader: TiffReader = { littleEndian, view, base: tiffStart };
  if (u16(reader, 2) !== 42) return meta;
  const ifd0Offset = u32(reader, 4);

  const ifd0 = parseIfd(reader, ifd0Offset);

  const modelEntry = ifd0.get(0x0110);
  if (modelEntry) {
    const model = readAscii(
      reader,
      modelEntry.type,
      modelEntry.count,
      modelEntry.valueOffset,
    );
    if (model) meta.model = model;
  }

  const exifPointer = ifd0.get(0x8769);
  if (exifPointer) {
    // Pointer value is a LONG stored inline in the value field.
    const exifIfdOffset = u32(reader, exifPointer.valueOffset);
    const exifIfd = parseIfd(reader, exifIfdOffset);
    const dtoEntry = exifIfd.get(0x9003);
    if (dtoEntry) {
      const dto = readAscii(
        reader,
        dtoEntry.type,
        dtoEntry.count,
        dtoEntry.valueOffset,
      );
      if (dto) meta.dateTimeOriginal = dto;
    }
  }
  return meta;
}

/**
 * Extract { dateTimeOriginal, model } from JPEG bytes.
 * Returns an object with undefined fields when EXIF is absent or the
 * input is malformed — this function never throws.
 */
export function parseExif(bytes: Uint8Array): ExifMeta {
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return {};
    }
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return {};
      const marker = bytes[offset + 1] ?? 0;
      // Standalone markers without a length field.
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) {
        offset += 2;
        continue;
      }
      const segmentLength =
        ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      if (segmentLength < 2) return {};
      if (marker === 0xe1) {
        const dataStart = offset + 4;
        const isExif =
          bytes[dataStart] === 0x45 && // E
          bytes[dataStart + 1] === 0x78 && // x
          bytes[dataStart + 2] === 0x69 && // i
          bytes[dataStart + 3] === 0x66 && // f
          bytes[dataStart + 4] === 0x00 &&
          bytes[dataStart + 5] === 0x00;
        if (isExif) {
          return parseTiff(bytes, dataStart + 6);
        }
      }
      offset += 2 + segmentLength;
    }
    return {};
  } catch {
    return {};
  }
}

/** Parse an EXIF "YYYY:MM:DD HH:mm:ss" timestamp as UTC milliseconds. */
function exifDateTimeToUtcMs(value: string): number | null {
  const m = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  return Number.isNaN(ms) ? null : ms;
}

export interface ExifCheckContext {
  deliveredAtISO: string;
  photoClaimedOfDeliveredItem: boolean;
}

/**
 * Timeline-consistency check.
 *
 * - No usable EXIF at all -> a zero-score signal whose explanation states
 *   that absence contributes nothing (platforms strip EXIF from honest
 *   uploads too).
 * - EXIF DateTimeOriginal before the delivery, for a photo claimed to be
 *   of the delivered item -> a high exif_conflict signal: the photo cannot
 *   depict an item that had not been delivered yet.
 * - Otherwise (timestamps consistent, or the photo is not claimed to be of
 *   the delivered item) -> null: no signal, no suspicion.
 */
export function checkExifConsistency(
  meta: ExifMeta | null | undefined,
  ctx: ExifCheckContext,
): RiskSignal | null {
  const hasMeta = Boolean(meta && (meta.dateTimeOriginal || meta.model));
  if (!hasMeta) {
    return makeSignal({
      signal: 'exif_conflict',
      score: 0,
      source: 'exif-timeline-check',
      explanation:
        'No EXIF metadata — contributes zero: messaging platforms strip EXIF from honest uploads too.',
    });
  }

  if (!ctx.photoClaimedOfDeliveredItem) return null;
  if (!meta?.dateTimeOriginal) return null;

  const photoMs = exifDateTimeToUtcMs(meta.dateTimeOriginal);
  const deliveredMs = Date.parse(ctx.deliveredAtISO);
  if (photoMs === null || Number.isNaN(deliveredMs)) return null;

  if (photoMs < deliveredMs) {
    return makeSignal({
      signal: 'exif_conflict',
      score: 0.9,
      source: 'exif-timeline-check',
      explanation: `EXIF DateTimeOriginal (${meta.dateTimeOriginal}) predates the delivery (${ctx.deliveredAtISO}) for a photo claimed to be of the delivered item — the photo cannot depict that item.`,
    });
  }
  return null;
}
