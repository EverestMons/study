import React, { useState, useEffect, useRef, useCallback, Component } from "react";

// --- Error Boundary ---
class StudyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.error) {
      const err = this.state.error;
      const report = [
        "STUDY CRASH REPORT",
        "==================",
        "Error: " + (err.message || String(err)),
        "",
        "Stack:",
        (err.stack || "no stack").split("\n").slice(0, 8).join("\n"),
        "",
        "Component stack:",
        (this.state.info?.componentStack || "unavailable").trim().split("\n").slice(0, 5).join("\n"),
      ].join("\n");
      return React.createElement("div", {
        style: { background: "#0F1115", minHeight: "100vh", padding: 32, fontFamily: "monospace" }
      },
        React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } },
          React.createElement("div", { style: { fontSize: 20, color: "#F87171", marginBottom: 16, fontWeight: 700 } }, "Study crashed"),
          React.createElement("div", { style: { fontSize: 13, color: "#6B7280", marginBottom: 16 } }, "Copy the text below and paste it to Claude to debug:"),
          React.createElement("textarea", {
            readOnly: true, value: report,
            onClick: function(e) { e.target.select(); },
            style: {
              width: "100%", minHeight: 300, background: "#1A1D24", color: "#E8EAF0",
              border: "1px solid #2A2F3A", borderRadius: 8, padding: 16, fontSize: 12,
              fontFamily: "SF Mono, Fira Code, monospace", resize: "vertical", lineHeight: 1.6
            }
          }),
          React.createElement("button", {
            onClick: function() { navigator.clipboard.writeText(report); },
            style: {
              marginTop: 12, padding: "10px 20px", background: "#6C9CFC", color: "#0F1115",
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer"
            }
          }, "Copy to clipboard"),
          React.createElement("button", {
            onClick: function() { this.setState({ error: null, info: null }); }.bind(this),
            style: {
              marginTop: 12, marginLeft: 8, padding: "10px 20px", background: "#22262F",
              color: "#E8EAF0", border: "1px solid #2A2F3A", borderRadius: 8, fontSize: 13, cursor: "pointer"
            }
          }, "Try to recover")
        )
      );
    }
    return this.props.children;
  }
}

// STUDY - Skill-Based Teaching Architecture (Clean Rebuild)
//
// Storage keys:
//   study-courses                  -> course metadata (materials with chunk lists)
//   study-doc:{cid}:{chunkId}      -> individual chunk content
//   study-cskills:{cid}:{chunkId}  -> skills from one chunk
//   study-skills:{cid}             -> merged course skill tree
//   study-asgn:{cid}               -> assignment decomposition
//   study-profile:{cid}            -> student skill point log
//   study-chat:{cid}               -> chat message history
//   study-journal:{cid}            -> session journal entries

// --- DB Layer ---
const DB = {
  async get(k) {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await window.storage.get(k);
        return r ? JSON.parse(r.value) : null;
      } catch (e) {
        if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
        console.error("DB get: all retries failed for", k, e);
        return null;
      }
    }
    return null;
  },
  async set(k, v) {
    var payload = JSON.stringify(v);
    if (payload.length > 4000000) console.warn("DB set: large payload", k, (payload.length / 1024 / 1024).toFixed(2) + "MB");
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        await window.storage.set(k, payload);
        return true;
      } catch (e) {
        console.warn("DB set attempt " + (attempt + 1) + " failed:", k, e.message || e);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    console.error("DB set: all retries failed for", k);
    return false;
  },
  async del(k) {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        await window.storage.delete(k);
        return true;
      } catch (e) {
        if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
        console.error("DB del: all retries failed for", k, e);
        return false;
      }
    }
    return false;
  },

  async getCourses() { return (await this.get("study-courses")) || []; },
  async saveCourses(c) { await this.set("study-courses", c); },

  async saveDoc(cid, did, d) { return await this.set("study-doc:" + cid + ":" + did, d); },
  async getDoc(cid, did) { return await this.get("study-doc:" + cid + ":" + did); },

  // Chunk-level skill storage
  async saveChunkSkills(cid, chunkId, s) { await this.set("study-cskills:" + cid + ":" + chunkId, s); },
  async getChunkSkills(cid, chunkId) { return await this.get("study-cskills:" + cid + ":" + chunkId); },

  async saveSkills(cid, s) { await this.set("study-skills:" + cid, s); },
  async getSkills(cid) { return await this.get("study-skills:" + cid); },

  async saveRefTaxonomy(cid, t) { await this.set("study-reftax:" + cid, t); },
  async getRefTaxonomy(cid) { return await this.get("study-reftax:" + cid); },

  async saveValidation(cid, v) { await this.set("study-valid:" + cid, v); },
  async getValidation(cid) { return await this.get("study-valid:" + cid); },

  async saveAsgn(cid, a) { await this.set("study-asgn:" + cid, a); },
  async getAsgn(cid) { return await this.get("study-asgn:" + cid); },

  async saveProfile(cid, p) { await this.set("study-profile:" + cid, p); },
  async getProfile(cid) {
    return (await this.get("study-profile:" + cid)) || { skills: {}, sessions: 0 };
  },

  async saveChat(cid, m) { await this.set("study-chat:" + cid, m); },
  async getChat(cid) { return (await this.get("study-chat:" + cid)) || []; },

  async saveJournal(cid, j) { await this.set("study-journal:" + cid, j); },
  async getJournal(cid) { return (await this.get("study-journal:" + cid)) || []; },

  // Delete all course data -- walks chunks from material metadata
  async deleteCourse(cid, materials = []) {
    for (const mat of materials) {
      if (mat.chunks) {
        for (const ch of mat.chunks) {
          await this.del("study-doc:" + cid + ":" + ch.id);
          await this.del("study-cskills:" + cid + ":" + ch.id);
        }
      }
      // Legacy: also try flat doc ID
      await this.del("study-doc:" + cid + ":" + mat.id);
    }
    await this.del("study-skills:" + cid);
    await this.del("study-reftax:" + cid);
    await this.del("study-valid:" + cid);
    await this.del("study-asgn:" + cid);
    await this.del("study-profile:" + cid);
    await this.del("study-chat:" + cid);
    await this.del("study-journal:" + cid);
    // Clean up practice sets
    try {
      var keys = await window.storage.list("study-practice:" + cid + ":");
      if (keys?.keys) for (var pk of keys.keys) await this.del(pk);
    } catch (e) { /* practice cleanup non-critical */ }
  }
};

// --- JSZip Loader (for EPUB and DOCX parsing) ---
let JSZ = null;
const loadJSZip = () => new Promise((res, rej) => {
  if (JSZ) { res(JSZ); return; }
  if (window.JSZip) { JSZ = window.JSZip; res(JSZ); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  s.onload = () => { JSZ = window.JSZip; res(JSZ); };
  s.onerror = () => rej(new Error("JSZip load failed"));
  document.head.appendChild(s);
});

// --- HTML Stripper ---
const stripHtml = (h) => {
  const d = document.createElement("div");
  d.innerHTML = h;
  d.querySelectorAll("script,style").forEach(e => e.remove());
  return d.textContent?.replace(/\s+/g, " ").trim() || "";
};

// --- EPUB Parser ---
const parseEpub = async (buf) => {
  const Z = await loadJSZip();
  const zip = await Z.loadAsync(buf);
  const cx = await zip.file("META-INF/container.xml")?.async("text");
  const opfPath = cx?.match(/full-path="([^"]+\.opf)"/)?.[1];
  let spineIds = [], manifest = {}, opfDir = "";

  if (opfPath) {
    opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
    const opf = await zip.file(opfPath)?.async("text");
    if (opf) {
      let m;
      const r1 = /<item\s+[^>]*?id="([^"]*)"[^>]*?href="([^"]*)"[^>]*?media-type="([^"]*)"[^>]*?\/?>/gi;
      while ((m = r1.exec(opf))) manifest[m[1]] = { href: m[2], type: m[3] };
      const r2 = /<item\s+[^>]*?href="([^"]*)"[^>]*?id="([^"]*)"[^>]*?media-type="([^"]*)"[^>]*?\/?>/gi;
      while ((m = r2.exec(opf))) if (!manifest[m[2]]) manifest[m[2]] = { href: m[1], type: m[3] };
      const r3 = /<itemref\s+idref="([^"]*)"/gi;
      while ((m = r3.exec(opf))) spineIds.push(m[1]);
    }
  }

  const chs = [];
  const proc = async (path, fallbackTitle) => {
    const f = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!f) return;
    const html = await f.async("text");
    const text = stripHtml(html);
    if (text.length < 20) return;
    // Try multiple title extraction strategies (allow nested HTML inside tags)
    var titleRaw = null;
    var tm;
    // 1. <title> tag
    tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tm && stripHtml(tm[1]).length > 0 && stripHtml(tm[1]).length < 200) titleRaw = stripHtml(tm[1]);
    // 2. <h1> tag (may contain spans, links, etc.)
    if (!titleRaw) { tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); if (tm && stripHtml(tm[1]).length > 0) titleRaw = stripHtml(tm[1]); }
    // 3. <h2> tag
    if (!titleRaw) { tm = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i); if (tm && stripHtml(tm[1]).length > 0) titleRaw = stripHtml(tm[1]); }
    // 4. First line of text content (if short enough to be a title)
    if (!titleRaw) { var firstLine = text.split("\n")[0]?.trim(); if (firstLine && firstLine.length > 2 && firstLine.length < 120) titleRaw = firstLine; }
    chs.push({
      id: "ch-" + (chs.length + 1),
      title: titleRaw || fallbackTitle,
      content: text,
      charCount: text.length
    });
  };

  if (spineIds.length) {
    for (const id of spineIds) {
      const it = manifest[id];
      if (it?.type?.includes("html")) await proc(opfDir + it.href, "Section " + (chs.length + 1));
    }
  } else {
    const htmlFiles = Object.keys(zip.files)
      .filter(f => /\.(x?html?)$/i.test(f) && !f.includes("META-INF"))
      .sort();
    for (const p of htmlFiles) await proc(p, "Section " + (chs.length + 1));
  }

  // --- Smart chapter merging ---
  // Many EPUBs split subchapters into separate HTML files (13.1, 13.2, etc.)
  // Merge them into logical parent chapters and group front/back matter.
  if (chs.length <= 1) return chs;

  var FRONT_MATTER = /^(front\s*matter|title\s*page|half\s*title|copyright|dedication|epigraph|table\s*of\s*contents|contents|foreword|preface|acknowledgment|acknowledgement|about\s*the\s*author|cover|halftitle|also\s*by)/i;
  var BACK_MATTER = /^(index|glossary|bibliography|references|further\s*reading|endnotes|notes|colophon|back\s*cover|afterword)/i;
  var APPENDIX = /^appendix/i;

  // Detect chapter number from title: "Chapter 13", "13.4 Reactions", "13 Alcohols", "CHAPTER XIII"
  var getChapterNum = function(title) {
    if (!title) return null;
    var t = title.trim();
    // "Chapter 13" or "CHAPTER 13" or "Chapter XIII"
    var m1 = t.match(/^chapter\s+(\d+)/i);
    if (m1) return parseInt(m1[1]);
    // "13.4 Something" or "13.4.1 Something" -- extract parent number
    var m2 = t.match(/^(\d+)\.\d+/);
    if (m2) return parseInt(m2[1]);
    // "13 Something" (number followed by space and text, not a date or year)
    var m3 = t.match(/^(\d{1,3})\s+[A-Z]/);
    if (m3 && parseInt(m3[1]) < 200) return parseInt(m3[1]);
    // "Part 3" stays separate (don't merge across parts)
    return null;
  };

  var merged = [];
  var frontMatter = [];
  var backMatter = [];
  var currentGroup = null; // { num, title, sections: [] }

  var flushGroup = function() {
    if (!currentGroup) return;
    var combined = currentGroup.sections.map(function(s) { return s.content; }).join("\n\n");
    var label = currentGroup.sections[0].title || "Chapter " + currentGroup.num;
    // If the first title is a subchapter (e.g. "6.1 Something"), synthesize a parent label
    if (currentGroup.sections.length > 1 && /^\d+\.\d+/.test(label)) {
      // Look for a section whose title is just "Chapter N" or "N Title"
      var chapterHeading = currentGroup.sections.find(function(s) {
        return /^chapter\s+\d+/i.test(s.title || "") || /^\d+\s+[A-Z]/.test(s.title || "");
      });
      if (chapterHeading) {
        label = chapterHeading.title;
      } else {
        label = "Chapter " + currentGroup.num + " (" + currentGroup.sections.length + " sections)";
      }
    }
    merged.push({
      id: "ch-" + (merged.length + 1),
      title: label,
      content: combined,
      charCount: combined.length,
      mergedFrom: currentGroup.sections.length
    });
    currentGroup = null;
  };

  for (var ci = 0; ci < chs.length; ci++) {
    var sec = chs[ci];
    var title = sec.title || "";

    // Front matter detection
    if (FRONT_MATTER.test(title)) {
      frontMatter.push(sec);
      continue;
    }

    // Back matter detection (but not appendices -- those stay separate)
    if (BACK_MATTER.test(title)) {
      backMatter.push(sec);
      continue;
    }

    // Try to detect chapter number
    var num = getChapterNum(title);

    if (num !== null) {
      // Same parent chapter as current group -- merge
      if (currentGroup && currentGroup.num === num) {
        currentGroup.sections.push(sec);
      } else {
        // Different chapter -- flush previous, start new
        flushGroup();
        currentGroup = { num: num, title: title, sections: [sec] };
      }
    } else {
      // No detectable chapter number
      // If we have an active group and this looks like a continuation (no number, short gap), merge it
      if (currentGroup && !APPENDIX.test(title)) {
        currentGroup.sections.push(sec);
      } else {
        // Standalone section (appendix, unnumbered chapter, etc.)
        flushGroup();
        merged.push({
          id: "ch-" + (merged.length + 1),
          title: title,
          content: sec.content,
          charCount: sec.charCount,
          mergedFrom: 1
        });
      }
    }
  }
  flushGroup();

  // Prepend front matter as single chunk if any
  if (frontMatter.length > 0) {
    var fmContent = frontMatter.map(function(s) { return s.content; }).join("\n\n");
    merged.unshift({
      id: "ch-0-fm",
      title: "Front Matter",
      content: fmContent,
      charCount: fmContent.length,
      mergedFrom: frontMatter.length
    });
  }

  // Append back matter as single chunk if any
  if (backMatter.length > 0) {
    var bmContent = backMatter.map(function(s) { return s.content; }).join("\n\n");
    merged.push({
      id: "ch-" + (merged.length + 1) + "-bm",
      title: "Back Matter",
      content: bmContent,
      charCount: bmContent.length,
      mergedFrom: backMatter.length
    });
  }

  // Re-number IDs sequentially
  for (var ri = 0; ri < merged.length; ri++) {
    merged[ri].id = "ch-" + (ri + 1);
  }

  return merged;
};

// --- File Reader ---
const readFile = (file) => new Promise(async (resolve) => {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "epub") {
    try {
      const chs = await parseEpub(await file.arrayBuffer());
      resolve({
        type: "epub", name: file.name, chapters: chs,
        totalChars: chs.reduce((s, c) => s + c.charCount, 0),
        content: "[EPUB: " + chs.length + " chapters]"
      });
    } catch (e) {
      resolve({ type: "text", name: file.name, content: "[EPUB failed: " + e.message + "]" });
    }
    return;
  }

  if (ext === "docx" || ext === "doc") {
    try {
      const arrayBuffer = await file.arrayBuffer();
      let text = "";
      try {
        const mod = await import("mammoth");
        const mammoth = mod.default || mod;
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value?.trim() || "";
      } catch (mammothErr) {
        console.error("Mammoth failed:", mammothErr);
        try {
          const Z = await loadJSZip();
          const zip = await Z.loadAsync(arrayBuffer);
          const docXml = await zip.file("word/document.xml")?.async("text");
          if (docXml) {
            text = docXml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
          }
        } catch (zipErr) {
          console.error("JSZip fallback failed:", zipErr);
        }
      }
      if (!text) {
        resolve({ type: "text", name: file.name, content: "[Could not extract text from " + file.name + ". Try saving as .txt first.]" });
        return;
      }
      resolve({ type: "text", name: file.name, content: text });
    } catch (e) {
      resolve({ type: "text", name: file.name, content: "[DOCX parse failed: " + e.message + "]" });
    }
    return;
  }

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "csv") {
    if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: "text", name: file.name, content: reader.result });
      reader.readAsText(file);
      return;
    }
    try {
      const Z = await loadJSZip();
      const zip = await Z.loadAsync(await file.arrayBuffer());
      let text = "";

      // Excel date converter: serial number -> YYYY-MM-DD
      const xlDate = (n) => {
        n = parseFloat(n);
        if (isNaN(n) || n < 1) return String(n);
        // Excel epoch: Jan 1 1900 = 1 (with the 1900 leap year bug)
        var d = new Date((n - 25569) * 86400000);
        var y = d.getUTCFullYear();
        if (y < 1950 || y > 2100) return String(n); // not a date
        var m = String(d.getUTCMonth() + 1).padStart(2, "0");
        var day = String(d.getUTCDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
      };

      // Column letter to index: A=0, B=1, ..., Z=25, AA=26
      var colIdx = function(ref) {
        var letters = ref.replace(/[0-9]/g, "");
        var idx = 0;
        for (var i = 0; i < letters.length; i++) {
          idx = idx * 26 + (letters.charCodeAt(i) - 64);
        }
        return idx - 1;
      };

      // Shared strings
      var ssFile = zip.file("xl/sharedStrings.xml");
      var strings = [];
      if (ssFile) {
        var ssXml = await ssFile.async("text");
        var matches = ssXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
        for (var mi = 0; mi < matches.length; mi++) {
          strings.push(matches[mi].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
        }
      }

      // Detect date columns from styles.xml
      var dateStyleIds = new Set();
      var stylesFile = zip.file("xl/styles.xml");
      if (stylesFile) {
        var stylesXml = await stylesFile.async("text");
        // numFmtId 14-22 are built-in date formats; also check custom formats with date patterns
        var xfs = stylesXml.match(/<xf[^>]*>/g) || [];
        for (var xi = 0; xi < xfs.length; xi++) {
          var fmtMatch = xfs[xi].match(/numFmtId="(\d+)"/);
          if (fmtMatch) {
            var fmtId = parseInt(fmtMatch[1]);
            if ((fmtId >= 14 && fmtId <= 22) || fmtId === 30 || fmtId === 36) {
              dateStyleIds.add(xi);
            }
          }
        }
      }

      // Sheet names
      var wbFile = zip.file("xl/workbook.xml");
      var sheetNames = [];
      if (wbFile) {
        var wbXml = await wbFile.async("text");
        var nameMatches = wbXml.match(/name="([^"]+)"/g) || [];
        for (var ni = 0; ni < nameMatches.length; ni++) {
          sheetNames.push(nameMatches[ni].replace(/name="([^"]+)"/, "$1"));
        }
      }

      // Parse sheets
      var sheetFiles = Object.keys(zip.files).filter(function(f) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(f); }).sort();
      for (var si = 0; si < sheetFiles.length; si++) {
        var sheetXml = await zip.file(sheetFiles[si]).async("text");
        var sheetName = sheetNames[si] || "Sheet" + (si + 1);
        text += "--- Sheet: " + sheetName + " ---\n";

        var rows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
        for (var ri = 0; ri < rows.length; ri++) {
          // Match cells with their reference (e.g. A5, B5, C5)
          var cellMatches = rows[ri].match(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g) || [];
          var rowVals = {};
          var maxCol = 0;
          for (var ci = 0; ci < cellMatches.length; ci++) {
            var cm = cellMatches[ci].match(/<c\s+r="([A-Z]+\d+)"([^>]*?)>([\s\S]*?)<\/c>/);
            if (!cm) continue;
            var ref = cm[1], attrs = cm[2], inner = cm[3];
            var col = colIdx(ref);
            if (col > maxCol) maxCol = col;
            var isShared = /t="s"/.test(attrs);
            var styleMatch = attrs.match(/s="(\d+)"/);
            var styleIdx = styleMatch ? parseInt(styleMatch[1]) : -1;
            var vMatch = inner.match(/<v>([^<]*)<\/v>/);
            if (vMatch) {
              var val = vMatch[1];
              if (isShared && strings[parseInt(val)] !== undefined) {
                rowVals[col] = strings[parseInt(val)];
              } else if (dateStyleIds.has(styleIdx)) {
                rowVals[col] = xlDate(val);
              } else {
                // Heuristic: numbers 40000-55000 in col 1 (B) are likely dates
                var numVal = parseFloat(val);
                if (!isNaN(numVal) && numVal > 40000 && numVal < 55000 && col <= 1) {
                  rowVals[col] = xlDate(val);
                } else {
                  rowVals[col] = val;
                }
              }
            }
          }
          // Build tab-separated row with proper column positions
          var parts = [];
          for (var c = 0; c <= maxCol; c++) {
            parts.push(rowVals[c] || "");
          }
          var line = parts.join("\t").replace(/\t+$/, "");
          if (line.trim()) text += line + "\n";
        }
        text += "\n";
      }
      resolve({ type: "text", name: file.name, content: text.trim() || "[Empty spreadsheet]" });
    } catch (e) {
      console.error("XLSX parse failed:", e);
      resolve({ type: "text", name: file.name, content: "[Spreadsheet parse failed: " + e.message + ". Try exporting as .csv or .txt from Excel.]" });
    }
    return;
  }

  if (ext === "pdf") {
    resolve({
      type: "text", name: file.name,
      content: "[PDF not supported: " + file.name + " -- Open in Preview or Acrobat, Select All (Cmd+A), Copy, paste into a .txt file, then upload that.]"
    });
    return;
  }

  if (ext === "pptx" || ext === "ppt") {
    if (ext === "ppt") {
      resolve({
        type: "text", name: file.name,
        content: "[Old .ppt format not supported: " + file.name + " -- Open in PowerPoint and Save As .pptx, then upload that.]"
      });
      return;
    }
    try {
      const Z = await loadJSZip();
      const zip = await Z.loadAsync(await file.arrayBuffer());
      
      // Find all slide files and sort numerically
      const slideFiles = Object.keys(zip.files)
        .filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)[1]);
          const numB = parseInt(b.match(/slide(\d+)/)[1]);
          return numA - numB;
        });
      
      if (slideFiles.length === 0) {
        resolve({ type: "text", name: file.name, content: "[PPTX has no slides: " + file.name + "]" });
        return;
      }
      
      var text = "";
      for (var i = 0; i < slideFiles.length; i++) {
        const xml = await zip.file(slideFiles[i]).async("text");
        // Extract text from <a:t> tags
        const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const slideText = matches
          .map(m => m.replace(/<\/?a:t>/g, ""))
          .map(t => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'"))
          .join("\n")
          .trim();
        
        if (slideText) {
          text += "--- Slide " + (i + 1) + " ---\n" + slideText + "\n\n";
        }
      }
      
      resolve({ type: "text", name: file.name, content: text.trim() || "[PPTX slides appear empty]" });
    } catch (e) {
      console.error("PPTX parse failed:", e);
      resolve({ type: "text", name: file.name, content: "[PPTX parse failed: " + e.message + ". Try exporting slides to PDF then copying text.]" });
    }
    return;
  }

  if (ext === "srt" || ext === "vtt") {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      const cleaned = raw
        .replace(/^\d+\s*$/gm, "")
        .replace(/[\d:,.]+ --> [\d:,.]+/g, "")
        .replace(/WEBVTT.*$/m, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
      resolve({ type: "text", name: file.name, content: cleaned });
    };
    reader.readAsText(file);
    return;
  }

  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = () => resolve({
      type: "image", name: file.name,
      content: "[Image: " + file.name + "]",
      base64: reader.result.split(",")[1],
      mediaType: file.type
    });
    reader.readAsDataURL(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => resolve({ type: "text", name: file.name, content: reader.result });
  reader.readAsText(file);
});

// --- Claude API ---
const callClaude = async (system, messages, maxTokens) => {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens || 2048,
        system,
        messages
      }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "No response.";
  } catch (e) {
    console.error("API:", e);
    return "Error: " + e.message;
  }
};

// Streaming version for chat -- calls onChunk with partial text as tokens arrive
const callClaudeStream = async (system, messages, onChunk, maxTokens) => {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens || 8192,
        system,
        messages,
        stream: true
      }),
    });
    if (!r.ok) {
      var errBody = await r.text();
      throw new Error("API " + r.status + ": " + errBody.substring(0, 200));
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      var lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (var line of lines) {
        if (!line.startsWith("data: ")) continue;
        var data = line.substring(6).trim();
        if (data === "[DONE]") continue;
        try {
          var evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            full += evt.delta.text;
            onChunk(full);
          }
          if (evt.type === "error") {
            throw new Error(evt.error?.message || "Stream error");
          }
        } catch (parseErr) {
          // Skip non-JSON lines (event type lines, etc.)
          if (data !== "[DONE]" && !data.startsWith("{")) continue;
        }
      }
    }
    return full || "No response.";
  } catch (e) {
    console.error("Stream API:", e);
    return "Error: " + e.message;
  }
};

