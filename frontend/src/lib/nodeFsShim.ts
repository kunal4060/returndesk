/**
 * Browser stub for node:fs — @impactx/ml's detectorTable imports
 * readFileSync at module level for its file-loading helper. In the
 * browser the frontend feeds the detector table from the synced
 * dataset JSON instead, so the file loader is never called; if it ever
 * is, it fails loudly rather than silently.
 */
export function readFileSync(): never {
  throw new Error(
    "readFileSync is not available in the browser — pass the detector table as data instead.",
  );
}

export default { readFileSync };
