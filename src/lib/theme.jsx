// --- Theme ---
export const T = {
  bg: "#0F1115",
  sf: "#1A1D24",
  sfH: "#22262F",
  bd: "#2A2F3A",
  tx: "#E8EAF0",
  txD: "#8B95A5",
  txM: "#64748B",
  ac: "#6C9CFC",
  acS: "rgba(108,156,252,0.1)",
  acB: "rgba(108,156,252,0.2)",
  gn: "#34D399",
  gnS: "rgba(52,211,153,0.1)",
  am: "#FBBF24",
  amS: "rgba(251,191,36,0.1)",
  rd: "#F87171",
};

// --- CSS ---
export const CSS = [
  "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');",
  "*{box-sizing:border-box;margin:0;padding:0}",
  "html,body{font-family:'DM Sans',sans-serif;background:" + T.bg + ";color:" + T.tx + ";overflow:hidden;height:100%}",
  "input,textarea,button,select{font-family:'DM Sans',sans-serif;outline:none}",
  "textarea{overflow-y:auto}",
  "::selection{background:" + T.acS + ";color:" + T.ac + "}",
  "*::-webkit-scrollbar{width:6px;height:6px}",
  "*::-webkit-scrollbar-track{background:transparent}",
  "*::-webkit-scrollbar-thumb{background:" + T.bd + ";border-radius:3px}",
  "*::-webkit-scrollbar-thumb:hover{background:#3A4050}",
  "*::-webkit-scrollbar-corner{background:transparent}",
  "html,body{scrollbar-color:" + T.bd + " transparent;scrollbar-width:thin}",
  "@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
  "@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}",
  "@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}",
  "@keyframes bookSlide1{0%,100%{transform:translateX(0)}30%{transform:translateX(12px)}50%{transform:translateX(12px) translateY(-6px)}70%{transform:translateX(0) translateY(-6px)}85%{transform:translateX(0)}}",
  "@keyframes bookSlide2{0%,100%{transform:translateX(0)}20%{transform:translateY(-8px)}40%{transform:translateX(-10px) translateY(-8px)}60%{transform:translateX(-10px)}80%{transform:translateX(0)}}",
  "@keyframes bookSlide3{0%,100%{transform:translateX(0)}35%{transform:translateY(-5px)}55%{transform:translateX(8px) translateY(-5px)}75%{transform:translateX(8px)}90%{transform:translateX(0)}}",
  "@keyframes bookSlide4{0%,100%{transform:translateX(0)}25%{transform:translateY(-7px)}50%{transform:translateX(-6px) translateY(-7px)}70%{transform:translateX(-6px)}85%{transform:translateX(0)}}",
  "@keyframes shelfPulse{0%,100%{opacity:.5}50%{opacity:.8}}",
  "@keyframes dotPulse{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}",
  "@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}",
  "button:active{transform:scale(0.97);background-color:rgba(139,92,246,0.08) !important;transition:transform 0.1s}",
].join("\n");

// --- Markdown Renderer ---
import React from "react";

export const inl = (t) => t.split(/(\*\*.*?\*\*)/g).map((p, i) =>
  p.startsWith("**") && p.endsWith("**")
    ? <strong key={i} style={{ fontWeight: 700, color: T.tx }}>{p.slice(2, -2)}</strong>
    : p
);

export const renderMd = (text) => {
  if (!text) return null;
  const clean = text
    .replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "")
    .replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "")
    .replace(/\[SHOW_IMAGE\][\s\S]*?\[\/SHOW_IMAGE\]/g, "")
    .replace(/\[INPUT_MODE:\s*[^\]]*\]/g, "")
    .replace(/\[SKILL_UPDATE\][\s\S]*$/g, "")
    .replace(/\[SKILL_UPDA[\s\S]*$/g, "")
    .replace(/\[UNLOCK_QUESTION\][\s\S]*$/g, "")
    .replace(/\[UNLOCK_QU[\s\S]*$/g, "")
    .replace(/\[SHOW_IMAGE\][\s\S]*$/g, "")
    .replace(/\[SHOW_IM[\s\S]*$/g, "")
    .replace(/\[INPUT_MODE[^\]]*$/g, "")
    .replace(/\[INPUT_MO[\s\S]*$/g, "")
    .trim();
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
      els.push(<p key={i} style={{ margin: "4px 0", lineHeight: 1.7, fontSize: 15 }}>{inl(ln)}</p>);
    }
    i++;
  }
  return els;
};
