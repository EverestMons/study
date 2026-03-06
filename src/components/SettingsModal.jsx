import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { getApiKey, setApiKey, getDb } from "../lib/db.js";
import { testApiKey } from "../lib/api.js";
import { useStudy } from "../StudyContext.jsx";

export default function SettingsModal() {
  const {
    apiKeyInput, setApiKeyInput, apiKeyLoaded,
    keyVerifying, setKeyVerifying, keyError, setKeyError,
    showSettings, setShowSettings, setApiKeyLoaded,
    setProfileData, addNotif,
  } = useStudy();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <style>{CSS}</style>
      <div style={{ background: T.sf, borderRadius: 16, padding: 28, maxWidth: 420, width: "90%" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginBottom: 20 }}>Settings</div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Anthropic API Key</div>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => { setApiKeyInput(e.target.value); setKeyError(""); }}
            placeholder="sk-ant-..."
            style={{ width: "100%", padding: 14, background: T.bg, border: "1px solid " + (keyError ? T.rd : T.bd), borderRadius: 8, color: T.tx, fontSize: 14, outline: "none" }}
          />
          {keyError && (
            <div style={{ fontSize: 12, color: T.rd, marginTop: 8 }}>{keyError}</div>
          )}
          <div style={{ fontSize: 11, color: T.txD, marginTop: 8 }}>
            Get your key from <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: T.ac }}>console.anthropic.com</a>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {apiKeyLoaded && apiKeyInput && (
            <button onClick={async () => { setShowSettings(false); setApiKeyInput(await getApiKey()); setKeyError(""); }}
              disabled={keyVerifying}
              style={{ flex: 1, padding: 14, background: "transparent", border: "1px solid " + T.bd, borderRadius: 8, color: T.txD, cursor: keyVerifying ? "default" : "pointer", opacity: keyVerifying ? 0.5 : 1 }}>
              Cancel
            </button>
          )}
          <button onClick={async () => {
              var key = apiKeyInput.trim();
              if (!key) return;
              setKeyVerifying(true);
              setKeyError("");
              var result = await testApiKey(key);
              setKeyVerifying(false);
              if (result.valid) {
                await setApiKey(key);
                setShowSettings(false);
                addNotif("success", "API key verified and saved");
              } else {
                setKeyError(result.error || "Invalid API key");
              }
            }}
            disabled={!apiKeyInput.trim() || keyVerifying}
            style={{ flex: 1, padding: 14, background: !apiKeyInput.trim() || keyVerifying ? T.sfH : T.ac, border: "none", borderRadius: 8, color: !apiKeyInput.trim() || keyVerifying ? T.txD : T.bg, fontWeight: 600, cursor: !apiKeyInput.trim() || keyVerifying ? "default" : "pointer" }}>
            {keyVerifying ? "Verifying..." : "Save"}
          </button>
        </div>
        {/* Dev: Reset skill data */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + T.bd }}>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Data Management</div>
          <button onClick={async () => {
            try {
              const rawDb = await getDb();
              await rawDb.execute("DELETE FROM skill_prerequisites");
              await rawDb.execute("DELETE FROM chunk_skill_bindings");
              await rawDb.execute("DELETE FROM sub_skill_mastery");
              await rawDb.execute("DELETE FROM sub_skills");
              await rawDb.execute("DELETE FROM parent_skills");
              await rawDb.execute("DELETE FROM settings WHERE key LIKE '%asgn%'");
              setProfileData(null);
              addNotif("success", "Skill data reset. Re-extract from materials to rebuild.");
              setShowSettings(false);
            } catch (e) {
              addNotif("error", "Reset failed: " + e.message);
            }
          }}
            style={{ padding: "10px 16px", background: "transparent", border: "1px solid " + T.rd, borderRadius: 8, color: T.rd, fontSize: 12, cursor: "pointer", width: "100%", transition: "all 0.15s ease" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            Reset Skill Data
          </button>
          <div style={{ fontSize: 11, color: T.txM, marginTop: 6 }}>Removes all skills, mastery, and progress. Keeps courses and materials.</div>
        </div>
      </div>
    </div>
  );
}
