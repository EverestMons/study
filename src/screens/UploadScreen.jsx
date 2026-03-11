import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { CLS } from "../lib/classify.js";
import { useStudy } from "../StudyContext.jsx";
import FolderPickerModal from "../components/FolderPickerModal.jsx";

export default function UploadScreen() {
  const {
    files, setFiles, cName, setCName, drag, setDrag, parsing,
    setScreen, setShowSettings, onDrop, onSelect, classify, removeF, createCourse, fiRef,
    importFromFolder, confirmFolderImport, folderImportData, setFolderImportData,
  } = useStudy();

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
    <div style={{ background: T.bg, height: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid " + T.bd, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", fontSize: 14, padding: "4px 8px", borderRadius: 6, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>&lt; Back</button>
        <button onClick={() => setShowSettings(true)}
          style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }}
          onMouseEnter={e => e.currentTarget.style.background = T.sfH}
          onMouseLeave={e => e.currentTarget.style.background = T.sf}>
          Settings
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.tx, margin: 0, marginBottom: 4 }}>Upload Course Data</h1>
        <p style={{ fontSize: 14, color: T.txD, margin: 0, marginBottom: 32, lineHeight: 1.6 }}>Drop your files in. Study will auto-detect file types when possible.</p>

        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fiRef.current?.click()}
          style={{ border: "2px dashed " + (drag ? T.ac : T.bd), borderRadius: 16, padding: cur ? "24px 20px" : "48px 32px", textAlign: "center", cursor: "pointer", background: drag ? T.acS : "transparent", marginBottom: 24, transition: "all 0.2s" }}>
          <input ref={fiRef} type="file" multiple accept=".txt,.md,.pdf,.csv,.doc,.docx,.pptx,.rtf,.srt,.vtt,.epub,.xlsx,.xls,.xlsm,image/*" onChange={onSelect} style={{ display: "none" }} />
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
          <>
            <div style={{ fontSize: 12, color: T.txM, textAlign: "center", margin: "16px 0" }}>&mdash; or &mdash;</div>
            <button onClick={importFromFolder}
              style={{ width: "100%", background: "transparent", border: "1px solid " + T.bd, color: T.txD, borderRadius: 10, padding: "14px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 24, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.ac; e.currentTarget.style.color = T.ac; e.currentTarget.style.background = T.acS; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.color = T.txD; e.currentTarget.style.background = "transparent"; }}>
              Import from Folder
            </button>
          </>
        )}

        {files.length === 0 && (
          <div style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 12, padding: "16px 20px", marginBottom: 24, fontSize: 12, lineHeight: 1.8, color: T.txD }}>
            <div style={{ fontWeight: 600, color: T.tx, marginBottom: 8, fontSize: 13 }}>Format guide</div>
            <div><span style={{ color: T.gn, fontWeight: 600 }}>Plain text (.txt, .md, .csv)</span> -- always works perfectly. When in doubt, export to .txt.</div>
            <div><span style={{ color: T.gn, fontWeight: 600 }}>Subtitles (.srt, .vtt)</span> -- timestamps stripped, clean transcript extracted.</div>
            <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Word docs (.docx)</span> -- works for most files. Complex formatting may be lost. If content looks wrong, save as .txt from Word.</div>
            <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Spreadsheets (.xlsx, .csv)</span> -- tables extracted as tab-separated text. For best results, export as .csv from Excel.</div>
            <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>E-books (.epub)</span> -- chapters extracted individually. Non-standard EPUBs may fail.</div>
            <div><span style={{ color: T.txM, fontWeight: 600 }}>PDFs (.pdf)</span> -- not yet supported. Open in Preview/Acrobat, select all text, paste into a .txt file.</div>
            <div><span style={{ color: "#F59E0B", fontWeight: 600 }}>Slides (.pptx)</span> -- text and speaker notes extracted. Complex layouts may lose some content.</div>
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
              {!cName.trim() ? "Name your course to continue" : "Create Course"}
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
      {folderImportData && (
        <FolderPickerModal
          folderData={folderImportData}
          onImport={confirmFolderImport}
          onClose={() => setFolderImportData(null)}
        />
      )}
    </div>
  );
}
