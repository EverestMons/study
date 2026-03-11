import React from "react";
import { T } from "../lib/theme.jsx";

const BADGE_COLORS = {
  pdf: { bg: "rgba(108,156,252,0.15)", color: T.ac },
  epub: { bg: "rgba(108,156,252,0.15)", color: T.ac },
  docx: { bg: "rgba(108,156,252,0.15)", color: T.ac },
  txt: { bg: "rgba(108,156,252,0.15)", color: T.ac },
  md: { bg: "rgba(108,156,252,0.15)", color: T.ac },
  pptx: { bg: "rgba(251,191,36,0.15)", color: T.am },
  xlsx: { bg: "rgba(52,211,153,0.15)", color: T.gn },
  xls: { bg: "rgba(52,211,153,0.15)", color: T.gn },
  xlsm: { bg: "rgba(52,211,153,0.15)", color: T.gn },
  csv: { bg: "rgba(52,211,153,0.15)", color: T.gn },
  srt: { bg: "rgba(139,149,165,0.15)", color: T.txD },
  vtt: { bg: "rgba(139,149,165,0.15)", color: T.txD },
  png: { bg: "rgba(139,149,165,0.15)", color: T.txD },
  jpg: { bg: "rgba(139,149,165,0.15)", color: T.txD },
  jpeg: { bg: "rgba(139,149,165,0.15)", color: T.txD },
  gif: { bg: "rgba(139,149,165,0.15)", color: T.txD },
  webp: { bg: "rgba(139,149,165,0.15)", color: T.txD },
};

const Checkbox = ({ checked, onChange }) => (
  <div onClick={e => { e.stopPropagation(); onChange(!checked); }}
    style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (checked ? T.ac : T.bd), background: checked ? T.ac : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" }}>
    {checked && <span style={{ color: "#0F1115", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>&#10003;</span>}
  </div>
);

const Badge = ({ ext }) => {
  var bc = BADGE_COLORS[ext] || { bg: "rgba(139,149,165,0.15)", color: T.txD };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: bc.bg, color: bc.color, width: 42, textAlign: "center", display: "inline-block", flexShrink: 0 }}>
      {ext}
    </span>
  );
};

