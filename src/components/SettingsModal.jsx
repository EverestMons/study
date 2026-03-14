import React from "react";
import { T, CSS } from "../lib/theme.jsx";
import { getApiKey, setApiKey, getDb, getSetting, setSetting } from "../lib/db.js";
import { testApiKey } from "../lib/api.js";
import { useStudy } from "../StudyContext.jsx";

const OCR_LANGS = [
  { code: "eng", label: "English", locked: true },
  { code: "spa", label: "Spanish" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "por", label: "Portuguese" },
  { code: "ita", label: "Italian" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
  { code: "ara", label: "Arabic" },
];

export default function SettingsModal() {
  const {
    apiKeyInput, setApiKeyInput, apiKeyLoaded,
    keyVerifying, setKeyVerifying, keyError, setKeyError,
    showSettings, setShowSettings, setApiKeyLoaded,
    setProfileData, addNotif,
    updateStatus, checkUpdate, updateInfo, doInstallUpdate,
  } = useStudy();

  var [ocrLangs, setOcrLangs] = React.useState(["eng"]);
  var [ocrLangsLoaded, setOcrLangsLoaded] = React.useState(false);

  React.useEffect(() => {
    getSetting("ocr_languages").then(v => {
      try { if (v) setOcrLangs(JSON.parse(v)); } catch {}
      setOcrLangsLoaded(true);
    });
  }, []);

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
        {/* OCR Languages */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + T.bd }}>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>OCR Languages</div>
          <div style={{ fontSize: 11, color: T.txM, marginBottom: 10 }}>Select languages for scanned PDF recognition. Additional languages download ~4MB of data on first use.</div>
          {ocrLangsLoaded && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {OCR_LANGS.map(lang => {
                var active = ocrLangs.includes(lang.code);
                return (
                  <button key={lang.code} onClick={async () => {
                    if (lang.locked) return;
                    var next = active ? ocrLangs.filter(c => c !== lang.code) : [...ocrLangs, lang.code];
                    setOcrLangs(next);
                    await setSetting("ocr_languages", JSON.stringify(next));
                  }}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid " + (active ? T.ac : T.bd), background: active ? T.acS : "transparent", color: active ? T.ac : T.txD, cursor: lang.locked ? "default" : "pointer", opacity: lang.locked ? 0.7 : 1, fontWeight: active ? 600 : 400 }}>
                    {lang.label}{lang.locked ? " (required)" : ""}
                  </button>
                );
              })}
            </div>
          )}
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
        {/* App Updates */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + T.bd }}>
          <div style={{ fontSize: 12, color: T.txD, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>App Updates</div>
          {updateInfo ? (
            <button
              onClick={doInstallUpdate}
              disabled={updateStatus === "downloading" || updateStatus === "installing"}
              style={{ padding: "10px 16px", background: T.ac, border: "none", borderRadius: 8, color: T.bg, fontSize: 12, fontWeight: 600, cursor: updateStatus ? "default" : "pointer", width: "100%", transition: "all 0.15s ease", opacity: updateStatus ? 0.7 : 1 }}>
              {updateStatus === "installing" ? "Installing..." : updateStatus === "downloading" ? "Downloading..." : "Update to v" + updateInfo.version}
            </button>
          ) : (
            <button
              onClick={() => checkUpdate()}
              disabled={!!updateStatus}
              style={{ padding: "10px 16px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 8, color: updateStatus ? T.txD : T.tx, fontSize: 12, cursor: updateStatus ? "default" : "pointer", width: "100%", transition: "all 0.15s ease", opacity: updateStatus ? 0.6 : 1 }}
              onMouseEnter={e => { if (!updateStatus) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {updateStatus === "checking" ? "Checking..." : "Check for Updates"}
            </button>
          )}
          <div style={{ fontSize: 11, color: T.txM, marginTop: 6 }}>Current version: {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}</div>
        </div>
      </div>
    </div>
  );
}
