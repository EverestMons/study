import React, { useState, Component, createContext } from "react";
import { T, CSS } from "./lib/theme.jsx";
import { resetAll } from "./lib/db.js";
import { StudyProvider } from "./StudyContext.jsx";
import ScreenRouter from "./ScreenRouter.jsx";
export { CIP_DOMAINS } from "./lib/cipData.js";

// --- Error Context (for capturing app state in crash reports) ---
export const ErrorContext = createContext({ screen: "unknown", courseId: null, sessionMode: null });

// --- Error Boundary ---
class StudyErrorBoundary extends Component {
  static contextType = ErrorContext;
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, showNuclear: false, copyStatus: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  buildReport() {
    const err = this.state.error;
    const ctx = this.context || {};
    return [
      "STUDY CRASH REPORT",
      "==================",
      "Timestamp: " + new Date().toISOString(),
      "Screen: " + (ctx.screen || "unknown"),
      "Course ID: " + (ctx.courseId || "none"),
      "Session Mode: " + (ctx.sessionMode || "none"),
      "Storage: SQLite",
      "",
      "Error: " + (err.message || String(err)),
      "",
      "Stack:",
      (err.stack || "no stack").split("\n").slice(0, 10).join("\n"),
      "",
      "Component stack:",
      (this.state.info?.componentStack || "unavailable").trim().split("\n").slice(0, 6).join("\n"),
    ].join("\n");
  }
  handleCopy(report) {
    navigator.clipboard.writeText(report)
      .then(() => { this.setState({ copyStatus: "copied" }); setTimeout(() => this.setState({ copyStatus: null }), 2000); })
      .catch(() => { this.setState({ copyStatus: "failed" }); setTimeout(() => this.setState({ copyStatus: null }), 3000); });
  }
  handleSoftReset() {
    this.setState({ error: null, info: null, showNuclear: false });
  }
  async handleHardReset() {
    try {
      await resetAll({ confirmed: true });
    } catch (e) { console.error("Failed to clear database:", e); }
    window.location.reload();
  }
  render() {
    if (this.state.error) {
      const report = this.buildReport();
      const btnBase = { padding: "10px 20px", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", marginTop: 12 };
      return React.createElement("div", {
        style: { background: "#0F1115", minHeight: "100vh", padding: 32, fontFamily: "system-ui, -apple-system, sans-serif" }
      },
        React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } },
          React.createElement("div", { style: { fontSize: 20, color: "#F87171", marginBottom: 8, fontWeight: 700 } }, "Study crashed"),
          React.createElement("div", { style: { fontSize: 13, color: "#6B7280", marginBottom: 20 } },
            "Copy the error report below and paste it to Claude for debugging help."),
          React.createElement("textarea", {
            readOnly: true, value: report,
            onClick: function(e) { e.target.select(); },
            style: {
              width: "100%", minHeight: 280, background: "#1A1D24", color: "#E8EAF0",
              border: "1px solid #2A2F3A", borderRadius: 8, padding: 16, fontSize: 11,
              fontFamily: "SF Mono, Fira Code, Consolas, monospace", resize: "vertical", lineHeight: 1.5
            }
          }),
          React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            React.createElement("button", {
              onClick: () => this.handleCopy(report),
              style: { ...btnBase, background: this.state.copyStatus === "failed" ? "#E5484D" : "#6C9CFC", color: "#0F1115", fontWeight: 600 }
            }, this.state.copyStatus === "copied" ? "Copied!" : this.state.copyStatus === "failed" ? "Copy failed" : "Copy to clipboard"),
            React.createElement("button", {
              onClick: () => this.handleSoftReset(),
              style: { ...btnBase, background: "#22262F", color: "#E8EAF0", border: "1px solid #2A2F3A" }
            }, "Try to recover")
          ),
          React.createElement("div", { style: { marginTop: 32, paddingTop: 20, borderTop: "1px solid #2A2F3A" } },
            !this.state.showNuclear
              ? React.createElement("button", {
                  onClick: () => this.setState({ showNuclear: true }),
                  style: { ...btnBase, marginTop: 0, background: "transparent", color: "#6B7280", fontSize: 12, padding: "8px 0" }
                }, "Still crashing? Show reset options...")
              : React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 13, color: "#F87171", marginBottom: 12 } },
                    "\u26A0\uFE0F This will permanently delete all your courses and data."),
                  React.createElement("button", {
                    onClick: () => this.handleHardReset(),
                    style: { ...btnBase, marginTop: 0, background: "#7F1D1D", color: "#FEE2E2", fontWeight: 600 }
                  }, "Clear all data and restart"),
                  React.createElement("button", {
                    onClick: () => this.setState({ showNuclear: false }),
                    style: { ...btnBase, marginLeft: 8, background: "transparent", color: "#6B7280" }
                  }, "Cancel")
                )
          )
        )
      );
    }
    return this.props.children;
  }
}

// Wrapper that provides error context
function StudyInnerWithContext() {
  const [errorCtx, setErrorCtx] = useState({ screen: "loading", courseId: null, sessionMode: null });
  return React.createElement(
    ErrorContext.Provider,
    { value: errorCtx },
    React.createElement(StudyProvider, { setErrorCtx },
      React.createElement(ScreenRouter)
    )
  );
}

export default function Study() {
  return React.createElement(StudyErrorBoundary, null, React.createElement(StudyInnerWithContext));
}
