import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { T } from "../lib/theme.jsx";

var MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
var DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDays(year, month) {
  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var daysInPrev = new Date(year, month, 0).getDate();
  var days = [];
  var pm = month === 0 ? 11 : month - 1;
  var py = month === 0 ? year - 1 : year;
  for (var i = firstDay - 1; i >= 0; i--)
    days.push({ day: daysInPrev - i, month: pm, year: py, adj: true });
  for (var d = 1; d <= daysInMonth; d++)
    days.push({ day: d, month: month, year: year, adj: false });
  var nm = month === 11 ? 0 : month + 1;
  var ny = month === 11 ? year + 1 : year;
  var rem = 42 - days.length;
  for (var d2 = 1; d2 <= rem; d2++)
    days.push({ day: d2, month: nm, year: ny, adj: true });
  return days;
}

function dayKey(y, m, d) { return y + "-" + m + "-" + d; }

/**
 * DatePicker — dark-themed calendar popover.
 *
 * Props:
 *   value       — epoch seconds (number) or null
 *   onChange     — (epochSeconds | null) => void
 *   anchorRef   — React ref to the trigger element (for positioning)
 *   onClose     — () => void, called on click-outside or Escape
 *
 * Consumer controls visibility via conditional rendering:
 *   {showPicker && <DatePicker value={v} onChange={fn} anchorRef={ref} onClose={close} />}
 */
export default function DatePicker({ value, onChange, anchorRef, onClose }) {
  var [viewYear, setViewYear] = useState(0);
  var [viewMonth, setViewMonth] = useState(0);
  var [pos, setPos] = useState({ top: 0, right: 0 });
  var [ready, setReady] = useState(false);
  var popRef = useRef(null);

  var sel = value ? new Date(value * 1000) : null;
  var today = new Date();
  var todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
  var selKey = sel ? dayKey(sel.getFullYear(), sel.getMonth(), sel.getDate()) : null;

  // Initialize view month + position on mount (useLayoutEffect = before paint)
  useLayoutEffect(function () {
    var d = sel || today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    if (anchorRef && anchorRef.current) {
      var rect = anchorRef.current.getBoundingClientRect();
      var popH = 340;
      var spaceBelow = window.innerHeight - rect.bottom;
      var top = spaceBelow >= popH + 8 ? rect.bottom + 4 : rect.top - popH - 4;
      var right = window.innerWidth - rect.right;
      if (right < 8) right = 8;
      setPos({ top: top, right: right });
    }
    setReady(true);
  }, []);

  // Close on outside click
  useEffect(function () {
    function onDown(e) {
      if (popRef.current && !popRef.current.contains(e.target) &&
        anchorRef && anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    }
    var t = setTimeout(function () { document.addEventListener("mousedown", onDown); }, 0);
    return function () { clearTimeout(t); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);

  // Close on Escape
  useEffect(function () {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  }

  function pickDay(d) {
    var epoch = Math.floor(new Date(d.year, d.month, d.day, 23, 59, 59).getTime() / 1000);
    onChange(epoch);
  }

  function clearDate(e) {
    e.stopPropagation();
    onChange(null);
  }

  var days = getDays(viewYear, viewMonth);

  var arrowBtn = {
    background: "none", border: "none", color: T.txD, fontSize: 16,
    cursor: "pointer", padding: "4px 8px", borderRadius: 6, lineHeight: 1,
  };

  return createPortal(
    <div ref={popRef} style={{
      position: "fixed", top: pos.top, right: pos.right, width: 260,
      background: T.sf, border: "1px solid " + T.bd, borderRadius: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.45)", zIndex: 9999,
      animation: ready ? "fadeIn 0.15s ease" : "none",
      visibility: ready ? "visible" : "hidden",
      padding: 12, userSelect: "none",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Month/year header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={prevMonth} style={arrowBtn}
          onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = "none"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>
          {MONTHS[viewMonth]} {viewYear}
        </div>
        <button onClick={nextMonth} style={arrowBtn}
          onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = "none"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {DOW.map(function (d) {
          return <div key={d} style={{ textAlign: "center", fontSize: 11, color: T.txD, padding: "4px 0", fontWeight: 500 }}>{d}</div>;
        })}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map(function (d, i) {
          var k = dayKey(d.year, d.month, d.day);
          var isToday = k === todayKey;
          var isSel = k === selKey;
          return (
            <div key={i} onClick={function () { pickDay(d); }}
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 13, borderRadius: "50%",
                cursor: "pointer", margin: "1px auto", transition: "background 0.1s",
                color: isSel ? "#0F1115" : d.adj ? T.txM : T.tx,
                background: isSel ? T.ac : "transparent",
                border: isToday && !isSel ? "1px solid " + T.ac : "1px solid transparent",
                fontWeight: isSel || isToday ? 600 : 400,
              }}
              onMouseEnter={function (e) { if (!isSel) e.currentTarget.style.background = T.sfH; }}
              onMouseLeave={function (e) { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              {d.day}
            </div>
          );
        })}
      </div>

      {/* Clear link */}
      {value != null && (
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <button onClick={clearDate}
            style={{ background: "none", border: "none", color: T.txM, fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}
            onMouseEnter={function (e) { e.currentTarget.style.color = T.tx; }}
            onMouseLeave={function (e) { e.currentTarget.style.color = T.txM; }}>
            Clear date
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
