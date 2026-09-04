import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile as tauriReadFile } from '@tauri-apps/plugin-fs';

export const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'epub', 'docx', 'pptx', 'xlsx', 'xls', 'xlsm',
  'csv', 'txt', 'md', 'srt', 'vtt',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
]);

export const MIME_MAP = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  srt: 'text/plain',
  vtt: 'text/vtt',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const getExt = (name) => {
  var parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

// Opens native OS folder picker dialog.
// Returns selected folder path (string) or null if cancelled.
export const pickFolder = async (defaultPath) => {
  var selected = await open({ directory: true, title: 'Select course folder', defaultPath: defaultPath || undefined });
  return selected || null;
};

// Recursively reads folder contents up to maxDepth levels deep, filters to supported extensions.
// Nested files carry their relative path from the root as `subfolder` (e.g. "Week1/Lecture");
// root-level files have subfolder === null.
// Returns { folderName, files: [{ name, path, ext, subfolder }], unsupported: [{ name, ext }] }
export const scanFolder = async (folderPath, { maxDepth = 8 } = {}) => {
  var parts = folderPath.replace(/\\/g, '/').split('/');
  var folderName = parts[parts.length - 1] || parts[parts.length - 2] || 'folder';
  var files = [];
  var unsupported = [];

  // Walk one directory: collect its files, then recurse into child directories.
  // depth is the directory's level below the root (root = 0).
  var walk = async (dirPath, subfolder, depth) => {
    var entries;
    try {
      entries = await readDir(dirPath);
    } catch (e) {
      console.warn('[folderImport] Could not read folder:', dirPath, e);
      return;
    }
    for (var entry of entries) {
      if (entry.isFile) {
        var ext = getExt(entry.name);
        var path = dirPath + '/' + entry.name;
        if (ext && SUPPORTED_EXTENSIONS.has(ext)) {
          files.push({ name: entry.name, path, ext, subfolder });
        } else if (ext) {
          unsupported.push({ name: entry.name, ext });
        }
      } else if (entry.isDirectory && !entry.isSymlink && !entry.name.startsWith('.') && depth < maxDepth) {
        var childSub = subfolder === null ? entry.name : subfolder + '/' + entry.name;
        await walk(dirPath + '/' + entry.name, childSub, depth + 1);
      }
    }
  };

  await walk(folderPath, null, 0);

  // Sort: subfolders grouped alphabetically, then files by name within each group
  files.sort((a, b) => {
    if (a.subfolder === b.subfolder) return a.name.localeCompare(b.name);
    if (a.subfolder === null) return -1;
    if (b.subfolder === null) return 1;
    return a.subfolder.localeCompare(b.subfolder);
  });

  return { folderName, folderPath, files, unsupported };
};

// Reads selected files from disk and constructs browser File objects.
// Input: array of { name, path, ext } from scanFolder output.
// Output: array of browser File objects compatible with readFile() in parsers.js.
export const readSelectedFiles = async (selectedFiles, onProgress) => {
  var results = [];
  for (var i = 0; i < selectedFiles.length; i++) {
    if (onProgress) onProgress(i, selectedFiles.length, selectedFiles[i].name);
    try {
      var data = await tauriReadFile(selectedFiles[i].path);
      var mime = MIME_MAP[selectedFiles[i].ext] || 'application/octet-stream';
      var file = new File([data], selectedFiles[i].name, { type: mime });
      results.push(file);
    } catch (e) {
      console.warn('[folderImport] Could not read file:', selectedFiles[i].name, e);
    }
  }
  return results;
};
