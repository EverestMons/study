import React from "react";
import { T, renderMd } from "../../lib/theme.jsx";
import { parseSkillUpdates } from "../../lib/study.js";
import { MaterialImages } from "../../lib/db.js";
import { useStudy } from "../../StudyContext.jsx";

const CodeEditor = React.lazy(() => import("./CodeEditor.jsx"));

// --- Inline Chat Image Component ---
function InlineChatImage({ imageId, imageMap }) {
  var [loaded, setLoaded] = React.useState(false);
  var [error, setError] = React.useState(false);
  var [expanded, setExpanded] = React.useState(false);
  var [url, setUrl] = React.useState(null);
  var [hovering, setHovering] = React.useState(false);
  var [canExpand, setCanExpand] = React.useState(false);

  var image = imageMap[imageId];

  React.useEffect(() => {
    if (!image) { setError(true); return; }
    var cancelled = false;
    (async () => {
      try {
        const { getImageUrl } = await import('../../lib/imageStore.js');
        const u = await getImageUrl(image.file_path);
        if (!cancelled) setUrl(u);
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; };
  }, [image?.file_path]);

  if (!image || error) {
    return (
      <div style={{ background: T.bg, border: "1px solid " + T.bd, borderRadius: 10, overflow: "hidden", margin: "12px 0", maxWidth: 440 }}>
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: T.txM }}>Image unavailable</span>
        </div>
      </div>
    );
  }

  var typeLabel = image.image_type === "slide" ? "Slide" : image.image_type === "page" ? "Page" : image.image_type === "embedded" ? "Figure" : "Image";
  var label = typeLabel + " " + (image.page_or_slide_number || "");
  var alt = image.caption || label;

  return (
    <div style={{ background: T.bg, border: "1px solid " + T.bd, borderRadius: 10, overflow: "hidden", margin: "12px 0", maxWidth: 440 }}>
      <div style={{ position: "relative", cursor: canExpand ? "pointer" : "default" }}
        onClick={() => canExpand && setExpanded(!expanded)}
        onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
        tabIndex={canExpand ? 0 : undefined}
        role={canExpand ? "button" : undefined}
        aria-label={canExpand ? (expanded ? "Collapse image" : "Expand image: " + alt) : undefined}
        onKeyDown={canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } } : undefined}>
        {!loaded && !error && (
          <div style={{ width: "100%", height: 160, background: T.bg, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(90deg, transparent, rgba(108,156,252,0.06), transparent)", animation: "shimmer 1.5s ease-in-out infinite" }} />
          </div>
        )}
        {url && (
          <img src={url} alt={alt}
            onLoad={(e) => {
              setLoaded(true);
              var nw = e.target.naturalWidth, nh = e.target.naturalHeight;
              if (nw > 0) setCanExpand(nh / nw * 440 > 280);
            }}
            onError={() => setError(true)}
            style={{
              display: loaded ? "block" : "none",
              width: "100%",
              maxHeight: expanded ? "none" : 280,
              objectFit: expanded ? "contain" : "cover",
              animation: "fadeIn 0.25s"
            }}
          />
        )}
        {canExpand && loaded && hovering && (
          <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", padding: "3px 10px", borderRadius: 12, fontSize: 10, color: T.tx, transition: "opacity 0.15s" }}>
            {expanded ? "Click to collapse" : "Click to expand"}
          </div>
        )}
      </div>
      <div style={{ padding: "6px 12px", borderTop: "1px solid " + T.bd, background: T.sf, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.txD }}>{label}</span>
        {image.caption && <span style={{ fontSize: 11, color: T.txM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{image.caption}</span>}
      </div>
    </div>
  );
}

// --- Render assistant message with inline images ---
var IMG_TAG_RE = /\[SHOW_IMAGE\]\s*(img_[a-f0-9]+)\s*\[\/SHOW_IMAGE\]/g;

function renderMessageWithImages(content, imageMap) {
  if (!imageMap || Object.keys(imageMap).length === 0) return renderMd(content);

  // Find all image tags
  var matches = [];
  IMG_TAG_RE.lastIndex = 0;
  var mt;
  while ((mt = IMG_TAG_RE.exec(content)) !== null) {
    matches.push({ imageId: mt[1], start: mt.index, end: mt.index + mt[0].length });
  }
  if (matches.length === 0) return renderMd(content);

  // Cap at 3 images per message
  var capped = matches.slice(0, 3);
  var elements = [];
  var lastIdx = 0;

  for (var j = 0; j < capped.length; j++) {
    var tag = capped[j];
    var textBefore = content.substring(lastIdx, tag.start);
    if (textBefore.trim()) {
      elements.push(<React.Fragment key={"t" + j}>{renderMd(textBefore)}</React.Fragment>);
    }
    if (imageMap[tag.imageId]) {
      elements.push(<InlineChatImage key={"img" + j} imageId={tag.imageId} imageMap={imageMap} />);
    }
    lastIdx = tag.end;
  }

  // Remaining text after last image tag
  var tail = content.substring(lastIdx);
  if (tail.trim()) {
    elements.push(<React.Fragment key="tail">{renderMd(tail)}</React.Fragment>);
  }

  return elements;
}

export default function MessageList() {
  const {
    msgs, booting, status, processingMatId,
    cachedSessionCtx, extractionCancelledRef,
    endRef, timeAgo,
    sessionMasteryEvents,
    active,
  } = useStudy();

  // Load image map for current course
  var [imageMap, setImageMap] = React.useState({});
  React.useEffect(() => {
    if (!active?.id) { setImageMap({}); return; }
    var cancelled = false;
    (async () => {
      try {
        var images = await MaterialImages.getByCourse(active.id);
        if (cancelled) return;
        var map = {};
        for (var img of images) map['img_' + img.id.substring(0, 8)] = img;
        setImageMap(map);
      } catch { if (!cancelled) setImageMap({}); }
    })();
    return () => { cancelled = true; };
  }, [active?.id]);

  const ratingColor = { easy: T.gn, good: T.gn, hard: T.am, struggled: T.am };
  const ratingBg = { easy: T.gnS, good: T.gnS, hard: T.amS, struggled: T.amS };
  const RATING_DOTS = { easy: 5, good: 4, hard: 2, struggled: 1 };
  const formatKey = (k) => k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <>
      {msgs.map((m, i) => {
        const isUser = m.role === "user";
        const isAsst = m.role === "assistant";
        const ts = m.ts ? timeAgo(m.ts) : null;
        // Parse skill update pills from assistant messages
        const skillPills = isAsst && m.content ? parseSkillUpdates(m.content) : [];
        return (
        <div key={i} style={{ marginBottom: 28, animation: "fadeIn 0.25s", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
          {/* Thin separator before user messages (after the first) */}
          {isUser && i > 0 && <div style={{ width: "100%", height: 1, background: T.bd, opacity: 0.3, marginBottom: 20 }} />}
          {isAsst && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: T.ac, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>Study</div>
              {ts && <div style={{ fontSize: 10, color: T.txM }}>{ts}</div>}
            </div>
          )}
          <div style={{
            maxWidth: isUser ? "80%" : "100%",
            background: isUser ? T.acS : "transparent",
            border: isUser ? "1px solid " + T.acB : "none",
            borderLeft: isAsst ? "2px solid rgba(108,156,252,0.25)" : "none",
            borderRadius: isUser ? "16px 16px 4px 16px" : "0",
            padding: isUser ? "12px 16px" : "4px 0 4px 12px",
            color: T.tx, lineHeight: 1.7, fontSize: 15
          }}>
            {isAsst ? (m.content ? renderMessageWithImages(m.content, imageMap) : (
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 16, verticalAlign: "middle" }}>
                {[0, 1, 2].map(d => <span key={d} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.ac, animation: "dotPulse 1.2s ease-in-out infinite", animationDelay: (d * 0.2) + "s" }} />)}
              </span>
            )) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                {m.codeMode ? (
                  <React.Suspense fallback={<pre style={{ fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: "pre-wrap", color: T.ac }}>{m.content.replace(/^```\n?/, "").replace(/\n?```$/, "")}</pre>}>
                    <CodeEditor
                      value={m.content.replace(/^```\n?/, "").replace(/\n?```$/, "")}
                      language={m.detectedLanguage}
                      readOnly
                      minHeight={null}
                      maxHeight={null}
                      showLineNumbers
                      showLanguageBadge={false}
                    />
                  </React.Suspense>
                ) : (
                  <div>{m.content}</div>
                )}
                {ts && <div style={{ fontSize: 10, color: T.txM, marginTop: 4 }}>{ts}</div>}
              </div>
            )}
          </div>
          {/* Skill update pills — enhanced with facet sub-rows */}
          {skillPills.length > 0 && (
            <div style={{ marginTop: 6, paddingLeft: 12 }}>
              {skillPills.map((sp, si) => {
                const allSk = cachedSessionCtx.current?.skills || [];
                const sk = allSk.find(s => s.id === sp.skillId || s.conceptKey === sp.skillId);
                const hasFacets = sp.facets && sp.facets.length > 0;
                if (!hasFacets) {
                  return (
                    <span key={si} style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 12, background: ratingBg[sp.rating] || T.acS, color: ratingColor[sp.rating] || T.ac, fontWeight: 500, marginRight: 6, marginBottom: 4 }}>
                      {sk?.name || sp.skillId}: {sp.rating}
                    </span>
                  );
                }
                if (sp.facets.length === 1) {
                  const f = sp.facets[0];
                  return (
                    <div key={si} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, background: T.sf, border: "1px solid " + T.bd, borderRadius: 8, padding: "6px 10px", marginRight: 6, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ratingColor[f.rating] || T.ac, flexShrink: 0 }} />
                      <span style={{ color: T.txD }}>{formatKey(f.facetKey)}</span>
                      <span style={{ fontSize: 10, color: ratingColor[f.rating] || T.ac, fontWeight: 500 }}>{f.rating}</span>
                    </div>
                  );
                }
                return (
                  <div key={si} style={{ background: T.sf, border: "1px solid " + T.bd, borderRadius: 10, padding: "10px 14px", marginTop: si > 0 ? 8 : 0, marginBottom: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{sk?.name || sp.skillId}</span>
                      <span style={{ fontSize: 11, color: ratingColor[sp.rating] || T.ac, fontWeight: 500 }}>{sp.rating}</span>
                    </div>
                    {sp.facets.map((f, fi) => {
                      const filled = RATING_DOTS[f.rating] || 3;
                      const isLast = fi === sp.facets.length - 1;
                      return (
                        <div key={fi} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: T.txD }}>
                          <span style={{ color: T.bd, fontSize: 10, width: 10, textAlign: "center" }}>{isLast ? "\u2514" : "\u251C"}</span>
                          <span style={{ flex: 1 }}>{formatKey(f.facetKey)}</span>
                          <span style={{ display: "inline-flex", gap: 2 }}>
                            {[1,2,3,4,5].map(d => (
                              <span key={d} style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: d <= filled ? (ratingColor[f.rating] || T.ac) : T.bd }} />
                            ))}
                          </span>
                          <span style={{ fontSize: 10, color: ratingColor[f.rating] || T.ac, minWidth: 48, textAlign: "right" }}>{f.rating}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {/* Inline mastery celebration cards */}
          {isAsst && sessionMasteryEvents.current && sessionMasteryEvents.current.filter(me => me.messageIndex === i).map((me, mi) => (
            <div key={"mastery-" + mi} style={{ maxWidth: "80%", margin: "20px auto", animation: "fadeIn 0.3s" }}>
              <div style={{ background: T.sf, border: "1px solid " + T.gn, borderRadius: 14, padding: "20px 24px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, marginBottom: 4 }}>{me.skillName}</div>
                <div style={{ height: 1, background: T.bd, margin: "8px 0 12px" }} />
                {(() => { var displayLevel = Math.max(me.levelAfter, me.levelBefore); return me.levelBefore !== displayLevel ? (
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                    <span style={{ color: T.ac }}>Lv {me.levelBefore}</span>
                    <span style={{ color: T.txD, margin: "0 8px" }}>{"\u2192"}</span>
                    <span style={{ color: T.ac }}>Lv {displayLevel}</span>
                  </div>
                ) : null; })()}
                {me.facets.map((f, fi) => (
                  <div key={fi} style={{ display: "flex", gap: 8, padding: "4px 0", alignItems: "center" }}>
                    <span style={{ color: T.gn, fontSize: 13, fontWeight: 600 }}>{"\u2713"}</span>
                    <span style={{ fontSize: 13, color: T.tx, flex: 1 }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: f.rating === "easy" || f.rating === "good" ? T.gn : T.am }}>{f.rating}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: T.txM, marginTop: 12 }}>
                  {me.nextReviewDays > 14
                    ? "Next review in " + me.nextReviewDays + " days \u2014 well locked in"
                    : "Next review in " + me.nextReviewDays + " day" + (me.nextReviewDays !== 1 ? "s" : "")}
                </div>
              </div>
            </div>
          ))}
        </div>
        );
      })}
      {/* Books loader — only during boot before streaming starts (status text visible) */}
      {booting && status && !(msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && msgs[msgs.length - 1].content !== undefined) && !processingMatId && (
        <div style={{ padding: "16px 0", animation: "fadeIn 0.2s" }}>
          <div style={{ fontSize: 11, color: T.ac, marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{status || "Reading materials..."}</div>
          <svg width="64" height="28" viewBox="0 0 64 28" style={{ display: "block" }}>
            <rect x="2" y="24" width="60" height="2" rx="1" fill={T.bd} style={{ animation: "shelfPulse 2s ease-in-out infinite" }} />
            <rect x="8" y="10" width="6" height="14" rx="1" fill={T.ac} style={{ animation: "bookSlide1 3.2s ease-in-out infinite" }} />
            <rect x="16" y="12" width="5" height="12" rx="1" fill="#F59E0B" style={{ animation: "bookSlide2 2.8s ease-in-out 0.3s infinite" }} />
            <rect x="23" y="8" width="7" height="16" rx="1" fill={T.ac} opacity="0.6" style={{ animation: "bookSlide3 3.5s ease-in-out 0.6s infinite" }} />
            <rect x="32" y="14" width="5" height="10" rx="1" fill="#8B5CF6" style={{ animation: "bookSlide4 3s ease-in-out 0.15s infinite" }} />
            <rect x="39" y="11" width="6" height="13" rx="1" fill={T.ac} opacity="0.8" style={{ animation: "bookSlide1 3.4s ease-in-out 0.8s infinite" }} />
            <rect x="47" y="13" width="5" height="11" rx="1" fill="#F59E0B" opacity="0.7" style={{ animation: "bookSlide2 3.1s ease-in-out 0.5s infinite" }} />
          </svg>
          {status.toLowerCase().includes("extract") && (
            <button onClick={() => { extractionCancelledRef.current = true; }}
              style={{ marginTop: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + T.bd, borderRadius: 6, fontSize: 11, color: T.txD, cursor: "pointer" }}>
              Stop extraction
            </button>
          )}
        </div>
      )}
      <div ref={endRef} />
    </>
  );
}
