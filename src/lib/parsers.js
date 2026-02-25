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
export const readFile = (file) => new Promise(async (resolve) => {
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

  // PPTX parsing
  if (ext === "pptx") {
    try {
      const Z = await loadJSZip();
      const zip = await Z.loadAsync(await file.arrayBuffer());
      const slides = [];

      // Find all slide XML files (slide1.xml, slide2.xml, etc.)
      const slideFiles = Object.keys(zip.files)
        .filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)[1]);
          const numB = parseInt(b.match(/slide(\d+)/)[1]);
          return numA - numB;
        });

      for (const slideFile of slideFiles) {
        const xml = await zip.file(slideFile)?.async("text");
        if (!xml) continue;

        // Extract text from <a:t> tags (PowerPoint text elements)
        const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, "").trim()).filter(t => t);

        if (texts.length > 0) {
          const slideNum = slideFile.match(/slide(\d+)/)[1];
          slides.push("--- Slide " + slideNum + " ---\n" + texts.join("\n"));
        }
      }

      // Also try to get notes from notesSlides
      const noteFiles = Object.keys(zip.files)
        .filter(f => f.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/))
        .sort((a, b) => {
          const numA = parseInt(a.match(/notesSlide(\d+)/)[1]);
          const numB = parseInt(b.match(/notesSlide(\d+)/)[1]);
          return numA - numB;
        });

      let notes = [];
      for (const noteFile of noteFiles) {
        const xml = await zip.file(noteFile)?.async("text");
        if (!xml) continue;
        const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const texts = textMatches.map(m => m.replace(/<\/?a:t>/g, "").trim()).filter(t => t && t.length > 2);
        if (texts.length > 0) {
          const noteNum = noteFile.match(/notesSlide(\d+)/)[1];
          notes.push("--- Notes for Slide " + noteNum + " ---\n" + texts.join("\n"));
        }
      }

      let content = slides.join("\n\n");
      if (notes.length > 0) {
        content += "\n\n=== SPEAKER NOTES ===\n\n" + notes.join("\n\n");
      }

      if (!content.trim()) {
        resolve({ type: "text", name: file.name, content: "[PPTX had no extractable text]", parseOk: false });
        return;
      }

      resolve({ type: "text", name: file.name, content: content });
    } catch (e) {
      resolve({ type: "text", name: file.name, content: "[PPTX parse failed: " + e.message + "]", parseOk: false });
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
