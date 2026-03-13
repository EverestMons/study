import React from "react";
import { T, CSS } from "./lib/theme.jsx";
import { useStudy } from "./StudyContext.jsx";
import ErrorDisplay from "./components/ErrorDisplay.jsx";
import GlobalLockOverlay from "./components/GlobalLockOverlay.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import HomeScreen from "./screens/HomeScreen.jsx";
import UploadScreen from "./screens/UploadScreen.jsx";
import ManageScreen from "./screens/ManageScreen.jsx";
import NotifsScreen from "./screens/NotifsScreen.jsx";
import ProfileScreen from "./screens/ProfileScreen.jsx";
import MaterialsScreen from "./screens/MaterialsScreen.jsx";
import SkillsScreen from "./screens/SkillsScreen.jsx";
import ScheduleScreen from "./screens/ScheduleScreen.jsx";
import CurriculumScreen from "./screens/CurriculumScreen.jsx";
import StudyScreen from "./screens/StudyScreen.jsx";

function UpdateBanner() {
  const { updateInfo, updateStatus, doInstallUpdate, dismissUpdate } = useStudy();
  if (!updateInfo) return null;
  var currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?";
  var downloading = updateStatus === "downloading" || updateStatus === "installing";
  return (
    <div style={{ background: T.ac, color: T.bg, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 13, fontWeight: 500 }}>
      <span>Update available: v{currentVersion} → v{updateInfo.version}</span>
      <button
        onClick={doInstallUpdate}
        disabled={downloading}
        style={{ padding: "4px 14px", background: T.bg, color: T.ac, border: "none", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.7 : 1 }}>
        {downloading ? (updateStatus === "installing" ? "Installing..." : "Downloading...") : "Update Now"}
      </button>
      {!downloading && (
        <button onClick={dismissUpdate} style={{ background: "none", border: "none", color: T.bg, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, opacity: 0.7 }}>×</button>
      )}
    </div>
  );
}

export default function ScreenRouter() {
  const {
    asyncError, screen, active, ready,
    showSettings, globalLock, updateInfo,
  } = useStudy();

  if (asyncError) return <ErrorDisplay />;

  // --- Loading ---
  if (!ready) return (
    <div style={{ background: T.bg, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style><div style={{ color: T.txD }}>Loading...</div>
    </div>
  );

  // --- GLOBAL LOCK OVERLAY ---
  if (globalLock) return <GlobalLockOverlay />;

  // --- SETTINGS MODAL ---
  if (showSettings) return <SettingsModal />;

  // --- Screen content ---
  var content = null;
  if (screen === "home") content = <HomeScreen />;
  else if (screen === "profile") content = <ProfileScreen />;
  else if (screen === "upload") content = <UploadScreen />;
  else if (screen === "manage" && active) content = <ManageScreen />;
  else if (screen === "materials" && active) content = <MaterialsScreen />;
  else if (screen === "skills" && active) content = <SkillsScreen />;
  else if (screen === "schedule" && active) content = <ScheduleScreen />;
  else if (screen === "curriculum" && active) content = <CurriculumScreen />;
  else if (screen === "notifs" && active) content = <NotifsScreen />;
  else if (screen === "study" && active) content = <StudyScreen />;

  return (
    <>
      {updateInfo && <UpdateBanner />}
      {content}
    </>
  );
}