// --- JSON Extractor ---
const extractJSON = (text) => {
  try { return JSON.parse(text); } catch {}
  const m1 = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) try { return JSON.parse(m1[1].trim()); } catch {}
  const m2 = text.match(/\[[\s\S]*\]/);
  if (m2) try { return JSON.parse(m2[0]); } catch {}
  const m3 = text.match(/\{[\s\S]*\}/);
  if (m3) try { return JSON.parse(m3[0]); } catch {}
  return null;
};

// --- Document Verification ---
const verifyDocument = async (courseId, mat) => {
  const loaded = await getMatContent(courseId, mat);
  if (!loaded.content && !loaded.chunks.length) return {
    status: "error",
    summary: "Document \"" + mat.name + "\" not found in storage. Try removing and re-uploading.",
    keyItems: [], issues: ["Document not in storage"], questions: []
  };

  if (loaded.content.length < 10) return {
    status: "error",
    summary: "\"" + mat.name + "\" appears empty (" + loaded.content.length + " characters).",
    keyItems: [], issues: ["No meaningful content"], questions: []
  };

  var garbledRatio = (loaded.content.match(/[\x00-\x08\x0E-\x1F\uFFFD]/g) || []).length / Math.max(loaded.content.length, 1);
  if (garbledRatio > 0.05) return {
    status: "error",
    summary: "\"" + mat.name + "\" contains garbled/binary content. Please re-upload as .txt, .docx, or .epub.",
    keyItems: [], issues: ["Binary/garbled content"], questions: []
  };

  let contentPreview = "";
  if (loaded.chunks.length > 1) {
    contentPreview = mat.classification.toUpperCase() + ": " + mat.name + " (" + loaded.chunks.length + " chunks)\n\n";
    for (const ch of loaded.chunks) {
      contentPreview += "--- " + ch.label + " (" + ch.charCount.toLocaleString() + " chars) ---\n" + ch.content.substring(0, 300) + "...\n\n";
    }
  } else {
    contentPreview = mat.classification.toUpperCase() + ": " + mat.name + "\nContent length: " + loaded.content.length.toLocaleString() + " characters\n\n" + loaded.content.substring(0, 8000);
    if (loaded.content.length > 8000) contentPreview += "\n\n[... truncated, " + (loaded.content.length - 8000).toLocaleString() + " more characters ...]";
  }

  const verifyPrompt = "You are verifying a document uploaded by a student. Read it carefully and produce a verification report.\n\nDOCUMENT:\n" + contentPreview + "\n\nIMPORTANT CONTEXT:\n- Spreadsheet files (.xlsx, .csv) will appear as tab-separated values. This is normal and expected -- not garbled.\n- Subtitle files (.srt, .vtt) will appear as plain text with timestamps stripped. This is normal.\n- Documents with dates as numbers like 46035 have already been converted where possible.\n- Focus on whether the ACADEMIC CONTENT is present and readable, not formatting aesthetics.\n\nRespond with ONLY a JSON object:\n{\n  \"status\": \"verified\" or \"partial\" or \"error\",\n  \"summary\": \"2-3 sentence summary -- be specific about topics, dates, names, structure\",\n  \"keyItems\": [\"key items: assignments, dates, topics, terms\"],\n  \"issues\": [\"actual problems: missing content, unreadable sections, binary garbage\"],\n  \"questions\": [\"clarifying questions about genuinely ambiguous content\"]\n}\n\nRules:\n- verified = content is present and readable enough to teach from\n- partial = most content readable but some sections genuinely missing or corrupted\n- error = content is fundamentally unreadable or empty\n- Tab-separated data from spreadsheets is NOT an issue\n- Be specific in the summary\n- Don't flag formatting differences as issues";

  const result = await callClaude(verifyPrompt, [{ role: "user", content: "Verify this document extraction." }]);
  const parsed = extractJSON(result);
  const verification = parsed || { status: "verified", summary: result.substring(0, 300), keyItems: [], issues: [], questions: [] };
  return verification;
};

// --- Skill Extraction ---
// --- Character budget per chunk (~25k tokens ~ 100k chars) ---
const CHUNK_CHAR_LIMIT = 100000;

// --- Store parsed file as chunked material ---
// Returns material metadata object with chunks array
// --- Split text into chunks at paragraph boundaries ---
const splitTextChunks = (text, limit) => {
  const pieces = [];
  var remaining = text;
  while (remaining.length > limit) {
    // Find the last double-newline (paragraph break) before the limit
    var cutRegion = remaining.substring(0, limit);
    var breakIdx = cutRegion.lastIndexOf("\n\n");
    // Fallback: single newline
    if (breakIdx < limit * 0.5) breakIdx = cutRegion.lastIndexOf("\n");
    // Fallback: last sentence boundary (. or ? or !)
    if (breakIdx < limit * 0.5) {
      var sentenceMatch = cutRegion.match(/.*[.!?]\s/s);
      breakIdx = sentenceMatch ? sentenceMatch[0].length : -1;
    }
    // Last resort: hard cut at limit
    if (breakIdx < limit * 0.3) breakIdx = limit;
    pieces.push(remaining.substring(0, breakIdx).trimEnd());
    remaining = remaining.substring(breakIdx).trimStart();
  }
  if (remaining.length > 0) pieces.push(remaining);
  return pieces;
};

const storeAsChunks = async (courseId, file, docIdPrefix) => {
  const mat = {
    id: docIdPrefix,
    name: file.name,
    classification: file.classification,
    type: file.type,
    chunks: []
  };

  if (file.classification === "textbook" && file.chapters) {
    // Each chapter = one chunk. Never split a chapter.
    for (let i = 0; i < file.chapters.length; i++) {
      var ch = file.chapters[i];
      var chunkId = docIdPrefix + "-ch-" + i;
      var content = ch.content || "";
      var saved = await DB.saveDoc(courseId, chunkId, { content: content });
      mat.chunks.push({
        id: chunkId,
        label: ch.title || "Chapter " + (i + 1),
        charCount: content.length,
        status: saved ? "pending" : "failed"
      });
      if (!saved) console.error("storeAsChunks: failed to save chunk", chunkId);
    }
    mat.totalChars = file.totalChars || mat.chunks.reduce((s, c) => s + c.charCount, 0);
  } else if (file.content) {
    // Non-textbook: always one chunk per file
    var chunkId = docIdPrefix + "-c0";
    var saved = await DB.saveDoc(courseId, chunkId, { content: file.content });
    mat.chunks.push({
      id: chunkId,
      label: file.name,
      charCount: file.content.length,
      status: saved ? "pending" : "failed"
    });
    if (!saved) console.error("storeAsChunks: failed to save chunk", chunkId);
    mat.charCount = file.content.length;
  }
  return mat;
};

// --- Load all chunk content for a material ---
// Returns { content, chunks } where content is the full text and chunks is array of {id, label, content}
const getMatContent = async (courseId, mat) => {
  if (mat.chunks && mat.chunks.length > 0) {
    var allChunks = [];
    var fullText = "";
    for (const ch of mat.chunks) {
      var doc = await DB.getDoc(courseId, ch.id);
      var text = doc?.content || "";
      allChunks.push({ id: ch.id, label: ch.label, content: text, charCount: text.length, status: ch.status });
      fullText += text + "\n";
    }
    return { content: fullText.trim(), chunks: allChunks };
  }
  // Legacy: flat doc storage
  var doc = await DB.getDoc(courseId, mat.id);
  if (!doc) return { content: "", chunks: [] };
  if (doc.chapters) {
    var allChunks = doc.chapters.map((ch, i) => ({
      id: mat.id + "-legacy-" + i, label: ch.title || "Chapter " + (i + 1),
      content: ch.content, charCount: ch.content?.length || 0, status: "pending"
    }));
    return { content: doc.chapters.map(ch => ch.content).join("\n"), chunks: allChunks };
  }
  return { content: doc.content || "", chunks: [{ id: mat.id, label: mat.name, content: doc.content || "", charCount: (doc.content || "").length, status: "pending" }] };
};

// --- Reference Taxonomy Generation ---
// Generates a canonical skill taxonomy for the course subject, grounded in syllabus if available.
// Returns { subject, level, taxonomy: [...], confidence, syllabusUsed }
const generateReferenceTaxonomy = async (courseId, courseName, materialsMeta, onStatus) => {
  onStatus("Building reference taxonomy...");

  // 1. Check for syllabus among materials
  var syllabusContent = "";
  var syllabusMat = materialsMeta.find(m => m.classification === "syllabus");
  if (syllabusMat) {
    var loaded = await getMatContent(courseId, syllabusMat);
    syllabusContent = loaded.content || "";
    // Cap syllabus at 50k chars -- syllabi are short, but be safe
    if (syllabusContent.length > 50000) syllabusContent = syllabusContent.substring(0, 50000);
  }

  // 2. Gather material structure overview (titles/chapters, not full content)
  var materialOutline = "";
  for (const mat of materialsMeta) {
    if (mat.classification === "syllabus") continue; // already captured
    materialOutline += "\n- " + mat.name + " (" + mat.classification + ")";
    if (mat.chunks && mat.chunks.length > 1) {
      for (const ch of mat.chunks) {
        materialOutline += "\n    - " + ch.label + " (" + (ch.charCount || 0).toLocaleString() + " chars)";
      }
    }
  }

  // 3. Build prompt
  var prompt;
  if (syllabusContent) {
    onStatus("Analyzing syllabus for reference taxonomy...");
    prompt = "You are an expert curriculum designer. A student has uploaded materials for a course. I need you to build a REFERENCE TAXONOMY -- the canonical set of skills, topics, and prerequisite relationships for this course.\n\nCOURSE NAME: " + courseName + "\n\nSYLLABUS:\n" + syllabusContent + "\n\nOTHER MATERIALS UPLOADED:\n" + materialOutline + "\n\nYour job:\n1. IDENTIFY the academic subject, level (intro/intermediate/advanced), and any specific focus areas from the syllabus.\n2. Extract the TOPIC SEQUENCE from the syllabus -- what is taught in what order.\n3. Generate a REFERENCE SKILL TAXONOMY: the standard set of skills a student should master in this course, based on the syllabus structure and your knowledge of how this subject is canonically taught.\n4. Wire PREREQUISITE RELATIONSHIPS between skills based on standard pedagogical order for this subject. Use your knowledge of the discipline -- don't just follow the syllabus week order blindly if the standard prerequisite chain differs.\n5. Flag any topics in the syllabus that are UNUSUAL for this level (taught in a non-standard order, or not typically part of this course).\n6. Rate your CONFIDENCE (0-100) in this taxonomy. High confidence = well-known subject with clear standard curriculum. Low confidence = interdisciplinary, niche, or non-standard course.\n\nRespond with ONLY a JSON object:\n{\n  \"subject\": \"e.g. Organic Chemistry\",\n  \"level\": \"intro|intermediate|advanced\",\n  \"focus\": \"any specific focus areas or specialization\",\n  \"confidence\": 85,\n  \"flags\": [\"any unusual topics or ordering noted\"],\n  \"taxonomy\": [\n    {\n      \"refId\": \"ref-1\",\n      \"name\": \"Skill/topic name\",\n      \"description\": \"What mastery of this skill means\",\n      \"prerequisites\": [\"ref-id\", ...],\n      \"category\": \"broad topic grouping\",\n      \"syllabusWeek\": \"week number or section from syllabus, if identifiable\",\n      \"standardOrder\": 1\n    }\n  ]\n}\n\nRules:\n- Be THOROUGH. Cover every topic the syllabus mentions.\n- Be GRANULAR. Break broad topics into specific skills (e.g. not just 'Derivatives' but 'Power Rule', 'Chain Rule', 'Product Rule').\n- Prerequisite wiring should reflect the DISCIPLINE's standard dependency chain, not just the order listed in the syllabus.\n- standardOrder is the typical teaching sequence in this discipline (1 = taught first).";
  } else {
    onStatus("Generating reference taxonomy from course structure...");
    prompt = "You are an expert curriculum designer. A student has uploaded materials for a course but did NOT upload a syllabus. I need you to build a REFERENCE TAXONOMY -- the canonical set of skills, topics, and prerequisite relationships for this course.\n\nCOURSE NAME: " + courseName + "\n\nMATERIALS UPLOADED:\n" + materialOutline + "\n\nYour job:\n1. IDENTIFY the academic subject, level (intro/intermediate/advanced), and likely scope based on the course name and material titles.\n2. Generate a REFERENCE SKILL TAXONOMY: the standard set of skills a student would need to master in this type of course, based on your knowledge of how this subject is canonically taught.\n3. Wire PREREQUISITE RELATIONSHIPS between skills based on the standard pedagogical order for this discipline.\n4. Rate your CONFIDENCE (0-100) in this taxonomy. High = clear well-known subject. Low = ambiguous course name, unusual material mix, or interdisciplinary.\n\nRespond with ONLY a JSON object:\n{\n  \"subject\": \"e.g. Organic Chemistry\",\n  \"level\": \"intro|intermediate|advanced\",\n  \"focus\": \"best guess at specific focus areas\",\n  \"confidence\": 70,\n  \"flags\": [\"any uncertainties about the course scope\"],\n  \"taxonomy\": [\n    {\n      \"refId\": \"ref-1\",\n      \"name\": \"Skill/topic name\",\n      \"description\": \"What mastery of this skill means\",\n      \"prerequisites\": [\"ref-id\", ...],\n      \"category\": \"broad topic grouping\",\n      \"standardOrder\": 1\n    }\n  ]\n}\n\nRules:\n- Be THOROUGH but don't over-generate. Cover the standard curriculum for this subject at the identified level.\n- Be GRANULAR. Break broad topics into specific teachable skills.\n- Prerequisite wiring should reflect the DISCIPLINE's standard dependency chain.\n- If the course name or materials are ambiguous, generate for the most likely interpretation and flag the uncertainty.\n- standardOrder is the typical teaching sequence (1 = taught first).";
  }

  var result = await callClaude(prompt, [{ role: "user", content: "Generate the reference taxonomy for this course." }], 16384);
  var parsed = extractJSON(result);

  if (!parsed || !parsed.taxonomy) {
    console.error("Reference taxonomy generation failed:", result.substring(0, 500));
    onStatus("Reference taxonomy generation failed -- extraction will proceed without reference.");
    return null;
  }

  onStatus("Reference taxonomy: " + parsed.taxonomy.length + " canonical skills for " + (parsed.subject || courseName) + " (confidence: " + (parsed.confidence || "?") + "%)");

  // Store for future use
  await DB.saveRefTaxonomy(courseId, parsed);
  return parsed;
};

const extractSkillTree = async (courseId, materialsMeta, onStatus, retryOnly) => {
  // 1. Gather material blocks from chunks, respecting status if retrying
  const materialBlocks = [];
  for (const mat of materialsMeta) {
    if (!mat.chunks || !mat.chunks.length) {
      var loaded = await getMatContent(courseId, mat);
      for (const ch of loaded.chunks) {
        if (!ch.content || ch.content.length < 10) continue;
        if (ch.status === "skipped") continue;
        if (retryOnly && ch.status === "extracted") continue;
        materialBlocks.push({
          chunkId: ch.id, matId: mat.id,
          label: (loaded.chunks.length > 1 ? mat.name + " > " : "") + ch.label,
          content: ch.content, chars: ch.content.length
        });
      }
    } else {
      for (const ch of mat.chunks) {
        if (ch.status === "skipped") continue;
        if (retryOnly && ch.status === "extracted") continue;
        var doc = await DB.getDoc(courseId, ch.id);
        var text = doc?.content || "";
        if (text.length < 10) continue;
        materialBlocks.push({
          chunkId: ch.id, matId: mat.id,
          label: (mat.chunks.length > 1 ? mat.name + " > " : "") + ch.label,
          content: text, chars: text.length
        });
      }
    }
  }

  if (!materialBlocks.length) {
    console.error("extractSkillTree: 0 material blocks. Materials:", materialsMeta.map(m => ({ id: m.id, name: m.name, chunks: (m.chunks || []).map(c => ({ id: c.id, status: c.status, chars: c.charCount })) })));
    if (retryOnly) { onStatus("No failed chunks to retry."); return await DB.getSkills(courseId) || []; }
    onStatus("No content found â€” chunk storage may have failed. Try deleting this course and re-uploading.");
    await DB.saveSkills(courseId, []);
    return [];
  }


  onStatus((retryOnly ? "Retrying " : "Processing ") + materialBlocks.length + " chunk" + (materialBlocks.length !== 1 ? "s" : "") + "...");

  // 2. Group blocks into API-call-sized batches
  const batches = [];
  let currentBatch = [], currentSize = 0;
  for (const block of materialBlocks) {
    if (block.chars > CHUNK_CHAR_LIMIT) {
      if (currentBatch.length) { batches.push(currentBatch); currentBatch = []; currentSize = 0; }
      var parts = splitTextChunks(block.content, CHUNK_CHAR_LIMIT);
      for (var pi = 0; pi < parts.length; pi++) {
        batches.push([{ label: block.label + " (part " + (pi + 1) + ")", content: parts[pi], chars: parts[pi].length, chunkId: block.chunkId, matId: block.matId }]);
      }
      continue;
    }
    if (currentSize + block.chars > CHUNK_CHAR_LIMIT && currentBatch.length) {
      batches.push(currentBatch);
      currentBatch = []; currentSize = 0;
    }
    currentBatch.push(block);
    currentSize += block.chars;
  }
  if (currentBatch.length) batches.push(currentBatch);

  // 3. Load reference taxonomy if available
  var refTax = await DB.getRefTaxonomy(courseId);
  var refSection = "";
  if (refTax && refTax.taxonomy && refTax.taxonomy.length > 0) {
    refSection = "\n\nREFERENCE TAXONOMY (" + (refTax.subject || "unknown") + ", " + (refTax.level || "unknown level") + "):\nThis is the canonical skill structure for this course subject. Use it to:\n- Match extracted skills to reference skills where they align (use the reference name and description as the authoritative version)\n- Preserve the prerequisite wiring from the reference taxonomy -- it reflects the discipline's standard dependency chain\n- Add skills for material that goes BEYOND the reference (flag these with \"refMatch\": false)\n- If the material covers a reference skill, set \"refMatch\": true and \"refId\": the matching reference ID\n\n" + JSON.stringify(refTax.taxonomy.map(t => ({ refId: t.refId, name: t.name, description: t.description, prerequisites: t.prerequisites, category: t.category })), null, 1) + "\n";
  }

  // 4. Extract skills per batch, track which chunk IDs succeeded/failed
  const succeededChunkIds = new Set();
  const failedChunkIds = new Set();
  const allBatchSkills = [];

  for (let i = 0; i < batches.length; i++) {
    onStatus("Extracting skills (batch " + (i + 1) + " of " + batches.length + ")...");
    var batchChunkIds = [...new Set(batches[i].map(b => b.chunkId))];

    var batchContent = "";
    for (const block of batches[i]) {
      batchContent += "\n--- " + block.label + " ---\n" + block.content + "\n";
    }

    var skillPrompt;
    if (refSection) {
      skillPrompt = "You are a curriculum analyst. You have a REFERENCE TAXONOMY for this course subject and COURSE MATERIALS from the student. Your job is to extract skills from the materials, guided by the reference taxonomy.\n\nCOURSE MATERIALS:\n" + batchContent + refSection + "\n\nRespond with ONLY a JSON array. Each skill object:\n{\n  \"id\": \"skill-" + (i * 100 + 1) + "\",\n  \"name\": \"Short skill name\",\n  \"description\": \"1-2 sentence description of what mastery means\",\n  \"prerequisites\": [\"skill-id\", ...],\n  \"sources\": [\"document name or chapter title where this is taught\"],\n  \"category\": \"broad topic grouping\",\n  \"refMatch\": true,\n  \"refId\": \"ref-X or null if no match\"\n}\n\nRules:\n- For each concept in the materials that matches a reference skill: use the reference skill's NAME and DESCRIPTION (they are the authoritative version). Set refMatch: true, refId to the matching reference ID.\n- For concepts in the materials NOT covered by the reference: create new skills with refMatch: false, refId: null. These are course-specific or non-standard topics.\n- PREREQUISITE WIRING: For skills that match the reference, inherit the reference's prerequisite chain (translated to your skill-IDs). For new skills, wire prerequisites based on what the material implies.\n- Be GRANULAR. Extract every discrete concept, not just chapter-level topics.\n- Start IDs from skill-" + (i * 100 + 1) + " to avoid collisions with other batches.\n- Prerequisites within this batch only (cross-batch links resolved later).\n- Sources should name the specific document(s) or chapter(s) from the material.\n- Extract as many skills as the material warrants -- no artificial limit.";
    } else {
      skillPrompt = "You are a curriculum analyst. Read the course materials below and extract every discrete skill or concept a student needs to learn from this material.\n\nCOURSE MATERIALS:\n" + batchContent + "\n\nRespond with ONLY a JSON array. Each skill object:\n{\n  \"id\": \"skill-" + (i * 100 + 1) + "\",\n  \"name\": \"Short skill name\",\n  \"description\": \"1-2 sentence description of what mastery means\",\n  \"prerequisites\": [\"skill-id\", ...],\n  \"sources\": [\"document name or chapter title where this is taught\"],\n  \"category\": \"broad topic grouping\"\n}\n\nRules:\n- Extract EVERY concept, not just big topics. Be granular.\n- Start IDs from skill-" + (i * 100 + 1) + " to avoid collisions with other batches.\n- Prerequisites can reference IDs from this batch only (cross-batch links will be resolved later).\n- Sources should name the specific document(s) or chapter(s) from the material above.\n- Be thorough. Missing a skill means the student can't be taught it.\n- Extract as many skills as the material warrants -- no artificial limit.";
    }

    try {
      var result = await callClaude(skillPrompt, [{ role: "user", content: "Extract all skills from this material." }], 16384);
      var parsed = extractJSON(result);
      if (parsed && Array.isArray(parsed)) {
        allBatchSkills.push(...parsed);
        for (var cid of batchChunkIds) {
          await DB.saveChunkSkills(courseId, cid, parsed);
          succeededChunkIds.add(cid);
        }
      } else {
        console.error("Batch " + (i + 1) + " parse failed:", result.substring(0, 300));
        for (var cid of batchChunkIds) failedChunkIds.add(cid);
      }
    } catch (e) {
      console.error("Batch " + (i + 1) + " API error:", e.message);
      for (var cid of batchChunkIds) failedChunkIds.add(cid);
    }
  }

  // 4. Update chunk statuses in material metadata
  var updatedMats = materialsMeta.map(mat => {
    if (!mat.chunks) return mat;
    return { ...mat, chunks: mat.chunks.map(ch => {
      if (succeededChunkIds.has(ch.id)) return { ...ch, status: "extracted" };
      if (failedChunkIds.has(ch.id)) return { ...ch, status: "failed" };
      return ch;
    })};
  });
  var allCourses = await DB.getCourses();
  allCourses = allCourses.map(c => c.id === courseId ? { ...c, materials: updatedMats } : c);
  await DB.saveCourses(allCourses);

  if (!allBatchSkills.length) {
    console.error("All batches failed to produce skills.");
    onStatus("Extraction failed for all chunks.");
    if (!retryOnly) { await DB.saveSkills(courseId, []); }
    return retryOnly ? (await DB.getSkills(courseId) || []) : [];
  }

  // 5. If retrying, include skills from previously succeeded chunks
  if (retryOnly) {
    var previousChunkSkills = [];
    for (const mat of materialsMeta) {
      if (!mat.chunks) continue;
      for (const ch of mat.chunks) {
        if (ch.status === "extracted" && !succeededChunkIds.has(ch.id)) {
          var cs = await DB.getChunkSkills(courseId, ch.id);
          if (Array.isArray(cs)) previousChunkSkills.push(...cs);
        }
      }
    }
    allBatchSkills.push(...previousChunkSkills);
  }

  // 6. Single batch? Save directly
  if (batches.length === 1 && !retryOnly) {
    await DB.saveSkills(courseId, allBatchSkills);
    onStatus("Extracted " + allBatchSkills.length + " skills." + (failedChunkIds.size > 0 ? " " + failedChunkIds.size + " chunk(s) failed." : ""));
    return allBatchSkills;
  }

  // 7. Multi-batch: merge and deduplicate
  onStatus("Merging " + allBatchSkills.length + " raw skills...");

  var mergeRefSection = "";
  if (refTax && refTax.taxonomy && refTax.taxonomy.length > 0) {
    mergeRefSection = "\n\nREFERENCE TAXONOMY (use for prerequisite wiring and deduplication guidance):\n" + JSON.stringify(refTax.taxonomy.map(t => ({ refId: t.refId, name: t.name, prerequisites: t.prerequisites, category: t.category })), null, 1) + "\n\nWhen merging, skills that share the same refId should be merged into one. Preserve the reference's prerequisite chain for matched skills. Skills with refMatch: false are course-specific and should be wired based on logical dependency.\n";
  }

  var mergePrompt = "You are a curriculum analyst. I extracted skills from course materials in separate batches. Now I need you to merge them into one clean skill tree.\n\nRAW SKILLS FROM ALL BATCHES:\n" + JSON.stringify(allBatchSkills, null, 1) + mergeRefSection + "\n\nYour job:\n1. DEDUPLICATE: merge skills that describe the same concept (keep the best description). Skills with the same refId MUST be merged.\n2. RENUMBER: assign clean sequential IDs (skill-1, skill-2, etc.).\n3. FIX PREREQUISITES: update prerequisite references to use the new IDs. For reference-matched skills, use the reference taxonomy's prerequisite chain. Add cross-batch prerequisites where obvious.\n4. KEEP SOURCES: preserve all source references.\n5. DO NOT DROP SKILLS: if two skills seem similar but distinct, keep both.\n6. PRESERVE refMatch and refId fields if present.\n\nRespond with ONLY the final merged JSON array, same format as input.";

  var mergeResult = await callClaude(mergePrompt, [{ role: "user", content: "Merge and deduplicate the skill tree." }], 16384);
  var mergedSkills = extractJSON(mergeResult);

  if (mergedSkills && Array.isArray(mergedSkills)) {
    onStatus("Merged to " + mergedSkills.length + " skills." + (failedChunkIds.size > 0 ? " " + failedChunkIds.size + " chunk(s) failed -- retry available." : ""));
    await DB.saveSkills(courseId, mergedSkills);
    return mergedSkills;
  }

  console.error("Merge pass failed, saving unmerged skills:", mergeResult.substring(0, 300));
  await DB.saveSkills(courseId, allBatchSkills);
  return allBatchSkills;
};


