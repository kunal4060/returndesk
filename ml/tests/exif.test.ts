import { describe, expect, it } from 'vitest';
import { checkExifConsistency, parseExif } from '../src/exif.js';

/**
 * Build a minimal synthetic JPEG carrying a hand-built TIFF/EXIF block:
 * IFD0 with Model (0x0110) + ExifIFD pointer (0x8769), ExifIFD with
 * DateTimeOriginal (0x9003). Little-endian TIFF.
 */
function buildJpegWithExif(
  dateTimeOriginal: string,
  model: string,
): Uint8Array {
  const modelBytes = [...model].map((ch) => ch.charCodeAt(0)).concat(0);
  const dtoBytes = [...dateTimeOriginal]
    .map((ch) => ch.charCodeAt(0))
    .concat(0);

  const IFD0_OFFSET = 8;
  const IFD0_SIZE = 2 + 2 * 12 + 4; // count + 2 entries + next pointer
  const EXIF_IFD_OFFSET = IFD0_OFFSET + IFD0_SIZE;
  const EXIF_IFD_SIZE = 2 + 1 * 12 + 4;
  const DATA_OFFSET = EXIF_IFD_OFFSET + EXIF_IFD_SIZE;
  const MODEL_OFFSET = DATA_OFFSET;
  const DTO_OFFSET = MODEL_OFFSET + modelBytes.length;
  const tiffLength = DTO_OFFSET + dtoBytes.length;

  const tiff = new Uint8Array(tiffLength);
  const view = new DataView(tiff.buffer);
  // TIFF header: "II", magic 42, IFD0 offset.
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, IFD0_OFFSET, true);

  function writeEntry(
    at: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  }

  // IFD0
  view.setUint16(IFD0_OFFSET, 2, true);
  writeEntry(IFD0_OFFSET + 2, 0x0110, 2, modelBytes.length, MODEL_OFFSET);
  writeEntry(IFD0_OFFSET + 14, 0x8769, 4, 1, EXIF_IFD_OFFSET);
  view.setUint32(IFD0_OFFSET + 26, 0, true);

  // ExifIFD
  view.setUint16(EXIF_IFD_OFFSET, 1, true);
  writeEntry(EXIF_IFD_OFFSET + 2, 0x9003, 2, dtoBytes.length, DTO_OFFSET);
  view.setUint32(EXIF_IFD_OFFSET + 14, 0, true);

  tiff.set(modelBytes, MODEL_OFFSET);
  tiff.set(dtoBytes, DTO_OFFSET);

  // JPEG: SOI, APP1 (Exif), TIFF payload, EOI.
  const app1Length = 2 + 6 + tiffLength;
  const jpeg = new Uint8Array(2 + 2 + app1Length + 2);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  jpeg[3] = 0xe1;
  jpeg[4] = (app1Length >> 8) & 0xff;
  jpeg[5] = app1Length & 0xff;
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6); // "Exif\0\0"
  jpeg.set(tiff, 12);
  jpeg[jpeg.length - 2] = 0xff;
  jpeg[jpeg.length - 1] = 0xd9;
  return jpeg;
}

describe('parseExif', () => {
  it('reads Model and DateTimeOriginal from a synthetic JPEG', () => {
    const jpeg = buildJpegWithExif('2026:01:10 09:30:00', 'TestCam X100');
    const meta = parseExif(jpeg);
    expect(meta.model).toBe('TestCam X100');
    expect(meta.dateTimeOriginal).toBe('2026:01:10 09:30:00');
  });

  it('returns empty meta for a plain JPEG without EXIF', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    expect(parseExif(jpeg)).toEqual({});
  });

  it('never throws on malformed input', () => {
    expect(parseExif(new Uint8Array([]))).toEqual({});
    expect(parseExif(new Uint8Array([1, 2, 3, 4, 5]))).toEqual({});
    expect(
      parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x02])),
    ).toEqual({});
  });
});

describe('checkExifConsistency', () => {
  const deliveredAtISO = '2026-01-20T10:00:00.000Z';

  it('fires a high exif_conflict when the photo predates delivery', () => {
    const jpeg = buildJpegWithExif('2026:01:10 09:30:00', 'TestCam X100');
    const meta = parseExif(jpeg);
    const signal = checkExifConsistency(meta, {
      deliveredAtISO,
      photoClaimedOfDeliveredItem: true,
    });
    expect(signal).not.toBeNull();
    expect(signal?.signal).toBe('exif_conflict');
    expect(signal?.score).toBe(0.9);
    expect(signal?.band).toBe('high');
    expect(signal?.action).toBe('review_priority_only');
  });

  it('returns the zero-score stripping signal when EXIF is absent', () => {
    const signal = checkExifConsistency(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), {
      deliveredAtISO,
      photoClaimedOfDeliveredItem: true,
    });
    expect(signal).not.toBeNull();
    expect(signal?.score).toBe(0);
    expect(signal?.band).toBe('low');
    expect(signal?.explanation).toBe(
      'No EXIF metadata — contributes zero: messaging platforms strip EXIF from honest uploads too.',
    );
  });

  it('also treats null meta as absent', () => {
    const signal = checkExifConsistency(null, {
      deliveredAtISO,
      photoClaimedOfDeliveredItem: true,
    });
    expect(signal?.score).toBe(0);
  });

  it('returns null when the timestamp is after delivery', () => {
    const signal = checkExifConsistency(
      { dateTimeOriginal: '2026:01:22 08:00:00', model: 'TestCam X100' },
      { deliveredAtISO, photoClaimedOfDeliveredItem: true },
    );
    expect(signal).toBeNull();
  });

  it('returns null when the photo is not claimed to be of the delivered item', () => {
    const signal = checkExifConsistency(
      { dateTimeOriginal: '2026:01:10 09:30:00', model: 'TestCam X100' },
      { deliveredAtISO, photoClaimedOfDeliveredItem: false },
    );
    expect(signal).toBeNull();
  });
});
