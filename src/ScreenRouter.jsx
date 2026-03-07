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
import StudyScreen from "./screens/StudyScreen.jsx";

export default function ScreenRouter() {
  const {
    asyncError, screen, active, ready,
    showSettings, globalLock,
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

  // --- HOME SCREEN ---
  if (screen === "home") return <HomeScreen />;

  // --- PROFILE SCREEN ---
  if (screen === "profile") return <ProfileScreen />;

  // --- UPLOAD SCREEN ---
  if (screen === "upload") return <UploadScreen />;

  // --- COURSE MANAGEMENT SCREEN ---
  if (screen === "manage" && active) return <ManageScreen />;

  // --- MATERIALS SCREEN ---
  if (screen === "materials" && active) return <MaterialsScreen />;

  // --- SKILLS SCREEN ---
  if (screen === "skills" && active) return <SkillsScreen />;

  // --- NOTIFICATIONS SCREEN ---
  if (screen === "notifs" && active) return <NotifsScreen />;

  // --- STUDY / CHAT SCREEN ---
  if (screen === "study" && active) return <StudyScreen />;

  return null;
}