// --- Skill Tree Validation Pass ---
// Reviews extracted skills against reference taxonomy for accuracy.
// Can auto-fix prerequisite wiring, flag issues, and correct descriptions.
// Returns { skills (corrected), report }
const validateSkillTree = async (courseId, skills, onStatus) => {
  if (!Array.isArray(skills) || skills.length === 0) {
    return { skills: [], report: { status: "empty", issues: [], fixes: [] } };
  }

  onStatus("Validating skill tree (" + skills.length + " skills)...");

  var refTax = await DB.getRefTaxonomy(courseId);

  // Build the validation prompt
  var refSection = "";
  if (refTax && refTax.taxonomy && refTax.taxonomy.length > 0) {
    refSection = "\n\nREFERENCE TAXONOMY (" + (refTax.subject || "unknown") + ", " + (refTax.level || "unknown level") + ", confidence: " + (refTax.confidence || "?") + "%):\n" + JSON.stringify(refTax.taxonomy.map(t => ({ refId: t.refId, name: t.name, description: t.description, prerequisites: t.prerequisites, category: t.category, standardOrder: t.standardOrder })), null, 1);
  }

  var prompt = "You are a curriculum quality reviewer. You have been given an extracted skill tree from a student's course materials. Your job is to VALIDATE and CORRECT it.\n\nEXTRACTED SKILL TREE:\n" + JSON.stringify(skills, null, 1) + refSection + "\n\nPerform these checks:\n\n1. PREREQUISITE LOGIC: For each skill, verify its prerequisites make sense. A prerequisite must be something the student needs to know BEFORE learning this skill. Flag and fix:\n   - Circular dependencies (A requires B, B requires A)\n   - Missing prerequisites (skill requires knowledge not listed as a prerequisite)\n   - Unnecessary prerequisites (listed prerequisite isn't actually needed)\n   - Wrong direction (A listed as prereq of B, but B should be prereq of A)\n" + (refSection ? "   - Compare against reference taxonomy prerequisite chains. Reference chains reflect the discipline's standard -- prefer them over the extracted version when they conflict.\n" : "") + "\n2. DESCRIPTION ACCURACY: Each skill description should clearly state what mastery means. Flag vague descriptions like 'understand X' or 'know about Y' -- replace with specific, testable criteria.\n\n3. DUPLICATES: Flag any skills that appear to describe the same concept under different names. Merge them (keep the better name and description, combine sources).\n\n4. ORPHANED SKILLS: Flag skills with no prerequisites AND no other skill depends on them, unless they are genuinely foundational (first things taught) or standalone topics.\n\n5. COVERAGE GAPS: " + (refSection ? "Compare against the reference taxonomy. Flag any reference skills that should be present but are missing from the extracted tree." : "Based on the skill categories present, flag any obvious gaps where a prerequisite concept is implied but not explicitly listed as a skill.") + "\n\n6. CATEGORY CONSISTENCY: Ensure skills in the same category are genuinely related. Flag miscategorized skills.\n\nRespond with ONLY a JSON object:\n{\n  \"correctedSkills\": [ ... the full skill array with all fixes applied ... ],\n  \"report\": {\n    \"totalChecked\": 45,\n    \"prerequisiteFixes\": [\n      { \"skillId\": \"skill-5\", \"issue\": \"description of what was wrong\", \"fix\": \"what was changed\" }\n    ],\n    \"descriptionFixes\": [\n      { \"skillId\": \"skill-12\", \"before\": \"old description\", \"after\": \"new description\" }\n    ],\n    \"mergedDuplicates\": [\n      { \"kept\": \"skill-3\", \"removed\": \"skill-17\", \"reason\": \"both describe the same concept\" }\n    ],\n    \"coverageGaps\": [\n      { \"missingTopic\": \"topic name\", \"reason\": \"why it should be present\" }\n    ],\n    \"warnings\": [\n      \"any other observations about the skill tree quality\"\n    ]\n  }\n}\n\nRules:\n- The correctedSkills array must be complete -- include ALL skills (fixed and unfixed).\n- Preserve all existing fields (id, name, sources, category, refMatch, refId, etc.).\n- When merging duplicates, keep one ID and remove the other. Update any prerequisites that referenced the removed ID.\n- For coverage gaps, do NOT add new skills -- just report what's missing. The student may have intentionally excluded those topics.\n- Be conservative with fixes. Only change things that are clearly wrong, not merely stylistic preferences.";

  try {
    var result = await callClaude(prompt, [{ role: "user", content: "Validate and correct this skill tree." }], 16384);
    var parsed = extractJSON(result);

    if (parsed && parsed.correctedSkills && Array.isArray(parsed.correctedSkills)) {
      var report = parsed.report || {};
      var fixCount = (report.prerequisiteFixes?.length || 0) + (report.descriptionFixes?.length || 0) + (report.mergedDuplicates?.length || 0);
      var gapCount = report.coverageGaps?.length || 0;

      onStatus("Validation complete: " + fixCount + " fix" + (fixCount !== 1 ? "es" : "") + " applied" + (gapCount > 0 ? ", " + gapCount + " coverage gap" + (gapCount !== 1 ? "s" : "") + " noted" : "") + ".");

      // Save corrected skills and report
      await DB.saveSkills(courseId, parsed.correctedSkills);
      await DB.saveValidation(courseId, report);

      return { skills: parsed.correctedSkills, report: report };
    }

    // Parse failed -- keep original skills, log issue
    console.error("Validation parse failed:", result.substring(0, 500));
    onStatus("Validation response couldn't be parsed -- keeping original skills.");
    await DB.saveValidation(courseId, { status: "parse_failed", raw: result.substring(0, 500) });
    return { skills: skills, report: { status: "parse_failed" } };

  } catch (e) {
    console.error("Validation call failed:", e);
    onStatus("Validation failed -- keeping original skills.");
    return { skills: skills, report: { status: "error", message: e.message } };
  }
};

// --- Incremental Skill Merge (for adding new materials) ---
const mergeSkillTree = async (courseId, existingSkills, newMaterialsMeta, onStatus) => {
  if (!Array.isArray(existingSkills) || existingSkills.length === 0) {
    // No existing tree -- fall back to full extraction with all materials
    const allMats = await DB.get("study-courses");
    const course = Array.isArray(allMats) ? allMats.find(c => c.id === courseId) : null;
    return extractSkillTree(courseId, course?.materials || newMaterialsMeta, onStatus);
  }

  // Build content from ONLY the new materials
  let newContent = "";
  for (const mat of newMaterialsMeta) {
    const loaded = await getMatContent(courseId, mat);
    if (!loaded.content) continue;
    for (const ch of loaded.chunks) {
      newContent += "\n--- " + ch.label + " ---\n" + ch.content + "\n";
    }
  }

  if (!newContent.trim()) return existingSkills;

  // Find the highest existing skill number to avoid ID collisions
  let maxId = 0;
  for (const s of existingSkills) {
    const num = parseInt(s.id.replace(/\D/g, ""), 10);
    if (num > maxId) maxId = num;
  }

  const existingList = existingSkills.map(s => s.id + ": " + s.name + " -- " + s.description).join("\n");

  onStatus("Analyzing new materials against existing skills...");

  const mergePrompt = "You are a curriculum analyst. A student has added new materials to their course. You need to figure out how these new materials relate to the EXISTING skill tree.\n\nEXISTING SKILLS (DO NOT change these IDs or names):\n" + existingList + "\n\nNEW MATERIALS:\n" + newContent + "\n\nYour job:\n1. Check if the new materials teach concepts already covered by existing skills. If so, add the new document as a source for that skill.\n2. If the new materials introduce concepts NOT covered by any existing skill, create NEW skills for them.\n3. New skill IDs must start from skill-" + (maxId + 1) + " to avoid collisions.\n4. New skills can list existing skills as prerequisites if appropriate.\n\nRespond with ONLY a JSON object:\n{\n  \"updatedSources\": [\n    { \"skillId\": \"skill-3\", \"addSources\": [\"new document name\"] }\n  ],\n  \"newSkills\": [\n    {\n      \"id\": \"skill-" + (maxId + 1) + "\",\n      \"name\": \"Short skill name\",\n      \"description\": \"1-2 sentence description\",\n      \"prerequisites\": [\"skill-id\", ...],\n      \"sources\": [\"new document name\"],\n      \"category\": \"broad topic grouping\"\n    }\n  ]\n}\n\nRules:\n- NEVER rename or re-ID existing skills. Student progress is tied to those IDs.\n- Only create new skills for genuinely new concepts.\n- If the new material just provides more depth on an existing skill, update its sources -- don't create a duplicate.\n- Be conservative: fewer new skills is better than duplicates.";

  const result = await callClaude(mergePrompt, [{ role: "user", content: "Merge new materials into the existing skill tree." }], 16384);
  const parsed = extractJSON(result);

  if (parsed && typeof parsed === "object") {
    // Apply source updates to existing skills
    const merged = existingSkills.map(s => {
      const update = parsed.updatedSources?.find(u => u.skillId === s.id);
      if (update && update.addSources) {
        const currentSources = s.sources || [];
        return { ...s, sources: [...currentSources, ...update.addSources.filter(src => !currentSources.includes(src))] };
      }
      return s;
    });

    // Add new skills
    if (parsed.newSkills && Array.isArray(parsed.newSkills)) {
      for (const ns of parsed.newSkills) {
        // Verify no ID collision
        if (!merged.find(s => s.id === ns.id)) {
          merged.push(ns);
        }
      }
    }

    await DB.saveSkills(courseId, merged);
    return merged;
  }

  // Fallback: if merge parse failed, don't destroy existing tree
  console.error("Skill merge parse failed, keeping existing tree");
  return existingSkills;
};

// --- Assignment Decomposition ---
const decomposeAssignments = async (courseId, materialsMeta, skills, onStatus) => {
  let asgnContent = "";
  for (const mat of materialsMeta) {
    if (mat.classification !== "assignment") continue;
    const loaded = await getMatContent(courseId, mat);
    if (loaded.content) asgnContent += "\n--- ASSIGNMENT: " + mat.name + " ---\n" + loaded.content + "\n";
  }

  if (!asgnContent.trim()) {
    await DB.saveAsgn(courseId, []);
    return [];
  }

  onStatus("Decomposing assignments into skill requirements...");

  const skillList = Array.isArray(skills)
    ? skills.map(s => s.id + ": " + s.name).join("\n")
    : "Skills not yet structured";

  const asgnPrompt = "You are a curriculum analyst. Read the assignments below and break each question/task into the skills required to complete it.\n\nASSIGNMENTS:\n" + asgnContent + "\n\nAVAILABLE SKILLS:\n" + skillList + "\n\nRespond with ONLY a JSON array. Each assignment object:\n{\n  \"id\": \"asgn-1\",\n  \"title\": \"Assignment name\",\n  \"dueDate\": \"date if found, null otherwise\",\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"description\": \"Brief description of what the question asks\",\n      \"requiredSkills\": [\"skill-1\", \"skill-3\"],\n      \"difficulty\": \"foundational|intermediate|advanced\"\n    }\n  ]\n}\n\nRules:\n- Map each question to skills from AVAILABLE SKILLS using their IDs.\n- If a question requires a skill not in the list, use a descriptive name.\n- Difficulty reflects how deep the understanding needs to be.\n- Be thorough -- every question should have at least one required skill.";

  const result = await callClaude(asgnPrompt, [{ role: "user", content: "Decompose all assignments into skill requirements." }], 16384);
  const asgn = extractJSON(result);

  if (asgn && Array.isArray(asgn)) {
    await DB.saveAsgn(courseId, asgn);
    return asgn;
  }
  await DB.saveAsgn(courseId, result);
  return result;
};

// --- Smart Context Builder ---
const buildContext = async (courseId, materials, skills, assignments, profile, recentMsgs) => {
  let ctx = "";

  // 1. Skill tree
  ctx += "SKILL TREE:\n";
  if (Array.isArray(skills)) {
    const categories = {};
    for (const s of skills) {
      const cat = s.category || "General";
      if (!categories[cat]) categories[cat] = [];
      const pts = profile.skills[s.id]?.points || 0;
      const str = effectiveStrength(profile.skills[s.id]);
      const strPct = Math.round(str * 100);
      const sessions = profile.skills[s.id]?.entries?.length || 0;
      const lastRating = profile.skills[s.id]?.entries?.slice(-1)[0]?.rating || "";
      categories[cat].push("  " + s.id + ": " + s.name + " [strength: " + strPct + "%" + (lastRating ? ", last: " + lastRating : "") + ", " + sessions + " sessions] -- " + s.description + (s.prerequisites?.length ? " (needs: " + s.prerequisites.join(", ") + ")" : ""));
    }
    for (const [cat, items] of Object.entries(categories)) {
      ctx += "\n" + cat + ":\n" + items.join("\n") + "\n";
    }
  } else {
    ctx += skills + "\n";
  }

  // 2. Assignment decomposition
  if (Array.isArray(assignments) && assignments.length > 0) {
    ctx += "\nASSIGNMENTS & SKILL REQUIREMENTS:\n";
    for (const a of assignments) {
      ctx += "\n" + a.title + (a.dueDate ? " (Due: " + a.dueDate + ")" : "") + ":\n";
      if (a.questions) {
        for (const q of a.questions) {
          ctx += "  " + q.id + ": " + q.description + " [" + q.difficulty + "] -- needs: " + (q.requiredSkills?.join(", ") || "unknown") + "\n";
        }
      }
    }
  }

  // 3. Student profile
  ctx += "\nSTUDENT PROFILE:\n";
  ctx += "Total study sessions: " + profile.sessions + "\n";
  const skillEntries = Object.entries(profile.skills);
  if (skillEntries.length > 0) {
    const sorted = skillEntries.sort((a, b) => effectiveStrength(b[1]) - effectiveStrength(a[1]));
    ctx += "Skill strength (accounts for time decay):\n";
    for (const [sid, data] of sorted) {
      const skillName = Array.isArray(skills) ? skills.find(s => s.id === sid)?.name || sid : sid;
      const str = effectiveStrength(data);
      ctx += "  " + skillName + ": " + Math.round(str * 100) + "% strength";
      if (data.entries?.length) {
        const last = data.entries[data.entries.length - 1];
        ctx += " (last: " + last.rating + " on " + last.date + ")";
      }
      ctx += "\n";
    }
  } else {
    ctx += "New student -- no skill history yet.\n";
  }

  // 4. Selectively load relevant source documents
  const recentText = recentMsgs.slice(-6).map(m => m.content).join(" ").toLowerCase();
  const keywords = recentText.split(/\s+/).filter(w => w.length > 3);

  let relevantSkillIds = [];
  if (Array.isArray(skills)) {
    for (const s of skills) {
      const nameLower = s.name.toLowerCase();
      if (keywords.some(kw => nameLower.includes(kw))) relevantSkillIds.push(s.id);
    }
  }

  const neededDocs = new Set();
  if (Array.isArray(skills)) {
    for (const sid of relevantSkillIds) {
      const skill = skills.find(s => s.id === sid);
      if (skill?.sources) skill.sources.forEach(src => neededDocs.add(src.toLowerCase()));
    }
  }

  const asgnRelated = ["assignment", "homework", "due", "question", "problem", "exercise", "submit"].some(w => recentText.includes(w));

  ctx += "\nLOADED SOURCE MATERIAL:\n";
  let loadedCount = 0;

  for (const mat of materials) {
    const loaded = await getMatContent(courseId, mat);
    var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
    if (!activeChunks.length) continue;

    const nameLower = mat.name.toLowerCase();
    const isNeeded = neededDocs.has(nameLower) ||
      keywords.some(kw => nameLower.includes(kw)) ||
      mat.classification === "syllabus" ||
      (mat.classification === "assignment" && asgnRelated);

    if (!isNeeded && loadedCount >= 3) continue;

    if (activeChunks.length > 1) {
      // Multi-chunk (textbook or large doc): show index, load relevant chunks
      ctx += "\n--- " + mat.name + " (chunk index) ---\n";
      for (const ch of activeChunks) ctx += "  " + ch.id + ": \"" + ch.label + "\"\n";

      const relChs = activeChunks.filter(ch => {
        const tl = ch.label.toLowerCase();
        const preview = ch.content.substring(0, 800).toLowerCase();
        return keywords.some(kw => kw.length > 3 && (tl.includes(kw) || preview.includes(kw))) ||
          [...neededDocs].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)));
      });
      for (const ch of relChs.slice(0, 3)) {
        ctx += "\n--- " + ch.label + " (full) ---\n" + ch.content + "\n";
      }
    } else if (isNeeded && activeChunks[0]?.content) {
      ctx += "\n--- " + mat.classification.toUpperCase() + ": " + mat.name + " ---\n" + activeChunks[0].content + "\n";
      loadedCount++;
    }
  }

  return ctx;
};

// --- Focused Context Builder ---
const buildFocusedContext = async (courseId, materials, focus, skills, profile) => {
  let ctx = "";
  const allSkills = Array.isArray(skills) ? skills : [];

  if (focus.type === "assignment") {
    // Load only this assignment and its required skills
    const asgn = focus.assignment;
    ctx += "CURRENT ASSIGNMENT: " + asgn.title + (asgn.dueDate ? " (Due: " + asgn.dueDate + ")" : "") + "\n\n";
    ctx += "QUESTIONS:\n";
    const requiredSkillIds = new Set();
    if (asgn.questions) {
      for (const q of asgn.questions) {
        ctx += "  " + q.id + ": " + q.description + " [" + q.difficulty + "]\n";
        ctx += "    Required skills: " + (q.requiredSkills?.join(", ") || "unknown") + "\n";
        if (q.requiredSkills) q.requiredSkills.forEach(s => requiredSkillIds.add(s));
      }
    }

    // Only the skills this assignment needs, with student's current level
    ctx += "\nREQUIRED SKILLS FOR THIS ASSIGNMENT:\n";
    const neededSources = new Set();
    for (const sid of requiredSkillIds) {
      const skill = allSkills.find(s => s.id === sid);
      const sd = profile.skills[sid];
      const str = effectiveStrength(sd);
      const strPct = Math.round(str * 100);
      const lastRating = sd?.entries?.slice(-1)[0]?.rating || "untested";
      if (skill) {
        ctx += "  " + sid + ": " + skill.name + " [strength: " + strPct + "%, last: " + lastRating + "] -- " + skill.description + "\n";
        if (skill.sources) skill.sources.forEach(src => neededSources.add(src.toLowerCase()));
      } else {
        ctx += "  " + sid + ": [strength: " + strPct + "%, last: " + lastRating + "]\n";
      }
    }

    // Load only source materials referenced by required skills
    ctx += "\nSOURCE MATERIAL:\n";
    for (const mat of materials) {
      const loaded = await getMatContent(courseId, mat);
      var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
      if (!activeChunks.length) continue;
      const nameLower = mat.name.toLowerCase();
      const isNeeded = neededSources.has(nameLower) ||
        mat.classification === "assignment" ||
        [...neededSources].some(src => nameLower.includes(src) || src.includes(nameLower.substring(0, 15)));
      if (!isNeeded) continue;

      if (activeChunks.length > 1) {
        for (const ch of activeChunks) {
          const tl = ch.label.toLowerCase();
          if ([...neededSources].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)))) {
            ctx += "\n--- " + ch.label + " ---\n" + ch.content + "\n";
          }
        }
      } else if (activeChunks[0]?.content) {
        ctx += "\n--- " + mat.name + " ---\n" + activeChunks[0].content + "\n";
      }
    }

  } else if (focus.type === "skill") {
    const skill = focus.skill;
    const sd = profile.skills[skill.id];
    const str = effectiveStrength(sd);
    const strPct = Math.round(str * 100);
    const lastRating = sd?.entries?.slice(-1)[0]?.rating || "untested";
    ctx += "FOCUS SKILL: " + skill.id + ": " + skill.name + " [strength: " + strPct + "%, last: " + lastRating + "]\n";
    ctx += "Description: " + skill.description + "\n";
    if (skill.prerequisites?.length) {
      ctx += "Prerequisites: " + skill.prerequisites.join(", ") + "\n";
      ctx += "\nPREREQUISITE STATUS:\n";
      for (const pid of skill.prerequisites) {
        const prereq = allSkills.find(s => s.id === pid);
        const pStr = effectiveStrength(profile.skills[pid]);
        const pStrPct = Math.round(pStr * 100);
        ctx += "  " + pid + ": " + (prereq?.name || pid) + " [strength: " + pStrPct + "%]\n";
      }
    }

    // Load only source materials this skill references
    const neededSources = new Set();
    if (skill.sources) skill.sources.forEach(src => neededSources.add(src.toLowerCase()));

    if (neededSources.size > 0) {
      ctx += "\nSOURCE MATERIAL:\n";
      for (const mat of materials) {
        const loaded = await getMatContent(courseId, mat);
        var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
        if (!activeChunks.length) continue;
        const nameLower = mat.name.toLowerCase();
        const isNeeded = neededSources.has(nameLower) ||
          [...neededSources].some(src => nameLower.includes(src) || src.includes(nameLower.substring(0, 15)));
        if (!isNeeded) continue;

        if (activeChunks.length > 1) {
          for (const ch of activeChunks) {
            const tl = ch.label.toLowerCase();
            if ([...neededSources].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)))) {
              ctx += "\n--- " + ch.label + " ---\n" + ch.content + "\n";
            }
          }
        } else if (activeChunks[0]?.content) {
          ctx += "\n--- " + mat.name + " ---\n" + activeChunks[0].content + "\n";
        }
      }
    }

  } else if (focus.type === "recap") {
    // Just profile summary, no materials
    ctx += "STUDENT PROFILE:\n";
    ctx += "Total sessions: " + profile.sessions + "\n";
    const entries = Object.entries(profile.skills).sort((a, b) => effectiveStrength(b[1]) - effectiveStrength(a[1]));
    if (entries.length > 0) {
      ctx += "Skills engaged:\n";
      for (const [sid, data] of entries) {
        const name = allSkills.find(s => s.id === sid)?.name || sid;
        const str = effectiveStrength(data);
        ctx += "  " + name + ": " + Math.round(str * 100) + "% strength\n";
      }
    }
  }

  return ctx;
};

// --- Session Journal ---
const generateSessionEntry = (messages, startIdx, skillUpdatesLog) => {
  const sessionMsgs = messages.slice(startIdx);
  if (sessionMsgs.length < 2) return null;

  const userMsgs = sessionMsgs.filter(m => m.role === "user");
  const assistantMsgs = sessionMsgs.filter(m => m.role === "assistant");
  if (userMsgs.length === 0) return null;

  const allUserText = userMsgs.map(m => m.content).join(" ").toLowerCase();
  const words = allUserText.split(/\s+/).filter(w => w.length > 4);
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);

  const strugglePatterns = /don'?t understand|confused|what do you mean|can you explain|still not|lost|huh\??|wait what|i don'?t get|help me understand|go over.+again|one more time/i;
  const struggles = userMsgs.filter(m => strugglePatterns.test(m.content)).map(m => m.content.substring(0, 120));

  const confidencePatterns = /oh i see|makes sense|got it|i understand|that clicks|ah ok|so basically|let me try|i think i can/i;
  const wins = userMsgs.filter(m => confidencePatterns.test(m.content)).map(m => m.content.substring(0, 120));

  const lastUserMsg = userMsgs[userMsgs.length - 1]?.content || "";
  const lastStudyMsg = assistantMsgs[assistantMsgs.length - 1]?.content
    ?.replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "").replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "").substring(0, 200) || "";

  return {
    date: new Date().toISOString(),
    messageCount: sessionMsgs.length,
    userMessages: userMsgs.length,
    topicsDiscussed: topWords,
    skillsUpdated: skillUpdatesLog.map(u => u.skillId + ": +" + u.points + " (" + u.reason + ")"),
    struggles: struggles.slice(0, 3),
    wins: wins.slice(0, 3),
    lastStudentMessage: lastUserMsg.substring(0, 200),
    lastStudyContext: lastStudyMsg,
  };
};

