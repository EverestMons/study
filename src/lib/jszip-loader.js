// Shared JSZip loader — bundled via npm (no CDN dependency)
import JSZip from 'jszip';

// --- Safety limits ---
const MAX_DECOMPRESSED_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_ZIP_ENTRIES = 10000;

export function loadJSZip() {
  return Promise.resolve(JSZip);
}

/** Load zip with decompression safety limits */
export const safeLoadZip = async (buf) => {
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.keys(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error('Archive contains too many entries (' + entries.length + '). Max: ' + MAX_ZIP_ENTRIES);
  }
  let totalSize = 0;
  for (const name of entries) {
    const file = zip.files[name];
    if (!file.dir && file._data && file._data.uncompressedSize) {
      totalSize += file._data.uncompressedSize;
    }
  }
  if (totalSize > MAX_DECOMPRESSED_SIZE) {
    throw new Error('Decompressed size exceeds limit (' + Math.round(totalSize / 1024 / 1024) + ' MB). Max: 500 MB');
  }
  return zip;
};
