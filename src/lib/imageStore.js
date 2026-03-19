// ============================================================
// imageStore.js — Filesystem storage for extracted material images
//
// Manages image files on disk at $APPDATA/images/{material_id}/.
// Uses @tauri-apps/plugin-fs for all filesystem operations.
// Uses @tauri-apps/api/core for converting paths to asset URLs.
//
// Depends on: @tauri-apps/plugin-fs, @tauri-apps/api/path, @tauri-apps/api/core
// ============================================================

let _appDataDir = null;

/**
 * Get the app data directory path (cached after first call).
 * @returns {Promise<string>}
 */
async function getAppDataPath() {
  if (_appDataDir) return _appDataDir;
  const { appDataDir } = await import('@tauri-apps/api/path');
  _appDataDir = await appDataDir();
  return _appDataDir;
}

/**
 * Get the images root directory path: $APPDATA/images/
 * @returns {Promise<string>}
 */
export async function getImagesRoot() {
  const dataDir = await getAppDataPath();
  return dataDir + 'images/';
}

/**
 * Get the image directory path for a specific material.
 * @param {string} materialId
 * @returns {Promise<string>} Absolute path to $APPDATA/images/{materialId}/
 */
export async function getImageDir(materialId) {
  const root = await getImagesRoot();
  return root + materialId + '/';
}

/**
 * Ensure the image directory for a material exists.
 * Creates both $APPDATA/images/ and $APPDATA/images/{materialId}/ if needed.
 * @param {string} materialId
 * @returns {Promise<string>} Absolute path to the created directory
 */
export async function ensureImageDir(materialId) {
  const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
  const root = await getImagesRoot();
  const dir = root + materialId + '/';

  // Create parent images/ dir if needed
  if (!(await exists(root))) {
    await mkdir(root, { recursive: true });
  }

  // Create material-specific dir
  if (!(await exists(dir))) {
    await mkdir(dir);
  }

  return dir;
}

/**
 * Save an image file to disk.
 * @param {string} materialId
 * @param {string} filename - e.g. "slide_001.png" or "embedded_002.jpg"
 * @param {Uint8Array|ArrayBuffer} data - Raw image bytes
 * @returns {Promise<{absolutePath: string, relativePath: string, size: number}>}
 */
export async function saveImage(materialId, filename, data) {
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  const dir = await ensureImageDir(materialId);
  const absolutePath = dir + filename;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  await writeFile(absolutePath, bytes);

  return {
    absolutePath,
    relativePath: materialId + '/' + filename,
    size: bytes.byteLength,
  };
}

/**
 * Delete all images for a material (removes the entire directory).
 * Safe to call when directory doesn't exist.
 * @param {string} materialId
 */
export async function deleteImageDir(materialId) {
  const { remove, exists } = await import('@tauri-apps/plugin-fs');
  const dir = await getImageDir(materialId);

  try {
    if (await exists(dir)) {
      await remove(dir, { recursive: true });
    }
  } catch (e) {
    console.warn('[ImageStore] Failed to delete image dir for', materialId, e);
  }
}

/**
 * Delete all images for a course (removes directories for all materials in the course).
 * @param {string[]} materialIds - List of material IDs belonging to the course
 */
export async function deleteCourseImages(materialIds) {
  for (const matId of materialIds) {
    await deleteImageDir(matId);
  }
}

/**
 * Convert a relative image path to a URL the WebView can load.
 * Uses Tauri's convertFileSrc for the asset protocol.
 * @param {string} relativePath - e.g. "mat-abc123/slide_001.png"
 * @returns {Promise<string>} URL suitable for <img src>
 */
export async function getImageUrl(relativePath) {
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  const root = await getImagesRoot();
  return convertFileSrc(root + relativePath);
}

/**
 * Get the absolute filesystem path for a relative image path.
 * @param {string} relativePath - e.g. "mat-abc123/slide_001.png"
 * @returns {Promise<string>}
 */
export async function getImageAbsolutePath(relativePath) {
  const root = await getImagesRoot();
  return root + relativePath;
}