// --- Journal Formatter ---
const formatJournal = (journal) => {
  if (!journal.length) return "No previous sessions recorded.\n";
  const recent = journal.slice(-10);
  let out = "";
  for (const entry of recent) {
    const d = new Date(entry.date).toLocaleDateString();
    out += "Session " + d + ": " + entry.messageCount + " messages, topics: " + (entry.topicsDiscussed?.slice(0, 5).join(", ") || "general") + "\n";
    if (entry.skillsUpdated?.length) out += "  Skills: " + entry.skillsUpdated.join(", ") + "\n";
    if (entry.struggles?.length) out += "  Struggled with: " + entry.struggles.map(s => "\"" + s.substring(0, 60) + "\"").join("; ") + "\n";
    if (entry.wins?.length) out += "  Breakthroughs: " + entry.wins.map(w => "\"" + w.substring(0, 60) + "\"").join("; ") + "\n";
    out += "  Left off: \"" + (entry.lastStudentMessage?.substring(0, 80) || "--") + "\"\n";
  }
  return out;
};

// --- System Prompt (Master Teacher) ---
const buildSystemPrompt = (courseName, context, journal) => {
  return "You are Study -- a master teacher. Not a tutor. Not an assistant. A teacher.\n\nThe difference matters: a tutor helps someone get through homework. A teacher makes someone capable. You do both -- but in order. First, you make sure the student can handle what's due. Then you make sure they actually understand it deeply enough to not need you.\n\nCOURSE: " + courseName + "\n\n" + context + "\n\nSESSION HISTORY:\n" + formatJournal(journal) + "\n\n---\n\nASSIGNMENT-FIRST PRIORITY:\n\nEvery session starts from the same question: what does this student need to turn in, and can they do it?\n\nCheck the assignment list and deadlines. Check which skills each assignment requires. Check the student's skill profile. That's your opening diagnostic -- not \"what do you want to learn today\" but \"here's what's coming up and here's what you need to be able to do.\"\n\nThe student picks which assignment to work on. You orient them. If they have something due tomorrow, you flag it. Once they pick, you reverse-engineer it: what skills are required, which has the student demonstrated, which are gaps. Then start on the gaps.\n\nWhen all assignments are handled, shift to mastery mode. Find skills where they struggled or scraped by. Go back and build real depth.\n\n---\n\nYOUR TEACHING METHOD -- ASK FIRST, TEACH SECOND:\n\nThis is the core rule: you do NOT teach until you've located the gap. Most of your responses should be questions, not explanations.\n\n1. ASK. When a student brings a topic or assignment, your first move is always a question. Not \"let me explain X\" but \"what do you think X is?\" or \"walk me through how you'd start this.\" You need to hear THEM before you say anything substantive. One question. Wait.\n\n2. LISTEN AND NARROW. Their answer tells you where the gap is. If they're close, ask a sharper question to find the exact edge of their understanding. If they're way off, you now know where to start -- but ask one more question to confirm: \"OK, so when you hear [term], what comes to mind?\" The goal is precision. You're not teaching a topic -- you're filling a specific hole.\n\n3. FILL THE GAP. Now -- and only now -- teach. And teach only what's missing. Use their course materials first. Keep it tight. One concept at a time. Don't build a lecture -- deliver the missing piece.\n\n4. VERIFY. Ask them to use what you just taught. \"OK, so with that in mind, how would you approach the problem now?\" If they can't apply it, the gap isn't filled. Reteach from a different angle.\n\n5. MOVE ON. Once verified, either move to the next gap or let them attempt the assignment question. Don't linger. Don't \"build wider\" unless they're in mastery mode and have time.\n\nThe ratio should be roughly: 60% of your messages are questions, 30% are short teaching, 10% are confirmations or redirects.\n\n---\n\nTHE ANSWER DOCTRINE:\n\nYou do not give answers to assignment or homework questions. Hard rule, no exceptions.\n\nWhen a student asks for an answer: redirect with purpose. \"What do you think the first step is?\"\n\nWhen they say \"just tell me, I'm running out of time\": hold firm, accelerate. \"Fastest path -- tell me what [X] is and we'll get there in two minutes.\"\n\nWhen they say \"I already know this\": test them. \"Walk me through it.\" They'll either prove it or see the gap.\n\nWhen frustrated: stay steady. \"I hear you. Let me come at this differently.\" Switch angles.\n\nWhen overwhelmed: shrink the problem. \"Forget the full question. Just this one piece.\"\n\n---\n\nHOW YOU SPEAK:\n\nShort by default. Most responses: 1-3 sentences. You're having a conversation, not writing.\n\nYour default response is a question. If you're not sure whether to ask or tell -- ask.\n\nWhen to go short (1-3 sentences):\n- Diagnostic questions (this is most of the time)\n- Confirming understanding\n- Hints and nudges\n- Routing (\"which assignment?\")\n- Redirects\n\nWhen to go medium (1-2 short paragraphs):\n- Teaching a specific concept AFTER diagnosing the gap\n- Worked examples the student asked for\n\nWhen to go long (rare):\n- Multi-step explanations where each step depends on the last\n- Even then: teach one step, ask, teach the next\n\nNever pad. No preamble. No \"Let's dive into this.\" Just start. If the answer is a question back to them, ask it.\n\nSpeak like a teacher mid-class. \"Alright.\" \"Here's the thing.\" \"Hold on.\" Not: \"Great question!\" \"I'd be happy to help!\" \"Certainly!\" No filler praise. When you praise, it's specific: \"good, you caught the sign error.\"\n\nConfident, not condescending. Point to course materials, don't quote them at length.\n\n---\n\nREADING THE STUDENT:\n\n- New, low points: Start with something they can answer. Build confidence with a small win. But don't go soft.\n- Moderate points: Push harder. Expect them to explain things back. Call out shortcuts.\n- High points: Move fast. Test edge cases. Ask \"why\" more than \"what.\"\n- Struggled last session: Try a different angle. Name it -- \"Last time my explanation of [X] didn't land. Different approach.\"\n- Breakthrough last session: Build on it. \"You nailed [X]. Today extends that.\"\n- All assignments done: Pivot to mastery. Find the shaky skills. \"Your assignments are handled. Let's make sure [weak area] is solid.\"\n\n---\n\nSKILL STRENGTH TRACKING:\n\nAfter meaningful teaching exchanges, rate how the student performed on the skill:\n[SKILL_UPDATE]\nskill-id: struggled|hard|good|easy | reason\n[/SKILL_UPDATE]\n\nRatings -- based on what the student DEMONSTRATED, not what you taught:\n- struggled: Could not answer diagnostic questions. Needed heavy guidance. Still shaky.\n- hard: Got there with significant help. Answered partially. Needed multiple attempts.\n- good: Answered correctly with minor nudges. Applied the concept to the problem.\n- easy: Nailed it cold. Handled variations. Connected it to other concepts unprompted.\n\nOnly rate when the student actually engaged with the skill. Don't rate for just listening.\nOne rating per skill per exchange. Be honest -- struggled is useful data, not a failure.";
};

// --- Boot Prompt (Course Entry) ---
const buildBootPrompt = (courseName, skillSummary, asgnSummary, profile, journal, verifyCtx) => {
  const statusLine = profile.sessions > 0
    ? "Returning student with " + profile.sessions + " sessions"
    : "Brand new -- first session";

  const hasAssignments = asgnSummary && asgnSummary.trim() && asgnSummary !== "None found yet.";

  return "You are Study -- a master teacher. A student just entered their course, and you've read every piece of material they uploaded. You know this course deeply.\n\nCOURSE: " + courseName + "\n\nSKILLS IDENTIFIED:\n" + (skillSummary || "Still processing...") + "\n\nASSIGNMENTS:\n" + (asgnSummary || "None found yet.") + "\n\nSTUDENT STATUS: " + statusLine + "\n\nSESSION HISTORY:\n" + formatJournal(journal || []) + "\n" + (verifyCtx || "") + "\n---\n\nWrite your opening message. This is the first thing the student sees.\n\nPRIORITY: ASSIGNMENTS FIRST.\n\nFOR A NEW STUDENT:\n" + (hasAssignments ? "Lead with what's due. Not a vague overview of the course -- the specific assignments, their deadlines, and what skills they'll need. The student came here because they have work to do. Show them you understand that.\n\nAfter laying out the assignments, briefly mention the skills the course covers and how they connect to the assignments. Then recommend where to start -- usually the nearest deadline, unless a foundational skill is missing that blocks everything.\n\nFrame it like: \"Alright, I've gone through everything. Here's what you've got coming up... [assignments with dates]. To handle [first assignment], you'll need to be solid on [skills]. Let's start there.\"\n\nIf they finish their assignments early, that's when the real learning begins -- mention this naturally. Something like: \"Once your assignments are handled, we can dig deeper into the concepts and make sure you actually own this material.\"\n" : "No assignments were found in the uploaded materials. Let the student know -- ask if they have assignment files to upload. In the meantime, survey the course skills and suggest starting with foundational concepts that everything else builds on. Frame it as getting ahead: when assignments do come, they'll be ready.\n") + "\nDon't be stiff. Don't deliver a numbered report. Talk to them like a teacher on the first day who's done their prep. Keep it focused -- orient them and get them moving.\n\nIf any documents had verification issues, mention them naturally -- \"One thing I noticed: [file] had some sections I couldn't read clearly. You might want to check [specific section] and let me know if I'm reading it right.\"\n\nFOR A RETURNING STUDENT:\nCheck their assignment status first. Reference what they were working on, what's still due, and what's coming up. If they finished something since last session, acknowledge it and point to what's next.\n\nIf all assignments are in good shape, shift to mastery: \"Your assignments are handled. Let's use this time to go deeper on [area where they showed weakness].\" Reference specific struggles from the session history.\n\nMake it feel like picking up a conversation, not starting over.\n\nEnd by letting them choose: pick an assignment to work on, ask about a concept, or tell you what they need. But make the assignment path the obvious default.";
};

// --- Skill Point Parser ---
// --- Question Unlock Parser ---
const parseQuestionUnlock = (response) => {
  var match = response.match(/\[UNLOCK_QUESTION\]\s*([\w-]+)\s*\[\/UNLOCK_QUESTION\]/);
  return match ? match[1].trim() : null;
};

const parseSkillUpdates = (response) => {
  const match = response.match(/\[SKILL_UPDATE\]([\s\S]*?)\[\/SKILL_UPDATE\]/);
  if (!match) return [];
  const updates = [];
  const lines = match[1].trim().split("\n");
  for (const line of lines) {
    // New format: skill-id: struggled|hard|good|easy | reason
    var m = line.match(/^([\w-]+):\s*(struggled|hard|good|easy)\s*\|?\s*(.*)/i);
    if (m) {
      updates.push({ skillId: m[1], rating: m[2].toLowerCase(), reason: m[3].trim() });
      continue;
    }
    // Legacy format fallback: skill-id: +N points | reason
    m = line.match(/^([\w-]+):\s*\+(\d+)\s*(?:points?)?\s*\|?\s*(.*)/);
    if (m) {
      var pts = parseInt(m[2]);
      var rating = pts >= 5 ? "easy" : pts >= 3 ? "good" : pts >= 2 ? "hard" : "struggled";
      updates.push({ skillId: m[1], rating, reason: m[3].trim() });
    }
  }
  return updates;
};

// --- Strength Decay Model ---
const DECAY_BASE = 0.05; // Base decay rate per day
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
const MAX_EASE = 4.0;

const effectiveStrength = (skillData) => {
  if (!skillData || !skillData.strength) return 0;
  var lastPracticed = skillData.lastPracticed;
  if (!lastPracticed) return skillData.strength;
  var daysSince = (Date.now() - new Date(lastPracticed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) daysSince = 0;
  // Higher ease = slower decay
  var decayRate = DECAY_BASE / (skillData.ease || DEFAULT_EASE);
  return skillData.strength * Math.exp(-decayRate * daysSince);
};

// Estimate next review date: when strength will drop below threshold
const nextReviewDate = (skillData, threshold) => {
  if (!skillData || !skillData.strength || !skillData.lastPracticed) return null;
  if (!threshold) threshold = 0.4;
  if (skillData.strength <= threshold) return "now";
  var decayRate = DECAY_BASE / (skillData.ease || DEFAULT_EASE);
  // strength * e^(-rate * days) = threshold => days = -ln(threshold/strength) / rate
  var days = -Math.log(threshold / skillData.strength) / decayRate;
  var reviewDate = new Date(new Date(skillData.lastPracticed).getTime() + days * 86400000);
  return reviewDate.toISOString().split("T")[0];
};

// --- Strength Update (replaces point-only system) ---
const applySkillUpdates = async (courseId, updates) => {
  if (!updates.length) return;
  var profile = await DB.getProfile(courseId);
  var now = new Date().toISOString();
  var date = now.split("T")[0];

  for (var u of updates) {
    if (!profile.skills[u.skillId]) {
      profile.skills[u.skillId] = { points: 0, strength: 0, ease: DEFAULT_EASE, lastPracticed: null, entries: [] };
    }
    var sk = profile.skills[u.skillId];

    // Calculate current effective strength before update
    var current = effectiveStrength(sk);

    // Rating-based adjustments
    var strengthGain, easeAdj, pointGain;
    switch (u.rating) {
      case "struggled":
        strengthGain = 0.05;
        easeAdj = -0.2;
        pointGain = 1;
        break;
      case "hard":
        strengthGain = 0.15;
        easeAdj = 0;
        pointGain = 2;
        break;
      case "good":
        strengthGain = 0.25;
        easeAdj = 0.1;
        pointGain = 3;
        break;
      case "easy":
        strengthGain = 0.35;
        easeAdj = 0.15;
        pointGain = 5;
        break;
      default:
        strengthGain = 0.15;
        easeAdj = 0;
        pointGain = 2;
    }

    // Apply: strength is based on decayed value + gain, capped at 1.0
    sk.strength = Math.min(1.0, current + strengthGain);
    sk.ease = Math.max(MIN_EASE, Math.min(MAX_EASE, (sk.ease || DEFAULT_EASE) + easeAdj));
    sk.lastPracticed = now;
    sk.points = (sk.points || 0) + pointGain; // Keep points for display/backward compat
    sk.entries.push({ date, rating: u.rating, reason: u.reason });
  }

  profile.sessions = (profile.sessions || 0) + 1;
  await DB.saveProfile(courseId, profile);
  return profile;
};

// =================================================================
// PRACTICE MODE - Problem set engine
// =================================================================

const TIERS = [
  null, // index 0 unused
  { name: "Predict", desc: "What does this output/evaluate to?", basePoints: 3, instruction: "Show a code snippet or expression. Ask what it outputs or evaluates to. The student answers with the expected output only. Do NOT include starter code." },
  { name: "Fill", desc: "Complete the missing piece", basePoints: 5, instruction: "Provide code with a clearly marked blank (use ___ as placeholder). The student fills in the missing part to make the code work correctly. Include the template as starterCode." },
  { name: "Write", desc: "Write a function/solution from scratch", basePoints: 8, instruction: "Describe what a function or solution should do. The student writes it from scratch. Do NOT include starter code." },
  { name: "Debug", desc: "Find and fix the error", basePoints: 10, instruction: "Provide code with exactly one bug. The student must identify and fix it. Include the buggy code as starterCode." },
  { name: "Combine", desc: "Use multiple concepts together", basePoints: 13, instruction: "Create a problem that requires this skill PLUS a prerequisite or related skill. Describe the task. May or may not include starter code." },
  { name: "Apply", desc: "Mini-program / complex problem", basePoints: 16, instruction: "Create a multi-step problem or mini-program with a real-world-ish scenario. The student builds a small but complete solution." },
];

const ATTEMPT_MULTIPLIERS = [0, 1.0, 0.6, 0.35, 0.2]; // index = attempt number, 4+ = 0.2
const attemptMultiplier = (n) => n <= 0 ? 1.0 : n < ATTEMPT_MULTIPLIERS.length ? ATTEMPT_MULTIPLIERS[n] : 0.2;
const attemptRating = (n) => n <= 1 ? "strong" : n === 2 ? "developing" : "struggling";

const strengthToTier = (strength) => {
  if (strength >= 0.80) return 6;
  if (strength >= 0.65) return 5;
  if (strength >= 0.50) return 4;
  if (strength >= 0.30) return 3;
  if (strength >= 0.15) return 2;
  return 1;
};

const detectLanguage = (courseName, skillName, skillDesc) => {
  var combined = " " + (courseName + " " + skillName + " " + (skillDesc || "")).toLowerCase() + " ";
  // Word-boundary match helper: checks pattern appears as whole word (surrounded by non-alpha)
  var wb = (pat) => { var re = new RegExp("(?<![a-z])" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-z])"); return re.test(combined); };
  var langs = [
    { id: "java", match: () => wb("java") && !wb("javascript") },
    { id: "python", match: () => wb("python") || wb("pip") || wb("pytest") || wb("django") || wb("flask") },
    { id: "javascript", match: () => wb("javascript") || wb("typescript") || (wb("react") && !combined.includes("reaction")) || wb("node.js") || wb("nodejs") },
    { id: "c++", match: () => combined.includes("c++") || wb("cpp") },
    { id: "c#", match: () => combined.includes("c#") || wb("csharp") || (wb(".net") && !combined.includes("network")) },
    { id: "c", match: () => wb("c programming") || wb("ansi c") || wb("gcc") || (/ c (?:language|program|code|compiler)/.test(combined)) },
    { id: "rust", match: () => wb("rustc") || wb("cargo") || wb("rust programming") || wb("rust language") || (wb("rust") && (wb("fn") || wb("struct") || wb("impl") || wb("crate"))) },
    { id: "go", match: () => wb("golang") || wb("go programming") || wb("go language") },
    { id: "sql", match: () => wb("sql") || wb("mysql") || wb("postgres") || wb("sqlite") },
    { id: "r", match: () => wb("rstudio") || wb("tidyverse") || wb("ggplot") || wb("r programming") || wb("r language") },
    { id: "matlab", match: () => wb("matlab") || wb("simulink") },
    { id: "swift", match: () => wb("swift") || wb("swiftui") || wb("xcode") },
    { id: "kotlin", match: () => wb("kotlin") },
    { id: "ruby", match: () => wb("ruby") || wb("rails") },
  ];
  for (var l of langs) {
    if (l.match()) return l.id;
  }
  return null;
};

// DB helpers for practice sets
DB.savePractice = async function(cid, skillId, data) { await this.set("study-practice:" + cid + ":" + skillId, data); };
DB.getPractice = async function(cid, skillId) { return await this.get("study-practice:" + cid + ":" + skillId); };

const createPracticeSet = (courseId, skill, courseName) => {
  var strength = skill.strength || 0;
  return {
    id: "prac-" + Date.now(),
    skillId: skill.id,
    courseId: courseId,
    detectedLanguage: detectLanguage(courseName, skill.name, skill.description),
    currentTier: strengthToTier(strength),
    tiers: {},
    problemSignatures: [],
    startedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
};

const generateProblems = async (practiceSet, skill, courseName, materialCtx) => {
  var tier = practiceSet.currentTier;
  var tierInfo = TIERS[tier];
  var lang = practiceSet.detectedLanguage;
  var sigList = practiceSet.problemSignatures.length > 0
    ? practiceSet.problemSignatures.join("\n")
    : "None yet";

  var prompt = "Generate 5 practice problems for the skill: " + skill.name + "\n" +
    "Description: " + (skill.description || "N/A") + "\n" +
    "Course: " + courseName + "\n" +
    "Language: " + (lang || "use pseudocode or general notation") + "\n" +
    "Tier " + tier + " (" + tierInfo.name + "): " + tierInfo.desc + "\n\n" +
    "TIER INSTRUCTIONS:\n" + tierInfo.instruction + "\n\n" +
    (skill.prerequisites?.length ? "This skill has prerequisites: " + skill.prerequisites.join(", ") + ". For Tier 5 (Combine), reference these.\n\n" : "") +
    (materialCtx ? "SOURCE MATERIAL FOR REFERENCE:\n" + materialCtx.substring(0, 8000) + "\n\n" : "") +
    "ALREADY USED PROBLEMS (generate COMPLETELY DIFFERENT scenarios, variable names, and structures):\n" + sigList + "\n\n" +
    "Return ONLY a JSON array of exactly 5 problems:\n" +
    "[{\n" +
    "  \"id\": \"p1\",\n" +
    "  \"prompt\": \"the problem statement shown to the student\",\n" +
    "  \"starterCode\": \"code template if applicable, or null\",\n" +
    "  \"expectedApproach\": \"what a correct answer looks like â€” for evaluation only, never shown to student\",\n" +
    "  \"signature\": \"one-line unique summary of this problem for dedup\"\n" +
    "}]\n\n" +
    "Rules:\n" +
    "- Each problem must be distinct from the others and from ALREADY USED.\n" +
    "- Problems should be focused solely on " + skill.name + ".\n" +
    "- Difficulty should be appropriate for Tier " + tier + " (" + tierInfo.name + ").\n" +
    "- Use " + (lang || "pseudocode") + " for all code snippets.\n" +
    "- For starterCode: use \\n for newlines within the string.";

  var result = await callClaude(prompt, [{ role: "user", content: "Generate the practice problems." }], 8192);
  var parsed = extractJSON(result);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Failed to parse problem generation response");
  }

  // Normalize and build attempt
  var problems = parsed.slice(0, 5).map((p, i) => ({
    id: p.id || ("p" + (i + 1)),
    prompt: p.prompt || "Problem " + (i + 1),
    starterCode: p.starterCode || null,
    expectedApproach: p.expectedApproach || "",
    studentAnswer: null,
    evaluation: null,
    passed: null,
  }));

  // Store signatures
  var newSigs = parsed.slice(0, 5).map(p => p.signature || p.prompt.substring(0, 80)).filter(Boolean);
  practiceSet.problemSignatures.push(...newSigs);

  // Determine attempt number for this tier
  var tierData = practiceSet.tiers[tier] || { attempts: [], passed: false, pointsAwarded: 0 };
  var attemptNum = tierData.attempts.length + 1;

  tierData.attempts.push({
    problems: problems,
    passCount: 0,
    attemptNumber: attemptNum,
    completed: false,
  });
  practiceSet.tiers[tier] = tierData;
  practiceSet.lastActiveAt = new Date().toISOString();

  return practiceSet;
};

const evaluateAnswer = async (skill, problem, studentAnswer, tier) => {
  var prompt = "Evaluate this student's answer.\n\n" +
    "Skill: " + skill.name + "\n" +
    "Problem: " + problem.prompt + "\n" +
    (problem.starterCode ? "Starter code:\n" + problem.starterCode + "\n\n" : "") +
    "Expected approach: " + problem.expectedApproach + "\n\n" +
    "Student's answer:\n" + studentAnswer + "\n\n" +
    "Evaluate on conceptual correctness and proper application of " + skill.name + ".\n" +
    "For code: minor syntax issues (missing semicolon, slight formatting) are OK if the logic is sound.\n" +
    (tier === 1 ? "For Tier 1 (predict): answer must match expected output exactly or be semantically equivalent.\n" : "") +
    (tier === 2 ? "For Tier 2 (fill): the filled portion must make the code work correctly.\n" : "") +
    "\nReturn ONLY JSON:\n{\"passed\": true/false, \"feedback\": \"brief explanation, 2-3 sentences max\"}";

  var result = await callClaude(prompt, [{ role: "user", content: "Evaluate the answer." }], 1024);
  var parsed = extractJSON(result);

  if (!parsed || typeof parsed.passed !== "boolean") {
    return { passed: false, feedback: "Could not evaluate response. Please try again." };
  }
  return parsed;
};

const completeTierAttempt = (practiceSet) => {
  var tier = practiceSet.currentTier;
  var tierData = practiceSet.tiers[tier];
  if (!tierData || !tierData.attempts.length) return { advanced: false, points: 0 };

  var currentAttempt = tierData.attempts[tierData.attempts.length - 1];
  var passCount = currentAttempt.problems.filter(p => p.passed === true).length;
  currentAttempt.passCount = passCount;
  currentAttempt.completed = true;

  if (passCount >= 4) {
    // Passed this tier
    tierData.passed = true;
    var attemptNum = currentAttempt.attemptNumber;
    var mult = attemptMultiplier(attemptNum);
    var points = Math.round(TIERS[tier].basePoints * mult);
    tierData.pointsAwarded = (tierData.pointsAwarded || 0) + points;

    // Advance to next tier if not at max
    var advanced = false;
    if (tier < 6) {
      practiceSet.currentTier = tier + 1;
      advanced = true;
    }

    return { advanced, points, passCount, attemptNum, rating: attemptRating(attemptNum), tierName: TIERS[tier].name };
  }

  // Failed â€” will need new problems (same tier)
  return { advanced: false, points: 0, passCount, attemptNum: currentAttempt.attemptNumber, retry: true, tierName: TIERS[tier].name };
};

// Load relevant material context for a skill's practice problems
const loadPracticeMaterialCtx = async (courseId, materials, skill) => {
  var neededSources = new Set();
  if (skill.sources) skill.sources.forEach(src => neededSources.add(src.toLowerCase()));
  if (neededSources.size === 0) return "";

  var ctx = "";
  for (var mat of materials) {
    var loaded = await getMatContent(courseId, mat);
    var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
    for (var ch of activeChunks) {
      var tl = ch.label.toLowerCase();
      if ([...neededSources].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)))) {
        ctx += "\n--- " + ch.label + " ---\n" + ch.content.substring(0, 6000) + "\n";
      }
    }
    if (ctx.length > 12000) break; // Cap total context
  }
  return ctx;
};