export default function FolderPickerModal({ folderData, onImport, onClose }) {
  var { folderName, files, unsupported } = folderData;
  var [selected, setSelected] = React.useState(() => new Set(files.map(f => f.path)));
  var [collapsed, setCollapsed] = React.useState(() => new Set());
  var [search, setSearch] = React.useState("");
  var [typeFilter, setTypeFilter] = React.useState(null);
  var [sortBy, setSortBy] = React.useState("name");

  // Filter + sort
  var uniqueExts = [...new Set(files.map(f => f.ext))].sort();
  var filteredFiles = files.filter(f => {
    if (typeFilter && f.ext !== typeFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  if (sortBy === "type") filteredFiles.sort((a, b) => a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name));

  // Group filtered files: root files first, then by subfolder
  var rootFiles = filteredFiles.filter(f => f.subfolder === null);
  var subfolderMap = new Map();
  for (var f of filteredFiles) {
    if (f.subfolder !== null) {
      if (!subfolderMap.has(f.subfolder)) subfolderMap.set(f.subfolder, []);
      subfolderMap.get(f.subfolder).push(f);
    }
  }
  var subfolders = [...subfolderMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  var selectedCount = selected.size;
  var allSelected = filteredFiles.length > 0 && filteredFiles.every(f => selected.has(f.path));

  var toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { var next = new Set(prev); filteredFiles.forEach(f => next.delete(f.path)); return next; });
    } else {
      setSelected(prev => { var next = new Set(prev); filteredFiles.forEach(f => next.add(f.path)); return next; });
    }
  };

  var toggleFile = (path) => {
    setSelected(prev => {
      var next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  var toggleCollapse = (subfolder) => {
    setCollapsed(prev => {
      var next = new Set(prev);
      if (next.has(subfolder)) next.delete(subfolder);
      else next.add(subfolder);
      return next;
    });
  };

  var handleImport = () => {
    var selectedFiles = files.filter(f => selected.has(f.path));
    if (selectedFiles.length > 0) onImport(selectedFiles);
  };

  // Header summary
  var docCount = unsupported.filter(u => u.ext === "doc").length;
  var unsupportedCount = unsupported.length;
  var summaryParts = [];
  var isFiltered = search || typeFilter;
  if (files.length > 0) summaryParts.push(isFiltered ? "Showing " + filteredFiles.length + " of " + files.length + " files" : files.length + " supported file" + (files.length !== 1 ? "s" : ""));
  if (unsupportedCount > 0) summaryParts.push(unsupportedCount + " unsupported skipped");

  // Truncate path to last 3 segments
  var pathSegments = (folderData.folderPath || "").replace(/\\/g, "/").split("/").filter(Boolean);
  var displayPath = pathSegments.length > 3 ? ".../" + pathSegments.slice(-3).join("/") : pathSegments.join("/");

  var isEmpty = files.length === 0;

  // Unique unsupported extensions for empty state
  var unsupportedExts = [...new Set(unsupported.map(u => "." + u.ext))].slice(0, 6);

  var renderFileRow = (file, indent) => (
    <div key={file.path}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", paddingLeft: indent ? 44 : 24, borderBottom: "1px solid rgba(42,47,58,0.5)", cursor: "pointer", transition: "background 0.1s" }}
      onMouseEnter={e => e.currentTarget.style.background = T.sfH}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      onClick={() => toggleFile(file.path)}>
      <Checkbox checked={selected.has(file.path)} onChange={() => toggleFile(file.path)} />
      <Badge ext={file.ext} />
      <span style={{ fontSize: 13, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.name}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 640, maxHeight: "80vh", background: T.sf, border: "1px solid " + T.bd, borderRadius: 16, display: "flex", flexDirection: "column", animation: "fadeIn 0.2s" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid " + T.bd, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.tx }}>Import from Folder</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.color = T.tx}
              onMouseLeave={e => e.currentTarget.style.color = T.txM}>&times;</button>
          </div>
          {displayPath && <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>{displayPath}</div>}
          <div style={{ fontSize: 12, color: T.txD, marginTop: 4 }}>
            {isEmpty ? "No supported files found" : summaryParts.join(" \u00B7 ")}
            {docCount > 0 && <span style={{ color: T.am }}> \u00B7 {docCount} .doc file{docCount !== 1 ? "s" : ""} — save as .docx to import</span>}
          </div>
        </div>

        {isEmpty ? (
          /* Empty state */
          <div style={{ padding: "40px 24px", textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 14, color: T.txD, marginBottom: 8 }}>No files with supported types in this folder.</div>
            {unsupportedExts.length > 0 && (
              <div style={{ fontSize: 12, color: T.txM }}>{unsupportedCount} file{unsupportedCount !== 1 ? "s" : ""} skipped ({unsupportedExts.join(", ")})</div>
            )}
            <div style={{ fontSize: 12, color: T.txM, marginTop: 8 }}>Supported: PDF, DOCX, EPUB, PPTX, TXT, and more.</div>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ padding: "12px 24px", borderBottom: "1px solid " + T.bd, background: T.bg, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, cursor: "pointer" }}
              onClick={toggleAll}>
              <Checkbox checked={allSelected} onChange={toggleAll} />
              <span style={{ fontSize: 13, color: T.txD }}>Select all ({filteredFiles.length})</span>
            </div>

            {/* Filter / Sort bar */}
            <div style={{ padding: "8px 24px", borderBottom: "1px solid " + T.bd, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter files\u2026"
                  style={{ flex: 1, fontSize: 12, background: T.bg, border: "1px solid " + T.bd, borderRadius: 6, padding: "6px 10px", color: T.tx, outline: "none" }}
                  onClick={e => e.stopPropagation()} />
                {["name", "type"].map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid " + (sortBy === s ? T.ac : T.bd), background: "transparent", color: sortBy === s ? T.ac : T.txD, cursor: "pointer", textTransform: "capitalize" }}>
                    {s}
                  </button>
                ))}
              </div>
              {uniqueExts.length >= 2 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                  <span onClick={() => setTypeFilter(null)}
                    style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid " + (!typeFilter ? T.ac : T.bd), background: !typeFilter ? "rgba(108,156,252,0.12)" : "transparent", color: !typeFilter ? T.ac : T.txD, cursor: "pointer", userSelect: "none" }}>All</span>
                  {uniqueExts.map(ext => (
                    <span key={ext} onClick={() => setTypeFilter(typeFilter === ext ? null : ext)}
                      style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid " + (typeFilter === ext ? T.ac : T.bd), background: typeFilter === ext ? "rgba(108,156,252,0.12)" : "transparent", color: typeFilter === ext ? T.ac : T.txD, cursor: "pointer", userSelect: "none", textTransform: "uppercase" }}>{ext}</span>
                  ))}
                </div>
              )}
            </div>

            {/* File list */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {/* Root files */}
              {rootFiles.map(f => renderFileRow(f, false))}

              {/* Subfolder groups */}
              {subfolders.map(([name, subFiles]) => (
                <React.Fragment key={"sub-" + name}>
                  {/* Subfolder header */}
                  <div onClick={() => toggleCollapse(name)}
                    style={{ display: "flex", alignItems: "center", padding: "10px 24px", background: T.bg, borderBottom: "1px solid " + T.bd, cursor: "pointer", userSelect: "none" }}>
                    <span style={{ fontSize: 10, color: T.txD, marginRight: 8, transition: "transform 0.15s", transform: collapsed.has(name) ? "rotate(-90deg)" : "rotate(0)" }}>{"\u25BC"}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.txD, flex: 1 }}>{name}</span>
                    <span style={{ fontSize: 11, color: T.txM }}>{subFiles.length} file{subFiles.length !== 1 ? "s" : ""}</span>
                  </div>
                  {/* Subfolder files (if expanded) */}
                  {!collapsed.has(name) && subFiles.map(f => renderFileRow(f, true))}
                </React.Fragment>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid " + T.bd, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: "transparent", border: "1px solid " + T.bd, color: T.txD, borderRadius: 8, padding: "10px 20px", fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.ac; e.currentTarget.style.color = T.tx; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.color = T.txD; }}>
            {isEmpty ? "Close" : "Cancel"}
          </button>
          {!isEmpty && (
            <button onClick={handleImport} disabled={selectedCount === 0}
              style={{ background: selectedCount > 0 ? T.ac : T.sf, border: "none", color: selectedCount > 0 ? "#0F1115" : T.txM, fontWeight: 600, borderRadius: 8, padding: "10px 24px", fontSize: 13, cursor: selectedCount > 0 ? "pointer" : "default", transition: "all 0.15s" }}>
              Import {selectedCount} File{selectedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
