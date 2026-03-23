import React from "react";
import { T } from "../lib/theme.jsx";
import { useStudy } from "../StudyContext.jsx";

export default function TopBarButtons() {
  const { setShowSettings, navigateTo, setLastSeenNotif, notifs, lastSeenNotif, loadProfile } = useStudy();
  var unread = notifs.filter(function (n) { return n.time.getTime() > lastSeenNotif; }).length;
  var btnStyle = { background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "8px 14px", color: T.txD, cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={async function () { await loadProfile(); navigateTo("profile"); }}
        style={btnStyle}
        onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
        onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>
        View Profile
      </button>
      <button onClick={function () { navigateTo("notifs"); setLastSeenNotif(Date.now()); }}
        style={btnStyle}
        onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
        onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>
        Notifications{unread > 0 ? <span style={{ color: T.rd }}> ({unread})</span> : null}
      </button>
      <button onClick={function () { setShowSettings(true); }}
        style={btnStyle}
        onMouseEnter={function (e) { e.currentTarget.style.background = T.sfH; }}
        onMouseLeave={function (e) { e.currentTarget.style.background = T.sf; }}>
        Settings
      </button>
    </div>
  );
}