// --- Theme ---
const T = {
  bg: "#0F1115",
  sf: "#1A1D24",
  sfH: "#22262F",
  bd: "#2A2F3A",
  tx: "#E8EAF0",
  txD: "#6B7280",
  txM: "#4B5563",
  ac: "#6C9CFC",
  acS: "rgba(108,156,252,0.1)",
  acB: "rgba(108,156,252,0.2)",
  gn: "#34D399",
  gnS: "rgba(52,211,153,0.1)",
  am: "#FBBF24",
  amS: "rgba(251,191,36,0.1)",
  rd: "#F87171",
};

// --- Classification Options ---
const CLS = [
  { v: "syllabus", l: "Syllabus / Schedule" },
  { v: "lecture", l: "Lecture Transcript" },
  { v: "assignment", l: "Assignment / Homework" },
  { v: "notes", l: "Notes" },
  { v: "textbook", l: "Textbook" },
  { v: "reference", l: "Reference / Other" },
];

// --- Auto-Classifier ---
const autoClassify = (file) => {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop();

  // Extension-based
  if (ext === "epub") return "textbook";
  if (ext === "srt" || ext === "vtt") return "lecture";

  // Name-based patterns
  if (/syllabus|schedule|course.?outline|calendar/i.test(name)) return "syllabus";
  if (/homework|hw\d|assignment|asgn|quiz|exam|midterm|final|problem.?set|worksheet|lab\d/i.test(name)) return "assignment";
  if (/lecture|transcript|recording|class.?notes|week.?\d/i.test(name)) return "lecture";
  if (/notes|review|summary|study.?guide|cheat.?sheet|outline/i.test(name)) return "notes";
  if (/textbook|chapter|ch\d|reading/i.test(name)) return "textbook";

  return "";
};

