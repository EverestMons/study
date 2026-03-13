import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Check for an available update. Returns update info or null.
 * Does not show any UI — callers decide how to present the result.
 * @returns {Promise<{version: string, notes: string, update: object}|null>}
 */
export async function checkForUpdate() {
  const update = await check();
  if (!update) return null;
  return { version: update.version, notes: update.body || "", update };
}

/**
 * Download and install a pending update, then relaunch.
 * @param {object} update - The update object from checkForUpdate().update
 * @param {(event: {event: string, data?: any}) => void} [onProgress]
 */
export async function installUpdate(update, onProgress) {
  await update.downloadAndInstall((event) => {
    if (onProgress) onProgress(event);
  });
  await relaunch();
}
