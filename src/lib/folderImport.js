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

// Reads folder contents up to maxDepth, filters to supported extensions.
// Returns { folderName, files: [{ name, path, ext, subfolder }], unsupported: [{ name, ext }] }
export const scanFolder = async (folderPath, { maxDepth = 1 } = {}) => {
  var parts = folderPath.replace(/\\/g, '/').split('/');
  var folderName = parts[parts.length - 1] || parts[parts.length - 2] || 'folder';
  var files = [];
  var unsupported = [];

  var collectEntries = (entries, basePath, subfolder) => {
    for (var entry of entries) {
      if (!entry.isFile) continue;
      var ext = getExt(entry.name);
      var path = basePath + '/' + entry.name;
      if (ext && SUPPORTED_EXTENSIONS.has(ext)) {
        files.push({ name: entry.name, path, ext, subfolder });
      } else if (ext) {
        unsupported.push({ name: entry.name, ext });
      }
    }
  };

  // Read root level
  var rootEntries = await readDir(folderPath);
  collectEntries(rootEntries, folderPath, null);

  // Read one level of subdirectories
  if (maxDepth >= 1) {
    var subdirs = rootEntries.filter(e => e.isDirectory && !e.name.startsWith('.'));
    for (var dir of subdirs) {
      var subPath = folderPath + '/' + dir.name;
      try {
        var subEntries = await readDir(subPath);
        collectEntries(subEntries, subPath, dir.name);
      } catch (e) {
        console.warn('[folderImport] Could not read subfolder:', dir.name, e);
      }
    }
  }

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
