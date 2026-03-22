import React, { useState } from "react";
import { T } from "../../lib/theme.jsx";

var MATH_SYMBOLS = {
  greek: [
    { label: "\u03B1", ch: "\u03B1" }, { label: "\u03B2", ch: "\u03B2" },
    { label: "\u03B3", ch: "\u03B3" }, { label: "\u03B4", ch: "\u03B4" },
    { label: "\u03B8", ch: "\u03B8" }, { label: "\u03BB", ch: "\u03BB" },
    { label: "\u03BC", ch: "\u03BC" }, { label: "\u03C0", ch: "\u03C0" },
    { label: "\u03C3", ch: "\u03C3" }, { label: "\u03C6", ch: "\u03C6" },
    { label: "\u03C9", ch: "\u03C9" }, { label: "\u0394", ch: "\u0394" },
    { label: "\u03A3", ch: "\u03A3" }, { label: "\u03A9", ch: "\u03A9" },
  ],
  operators: [
    { label: "\u00B1", ch: "\u00B1" }, { label: "\u00D7", ch: "\u00D7" },
    { label: "\u00F7", ch: "\u00F7" }, { label: "\u2260", ch: "\u2260" },
    { label: "\u2248", ch: "\u2248" }, { label: "\u2264", ch: "\u2264" },
    { label: "\u2265", ch: "\u2265" }, { label: "\u2208", ch: "\u2208" },
    { label: "\u2209", ch: "\u2209" }, { label: "\u2282", ch: "\u2282" },
    { label: "\u222A", ch: "\u222A" }, { label: "\u2229", ch: "\u2229" },
  ],
  calculus: [
    { label: "\u222B", ch: "\u222B" }, { label: "\u2202", ch: "\u2202" },
    { label: "\u2211", ch: "\u2211" }, { label: "\u220F", ch: "\u220F" },
    { label: "\u221A", ch: "\u221A" }, { label: "\u221E", ch: "\u221E" },
    { label: "lim", ch: "lim" },
  ],
  super_sub: [
    { label: "x\u00B2", ch: "\u00B2" }, { label: "x\u00B3", ch: "\u00B3" },
    { label: "x\u207F", ch: "\u207F" }, { label: "x\u2081", ch: "\u2081" },
    { label: "x\u2082", ch: "\u2082" }, { label: "x\u2099", ch: "\u2099" },
  ],
  arrows: [
    { label: "\u2192", ch: "\u2192" }, { label: "\u2190", ch: "\u2190" },
    { label: "\u21D2", ch: "\u21D2" }, { label: "\u21D4", ch: "\u21D4" },
    { label: "\u21A6", ch: "\u21A6" },
  ],
  sets: [
    { label: "\u2200", ch: "\u2200" }, { label: "\u2203", ch: "\u2203" },
    { label: "\u2234", ch: "\u2234" }, { label: "\u2235", ch: "\u2235" },
    { label: "\u211D", ch: "\u211D" }, { label: "\u2124", ch: "\u2124" },
    { label: "\u2115", ch: "\u2115" }, { label: "\u211A", ch: "\u211A" },
    { label: "\u2102", ch: "\u2102" },
  ],
};

var GROUP_LABELS = {
  greek: "Greek", operators: "Ops", calculus: "Calc",
  super_sub: "Sup/Sub", arrows: "Arrows", sets: "Sets",
};

var GROUP_KEYS = Object.keys(MATH_SYMBOLS);

export default function MathToolbar({ taRef, input, setInput }) {
  var [expanded, setExpanded] = useState(null);

  function insertSymbol(ch) {
    var ta = taRef.current;
    if (!ta) return;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var val = input || "";
    var newVal = val.substring(0, start) + ch + val.substring(end);
    setInput(newVal);
    setExpanded(null);
    requestAnimationFrame(function() {
      if (taRef.current) {
        taRef.current.selectionStart = taRef.current.selectionEnd = start + ch.length;
        taRef.current.focus();
      }
    });
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Category pills */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: expanded ? 6 : 0 }}>
        {GROUP_KEYS.map(function(key) {
          var isActive = expanded === key;
          return (
            <button key={key} onClick={function() { setExpanded(isActive ? null : key); }}
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                border: "1px solid " + (isActive ? T.acB : T.bd),
                background: isActive ? T.acS : "transparent",
                color: isActive ? T.ac : T.txM,
                transition: "all 0.15s ease",
              }}>
              {GROUP_LABELS[key]}
            </button>
          );
        })}
      </div>
      {/* Symbol buttons */}
      {expanded && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", animation: "fadeIn 0.15s" }}>
          {MATH_SYMBOLS[expanded].map(function(sym, i) {
            return (
              <button key={i} onClick={function() { insertSymbol(sym.ch); }}
                onMouseEnter={function(e) { e.currentTarget.style.background = T.sfH; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, border: "1px solid " + T.bd,
                  background: "transparent", color: T.tx,
                  transition: "background 0.1s ease",
                }}>
                {sym.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