// --- Parse Status ---
const parseFailed = (content) => {
  if (!content) return true;
  if (typeof content !== "string") return false;
  var t = content.trim();
  // Matches strings that start with [ and contain failure keywords
  if (/^\[.*(?:failed|not supported|could not|error|empty)/i.test(t)) return true;
  return false;
};

// --- Markdown Renderer ---
const renderMd = (text) => {
  if (!text) return null;
  const clean = text.replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "").replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "").trim();
  const lines = clean.split("\n");
  const els = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("### ")) {
      els.push(<h3 key={i} style={{ fontSize: 15, fontWeight: 700, color: T.tx, margin: "16px 0 8px" }}>{ln.slice(4)}</h3>);
    } else if (ln.startsWith("## ")) {
      els.push(<h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: T.tx, margin: "20px 0 10px" }}>{ln.slice(3)}</h2>);
    } else if (ln.startsWith("# ")) {
      els.push(<h1 key={i} style={{ fontSize: 20, fontWeight: 700, color: T.tx, margin: "24px 0 12px" }}>{ln.slice(2)}</h1>);
    } else if (ln.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      els.push(
        <pre key={"c" + i} style={{
          background: "#13151A", border: "1px solid " + T.bd, borderRadius: 8,
          padding: "12px 16px", fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace",
          overflowX: "auto", margin: "12px 0", color: T.ac, lineHeight: 1.6
        }}>{code.join("\n")}</pre>
      );
    } else if (/^[-*] /.test(ln)) {
      els.push(
        <div key={i} style={{ display: "flex", gap: 8, margin: "4px 0", paddingLeft: 4 }}>
          <span style={{ color: T.ac, flexShrink: 0 }}>*</span>
          <span>{inl(ln.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(ln)) {
      const n = ln.match(/^(\d+)\./)[1];
      els.push(
        <div key={i} style={{ display: "flex", gap: 8, margin: "4px 0", paddingLeft: 4 }}>
          <span style={{ color: T.ac, flexShrink: 0, fontWeight: 600 }}>{n}.</span>
          <span>{inl(ln.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (ln.trim() === "") {
      els.push(<div key={i} style={{ height: 8 }} />);
    } else {
      els.push(<p key={i} style={{ margin: "4px 0", lineHeight: 1.7 }}>{inl(ln)}</p>);
    }
    i++;
  }
  return els;
};

const inl = (t) => t.split(/(\*\*.*?\*\*)/g).map((p, i) =>
  p.startsWith("**") && p.endsWith("**")
    ? <strong key={i} style={{ fontWeight: 700, color: T.tx }}>{p.slice(2, -2)}</strong>
    : p
);

// --- CSS ---
const CSS = [
  "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');",
  "*{box-sizing:border-box;margin:0;padding:0}",
  "body{font-family:'DM Sans',sans-serif;background:" + T.bg + ";color:" + T.tx + "}",
  "input,textarea,button,select{font-family:'DM Sans',sans-serif;outline:none}",
  "textarea{overflow-y:auto}",
  "::selection{background:" + T.acS + ";color:" + T.ac + "}",
  "::-webkit-scrollbar{width:6px}",
  "::-webkit-scrollbar-track{background:transparent}",
  "::-webkit-scrollbar-thumb{background:" + T.bd + ";border-radius:3px}",
  "@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
  "@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}",
  "@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}",
  "@keyframes bookSlide1{0%,100%{transform:translateX(0)}30%{transform:translateX(12px)}50%{transform:translateX(12px) translateY(-6px)}70%{transform:translateX(0) translateY(-6px)}85%{transform:translateX(0)}}",
  "@keyframes bookSlide2{0%,100%{transform:translateX(0)}20%{transform:translateY(-8px)}40%{transform:translateX(-10px) translateY(-8px)}60%{transform:translateX(-10px)}80%{transform:translateX(0)}}",
  "@keyframes bookSlide3{0%,100%{transform:translateX(0)}35%{transform:translateY(-5px)}55%{transform:translateX(8px) translateY(-5px)}75%{transform:translateX(8px)}90%{transform:translateX(0)}}",
  "@keyframes bookSlide4{0%,100%{transform:translateX(0)}25%{transform:translateY(-7px)}50%{transform:translateX(-6px) translateY(-7px)}70%{transform:translateX(-6px)}85%{transform:translateX(0)}}",
  "@keyframes shelfPulse{0%,100%{opacity:.5}50%{opacity:.8}}",
].join("\n");


// --- Main Component ---
function StudyInner() {
  const [asyncError, setAsyncError] = useState(null);

  const [screen, setScreen] = useState("home");
  const [courses, setCourses] = useState([]);
  const [active, setActive] = useState(null);
  const [ready, setReady] = useState(false);

  const [files, setFiles] = useState([]);
  const [cName, setCName] = useState("");
  const [drag, setDrag] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [status, setStatus] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [skillViewData, setSkillViewData] = useState(null); // { skills, report, refTax }
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [notifs, setNotifs] = useState([]); // [{ id, type, msg, time }]
  const [showNotifs, setShowNotifs] = useState(false);
  const [lastSeenNotif, setLastSeenNotif] = useState(0);
  const [sessionMode, setSessionMode] = useState(null);
  const [focusContext, setFocusContext] = useState(null);
  const [pickerData, setPickerData] = useState(null);
  const [chunkPicker, setChunkPicker] = useState(null); // { courseId, materials, selectedChunks: Set }
  const [asgnWork, setAsgnWork] = useState(null); // { questions: [{id, description, unlocked, answer, done}], currentIdx: 0 }
  const [practiceMode, setPracticeMode] = useState(null); // { set: PracticeSet, skill: {}, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null }

  const endRef = useRef(null);
  const taRef = useRef(null);
  const fiRef = useRef(null);
  const sessionStartIdx = useRef(0);
  const sessionSkillLog = useRef([]);
  const cachedSessionCtx = useRef(null); // { ctx, skills, profile, journal, focus }

  // Notification helper: type = "info" | "warn" | "error" | "skill" | "success"
  const addNotif = (type, msg) => {
    setNotifs(p => [{ id: Date.now() + Math.random(), type, msg, time: new Date() }, ...p].slice(0, 50));
  };

  // --- Effects ---
  useEffect(() => {
    const onErr = (e) => { setAsyncError({ message: e.message || "Unknown error", stack: e.error?.stack || "" }); };
    const onRej = (e) => { setAsyncError({ message: e.reason?.message || String(e.reason), stack: e.reason?.stack || "" }); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  useEffect(() => { (async () => { setCourses(await DB.getCourses()); setReady(true); })(); }, []);
  useEffect(() => { if (ready) { var t = setTimeout(() => DB.saveCourses(courses).catch(e => console.error("Auto-save courses failed:", e)), 500); return () => clearTimeout(t); } }, [courses, ready]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 150) + "px"; } }, [input]);

  const saveSessionToJournal = useCallback(async () => {
    if (!active || msgs.length <= sessionStartIdx.current + 1) return;
    try {
      const entry = generateSessionEntry(msgs, sessionStartIdx.current, sessionSkillLog.current);
      if (!entry) return;
      const journal = await DB.getJournal(active.id);
      journal.push(entry);
      await DB.saveJournal(active.id, journal.slice(-50));
      await DB.saveChat(active.id, msgs.slice(-100));
      sessionStartIdx.current = msgs.length;
      sessionSkillLog.current = [];
    } catch (e) { console.error("Journal save failed:", e); }
  }, [active, msgs]);

  useEffect(() => {
    const onUnload = () => { saveSessionToJournal(); };
    const onVis = () => { if (document.visibilityState === "hidden") saveSessionToJournal(); };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("beforeunload", onUnload); document.removeEventListener("visibilitychange", onVis); };
  }, [saveSessionToJournal]);

  // --- File Handlers ---
  const onDrop = useCallback(async (e) => {
    e.preventDefault(); setDrag(false);
    const fl = Array.from(e.dataTransfer.files);
    setParsing(true);
    const parsed = await Promise.all(fl.map(readFile));
    setFiles(p => [...p, ...parsed.map(f => ({
      ...f,
      classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
      parseOk: !parseFailed(f.content),
      id: Date.now() + "-" + Math.random()
    }))]);
    setParsing(false);
  }, []);

  const onSelect = useCallback(async (e) => {
    const fl = Array.from(e.target.files);
    setParsing(true);
    const parsed = await Promise.all(fl.map(readFile));
    setFiles(p => [...p, ...parsed.map(f => ({
      ...f,
      classification: autoClassify(f) || (f.type === "epub" ? "textbook" : ""),
      parseOk: !parseFailed(f.content),
      id: Date.now() + "-" + Math.random()
    }))]);
    setParsing(false); e.target.value = "";
  }, []);

  const classify = (id, c) => setFiles(p => p.map(f => f.id === id ? { ...f, classification: c } : f));
  const removeF = (id) => setFiles(p => p.filter(f => f.id !== id));

  // --- Course Creation ---
  const createCourse = async () => {
    if (!cName.trim() || !files.length || files.some(f => !f.classification)) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    const tempCourse = { id: Date.now().toString(), name: cName.trim(), materials: [], createdAt: new Date().toISOString() };
    setActive(tempCourse); setScreen("study"); setBooting(true); setMsgs([]); setStatus("Storing documents...");

    try {
      const courseId = tempCourse.id;
      const mats = [];

      for (let i = 0; i < validFiles.length; i++) {
        const f = validFiles[i];
        setStatus("Storing: " + f.name + "...");
        const mat = await storeAsChunks(courseId, f, "doc-" + i + "-" + Date.now());
        var failedChunks = mat.chunks.filter(c => c.status === "failed").length;
        if (failedChunks > 0) {
          addNotif("error", failedChunks + " of " + mat.chunks.length + " chunks failed to save for \"" + f.name + "\". Storage may be unreliable.");
        }
        mats.push(mat);
        setStatus("Stored: " + f.name + " (" + mat.chunks.length + " chunk" + (mat.chunks.length !== 1 ? "s" : "") + (failedChunks > 0 ? ", " + failedChunks + " failed" : "") + ")");
      }

      const allVerifications = [];
      const allQuestions = [];
      for (const mat of mats) {
        setStatus("Verifying: " + mat.name + "...");
        addNotif("info", "Verifying: " + mat.name + "...");
        try {
          const v = await verifyDocument(courseId, mat);
          mat.verification = v.status;
          allVerifications.push({ name: mat.name, ...v });
          if (v.questions?.length) allQuestions.push(...v.questions.map(q => ({ doc: mat.name, question: q })));
        } catch (e) {
          mat.verification = "error";
          allVerifications.push({ name: mat.name, status: "error", summary: "Verification failed: " + e.message });
        }
      }

      setStatus("Building reference taxonomy...");
      addNotif("info", "Building reference skill framework...");
      let refTaxonomy = null;
      try {
        refTaxonomy = await generateReferenceTaxonomy(courseId, cName.trim(), mats, setStatus);
      } catch (e) {
        console.error("Reference taxonomy failed:", e);
      }

      setStatus("Extracting skills from your course...");
      addNotif("info", refTaxonomy ? "Reference: " + refTaxonomy.taxonomy.length + " canonical skills for " + (refTaxonomy.subject || cName.trim()) + ". Extracting..." : "Extracting skills...");
      let skills = [];

      // Textbooks always show chunk picker (they're the largest files, user should choose chapters)
      var hasTextbook = mats.some(m => m.classification === "textbook");
      if (hasTextbook) {
        // Save course first so it persists
        const newCourse = { id: courseId, name: cName.trim(), materials: mats, createdAt: new Date().toISOString() };
        const updated = [...courses.filter(c => c.id !== courseId), newCourse];
        await DB.saveCourses(updated);
        setCourses(updated); setActive(newCourse); setFiles([]); setCName("");

        // Populate chunk picker -- all chunks selected by default
        var allChunkIds = new Set();
        for (const m of mats) { if (m.chunks) for (const c of m.chunks) allChunkIds.add(c.id); }
        setChunkPicker({ courseId, materials: mats, selectedChunks: allChunkIds });
        setBooting(false); setStatus("");
        var pickerMsg = "Select which sections to analyze. Uncheck any chapters that aren't relevant to your course.";
        if (refTaxonomy) pickerMsg = "Identified as " + (refTaxonomy.subject || "unknown subject") + " (" + (refTaxonomy.level || "unknown level") + "). " + pickerMsg;
        setMsgs(p => [...p, { role: "assistant", content: pickerMsg }]);
        return;
      }

      // No multi-chunk files -- run extraction directly
      try {
        skills = await extractSkillTree(courseId, mats, setStatus);
        if (!Array.isArray(skills)) {
          console.error("Skill extraction returned non-array:", typeof skills, String(skills).substring(0, 300));
          addNotif("error", "Skill extraction didn't return structured data. Try re-triggering extraction.");
        }
      } catch (e) {
        console.error("Skill extraction failed:", e);
        addNotif("error", "Skill extraction failed: " + e.message);
      }

      // Validation pass
      if (Array.isArray(skills) && skills.length > 0) {
        try {
          var validation = await validateSkillTree(courseId, skills, setStatus);
          skills = validation.skills;
          var vr = validation.report;
          if (vr && vr.status !== "parse_failed" && vr.status !== "error") {
            var fixCount = (vr.prerequisiteFixes?.length || 0) + (vr.descriptionFixes?.length || 0) + (vr.mergedDuplicates?.length || 0);
            if (fixCount > 0) addNotif("success", "Validation applied " + fixCount + " correction" + (fixCount !== 1 ? "s" : "") + " to the skill tree.");
          }
        } catch (e) {
          console.error("Validation failed:", e);
        }
      }

      const hasAsgn = mats.some(m => m.classification === "assignment");
      let asgn = [];
      if (hasAsgn) {
        setStatus("Breaking down assignments...");
        try { asgn = await decomposeAssignments(courseId, mats, skills, setStatus); } catch (e) { console.error("Assignment decomp failed:", e); }
      }

      // Refresh materials from DB (chunk statuses updated by extractSkillTree)
      var refreshedCourses = await DB.getCourses();
      var refreshedMats = refreshedCourses.find(c => c.id === courseId)?.materials || mats;

      const newCourse = { id: courseId, name: cName.trim(), materials: refreshedMats, createdAt: new Date().toISOString() };
      const updated = [...courses.filter(c => c.id !== courseId), newCourse];
      setCourses(updated); setActive(newCourse); setFiles([]); setCName("");
      setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null);

      // Store verification context for later boot
      let verifyCtx = "\nDOCUMENT VERIFICATION RESULTS:\n";
      for (const v of allVerifications) {
        const tag = v.status === "verified" ? "[OK]" : v.status === "partial" ? "[!]" : "[X]";
        verifyCtx += tag + " " + v.name + ": " + (v.summary || "No summary") + "\n";
        if (v.issues?.length) verifyCtx += "  Issues: " + v.issues.join("; ") + "\n";
      }
      if (allQuestions.length) {
        verifyCtx += "\nCLARIFYING QUESTIONS (ask the student these):\n";
        for (const q of allQuestions) verifyCtx += "  - [" + q.doc + "] " + q.question + "\n";
      }

      // Show summary of what was processed, then let them pick a mode
      const matCount = mats.length;
      const skillCount = Array.isArray(skills) ? skills.length : 0;
      const asgnCount = Array.isArray(asgn) ? asgn.length : 0;
      const issueCount = allVerifications.filter(v => v.status !== "verified").length;
      let summary = "Course ready. " + matCount + " document" + (matCount !== 1 ? "s" : "") + " processed";
      if (skillCount > 0) summary += ", " + skillCount + " skills identified";
      if (asgnCount > 0) summary += ", " + asgnCount + " assignment" + (asgnCount !== 1 ? "s" : "") + " found";
      if (issueCount > 0) summary += ". " + issueCount + " document" + (issueCount !== 1 ? "s" : "") + " had extraction issues";
      summary += ".";
      addNotif("success", summary);
    } catch (err) {
      console.error("Course creation failed:", err);
      addNotif("error", "Course setup failed: " + err.message + ". Your files were saved â€” try re-entering the course.");
    }
    setBooting(false); setStatus("");
  };

  // --- Run extraction after chunk selection ---
  const runExtraction = async (selectedChunkIds) => {
    if (!chunkPicker || !active) { console.error("runExtraction: missing chunkPicker or active", { chunkPicker: !!chunkPicker, active: !!active }); return; }
    setBusy(true); setBooting(true); setChunkPicker(null);

    // Mark unselected chunks as "skipped" in material metadata
    var updatedMats = active.materials.map(mat => {
      if (!mat.chunks) return mat;
      return { ...mat, chunks: mat.chunks.map(ch =>
        selectedChunkIds.has(ch.id) ? { ...ch, status: "pending" } : { ...ch, status: "skipped" }
      )};
    });

    // Save updated metadata
    var updatedCourse = { ...active, materials: updatedMats };
    var allCourses = await DB.getCourses();
    allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
    await DB.saveCourses(allCourses);
    setCourses(allCourses); setActive(updatedCourse);

    // Count what we're processing
    var totalSelected = updatedMats.flatMap(m => (m.chunks || []).filter(c => c.status === "pending")).length;
    var totalSkipped = updatedMats.flatMap(m => (m.chunks || []).filter(c => c.status === "skipped")).length;
    setStatus("Extracting skills from " + totalSelected + " chunks...");
    addNotif("info", "Analyzing " + totalSelected + " section" + (totalSelected !== 1 ? "s" : "") + (totalSkipped > 0 ? " (" + totalSkipped + " skipped)" : "") + "...");

    let skills = [];
    try {
      skills = await extractSkillTree(active.id, updatedMats, setStatus);
      if (!Array.isArray(skills)) {
        addNotif("error", "Skill extraction didn't return structured data.");
      }
    } catch (e) {
      console.error("Skill extraction failed:", e);
      addNotif("error", "Skill extraction failed: " + e.message);
    }

    // Validation pass
    if (Array.isArray(skills) && skills.length > 0) {
      try {
        var validation = await validateSkillTree(active.id, skills, setStatus);
        skills = validation.skills;
        var vr = validation.report;
        if (vr && vr.status !== "parse_failed" && vr.status !== "error") {
          var fixCount = (vr.prerequisiteFixes?.length || 0) + (vr.descriptionFixes?.length || 0) + (vr.mergedDuplicates?.length || 0);
          if (fixCount > 0) addNotif("success", "Validation applied " + fixCount + " correction" + (fixCount !== 1 ? "s" : "") + " to the skill tree.");
        }
      } catch (e) {
        console.error("Validation failed:", e);
      }
    }

    // Decompose assignments
    var hasAsgn = updatedMats.some(m => m.classification === "assignment");
    let asgn = [];
    if (hasAsgn && Array.isArray(skills) && skills.length > 0) {
      setStatus("Breaking down assignments...");
      try { asgn = await decomposeAssignments(active.id, updatedMats, skills, setStatus); } catch (e) { console.error("Assignment decomp failed:", e); }
    }

    // Refresh from DB
    var refreshed = await DB.getCourses();
    var refreshedCourse = refreshed.find(c => c.id === active.id);
    if (refreshedCourse) { setCourses(refreshed); setActive(refreshedCourse); }

    var skillCount = Array.isArray(skills) ? skills.length : 0;
    var failedCount = (refreshedCourse?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "failed")).length;
    var summary = skillCount > 0 ? "Found " + skillCount + " skills." : "No skills extracted.";
    if (failedCount > 0) summary += " " + failedCount + " chunk(s) failed -- you can retry from the mode picker.";
    addNotif("info", summary);

    setBooting(false); setBusy(false); setStatus("");
    setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null);
  };
  const enterStudy = async (course) => {
    setActive(course); setScreen("study");
    setMsgs([]); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null);
    sessionSkillLog.current = [];
    cachedSessionCtx.current = null;
    sessionStartIdx.current = 0;
    // Save previous session to journal before clearing
    try {
      const savedMsgs = await DB.getChat(course.id);
      if (savedMsgs.length > 1) {
        const entry = generateSessionEntry(savedMsgs, 0, []);
        if (entry) {
          const journal = await DB.getJournal(course.id);
          journal.push(entry);
          await DB.saveJournal(course.id, journal.slice(-50));
        }
      }
    } catch (e) { console.error("Journal capture on enter:", e); }
    await DB.saveChat(course.id, []);
  };

  // --- Mode Selection (step 1: load picker data) ---
  const selectMode = async (mode) => {
    setSessionMode(mode);
    if (mode === "recap") {
      // Recap boots directly -- no picker needed
      bootWithFocus({ type: "recap" });
      return;
    }
    // Load structured data for picker
    try {
      const skills = await DB.getSkills(active.id);
      const profile = await DB.getProfile(active.id);
      if (mode === "assignment") {
        const asgn = await DB.getAsgn(active.id);
        if (!Array.isArray(asgn) || asgn.length === 0) {
          setPickerData({ mode, empty: true, message: "No assignments found. Upload assignment files and recreate the course, or switch to skill work." });
          return;
        }
        // Enrich assignments with readiness info
        const enriched = asgn.map(a => {
          const reqSkills = new Set();
          if (a.questions) a.questions.forEach(q => q.requiredSkills?.forEach(s => reqSkills.add(s)));
          const skillList = [...reqSkills].map(sid => {
            const sk = Array.isArray(skills) ? skills.find(s => s.id === sid) : null;
            return { id: sid, name: sk?.name || sid, points: profile.skills[sid]?.points || 0, strength: effectiveStrength(profile.skills[sid]) };
          });
          const weakSkills = skillList.filter(sk => sk.strength < 0.4);
          const avgStrength = skillList.length > 0 ? skillList.reduce((s, sk) => s + sk.strength, 0) / skillList.length : 0;
          return { ...a, skillList, avgStrength, weakSkills, questionCount: a.questions?.length || 0 };
        });
        setPickerData({ mode, items: enriched, _skills: skills });
      } else if (mode === "skills") {
        if (!Array.isArray(skills) || skills.length === 0) {
          setPickerData({ mode, empty: true, message: "No skills extracted yet. Upload course materials first." });
          return;
        }
        const enriched = skills.map(s => {
          const sd = profile.skills[s.id];
          return {
            ...s,
            points: sd?.points || 0,
            strength: effectiveStrength(sd),
            ease: sd?.ease || DEFAULT_EASE,
            lastPracticed: sd?.lastPracticed || null,
            reviewDate: nextReviewDate(sd, 0.4),
            sessions: sd?.entries?.length || 0,
            lastRating: sd?.entries?.slice(-1)[0]?.rating || null
          };
        }).sort((a, b) => a.strength - b.strength);
        setPickerData({ mode, items: enriched });
      }
    } catch (e) {
      console.error("Picker load failed:", e);
      setPickerData({ mode, empty: true, message: "Failed to load data: " + e.message });
    }
  };

  // --- Boot with focused context (step 2: after picker selection) ---
  const bootWithFocus = async (focus) => {
    if (!active) return;
    setFocusContext(focus); setPickerData(null); setBooting(true); setStatus("Loading...");
    try {
      const skills = await DB.getSkills(active.id);
      const profile = await DB.getProfile(active.id);
      const journal = await DB.getJournal(active.id);
      const ctx = await buildFocusedContext(active.id, active.materials, focus, skills, profile);

      // Cache context for reuse in sendMessage
      cachedSessionCtx.current = { ctx, skills, profile, journal, focus };

      var userMsg, modeHint;
      if (focus.type === "recap") {
        userMsg = "Catch me up on where I left off.";
        modeHint = "\n\nMODE: RECAP. Summarize progress from session history. Suggest what to do next.";
      } else if (focus.type === "assignment") {
        // Initialize workspace with all questions locked
        var qs = (focus.assignment.questions || []).map(q => ({
          id: q.id, description: q.description, difficulty: q.difficulty,
          requiredSkills: q.requiredSkills || [],
          unlocked: false, answer: "", done: false
        }));
        setAsgnWork({ questions: qs, currentIdx: 0 });

        userMsg = "I want to work on: " + focus.assignment.title;
        modeHint = "\n\nMODE: ASSIGNMENT WORK.\n\nIMPORTANT FLOW: Questions are hidden from the student. You control when they see each question.\n\n1. Look at the FIRST question's required skills. Check the student's strength on those skills.\n2. If ANY required skill is below 50% strength, teach that skill first using the ASK FIRST method. Diagnose, fill gaps, verify.\n3. Once the student has demonstrated competence on ALL skills needed for the question, reveal it by including:\n[UNLOCK_QUESTION]" + (qs[0]?.id || "q1") + "[/UNLOCK_QUESTION]\n4. After revealing, guide them but do NOT write their answer. Ask them to explain their approach. Nudge if stuck.\n5. When the student says they've completed a question or moves on, proceed to the next question's required skills.\n\nStart by diagnosing the first question's prerequisites. Do NOT show or describe the question yet. Just begin with a skill-check question.\n\nThe question order is: " + qs.map(q => q.id).join(", ") + "\nUse the exact question ID in the unlock tag.";
      } else if (focus.type === "skill") {
        userMsg = "I want to work on: " + focus.skill.name;
        modeHint = "\n\nMODE: SKILL MASTERY. The student chose this specific skill to strengthen. You have the skill details and source material loaded. Start by asking a diagnostic question to find where their understanding breaks down.";
      }

      const bootSystem = "You are Study -- a master teacher.\n\nCOURSE: " + active.name + "\n\n" + ctx + "\n\nSESSION HISTORY:\n" + formatJournal(journal) + modeHint + "\n\nRespond concisely. Your first response should be a focused question, not a lecture. 1-4 sentences max.";
      setMsgs([{ role: "user", content: userMsg }, { role: "assistant", content: "" }]);
      const response = await callClaudeStream(bootSystem, [{ role: "user", content: userMsg }], function(partial) {
        setMsgs([{ role: "user", content: userMsg }, { role: "assistant", content: partial }]);
      });
      setMsgs([{ role: "user", content: userMsg }, { role: "assistant", content: response }]);
      sessionStartIdx.current = 0;
      await DB.saveChat(active.id, [{ role: "user", content: userMsg }, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("Boot failed:", err);
      addNotif("error", "Failed to start session: " + err.message);
    }
    setBooting(false); setStatus("");
  };

  // --- Send Message ---
  const sendMessage = async () => {
    if (!input.trim() || busy || !active) return;
    const userMsg = input.trim(); setInput("");
    const newMsgs = [...msgs, { role: "user", content: userMsg }];
    setMsgs([...newMsgs, { role: "assistant", content: "" }]); setBusy(true);

    // Use cached context if available, otherwise rebuild
    let ctx, skills, profile, journal;
    if (cachedSessionCtx.current && focusContext) {
      ctx = cachedSessionCtx.current.ctx;
      skills = cachedSessionCtx.current.skills;
      profile = cachedSessionCtx.current.profile;
      journal = cachedSessionCtx.current.journal;
    } else {
      skills = await DB.getSkills(active.id) || "";
      profile = await DB.getProfile(active.id);
      journal = await DB.getJournal(active.id);
      if (focusContext && (focusContext.type === "assignment" || focusContext.type === "skill")) {
        ctx = await buildFocusedContext(active.id, active.materials, focusContext, skills, profile);
      } else {
        const asgn = await DB.getAsgn(active.id) || [];
        ctx = await buildContext(active.id, active.materials, skills, asgn, profile, newMsgs);
      }
    }

    const sysPrompt = buildSystemPrompt(active.name, ctx, journal);
    const chatMsgs = newMsgs.slice(-40).map(m => ({ role: m.role, content: m.content }));

    const response = await callClaudeStream(sysPrompt, chatMsgs, function(partial) {
      setMsgs([...newMsgs, { role: "assistant", content: partial }]);
    });

    const updates = parseSkillUpdates(response);
    if (updates.length) {
      await applySkillUpdates(active.id, updates);
      sessionSkillLog.current.push(...updates);
      for (var u of updates) addNotif("skill", u.skill + ": " + (u.delta > 0 ? "+" : "") + u.delta + " pts (" + u.rating + ")");
      // Refresh cached context after skill updates (profile changed)
      if (cachedSessionCtx.current) {
        var updatedProfile = await DB.getProfile(active.id);
        var updatedCtx = await buildFocusedContext(active.id, active.materials, focusContext, skills, updatedProfile);
        cachedSessionCtx.current = { ...cachedSessionCtx.current, profile: updatedProfile, ctx: updatedCtx };
      }
    }

    // Handle question unlocks
    const unlockId = parseQuestionUnlock(response);
    if (unlockId && asgnWork) {
      setAsgnWork(prev => {
        if (!prev) return prev;
        var updated = { ...prev, questions: prev.questions.map(q =>
          q.id === unlockId ? { ...q, unlocked: true } : q
        )};
        // Set currentIdx to the newly unlocked question
        var idx = updated.questions.findIndex(q => q.id === unlockId);
        if (idx >= 0) updated.currentIdx = idx;
        return updated;
      });
    }

    const finalMsgs = [...newMsgs, { role: "assistant", content: response }];
    setMsgs(finalMsgs); setBusy(false);
    await DB.saveChat(active.id, finalMsgs.slice(-100));
  };

  // --- Delete Course ---
  const delCourse = async (id) => {
    const course = courses.find(c => c.id === id);
    setCourses(p => p.filter(c => c.id !== id));
    await DB.deleteCourse(id, course?.materials || []);
    if (active?.id === id) { setActive(null); setScreen("home"); }
  };

  // --- Add Materials ---
  const addMats = async () => {
    if (!active || !files.length || files.some(f => !f.classification)) return;
    const validFiles = files.filter(f => f.parseOk !== false);
    if (validFiles.length === 0) return;
    setBusy(true); setShowAdd(false);
    const newMeta = [];
    for (let i = 0; i < validFiles.length; i++) {
      const f = validFiles[i];
      const mat = await storeAsChunks(active.id, f, "doc-add-" + i + "-" + Date.now());
      newMeta.push(mat);
    }
    const updatedCourse = { ...active, materials: [...active.materials, ...newMeta] };
    setCourses(p => p.map(c => c.id === active.id ? updatedCourse : c)); setActive(updatedCourse); setFiles([]);

    // Incremental merge: only analyze new materials against existing tree
    addNotif("info", "Analyzing new materials against existing skills...");
    const existingSkills = await DB.getSkills(active.id);
    const merged = await mergeSkillTree(active.id, existingSkills, newMeta, (s) => addNotif("info", s));

    // Re-decompose assignments if new ones were added
    if (newMeta.some(m => m.classification === "assignment")) {
      addNotif("info", "Breaking down new assignments...");
      await decomposeAssignments(active.id, updatedCourse.materials, merged, () => {});
    }

    // Report what changed
    const newSkillCount = Array.isArray(merged) && Array.isArray(existingSkills) ? merged.length - existingSkills.length : 0;
    let report = "Added " + newMeta.length + " file" + (newMeta.length !== 1 ? "s" : "") + ": " + newMeta.map(m => m.name).join(", ") + ".";
    if (newSkillCount > 0) report += " " + newSkillCount + " new skill" + (newSkillCount !== 1 ? "s" : "") + " identified.";
    else report += " New content mapped to existing skills.";
    addNotif("info", report);
    setBusy(false);
    await DB.saveChat(updatedCourse.id, msgs.slice(-100));
  };

  // --- Remove Material ---
  const removeMat = async (docId) => {
    if (!active || busy) return;
    setBusy(true);
    try {
      const removedMat = active.materials.find(m => m.id === docId);
      // Delete all chunk data
      if (removedMat?.chunks) {
        for (const ch of removedMat.chunks) {
          await DB.del("study-doc:" + active.id + ":" + ch.id);
          await DB.del("study-cskills:" + active.id + ":" + ch.id);
        }
      }
      // Legacy fallback
      await DB.del("study-doc:" + active.id + ":" + docId);
      const updatedMats = active.materials.filter(m => m.id !== docId);
      const updatedCourse = { ...active, materials: updatedMats };
      setCourses(p => p.map(c => c.id === active.id ? updatedCourse : c));
      setActive(updatedCourse);
      if (updatedMats.length > 0) {
        // Prune skills whose ONLY source was the removed document
        const existingSkills = await DB.getSkills(active.id);
        if (Array.isArray(existingSkills) && removedMat) {
          const removedName = removedMat.name.toLowerCase();
          const pruned = existingSkills.filter(s => {
            if (!s.sources || s.sources.length === 0) return true;
            const remaining = s.sources.filter(src => src.toLowerCase() !== removedName);
            if (remaining.length > 0) {
              s.sources = remaining;
              return true;
            }
            return false; // All sources were the removed doc
          });
          const removedCount = existingSkills.length - pruned.length;
          await DB.saveSkills(active.id, pruned);
          addNotif("info", "Removed \"" + removedMat.name + "\"." + (removedCount > 0 ? " " + removedCount + " skill" + (removedCount !== 1 ? "s" : "") + " pruned." : " Skills updated."));
        } else {
          addNotif("info", "Material removed.");
        }
        // Re-decompose assignments if any remain
        if (updatedMats.some(m => m.classification === "assignment")) {
          const sk = await DB.getSkills(updatedCourse.id);
          await decomposeAssignments(updatedCourse.id, updatedMats, sk, () => {});
        }
      } else {
        addNotif("warn", "All materials removed. Upload new files to continue.");
      }
    } catch (err) {
      addNotif("error", "Remove failed: " + err.message);
    }
    setBusy(false);
  };

  // --- Reprocess Material ---
  const reprocessMat = async (mat) => {
    if (!active || busy) return;
    setBusy(true);
    addNotif("info", "Reprocessing \"" + mat.name + "\"...");
    try {
      const v = await verifyDocument(active.id, mat);
      const updatedMats = active.materials.map(m => m.id === mat.id ? { ...m, verification: v.status } : m);
      const updatedCourse = { ...active, materials: updatedMats };
      setCourses(p => p.map(c => c.id === active.id ? updatedCourse : c));
      setActive(updatedCourse);

      // Incremental merge for this single document
      addNotif("info", "Checking for new skills...");
      const existingSkills = await DB.getSkills(updatedCourse.id);
      await mergeSkillTree(updatedCourse.id, existingSkills, [mat], () => {});

      if (updatedMats.some(m => m.classification === "assignment")) {
        const sk = await DB.getSkills(updatedCourse.id);
        await decomposeAssignments(updatedCourse.id, updatedMats, sk, () => {});
      }
      const tag = v.status === "verified" ? "[OK]" : v.status === "partial" ? "[!]" : "[X]";
      let report = tag + " Reprocessed \"" + mat.name + "\": " + v.summary;
      if (v.issues?.length) report += "\n\n**Issues found:** " + v.issues.join("; ");
      if (v.questions?.length) report += "\n\n**Questions about this document:**\n" + v.questions.map(q => "- " + q).join("\n");
      addNotif("info", report);
    } catch (err) {
      addNotif("error", "Reprocess failed: " + err.message);
    }
    setBusy(false);
  };

  // --- Async Error Reporter ---
  const catchAsync = (fn) => async (...args) => {
    try { return await fn(...args); } catch (e) {
      console.error("Async error:", e);
      setAsyncError({ message: e.message || String(e), stack: e.stack || "no stack" });
    }
  };

  // --- Async Error Display ---
  if (asyncError) {
    const report = [
      "STUDY ASYNC ERROR",
      "==================",
      "Error: " + asyncError.message,
      "",
      "Stack:",
      (asyncError.stack || "").split("\n").slice(0, 10).join("\n"),
    ].join("\n");
    return (
      <div style={{ background: T.bg, minHeight: "100vh", padding: 32, fontFamily: "monospace" }}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 20, color: T.rd, marginBottom: 16, fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>Copy the text below and paste it to Claude to debug:</div>
          <textarea readOnly value={report} onClick={e => e.target.select()}
            style={{ width: "100%", minHeight: 250, background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, padding: 16, fontSize: 12, fontFamily: "SF Mono, Fira Code, monospace", resize: "vertical", lineHeight: 1.6 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => navigator.clipboard.writeText(report)}
              style={{ padding: "10px 20px", background: T.ac, color: "#0F1115", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Copy to clipboard</button>
            <button onClick={() => setAsyncError(null)}
              style={{ padding: "10px 20px", background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Dismiss</button>
            <button onClick={() => { setAsyncError(null); setScreen("home"); }}
              style={{ padding: "10px 20px", background: T.sf, color: T.tx, border: "1px solid " + T.bd, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Go home</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (!ready) return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style><div style={{ color: T.txD }}>Loading...</div>
    </div>
  );

  // --- HOME SCREEN ---
  if (screen === "home") return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease", maxWidth: 500 }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 42, fontWeight: 700, color: T.tx, letterSpacing: "-0.03em", marginBottom: 8 }}>Study</div>
          <div style={{ fontSize: 15, color: T.txD, lineHeight: 1.6 }}>Your AI teacher. Upload your course materials,<br/>and master the material together.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setScreen("upload")}
            style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 16, padding: "28px 32px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Upload Course Data</div>
            <div style={{ fontSize: 13, color: T.txD }}>Syllabus, textbooks, transcripts, assignments, notes</div>
          </button>
          <button onClick={() => courses.length ? setScreen("courses") : setScreen("upload")}
            style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 16, padding: "28px 32px", cursor: "pointer", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(108,156,252,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = T.acS}>
            <div style={{ fontSize: 17, fontWeight: 600, color: T.ac, marginBottom: 4 }}>Study</div>
            <div style={{ fontSize: 13, color: T.txD }}>{courses.length ? courses.length + " course" + (courses.length > 1 ? "s" : "") : "Upload materials first"}</div>
          </button>
        </div>
      </div>
    </div>
  );

  // --- UPLOAD SCREEN ---
  if (screen === "upload") {
    const pending = files.filter(f => !f.classification);
    const confirmed = files.filter(f => f.classification);
    const failed = files.filter(f => f.parseOk === false);
    const cur = pending[0] || null;
    const allDone = files.length > 0 && pending.length === 0;
    const hasFailures = failed.length > 0;
    const goodFiles = confirmed.filter(f => f.parseOk !== false);
    const rdy = allDone && cName.trim() && goodFiles.length > 0;

    const previewContent = (f) => {
      if (f.parseOk === false) return f.content || "[Parse failed]";
      if (f.chapters) return f.chapters.length + " chapters, " + (f.totalChars || 0).toLocaleString() + " chars";
      if (f.content) {
        var preview = f.content.substring(0, 150).replace(/\n/g, " ").trim();
        if (f.content.length > 150) preview += "...";
        return preview;
      }
      if (f.type === "image") return "[Image file]";
      return "[No content]";
    };

    return (
      <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, marginBottom: 24 }}>&lt; Back</button>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Upload Course Data</h1>
          <p style={{ fontSize: 14, color: T.txD, marginBottom: 32, lineHeight: 1.6 }}>Drop your files in. Study will auto-detect file types when possible.</p>

          <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
            style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 16, padding: cur ? "24px 20px" : "48px 32px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent", marginBottom: 24, transition: "all 0.2s" }}>
            <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,.pptx,.ppt,image/*" onChange={onSelect} style={{ display: "none" }} />
            <div style={{ fontSize: cur ? 13 : 15, color: T.tx, fontWeight: 500, marginBottom: 4 }}>
              {parsing ? "Parsing files..." : drag ? "Drop here" : files.length > 0 ? "Add more files" : "Drag & drop or click to browse"}
            </div>
            {files.length === 0 && (
              <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6 }}>
                <span style={{ color: T.gn }}>Best:</span> .txt .md .csv .srt .vtt
                <span style={{ margin: "0 6px", color: T.bd }}>|</span>
                <span style={{ color: "#F59E0B" }}>Good:</span> .docx .xlsx .epub .pptx
                <span style={{ margin: "0 6px", color: T.bd }}>|</span>
                <span style={{ color: T.txM }}>No support:</span> .pdf
              </div>
            )}
          </div>

          {files.length === 0 && (
            <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, padding: "16px 20px", marginBottom: 24, fontSize: 12, lineHeight: 1.8, color: T.txD }}>
              <div style={{ fontWeight: 600, color: T.tx, marginBottom: 8, fontSize: 13 }}>Format guide</div>
              <div><span style={{ color: T.gn, fontWeight: 600 }}>Plain text (.txt, .md, .csv)</span> -- always works perfectly. When in doubt, export to .txt.</div>
              <div><span style={{ color: T.gn, fontWeight: 600 }}>Subtitles (.srt, .vtt)</span> -- timestamps stripped, clean transcript extracted.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Word docs (.docx)</span> -- works for most files. Complex formatting may be lost. If content looks wrong, save as .txt from Word.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Spreadsheets (.xlsx, .csv)</span> -- tables extracted as tab-separated text. For best results, export as .csv from Excel.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>E-books (.epub)</span> -- chapters extracted individually. Non-standard EPUBs may fail.</div>
              <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Slides (.pptx)</span> -- text extracted from all slides. Old .ppt format requires resaving as .pptx first.</div>
              <div><span style={{ color: T.txM, fontWeight: 600 }}>PDFs (.pdf)</span> -- not yet supported. Open in Preview/Acrobat, select all text, paste into a .txt file.</div>
              <div><span style={{ color: T.gn, fontWeight: 600 }}>Images</span> -- screenshots of assignments or notes. AI reads them directly.</div>
              <div style={{ marginTop: 8, color: T.txM, fontStyle: "italic" }}>Tip: if a file fails to parse, the fastest fix is always exporting to .txt or .csv from the source application.</div>
            </div>
          )}

          {cur && (
            <div style={{ background: T.sf, border: "1px solid " + T.acB, borderRadius: 14, padding: 20, marginBottom: 16, animation: "fadeIn 0.3s" }}>
              <div style={{ fontSize: 12, color: T.ac, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
                Classify file {confirmed.length + 1} of {files.length}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.tx, marginBottom: 4 }}>{cur.name}</div>
              <div style={{ fontSize: 12, color: cur.parseOk === false ? T.rd : T.txD, marginBottom: 12, marginTop: 4, fontStyle: cur.parseOk === false ? "italic" : "normal" }}>
                {previewContent(cur)}
              </div>
              {cur.parseOk === false && (
                <div style={{ fontSize: 12, color: T.rd, marginBottom: 12, padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>
                  Parse failed. Try re-exporting as .txt or .csv.
                </div>
              )}
              <div style={{ fontSize: 13, color: T.txD, marginBottom: 14 }}>What type of material is this?</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CLS.map(c => (
                  <button key={c.v} onClick={() => classify(cur.id, c.v)}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: T.tx, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.ac; e.currentTarget.style.background = T.acS; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.background = T.sf; }}>
                    {c.l}
                  </button>
                ))}
              </div>
              <button onClick={() => removeF(cur.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 12, marginTop: 12, padding: 0 }}>Skip this file</button>
            </div>
          )}

          {confirmed.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>Files ({confirmed.length})</div>
              {confirmed.map(f => {
                const cls = CLS.find(c => c.v === f.classification);
                const ok = f.parseOk !== false;
                return (
                  <div key={f.id} style={{ background: T.sf, borderRadius: 10, marginBottom: 6, padding: "10px 14px", border: "1px solid " + (ok ? T.bd : "rgba(248,113,113,0.3)") }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? T.gn : T.rd, flexShrink: 0 }} />
                        <span style={{ color: T.tx, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ color: T.ac, fontSize: 11 }}>{cls?.l}</span>
                        <button onClick={() => setFiles(p => p.map(pf => pf.id === f.id ? { ...pf, classification: "" } : pf))} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 11 }}>change</button>
                        <button onClick={() => removeF(f.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer", fontSize: 14 }}>x</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: ok ? T.txD : T.rd, paddingLeft: 16, lineHeight: 1.4 }}>{previewContent(f)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {hasFailures && allDone && (
            <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: T.rd }}>
              {failed.length} file{failed.length !== 1 ? "s" : ""} failed to parse. These will be skipped. Remove them or re-export as .txt/.csv.
            </div>
          )}

          {allDone && (
            <div style={{ animation: "fadeIn 0.3s" }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Course Name</label>
                <input type="text" value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. Organic Chemistry 201"
                  style={{ width: "100%", background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "12px 16px", color: T.tx, fontSize: 15 }} />
              </div>
              <button onClick={createCourse} disabled={!rdy}
                style={{ width: "100%", padding: "16px 24px", borderRadius: 12, border: "none", background: rdy ? T.ac : T.sf, color: rdy ? "#0F1115" : T.txM, fontSize: 15, fontWeight: 600, cursor: rdy ? "pointer" : "default" }}>
                {!cName.trim() ? "Name your course to continue" : "Create Course & Extract Skills"}
              </button>
            </div>
          )}

          {files.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: T.txM, fontSize: 13 }}>
              Drop your syllabus, textbook, transcripts, assignments, or notes above.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- COURSES SCREEN ---
  if (screen === "courses") return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: 32 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, marginBottom: 24 }}>&lt; Back</button>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Your Courses</h1>
        <p style={{ fontSize: 14, color: T.txD, marginBottom: 32 }}>Pick a course to study.</p>
        {courses.map(c => {
          const types = [...new Set(c.materials.map(m => m.classification))].map(v => CLS.find(cl => cl.v === v)?.l || v).join(", ");
          return (
            <div key={c.id} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: 20, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: T.tx, marginBottom: 6 }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: T.txD }}>{c.materials.length} materials | {types}</div>
                </div>
                <button onClick={e => { e.stopPropagation();
                    if (pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id) { setPendingConfirm(null); delCourse(c.id); }
                    else setPendingConfirm({ type: "delCourse", id: c.id });
                  }} style={{ background: "none", border: "none", color: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? T.rd : T.txM, cursor: "pointer", fontSize: pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? 11 : 13 }}>
                  {pendingConfirm?.type === "delCourse" && pendingConfirm?.id === c.id ? "Confirm delete?" : "Delete"}
                </button>
              </div>
              <button onClick={() => enterStudy(c)}
                style={{ marginTop: 14, width: "100%", padding: "12px 20px", borderRadius: 10, border: "1px solid " + T.acB, background: T.acS, color: T.ac, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Start Studying
              </button>
            </div>
          );
        })}
        <button onClick={() => setScreen("upload")} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "1px dashed " + T.bd, background: "transparent", color: T.txD, fontSize: 14, cursor: "pointer", marginTop: 8 }}>+ Add New Course</button>
      </div>
    </div>
  );

  // --- STUDY / CHAT SCREEN ---


  if (screen === "study" && active) {
    return (
      <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
        <style>{CSS}</style>
        <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={async () => { await saveSessionToJournal(); setScreen("courses"); setMsgs([]); setSessionMode(null); setFocusContext(null); setPickerData(null); setChunkPicker(null); setAsgnWork(null); setPracticeMode(null); setShowSkills(false); setSkillViewData(null); sessionStartIdx.current = 0; sessionSkillLog.current = []; cachedSessionCtx.current = null; }}
              style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14 }}>&lt;</button>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{active.name}</div>
              <div style={{ fontSize: 11, color: T.txD }}>{active.materials.length} materials indexed</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setShowAdd(!showAdd); if (!showAdd) { setShowManage(false); setShowSkills(false); } }}
              style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: T.txD, cursor: "pointer" }}>+ Add</button>
            <button onClick={() => { setShowManage(!showManage); if (!showManage) { setShowAdd(false); setShowSkills(false); } }}
              style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: T.txD, cursor: "pointer" }}>Materials</button>
            <button onClick={async () => {
              if (!showSkills && active) {
                var sk = await DB.getSkills(active.id) || [];
                var rp = await DB.getValidation(active.id);
                var rt = await DB.getRefTaxonomy(active.id);
                setSkillViewData({ skills: sk, report: rp, refTax: rt });
              }
              setShowSkills(!showSkills); if (!showSkills) { setShowAdd(false); setShowManage(false); }
            }}
              style={{ background: showSkills ? T.acS : T.sf, border: "1px solid " + (showSkills ? T.acB : T.bd), borderRadius: 8, padding: "6px 12px", fontSize: 12, color: showSkills ? T.ac : T.txD, cursor: "pointer" }}>Skills</button>
            <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) setLastSeenNotif(Date.now()); }}
              style={{ background: showNotifs ? T.acS : T.sf, border: "1px solid " + (showNotifs ? T.acB : T.bd), borderRadius: 8, padding: "6px 12px", fontSize: 12, color: showNotifs ? T.ac : T.txD, cursor: "pointer", position: "relative" }}>
              {"ðŸ””"}
              {notifs.filter(n => n.time.getTime() > lastSeenNotif).length > 0 && (
                <span style={{ position: "absolute", top: -4, right: -4, background: T.rd || "#EF4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>
                  {notifs.filter(n => n.time.getTime() > lastSeenNotif).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Add Materials Panel */}
        {showAdd && (
          <div style={{ borderBottom: "1px solid " + T.bd, padding: 20, background: T.sf, flexShrink: 0 }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
                style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent", marginBottom: files.length ? 16 : 0 }}>
                <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,.pptx,.ppt,image/*" onChange={onSelect} style={{ display: "none" }} />
                <div style={{ fontSize: 13, color: T.txD }}>Drop files or click to browse</div>
              </div>
              {files.map(f => (
                <div key={f.id} style={{ background: T.bg, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: T.tx }}>{f.name}</span>
                    <button onClick={() => removeF(f.id)} style={{ background: "none", border: "none", color: T.txM, cursor: "pointer" }}>x</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {CLS.map(c => <button key={c.v} onClick={() => classify(f.id, c.v)}
                      style={{ background: f.classification === c.v ? T.acS : "transparent", border: "1px solid " + (f.classification === c.v ? T.ac : T.bd), borderRadius: 6, padding: "4px 8px", fontSize: 11, color: f.classification === c.v ? T.ac : T.txD, cursor: "pointer" }}>{c.l}</button>)}
                  </div>
                </div>
              ))}
              {files.length > 0 && files.every(f => f.classification) && (
                <button onClick={addMats} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>Add & Re-index Skills</button>
              )}
            </div>
          </div>
        )}

        {/* Materials Management Panel */}
        {showManage && (
          <div style={{ borderBottom: "1px solid " + T.bd, padding: 20, background: T.sf, flexShrink: 0, maxHeight: "50vh", overflowY: "auto" }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>Course Materials ({active.materials.length})</div>
              {active.materials.map(mat => {
                const clsLabel = CLS.find(c => c.v === mat.classification)?.l || mat.classification;
                const chunks = mat.chunks || [];
                const extracted = chunks.filter(c => c.status === "extracted").length;
                const failed = chunks.filter(c => c.status === "failed").length;
                const skipped = chunks.filter(c => c.status === "skipped").length;
                const pending = chunks.filter(c => c.status === "pending").length;
                const hasMultiChunk = chunks.length > 1;

                return (
                  <div key={mat.id} style={{ background: T.bg, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                    {/* Material header */}
                    <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clsLabel}: {mat.name}</div>
                        <div style={{ fontSize: 11, color: T.txD, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {chunks.length > 0 && <span>{chunks.length} section{chunks.length !== 1 ? "s" : ""}</span>}
                          {extracted > 0 && <span style={{ color: T.gn }}>{extracted} extracted</span>}
                          {failed > 0 && <span style={{ color: "#F59E0B" }}>{failed} failed</span>}
                          {skipped > 0 && <span style={{ color: T.txD }}>{skipped} skipped</span>}
                          {pending > 0 && <span style={{ color: T.ac }}>{pending} pending</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {pending > 0 && (
                          <button onClick={() => {
                            if (busy) return;
                            // Open chunk picker for this course
                            var allChunkIds = new Set();
                            for (var m of active.materials) { if (m.chunks) for (var c of m.chunks) { if (c.status !== "extracted") allChunkIds.add(c.id); } }
                            setChunkPicker({ courseId: active.id, materials: active.materials, selectedChunks: allChunkIds });
                            setShowManage(false);
                          }} disabled={busy}
                            style={{ background: "none", border: "1px solid " + T.ac, borderRadius: 6, padding: "4px 8px", fontSize: 11, color: T.ac, cursor: busy ? "default" : "pointer" }}>Extract</button>
                        )}
                        {failed > 0 && (
                          <button onClick={async () => {
                            if (busy) return;
                            setBusy(true);
                            addNotif("info", "Retrying " + failed + " failed chunk(s) from " + mat.name + "...");
                            try {
                              var skills = await extractSkillTree(active.id, active.materials, setStatus, true);
                              var refreshed = await DB.getCourses();
                              var updatedCourse = refreshed.find(c => c.id === active.id);
                              if (updatedCourse) { setCourses(refreshed); setActive(updatedCourse); }
                              addNotif("success", "Retry complete. " + (Array.isArray(skills) ? skills.length + " total skills." : "Check results."));
                            } catch (e) {
                              addNotif("error", "Retry failed: " + e.message);
                            }
                            setBusy(false); setStatus("");
                          }} disabled={busy}
                            style={{ background: "none", border: "1px solid #F59E0B", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#F59E0B", cursor: busy ? "default" : "pointer" }}>Retry failed</button>
                        )}
                        <button onClick={() => {
                            if (busy) return;
                            if (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id) { setPendingConfirm(null); removeMat(mat.id); }
                            else setPendingConfirm({ type: "removeMat", id: mat.id });
                          }} disabled={busy}
                          style={{ background: "none", border: "1px solid " + (pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? T.rd : T.bd), borderRadius: 6, padding: "4px 8px", fontSize: 11, color: T.rd, cursor: busy ? "default" : "pointer" }}>
                          {pendingConfirm?.type === "removeMat" && pendingConfirm?.id === mat.id ? "Confirm?" : "Remove"}
                        </button>
                      </div>
                    </div>
                    {/* Chunk list for multi-chunk materials */}
                    {hasMultiChunk && (
                      <div style={{ borderTop: "1px solid " + T.bd, maxHeight: 200, overflowY: "auto" }}>
                        {chunks.map((ch, ci) => {
                          var statusColor = ch.status === "extracted" ? T.gn : ch.status === "failed" ? "#F59E0B" : ch.status === "skipped" ? T.txD : T.ac;
                          var statusIcon = ch.status === "extracted" ? "\u2713" : ch.status === "failed" ? "\u2717" : ch.status === "skipped" ? "\u2013" : "\u25CB";
                          return (
                            <div key={ci} style={{ padding: "6px 12px 6px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: ci < chunks.length - 1 ? "1px solid " + T.bg : "none", fontSize: 12 }}>
                              <span style={{ color: statusColor, fontWeight: 600, width: 14, textAlign: "center", flexShrink: 0 }}>{statusIcon}</span>
                              <span style={{ color: ch.status === "skipped" ? T.txD : T.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: ch.status === "skipped" ? "italic" : "normal" }}>{ch.label}</span>
                              <span style={{ color: T.txD, flexShrink: 0 }}>{(ch.charCount || 0).toLocaleString()}</span>
                              {ch.status === "skipped" && (
                                <button onClick={async () => {
                                  if (busy) return;
                                  // Re-enable this chunk
                                  var updatedMats = active.materials.map(m => m.id !== mat.id ? m : { ...m, chunks: m.chunks.map(c => c.id === ch.id ? { ...c, status: "pending" } : c) });
                                  var updatedCourse = { ...active, materials: updatedMats };
                                  var allCourses = await DB.getCourses();
                                  allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                                  await DB.saveCourses(allCourses);
                                  setCourses(allCourses); setActive(updatedCourse);
                                }} style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, padding: 0 }}>enable</button>
                              )}
                              {ch.status === "pending" && (
                                <button onClick={async () => {
                                  if (busy) return;
                                  var updatedMats = active.materials.map(m => m.id !== mat.id ? m : { ...m, chunks: m.chunks.map(c => c.id === ch.id ? { ...c, status: "skipped" } : c) });
                                  var updatedCourse = { ...active, materials: updatedMats };
                                  var allCourses = await DB.getCourses();
                                  allCourses = allCourses.map(c => c.id === active.id ? updatedCourse : c);
                                  await DB.saveCourses(allCourses);
                                  setCourses(allCourses); setActive(updatedCourse);
                                }} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 11, padding: 0 }}>skip</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Skills Viewer Panel */}
        {showSkills && skillViewData && (
          <div style={{ borderBottom: "1px solid " + T.bd, padding: 20, background: T.sf, flexShrink: 0, maxHeight: "60vh", overflowY: "auto" }}>
            <div style={{ maxWidth: 650, margin: "0 auto" }}>
              {/* Header with ref taxonomy info */}
              {skillViewData.refTax && (
                <div style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12 }}>
                  <span style={{ color: T.ac, fontWeight: 600 }}>{skillViewData.refTax.subject || "Unknown"}</span>
                  <span style={{ color: T.txD }}> | {skillViewData.refTax.level || "?"} | confidence: {skillViewData.refTax.confidence || "?"}%</span>
                  {skillViewData.refTax.flags && skillViewData.refTax.flags.length > 0 && (
                    <div style={{ color: "#F59E0B", marginTop: 4 }}>{skillViewData.refTax.flags.join(" | ")}</div>
                  )}
                </div>
              )}

              {/* Validation report summary */}
              {skillViewData.report && skillViewData.report.status !== "parse_failed" && skillViewData.report.status !== "error" && (
                <div style={{ marginBottom: 14 }}>
                  {(() => {
                    var r = skillViewData.report;
                    var pf = r.prerequisiteFixes?.length || 0;
                    var df = r.descriptionFixes?.length || 0;
                    var md = r.mergedDuplicates?.length || 0;
                    var cg = r.coverageGaps?.length || 0;
                    var total = pf + df + md;
                    if (total === 0 && cg === 0 && (!r.warnings || r.warnings.length === 0)) return (
                      <div style={{ fontSize: 12, color: T.gn, background: T.gnS, borderRadius: 8, padding: "8px 12px" }}>Validation: no issues found.</div>
                    );
                    return (
                      <div style={{ background: T.bg, borderRadius: 10, overflow: "hidden", border: "1px solid " + T.bd }}>
                        <div style={{ padding: "8px 12px", fontSize: 12, color: T.tx, fontWeight: 600, borderBottom: "1px solid " + T.bd }}>
                          Validation: {total} fix{total !== 1 ? "es" : ""} applied{cg > 0 ? ", " + cg + " gap" + (cg !== 1 ? "s" : "") + " noted" : ""}
                        </div>
                        {pf > 0 && r.prerequisiteFixes.map((f, i) => (
                          <div key={"pf" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: T.ac }}>prereq</span> <span style={{ color: T.txD }}>{f.skillId}:</span> <span style={{ color: T.tx }}>{f.fix}</span>
                          </div>
                        ))}
                        {df > 0 && r.descriptionFixes.map((f, i) => (
                          <div key={"df" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: "#8B5CF6" }}>desc</span> <span style={{ color: T.txD }}>{f.skillId}:</span> <span style={{ color: T.tx }}>{f.after}</span>
                          </div>
                        ))}
                        {md > 0 && r.mergedDuplicates.map((f, i) => (
                          <div key={"md" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: "#F59E0B" }}>merged</span> <span style={{ color: T.txD }}>{f.removed} into {f.kept}:</span> <span style={{ color: T.tx }}>{f.reason}</span>
                          </div>
                        ))}
                        {cg > 0 && r.coverageGaps.map((f, i) => (
                          <div key={"cg" + i} style={{ padding: "6px 12px", fontSize: 11, borderBottom: "1px solid " + T.bg }}>
                            <span style={{ color: T.rd }}>gap</span> <span style={{ color: T.tx }}>{f.missingTopic}:</span> <span style={{ color: T.txD }}>{f.reason}</span>
                          </div>
                        ))}
                        {r.warnings && r.warnings.map((w, i) => (
                          <div key={"w" + i} style={{ padding: "6px 12px", fontSize: 11, color: T.txD }}>{w}</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Skills list */}
              <div style={{ fontSize: 12, color: T.txD, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
                Skills ({skillViewData.skills.length})
              </div>

              {(() => {
                // Group by category
                var cats = {};
                for (var s of skillViewData.skills) {
                  var cat = s.category || "Uncategorized";
                  if (!cats[cat]) cats[cat] = [];
                  cats[cat].push(s);
                }
                return Object.entries(cats).map(([cat, skills]) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.ac, marginBottom: 6, padding: "4px 0", borderBottom: "1px solid " + T.bd }}>
                      {cat} <span style={{ fontWeight: 400, color: T.txD }}>({skills.length})</span>
                    </div>
                    {skills.map(sk => (
                      <div key={sk.id} style={{ background: T.bg, borderRadius: 8, padding: "8px 12px", marginBottom: 4, border: "1px solid " + T.bd }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: T.tx, fontWeight: 500 }}>
                              {sk.name}
                              {sk.refMatch && <span style={{ fontSize: 10, color: T.gn, marginLeft: 6, fontWeight: 400 }}>ref</span>}
                              {sk.refMatch === false && <span style={{ fontSize: 10, color: "#F59E0B", marginLeft: 6, fontWeight: 400 }}>custom</span>}
                            </div>
                            <div style={{ fontSize: 11, color: T.txD, marginTop: 2 }}>{sk.description}</div>
                            {sk.prerequisites && sk.prerequisites.length > 0 && (
                              <div style={{ fontSize: 10, color: T.txD, marginTop: 3 }}>
                                requires: {sk.prerequisites.map(p => {
                                  var dep = skillViewData.skills.find(s => s.id === p);
                                  return dep ? dep.name : p;
                                }).join(", ")}
                              </div>
                            )}
                            {sk.sources && sk.sources.length > 0 && (
                              <div style={{ fontSize: 10, color: T.txD, marginTop: 2 }}>from: {sk.sources.join(", ")}</div>
                            )}
                          </div>
                          <button onClick={async () => {
                            if (busy) return;
                            setBusy(true); setStatus("Re-examining " + sk.name + "...");
                            try {
                              var refTax = await DB.getRefTaxonomy(active.id);
                              var refCtx = refTax && refTax.taxonomy ? "\n\nREFERENCE TAXONOMY CONTEXT:\n" + JSON.stringify(refTax.taxonomy.filter(t => t.refId === sk.refId || t.category === sk.category).slice(0, 10), null, 1) : "";
                              var flagPrompt = "A student flagged this skill as potentially incorrect in their course skill tree.\n\nFLAGGED SKILL:\n" + JSON.stringify(sk, null, 2) + "\n\nFULL SKILL TREE CONTEXT (nearby skills):\n" + JSON.stringify(skillViewData.skills.filter(s => s.category === sk.category || (sk.prerequisites && sk.prerequisites.includes(s.id)) || (s.prerequisites && s.prerequisites.includes(sk.id))).slice(0, 15), null, 1) + refCtx + "\n\nRe-examine this skill. Check:\n1. Is the name accurate for what the source material actually teaches?\n2. Is the description specific and testable?\n3. Are the prerequisites correct and complete?\n4. Is it categorized correctly?\n5. Should it be split into multiple skills or merged with another?\n\nRespond with ONLY a JSON object:\n{\n  \"action\": \"keep|modify|split|merge\",\n  \"explanation\": \"why this action\",\n  \"correctedSkill\": { ...the skill with any fixes applied... },\n  \"splitInto\": [ ...if splitting, the new skills... ]\n}";
                              var result = await callClaude(flagPrompt, [{ role: "user", content: "Re-examine this flagged skill." }], 4096);
                              var parsed = extractJSON(result);
                              if (parsed && parsed.correctedSkill) {
                                var allSkills = await DB.getSkills(active.id) || [];
                                if (parsed.action === "split" && parsed.splitInto && parsed.splitInto.length > 0) {
                                  allSkills = allSkills.filter(s => s.id !== sk.id).concat(parsed.splitInto);
                                } else if (parsed.action === "merge") {
                                  allSkills = allSkills.map(s => s.id === sk.id ? parsed.correctedSkill : s);
                                } else {
                                  allSkills = allSkills.map(s => s.id === sk.id ? parsed.correctedSkill : s);
                                }
                                await DB.saveSkills(active.id, allSkills);
                                setSkillViewData(prev => ({ ...prev, skills: allSkills }));
                                addNotif("info", (parsed.action === "keep" ? "Reviewed: " : "Fixed: ") + sk.name + " -- " + parsed.explanation);
                              } else {
                                addNotif("warn", "Couldn't parse re-examination result for " + sk.name + ".");
                              }
                            } catch (e) {
                              addNotif("error", "Re-examination failed: " + e.message);
                            }
                            setBusy(false); setStatus("");
                          }} disabled={busy}
                            title="Flag this skill for re-examination"
                            style={{ background: "none", border: "1px solid " + T.bd, borderRadius: 6, padding: "3px 7px", fontSize: 10, color: T.txD, cursor: busy ? "default" : "pointer", flexShrink: 0 }}>?</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Practice Mode View */}
        {practiceMode && !practiceMode.generating && practiceMode.set && (() => {
          var pm = practiceMode;
          var pset = pm.set;
          var tier = pset.currentTier;
          var tierInfo = TIERS[tier];
          var tierData = pset.tiers[tier];
          var currentAttempt = tierData?.attempts?.[tierData.attempts.length - 1];
          var problems = currentAttempt?.problems || [];
          var curIdx = pm.currentProblemIdx;
          var problem = problems[curIdx];
          var passCount = problems.filter(p => p.passed === true).length;
          var answeredCount = problems.filter(p => p.passed !== null).length;

          return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Practice Header */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid " + T.bd, flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{pm.skill.name}</div>
                  <div style={{ fontSize: 12, color: T.ac, fontWeight: 600 }}>Tier {tier}: {tierInfo.name}</div>
                </div>
                {/* Tier progress bar */}
                <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                  {[1,2,3,4,5,6].map(t => (
                    <div key={t} style={{ flex: 1, height: 4, borderRadius: 2, background: t < tier ? T.gn : t === tier ? T.ac : T.bd }} />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.txD }}>
                  <span>Problem {curIdx + 1} of {problems.length}</span>
                  <span>Passed: {passCount}/{problems.length} (need 4)</span>
                </div>
              </div>

              {/* Tier Complete Screen */}
              {pm.tierComplete ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                  <div style={{ textAlign: "center", maxWidth: 400 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>{pm.tierComplete.advanced ? "ðŸŽ¯" : "ðŸ”„"}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 8 }}>
                      {pm.tierComplete.advanced ? "Tier " + (tier - 1) + " Complete!" : "Not quite â€” " + pm.tierComplete.passCount + "/5 passed"}
                    </div>
                    <div style={{ fontSize: 14, color: T.txD, marginBottom: 20 }}>
                      {pm.tierComplete.advanced
                        ? "+" + pm.tierComplete.points + " points (" + pm.tierComplete.rating + "). Moving to Tier " + tier + ": " + tierInfo.name + "."
                        : "You need 4/5 to advance. New problems will be generated for another attempt."}
                    </div>
                    {/* Problem results */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20, textAlign: "left" }}>
                      {(pm.tierComplete.problems || []).map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.sf }}>
                          <span style={{ color: p.passed ? T.gn : p.passed === false ? T.rd : T.txD, fontWeight: 600 }}>{p.passed ? "âœ“" : p.passed === false ? "âœ—" : "â€”"}</span>
                          <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{p.prompt.substring(0, 60)}{p.prompt.length > 60 ? "..." : ""}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={async () => {
                      if (pm.tierComplete.advanced) {
                        // Generate problems for new tier
                        setPracticeMode(prev => ({ ...prev, generating: true, tierComplete: null }));
                        try {
                          var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, pm.skill);
                          var updated = await generateProblems(pset, pm.skill, active.name, matCtx);
                          await DB.savePractice(active.id, pm.skill.id, updated);
                          setPracticeMode({ set: updated, skill: pm.skill, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                        } catch (e) {
                          addNotif("error", "Failed to generate next tier: " + e.message);
                          setPracticeMode(prev => ({ ...prev, generating: false }));
                        }
                      } else {
                        // Retry - generate new problems for same tier
                        setPracticeMode(prev => ({ ...prev, generating: true, tierComplete: null }));
                        try {
                          var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, pm.skill);
                          var updated = await generateProblems(pset, pm.skill, active.name, matCtx);
                          await DB.savePractice(active.id, pm.skill.id, updated);
                          setPracticeMode({ set: updated, skill: pm.skill, currentProblemIdx: 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                        } catch (e) {
                          addNotif("error", "Failed to generate retry problems: " + e.message);
                          setPracticeMode(prev => ({ ...prev, generating: false }));
                        }
                      }
                    }}
                      style={{ padding: "12px 32px", borderRadius: 10, border: "none", background: T.ac, color: "#0F1115", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      {pm.tierComplete.advanced ? "Start Tier " + tier : "Try Again"}
                    </button>
                  </div>
                </div>
              ) : problem ? (
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                  <div style={{ maxWidth: 700, margin: "0 auto" }}>
                    {/* Problem prompt */}
                    <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-wrap" }}>{problem.prompt}</div>

                    {/* Code editor */}
                    <textarea
                      value={problem.studentAnswer || (problem.starterCode || "")}
                      onChange={e => {
                        var val = e.target.value;
                        setPracticeMode(prev => {
                          var s = prev.set;
                          var t = s.currentTier;
                          var td = { ...s.tiers[t] };
                          var attempts = [...td.attempts];
                          var lastA = { ...attempts[attempts.length - 1] };
                          var probs = [...lastA.problems];
                          probs[prev.currentProblemIdx] = { ...probs[prev.currentProblemIdx], studentAnswer: val };
                          lastA.problems = probs;
                          attempts[attempts.length - 1] = lastA;
                          td.attempts = attempts;
                          var newTiers = { ...s.tiers, [t]: td };
                          return { ...prev, set: { ...s, tiers: newTiers } };
                        });
                      }}
                      disabled={problem.passed !== null || pm.evaluating}
                      onKeyDown={e => {
                        if (e.key === "Tab") {
                          e.preventDefault();
                          var ta = e.target;
                          var start = ta.selectionStart, end = ta.selectionEnd;
                          var val = (problem.studentAnswer || problem.starterCode || "");
                          var newVal = val.substring(0, start) + "  " + val.substring(end);
                          setPracticeMode(prev => {
                            var s = prev.set, t2 = s.currentTier;
                            var td2 = { ...s.tiers[t2] }; var atts = [...td2.attempts];
                            var la = { ...atts[atts.length - 1] }; var pr = [...la.problems];
                            pr[prev.currentProblemIdx] = { ...pr[prev.currentProblemIdx], studentAnswer: newVal };
                            la.problems = pr; atts[atts.length - 1] = la; td2.attempts = atts;
                            return { ...prev, set: { ...s, tiers: { ...s.tiers, [t2]: td2 } } };
                          });
                          setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
                        }
                      }}
                      style={{
                        width: "100%", minHeight: 220, maxHeight: 400, padding: 16,
                        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", fontSize: 13, lineHeight: 1.6,
                        background: "#1A1D24", color: problem.passed !== null ? T.txD : "#E8EAF0",
                        border: "1px solid " + (pm.feedback ? (problem.passed ? T.gn : T.rd) : T.bd),
                        borderRadius: 10, resize: "vertical", tabSize: 2
                      }}
                      placeholder={tier === 1 ? "Type the expected output..." : "Write your answer here..."}
                    />

                    {/* Action buttons */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                      <button onClick={() => {
                        var nextUnanswered = problems.findIndex((p, idx) => idx > curIdx && p.passed === null);
                        if (nextUnanswered < 0) nextUnanswered = problems.findIndex((p, idx) => idx !== curIdx && p.passed === null);
                        if (nextUnanswered >= 0) setPracticeMode(prev => ({ ...prev, currentProblemIdx: nextUnanswered, feedback: null }));
                      }}
                        disabled={problem.passed !== null || pm.evaluating}
                        style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid " + T.bd, background: T.sf, color: T.txD, fontSize: 12, cursor: "pointer" }}>Skip</button>

                      {problem.passed === null ? (
                        <button onClick={async () => {
                          var answer = problem.studentAnswer || problem.starterCode || "";
                          if (!answer.trim()) return;
                          setPracticeMode(prev => ({ ...prev, evaluating: true }));
                          try {
                            var result = await evaluateAnswer(pm.skill, problem, answer, tier);
                            // Update the problem in the set
                            var updatedSet = { ...pset };
                            var attempt = updatedSet.tiers[tier].attempts.slice(-1)[0];
                            attempt.problems[curIdx] = { ...attempt.problems[curIdx], passed: result.passed, evaluation: result.feedback, studentAnswer: answer };
                            updatedSet.lastActiveAt = new Date().toISOString();
                            await DB.savePractice(active.id, pm.skill.id, updatedSet);

                            setPracticeMode(prev => ({
                              ...prev, set: updatedSet, evaluating: false,
                              feedback: { passed: result.passed, text: result.feedback }
                            }));

                            // Check if all problems answered
                            var allDone = attempt.problems.every(p => p.passed !== null);
                            if (allDone) {
                              var tierResult = completeTierAttempt(updatedSet);
                              await DB.savePractice(active.id, pm.skill.id, updatedSet);
                              if (tierResult.points > 0) {
                                await applySkillUpdates(active.id, [{
                                  skillId: pm.skill.id, skill: pm.skill.name,
                                  delta: tierResult.points, rating: tierResult.rating,
                                  reason: "Practice Tier " + (tier) + " (" + tierResult.tierName + ") - attempt " + tierResult.attemptNum
                                }]);
                                addNotif("skill", pm.skill.name + ": +" + tierResult.points + " pts (Tier " + tier + " " + tierResult.tierName + ")");
                              }
                              // Show tier complete after a brief delay to let feedback show
                              setTimeout(() => {
                                setPracticeMode(prev => ({
                                  ...prev, set: updatedSet,
                                  tierComplete: { ...tierResult, problems: attempt.problems }
                                }));
                              }, 2000);
                            }
                          } catch (e) {
                            addNotif("error", "Evaluation failed: " + e.message);
                            setPracticeMode(prev => ({ ...prev, evaluating: false }));
                          }
                        }}
                          disabled={pm.evaluating || !(problem.studentAnswer || problem.starterCode || "").trim()}
                          style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: pm.evaluating ? T.bd : T.ac, color: pm.evaluating ? T.txD : "#0F1115", fontSize: 13, fontWeight: 600, cursor: pm.evaluating ? "wait" : "pointer" }}>
                          {pm.evaluating ? "Evaluating..." : "Submit"}
                        </button>
                      ) : (
                        <button onClick={() => {
                          var nextUnanswered = problems.findIndex((p, idx) => idx > curIdx && p.passed === null);
                          if (nextUnanswered < 0) nextUnanswered = problems.findIndex(p => p.passed === null);
                          if (nextUnanswered >= 0) setPracticeMode(prev => ({ ...prev, currentProblemIdx: nextUnanswered, feedback: null }));
                        }}
                          style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Next Problem
                        </button>
                      )}
                    </div>

                    {/* Feedback */}
                    {pm.feedback && (
                      <div style={{
                        marginTop: 16, padding: "12px 16px", borderRadius: 10,
                        background: pm.feedback.passed ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                        border: "1px solid " + (pm.feedback.passed ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)")
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: pm.feedback.passed ? T.gn : T.rd, marginBottom: 4 }}>
                          {pm.feedback.passed ? "âœ“ Correct" : "âœ— Incorrect"}
                        </div>
                        <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.6 }}>{pm.feedback.text}</div>
                      </div>
                    )}

                    {/* Problem navigation dots */}
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                      {problems.map((p, idx) => (
                        <button key={idx} onClick={() => setPracticeMode(prev => ({ ...prev, currentProblemIdx: idx, feedback: p.passed !== null ? { passed: p.passed, text: p.evaluation } : null }))}
                          style={{
                            width: 12, height: 12, borderRadius: 6, border: "none", cursor: "pointer",
                            background: p.passed === true ? T.gn : p.passed === false ? T.rd : idx === curIdx ? T.ac : T.bd,
                            transform: idx === curIdx ? "scale(1.3)" : "scale(1)"
                          }} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* Practice generating indicator */}
        {practiceMode?.generating && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, color: T.txD, marginBottom: 8 }}>Generating practice problems...</div>
              <div style={{ fontSize: 12, color: T.txD }}>Tier {practiceMode?.set?.currentTier || "?"}: {TIERS[practiceMode?.set?.currentTier]?.name || "..."}</div>
            </div>
          </div>
        )}



        {!practiceMode && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Notification Side Panel */}
        {showNotifs && (
          <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid " + T.bd, background: T.sf, display: "flex", flexDirection: "column", order: 2 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.bd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Notifications</div>
              {notifs.length > 0 && (
                <button onClick={() => setNotifs([])} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 11 }}>Clear all</button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {notifs.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: T.txD, fontSize: 12 }}>No notifications yet</div>
              ) : notifs.map(n => {
                var typeColor = n.type === "error" ? (T.rd || "#EF4444") : n.type === "warn" ? "#F59E0B" : n.type === "skill" ? "#8B5CF6" : n.type === "success" ? T.gn : T.ac;
                var typeIcon = n.type === "error" ? "âœ—" : n.type === "warn" ? "âš " : n.type === "skill" ? "â¬†" : n.type === "success" ? "âœ“" : "â€¢";
                var ago = Math.round((Date.now() - n.time.getTime()) / 1000);
                var agoStr = ago < 60 ? ago + "s" : ago < 3600 ? Math.round(ago / 60) + "m" : Math.round(ago / 3600) + "h";
                return (
                  <div key={n.id} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: T.bg, borderLeft: "3px solid " + typeColor }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.5, flex: 1 }}>
                        <span style={{ color: typeColor, fontWeight: 600, marginRight: 6 }}>{typeIcon}</span>
                        {n.msg}
                      </div>
                      <div style={{ fontSize: 10, color: T.txD, flexShrink: 0, marginTop: 2 }}>{agoStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", order: 1 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Chunk Selection Picker */}
            {chunkPicker && !booting && (
              <div style={{ padding: "40px 20px", animation: "fadeIn 0.3s" }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 6 }}>Select sections to analyze</div>
                  <div style={{ fontSize: 13, color: T.txD }}>Uncheck chapters or files that aren't relevant to your course. Only selected sections will be processed.</div>
                </div>
                <div style={{ maxWidth: 520, margin: "0 auto" }}>
                  {chunkPicker.materials.map((mat, mi) => (
                    <div key={mi} style={{ marginBottom: 16, background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: mat.chunks && mat.chunks.length > 1 ? "1px solid " + T.bd : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{mat.name}</div>
                          <div style={{ fontSize: 11, color: T.txD }}>{mat.classification} {mat.chunks ? "-- " + mat.chunks.length + " section" + (mat.chunks.length !== 1 ? "s" : "") : ""}</div>
                        </div>
                        {mat.chunks && mat.chunks.length > 1 && (
                          <button onClick={() => {
                            var allIds = mat.chunks.map(c => c.id);
                            var allSelected = allIds.every(id => chunkPicker.selectedChunks.has(id));
                            setChunkPicker(prev => {
                              var next = new Set(prev.selectedChunks);
                              allIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
                              return { ...prev, selectedChunks: next };
                            });
                          }} style={{ background: "none", border: "none", color: T.ac, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                            {mat.chunks.every(c => chunkPicker.selectedChunks.has(c.id)) ? "Deselect all" : "Select all"}
                          </button>
                        )}
                      </div>
                      {mat.chunks && mat.chunks.length > 1 ? (
                        <div style={{ maxHeight: 300, overflowY: "auto" }}>
                          {mat.chunks.map((ch, ci) => (
                            <label key={ci} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer", borderBottom: ci < mat.chunks.length - 1 ? "1px solid " + T.bg : "none" }}
                              onMouseEnter={e => e.currentTarget.style.background = T.acS}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <input type="checkbox" checked={chunkPicker.selectedChunks.has(ch.id)}
                                onChange={() => setChunkPicker(prev => {
                                  var next = new Set(prev.selectedChunks);
                                  next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
                                  return { ...prev, selectedChunks: next };
                                })}
                                style={{ accentColor: T.ac, width: 16, height: 16, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.label}</div>
                                <div style={{ fontSize: 11, color: T.txD }}>{(ch.charCount || 0).toLocaleString()} chars</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : mat.chunks && mat.chunks.length === 1 ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer" }}>
                          <input type="checkbox" checked={chunkPicker.selectedChunks.has(mat.chunks[0].id)}
                            onChange={() => setChunkPicker(prev => {
                              var next = new Set(prev.selectedChunks);
                              var id = mat.chunks[0].id;
                              next.has(id) ? next.delete(id) : next.add(id);
                              return { ...prev, selectedChunks: next };
                            })}
                            style={{ accentColor: T.ac, width: 16, height: 16 }} />
                          <div style={{ fontSize: 13, color: T.tx }}>Include this file</div>
                        </label>
                      ) : null}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
                    <div style={{ fontSize: 12, color: T.txD, alignSelf: "center" }}>
                      {chunkPicker.selectedChunks.size} of {chunkPicker.materials.flatMap(m => m.chunks || []).length} sections selected
                    </div>
                    <button onClick={() => runExtraction(chunkPicker.selectedChunks)}
                      disabled={chunkPicker.selectedChunks.size === 0}
                      style={{ background: chunkPicker.selectedChunks.size > 0 ? T.ac : T.bd, color: chunkPicker.selectedChunks.size > 0 ? "#0F1115" : T.txD, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: chunkPicker.selectedChunks.size > 0 ? "pointer" : "default" }}>
                      Extract skills
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!sessionMode && !booting && !chunkPicker && !practiceMode && (
              <div style={{ padding: "60px 20px", animation: "fadeIn 0.3s" }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.tx, marginBottom: 8 }}>What are we doing today?</div>
                  <div style={{ fontSize: 13, color: T.txD }}>Pick a direction and we'll get started.</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420, margin: "0 auto" }}>
                  <button onClick={() => selectMode("assignment")}
                    style={{ background: T.acS, border: "1px solid " + T.acB, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(108,156,252,0.15)"}
                    onMouseLeave={e => e.currentTarget.style.background = T.acS}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.ac, marginBottom: 4 }}>Work on an assignment</div>
                    <div style={{ fontSize: 12, color: T.txD }}>Pick an assignment, then get taught what you need to complete it.</div>
                  </button>
                  <button onClick={() => selectMode("recap")}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                    onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Recap last session</div>
                    <div style={{ fontSize: 12, color: T.txD }}>Review where you left off and what still needs work.</div>
                  </button>
                  <button onClick={() => selectMode("skills")}
                    style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 14, padding: "20px 24px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.sfH; e.currentTarget.style.borderColor = T.acB; }}
                    onMouseLeave={e => { e.currentTarget.style.background = T.sf; e.currentTarget.style.borderColor = T.bd; }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.tx, marginBottom: 4 }}>Skill work</div>
                    <div style={{ fontSize: 12, color: T.txD }}>Pick a skill to strengthen and go deep.</div>
                  </button>
                </div>
              </div>
            )}

            {pickerData && !booting && (
              <div style={{ padding: "40px 20px", animation: "fadeIn 0.3s" }}>
                <button onClick={() => { setSessionMode(null); setPickerData(null); }}
                  style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0 }}>&lt; Back</button>

                {pickerData.empty ? (
                  <div style={{ textAlign: "center", padding: 40 }}>
                    <div style={{ color: T.txD, fontSize: 14, marginBottom: 16 }}>{pickerData.message}</div>
                    {(() => {
                      var failedChunks = (active?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "failed"));
                      var hasExtracted = (active?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "extracted")).length > 0;
                      return <>
                        {failedChunks.length > 0 && (
                          <div style={{ color: "#F59E0B", fontSize: 12, marginBottom: 12 }}>
                            {failedChunks.length} chunk{failedChunks.length !== 1 ? "s" : ""} failed extraction
                          </div>
                        )}
                        <button onClick={async () => {
                          if (!active) return;
                          setPickerData(null); setSessionMode(null);
                          setBusy(true);
                          var isRetry = hasExtracted;
                          setStatus(isRetry ? "Retrying failed chunks..." : "Extracting skills...");
                          addNotif("info", isRetry ? "Retrying extraction..." : "Extracting skills...");
                          try {
                            var skills = await extractSkillTree(active.id, active.materials, setStatus, isRetry);
                            // Refresh active course from DB (chunk statuses updated)
                            var refreshed = await DB.getCourses();
                            var updatedCourse = refreshed.find(c => c.id === active.id);
                            if (updatedCourse) { setActive(updatedCourse); setCourses(refreshed); }
                            if (Array.isArray(skills) && skills.length > 0) {
                              var stillFailed = (updatedCourse?.materials || []).flatMap(m => (m.chunks || []).filter(c => c.status === "failed")).length;
                              var msg = "Found " + skills.length + " skills.";
                              if (stillFailed > 0) msg += " " + stillFailed + " chunk(s) still need retry.";
                              else msg += " All chunks extracted.";
                              addNotif("success", msg);
                            } else {
                              addNotif("error", "Skill extraction returned unexpected format.");
                            }
                          } catch (e) {
                            addNotif("error", "Extraction failed: " + e.message);
                          }
                          setBusy(false); setStatus("");
                        }} style={{ background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          {hasExtracted && failedChunks.length > 0 ? "Retry failed chunks" : "Extract skills"}
                        </button>
                      </>;
                    })()}
                  </div>
                ) : pickerData.mode === "assignment" ? (
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick an assignment</div>
                    <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Study will focus on teaching what you need for the one you choose.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500 }}>
                      {pickerData.items.map((a, i) => {
                        var isExpanded = pickerData.expanded === i;
                        var readyColor = a.avgStrength >= 0.6 ? T.gn : a.avgStrength >= 0.3 ? "#F59E0B" : (T.txM || T.txD);
                        return (
                          <div key={i} style={{ background: T.sf, border: "1px solid " + (isExpanded ? T.acB : T.bd), borderRadius: 12, overflow: "hidden", transition: "all 0.15s" }}>
                            <div onClick={() => setPickerData(prev => ({ ...prev, expanded: isExpanded ? null : i }))}
                              style={{ padding: "16px 20px", cursor: "pointer" }}
                              onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T.acS; }}
                              onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{a.title}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {a.dueDate && <div style={{ fontSize: 11, color: T.ac, flexShrink: 0 }}>{a.dueDate}</div>}
                                  <span style={{ fontSize: 11, color: T.txD }}>{isExpanded ? "â–´" : "â–¾"}</span>
                                </div>
                              </div>
                              <div style={{ fontSize: 12, color: T.txD }}>
                                {a.questionCount} question{a.questionCount !== 1 ? "s" : ""} | {a.skillList.length} skills needed
                                <span style={{ color: readyColor }}> | readiness: {Math.round(a.avgStrength * 100)}%</span>
                              </div>
                            </div>
                            {isExpanded && (
                              <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 20px" }}>
                                {a.skillList.length > 0 && (
                                  <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, color: T.txD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 }}>Required Skills</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      {a.skillList.sort((x, y) => x.strength - y.strength).map(sk => {
                                        var skColor = sk.strength >= 0.6 ? T.gn : sk.strength >= 0.4 ? "#F59E0B" : (T.rd || "#EF4444");
                                        var isWeak = sk.strength < 0.4;
                                        return (
                                          <div key={sk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: 6, background: isWeak ? "rgba(239,68,68,0.06)" : "transparent" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                              <div style={{ width: 6, height: 6, borderRadius: 3, background: skColor, flexShrink: 0 }} />
                                              <div style={{ fontSize: 12, color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.name}</div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                              <span style={{ fontSize: 11, color: skColor, fontWeight: 600 }}>{Math.round(sk.strength * 100)}%</span>
                                              {isWeak && (
                                                <button onClick={(e) => {
                                                  e.stopPropagation();
                                                  var fullSkill = Array.isArray(pickerData._skills) ? pickerData._skills.find(s => s.id === sk.id) : null;
                                                  if (fullSkill) bootWithFocus({ type: "skill", skill: { ...fullSkill, strength: sk.strength, points: sk.points } });
                                                }}
                                                  style={{ background: "none", border: "1px solid " + T.acB, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: T.ac, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>Practice</button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <button onClick={() => bootWithFocus({ type: "assignment", assignment: a })}
                                  style={{ width: "100%", padding: "10px 16px", borderRadius: 10, border: a.avgStrength >= 0.4 ? "none" : "1px solid " + T.bd, background: a.avgStrength >= 0.4 ? T.ac : T.sf, color: a.avgStrength >= 0.4 ? "#0F1115" : T.tx, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                  {a.avgStrength >= 0.4 ? "Start Assignment" : "Start Anyway (low readiness)"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 4 }}>Pick a skill to work on</div>
                    <div style={{ fontSize: 13, color: T.txD, marginBottom: 20 }}>Sorted by weakest first. Pick one to go deep.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 500 }}>
                      {pickerData.items.map((s, i) => {
                        var isExp = pickerData.expanded === i;
                        var strColor = s.strength >= 0.7 ? T.gn : s.strength >= 0.4 ? "#F59E0B" : T.txM;
                        var startTier = strengthToTier(s.strength);
                        return (
                          <div key={i} style={{ background: T.sf, border: "1px solid " + (isExp ? T.acB : T.bd), borderRadius: 10, overflow: "hidden", transition: "all 0.15s" }}>
                            <div onClick={() => setPickerData(prev => ({ ...prev, expanded: isExp ? null : i }))}
                              style={{ padding: "12px 16px", cursor: "pointer" }}
                              onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = T.acS; }}
                              onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = "transparent"; }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: T.tx }}>{s.name}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                                  {s.reviewDate === "now" && <span style={{ fontSize: 10, color: T.rd, fontWeight: 600 }}>REVIEW</span>}
                                  <span style={{ fontSize: 11, color: strColor, fontWeight: 600 }}>{Math.round(s.strength * 100)}%</span>
                                  <span style={{ fontSize: 11, color: T.txD }}>{isExp ? "\u25b4" : "\u25be"}</span>
                                </div>
                              </div>
                              <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>
                                {s.lastRating ? "Last: " + s.lastRating : "Not yet practiced"}
                                {s.lastPracticed ? " | " + Math.round((Date.now() - new Date(s.lastPracticed).getTime()) / 86400000) + "d ago" : ""}
                              </div>
                            </div>
                            {isExp && (
                              <div style={{ borderTop: "1px solid " + T.bd, padding: "12px 16px", display: "flex", gap: 8 }}>
                                <button onClick={() => bootWithFocus({ type: "skill", skill: s })}
                                  style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: "1px solid " + T.acB, background: T.acS, color: T.ac, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                  Learn
                                  <div style={{ fontSize: 10, fontWeight: 400, color: T.txD, marginTop: 2 }}>AI-guided dialogue</div>
                                </button>
                                <button onClick={async () => {
                                  setPracticeMode({ generating: true });
                                  setPickerData(null); setSessionMode("practice");
                                  try {
                                    var existing = await DB.getPractice(active.id, s.id);
                                    var pset = existing || createPracticeSet(active.id, s, active.name);
                                    var tier = pset.currentTier;
                                    var tierData = pset.tiers[tier];
                                    var lastAttempt = tierData?.attempts?.[tierData.attempts.length - 1];
                                    if (!lastAttempt || lastAttempt.completed) {
                                      var matCtx = await loadPracticeMaterialCtx(active.id, active.materials, s);
                                      pset = await generateProblems(pset, s, active.name, matCtx);
                                    }
                                    await DB.savePractice(active.id, s.id, pset);
                                    var curAttempt = pset.tiers[pset.currentTier].attempts.slice(-1)[0];
                                    var firstUnanswered = curAttempt.problems.findIndex(p => p.passed === null);
                                    setPracticeMode({ set: pset, skill: s, currentProblemIdx: firstUnanswered >= 0 ? firstUnanswered : 0, feedback: null, evaluating: false, generating: false, tierComplete: null });
                                  } catch (e) {
                                    addNotif("error", "Failed to start practice: " + e.message);
                                    setPracticeMode(null); setSessionMode(null);
                                  }
                                }}
                                  style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: "none", background: T.ac, color: "#0F1115", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                  Practice
                                  <div style={{ fontSize: 10, fontWeight: 400, color: "rgba(15,17,21,0.6)", marginTop: 2 }}>Tier {startTier}: {TIERS[startTier].name}</div>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 20, animation: "fadeIn 0.25s", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && <div style={{ fontSize: 11, color: T.ac, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>Study</div>}
                <div style={{
                  maxWidth: m.role === "user" ? "80%" : "100%",
                  background: m.role === "user" ? T.acS : "transparent",
                  border: m.role === "user" ? "1px solid " + T.acB : "none",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "0",
                  padding: m.role === "user" ? "12px 16px" : "4px 0",
                  color: T.tx, lineHeight: 1.7, fontSize: 14
                }}>
                  {m.role === "assistant" ? (m.content ? renderMd(m.content) : <span style={{ display: "inline-block", width: 8, height: 16, background: T.ac, animation: "blink 1s step-end infinite", verticalAlign: "middle" }} />) : m.content}
                </div>
              </div>
            ))}
            {((booting && !(msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && msgs[msgs.length - 1].content)) || (busy && !(msgs.length > 0 && msgs[msgs.length - 1].role === "assistant"))) && (
              <div style={{ padding: "16px 0", animation: "fadeIn 0.2s" }}>
                <div style={{ fontSize: 11, color: T.ac, marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{booting ? status || "Reading materials..." : "Study"}</div>
                <svg width="64" height="28" viewBox="0 0 64 28" style={{ display: "block" }}>
                  {/* shelf */}
                  <rect x="2" y="24" width="60" height="2" rx="1" fill={T.bd} style={{ animation: "shelfPulse 2s ease-in-out infinite" }} />
                  {/* books - pixel style rectangles with different colors */}
                  <rect x="8" y="10" width="6" height="14" rx="1" fill={T.ac} style={{ animation: "bookSlide1 3.2s ease-in-out infinite" }} />
                  <rect x="16" y="12" width="5" height="12" rx="1" fill="#F59E0B" style={{ animation: "bookSlide2 2.8s ease-in-out 0.3s infinite" }} />
                  <rect x="23" y="8" width="7" height="16" rx="1" fill={T.ac} opacity="0.6" style={{ animation: "bookSlide3 3.5s ease-in-out 0.6s infinite" }} />
                  <rect x="32" y="14" width="5" height="10" rx="1" fill="#8B5CF6" style={{ animation: "bookSlide4 3s ease-in-out 0.15s infinite" }} />
                  <rect x="39" y="11" width="6" height="13" rx="1" fill={T.ac} opacity="0.8" style={{ animation: "bookSlide1 3.4s ease-in-out 0.8s infinite" }} />
                  <rect x="47" y="13" width="5" height="11" rx="1" fill="#F59E0B" opacity="0.7" style={{ animation: "bookSlide2 3.1s ease-in-out 0.5s infinite" }} />
                </svg>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Assignment Panel */}
        {asgnWork && msgs.length > 0 && (
          <div style={{ width: 340, borderLeft: "1px solid " + T.bd, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid " + T.bd }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 4 }}>
                {focusContext?.assignment?.title || "Assignment"}
              </div>
              <div style={{ fontSize: 11, color: T.txD }}>
                {asgnWork.questions.filter(q => q.done).length} / {asgnWork.questions.length} complete
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {asgnWork.questions.map((q, i) => (
                <div key={q.id} style={{ marginBottom: 12 }}>
                  {q.done ? (
                    /* Completed question - collapsed */
                    <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", opacity: 0.7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: T.gn }}>{q.id}</div>
                        <div style={{ fontSize: 10, color: T.gn }}>Done</div>
                      </div>
                      <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>{q.answer.substring(0, 80)}{q.answer.length > 80 ? "..." : ""}</div>
                    </div>
                  ) : q.unlocked ? (
                    /* Active question - expanded with answer box */
                    <div style={{ background: T.sf, border: "1px solid " + T.acB, borderRadius: 12, padding: 14, animation: "fadeIn 0.3s" }}>
                      <div style={{ fontSize: 11, color: T.ac, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{q.id}</div>
                      <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.6, marginBottom: 12 }}>{q.description}</div>
                      <textarea
                        value={q.answer}
                        onChange={e => {
                          var val = e.target.value;
                          setAsgnWork(prev => ({
                            ...prev,
                            questions: prev.questions.map(pq => pq.id === q.id ? { ...pq, answer: val } : pq)
                          }));
                        }}
                        placeholder="Write your answer here..."
                        style={{ width: "100%", minHeight: 100, background: T.bg, border: "1px solid " + T.bd, borderRadius: 8, padding: "10px 12px", color: T.tx, fontSize: 13, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                      {q.answer.trim().length > 0 && (
                        <button onClick={() => {
                          setAsgnWork(prev => ({
                            ...prev,
                            questions: prev.questions.map(pq => pq.id === q.id ? { ...pq, done: true } : pq)
                          }));
                        }}
                          style={{ marginTop: 8, background: T.gn, color: "#0F1115", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                          Mark done
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Locked question */
                    <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", opacity: 0.4 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: T.txM }}>{q.id}</div>
                      <div style={{ fontSize: 11, color: T.txM, marginTop: 2 }}>Locked -- building skills</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Export button */}
            {asgnWork.questions.some(q => q.done) && (
              <div style={{ padding: 12, borderTop: "1px solid " + T.bd }}>
                <button onClick={() => {
                  var content = "# " + (focusContext?.assignment?.title || "Assignment") + "\n\n";
                  for (var q of asgnWork.questions) {
                    if (q.done) {
                      content += "## " + q.id + ": " + q.description + "\n\n";
                      content += q.answer + "\n\n---\n\n";
                    }
                  }
                  var blob = new Blob([content], { type: "text/markdown" });
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement("a");
                  a.href = url;
                  a.download = (focusContext?.assignment?.title || "assignment").replace(/[^a-zA-Z0-9]/g, "_") + "_answers.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                  style={{ width: "100%", background: T.ac, color: "#0F1115", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Export answers
                </button>
              </div>
            )}
          </div>
        )}

        </div>
        )}


        {/* Input Bar - only show after session has started, hidden during practice */}
        {msgs.length > 0 && !practiceMode && (
        <div style={{ borderTop: "1px solid " + T.bd, padding: 16, flexShrink: 0 }}>
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type your answer or ask a question..." rows={1}
              style={{ flex: 1, background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, padding: "12px 16px", color: T.tx, fontSize: 14, resize: "none", lineHeight: 1.5, maxHeight: 150 }} />
            <button onClick={sendMessage} disabled={!input.trim() || busy}
              style={{
                background: input.trim() && !busy ? T.ac : T.sf,
                color: input.trim() && !busy ? "#0F1115" : T.txM,
                border: "none", borderRadius: 12, width: 44, height: 44,
                fontSize: 16, cursor: input.trim() && !busy ? "pointer" : "default",
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700
              }}>-&gt;</button>
          </div>
        </div>
        )}

      </div>
    );
  }

  return null;
}

export default function Study() {
  return React.createElement(StudyErrorBoundary, null, React.createElement(StudyInner));
}
