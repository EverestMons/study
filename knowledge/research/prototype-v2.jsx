import { useState, useEffect, useRef, useCallback } from "react";

// ─── FONTS ───
const FONT_DISPLAY = "'Cinzel', 'Palatino Linotype', 'Book Antiqua', serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";
const FONT_BODY = "'DM Sans', 'Segoe UI', system-ui, sans-serif";

// ─── SAMPLE DATA ───
const SAMPLE_COFFEE = {
  name: "Ethiopia Yirgacheffe",
  roaster: "Onyx Coffee Lab",
  origin: "Ethiopia",
  roastLevel: "Light",
  colorIndex: 1,
};

const PALETTES = [
  ["#0a0d3d", "#1a1d6e", "#2b4c9e"],
  ["#1a0d3d", "#2d1a6e", "#4b2b9e"],
  ["#2d0d3d", "#4a1a6e", "#6e2b9e"],
  ["#3d0d2d", "#6e1a4a", "#9e2b6e"],
  ["#3d0d0d", "#6e1a1a", "#9e2b2b"],
];

const QUANTITIES = [
  { label: "×0.5", multiplier: 0.5, version: 1 },
  { label: "×1", multiplier: 1.0, version: 3 },
  { label: "×2", multiplier: 2.0, version: 1 },
  { label: "×3", multiplier: 3.0, version: 1 },
];

const BASE_OUTPUT = 400;
const BASE_INPUT = 25;
const BASE_GRIND = 20;

function getRecipePhases(multiplier) {
  const output = BASE_OUTPUT * multiplier;
  const bloomWeight = Math.round((output * 0.1) / 5) * 5;
  const remaining = output - bloomWeight;
  const perPour = Math.round((remaining / 4) / 5) * 5;

  return [
    { name: "Bloom", targetWeight: bloomWeight, cumulativeWeight: bloomWeight, pourDuration: 10, startTime: 0, waitUntil: 40 },
    { name: "Pour 1", targetWeight: perPour, cumulativeWeight: bloomWeight + perPour, pourDuration: 15, startTime: 40, waitUntil: 80 },
    { name: "Pour 2", targetWeight: perPour, cumulativeWeight: bloomWeight + perPour * 2, pourDuration: 15, startTime: 80, waitUntil: 120 },
    { name: "Pour 3", targetWeight: perPour, cumulativeWeight: bloomWeight + perPour * 3, pourDuration: 15, startTime: 120, waitUntil: 160 },
    { name: "Pour 4", targetWeight: perPour, cumulativeWeight: output, pourDuration: 10, startTime: 160, waitUntil: 210 },
  ];
}

// ─── PIXEL KETTLE SVG ───
function PixelKettle({ pouring, size = 48, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }}>
      <rect x="3" y="5" width="8" height="6" fill={color} rx="1" />
      <rect x="11" y="5" width="2" height="2" fill={color} />
      <rect x="13" y="6" width="1" height="1" fill={color} />
      <rect x="1" y="5" width="2" height="1" fill={color} />
      <rect x="1" y="5" width="1" height="4" fill={color} />
      <rect x="1" y="9" width="2" height="1" fill={color} />
      <rect x="5" y="4" width="4" height="1" fill={color} />
      <rect x="6" y="3" width="2" height="1" fill={color} />
      {pouring && (
        <>
          <rect x="13" y="8" width="1" height="1" fill={color}>
            <animate attributeName="y" values="8;12;8" dur="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite" />
          </rect>
          <rect x="14" y="9" width="1" height="1" fill={color}>
            <animate attributeName="y" values="9;13;9" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.2;0.7" dur="0.8s" repeatCount="indefinite" />
          </rect>
        </>
      )}
    </svg>
  );
}

// ─── PIXEL MUG SVG ───
function PixelMug({ palette, size = 160 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ imageRendering: "pixelated" }}>
      {/* Steam wisps */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={8 + i * 3} y="2" width="1" height="2" fill="rgba(255,255,255,0.35)" rx="0.5">
          <animate attributeName="y" values={`${3 - i};${1 - i};${3 - i}`} dur={`${1.8 + i * 0.4}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0.15;0.4" dur={`${1.8 + i * 0.4}s`} repeatCount="indefinite" />
        </rect>
      ))}
      {/* Mug body */}
      <rect x="5" y="9" width="10" height="9" fill="rgba(255,255,255,0.85)" rx="1" />
      {/* Coffee surface */}
      <rect x="6" y="10" width="8" height="2" fill={palette[2]} />
      {/* Handle */}
      <rect x="15" y="11" width="3" height="1" fill="rgba(255,255,255,0.85)" />
      <rect x="17" y="11" width="1" height="4" fill="rgba(255,255,255,0.85)" />
      <rect x="15" y="15" width="3" height="1" fill="rgba(255,255,255,0.85)" />
      {/* Saucer */}
      <rect x="3" y="18" width="14" height="2" fill="rgba(255,255,255,0.55)" rx="1" />
    </svg>
  );
}

// ─── TIMER RING ───
function TimerRing({ progress, radius, strokeWidth, color, glow = false }) {
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - Math.min(Math.max(progress, 0), 1) * circumference;

  return (
    <circle
      cx="160" cy="160" r={radius}
      fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round"
      strokeDasharray={circumference} strokeDashoffset={offset}
      style={{
        transition: "stroke-dashoffset 0.15s linear, opacity 0.3s ease",
        transform: "rotate(-90deg)", transformOrigin: "160px 160px",
        filter: glow ? `drop-shadow(0 0 6px ${color})` : "none",
      }}
    />
  );
}

// ─── SCREEN 1: QUANTITY SELECTOR ───
function QuantityScreen({ coffee, onStart }) {
  const [selectedIdx, setSelectedIdx] = useState(1);
  const selected = QUANTITIES[selectedIdx];
  const palette = PALETTES[coffee.colorIndex];
  const coffeeOut = Math.round(BASE_OUTPUT * selected.multiplier);
  const coffeeIn = Math.round(BASE_INPUT * selected.multiplier * 10) / 10;

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(155deg, ${palette[0]} 0%, ${palette[1]} 50%, ${palette[2]} 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px", fontFamily: FONT_BODY,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      {/* Coffee info */}
      <div style={{ textAlign: "center", marginBottom: 48, zIndex: 1 }}>
        <div style={{
          fontSize: 14, color: "rgba(255,255,255,0.5)", letterSpacing: 3,
          textTransform: "uppercase", marginBottom: 8,
        }}>
          Brewing
        </div>
        <div style={{ fontSize: 28, color: "#fff", fontFamily: FONT_DISPLAY, fontWeight: 400, lineHeight: 1.3 }}>
          {coffee.roaster}
        </div>
        <div style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", fontFamily: FONT_DISPLAY, marginTop: 4 }}>
          {coffee.origin}
        </div>
      </div>

      {/* Quantity selector circles */}
      <div style={{ display: "flex", gap: 12, marginBottom: 40, zIndex: 1 }}>
        {QUANTITIES.map((q, i) => {
          const isSelected = i === selectedIdx;
          return (
            <button
              key={q.label}
              onClick={() => setSelectedIdx(i)}
              style={{
                width: 76, height: 76, borderRadius: "50%",
                border: isSelected ? "2px solid rgba(255,255,255,0.9)" : "1.5px solid rgba(255,255,255,0.2)",
                background: isSelected ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                color: isSelected ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 16, fontWeight: 600, fontFamily: FONT_MONO,
                cursor: "pointer", transition: "all 0.25s ease",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                boxShadow: isSelected ? "0 0 20px rgba(255,255,255,0.1)" : "none",
                padding: 0, lineHeight: 1.15,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>{q.label}</span>
              <span style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>
                {Math.round(BASE_OUTPUT * q.multiplier)}g
              </span>
              <span style={{ fontSize: 8, opacity: 0.4, marginTop: 1, fontWeight: 400 }}>
                v{q.version}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recipe summary card */}
      <div style={{
        background: "rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 28px",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)",
        marginBottom: 48, width: "100%", maxWidth: 320, zIndex: 1,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              Coffee In
            </div>
            <div style={{ fontSize: 24, color: "#fff", fontFamily: FONT_MONO, fontWeight: 600 }}>
              {coffeeIn}g
            </div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.15)", margin: "0 16px" }} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              Coffee Out
            </div>
            <div style={{ fontSize: 24, color: "#fff", fontFamily: FONT_MONO, fontWeight: 600 }}>
              {coffeeOut}g
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
            Grind Size
          </div>
          <div style={{ fontSize: 20, color: "#fff", fontFamily: FONT_MONO, fontWeight: 600 }}>
            {BASE_GRIND}
          </div>
        </div>
      </div>

      {/* Start brew button */}
      <button
        onClick={() => onStart(selected.multiplier)}
        style={{
          width: 140, height: 140, borderRadius: "50%",
          background: `linear-gradient(135deg, ${palette[1]}, ${palette[2]})`,
          border: "2px solid rgba(255,255,255,0.2)",
          color: "#fff", fontSize: 18, fontWeight: 600,
          fontFamily: FONT_DISPLAY, cursor: "pointer",
          boxShadow: `0 8px 32px ${palette[0]}80`,
          transition: "transform 0.2s ease", zIndex: 1,
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        Start Brew
      </button>
    </div>
  );
}

// ─── SCREEN 2: TIMER ───
function TimerScreen({ coffee, multiplier, onFinish }) {
  const palette = PALETTES[coffee.colorIndex];
  const phases = getRecipePhases(multiplier);

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [brewStartTime, setBrewStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [pourStartTime, setPourStartTime] = useState(null);
  const [pourElapsed, setPourElapsed] = useState(0);
  const [waitStartTime, setWaitStartTime] = useState(null);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [waitDuration, setWaitDuration] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Fade states — elements animate in/out, circle never moves
  const [showDots, setShowDots] = useState(false);
  const [showButton, setShowButton] = useState(false);

  const phase = phases[phaseIndex];
  const isLastPhase = phaseIndex === phases.length - 1;
  const hasStarted = brewStartTime !== null;

  // Tick
  useEffect(() => {
    if (!brewStartTime || isFinished) return;
    const id = setInterval(() => {
      const now = Date.now();
      setElapsed((now - brewStartTime) / 1000);
      if (pourStartTime) setPourElapsed((now - pourStartTime) / 1000);
      if (waitStartTime) setWaitElapsed((now - waitStartTime) / 1000);
    }, 50);
    return () => clearInterval(id);
  }, [brewStartTime, pourStartTime, waitStartTime, isFinished]);

  const pourProgress = isPouring && phase ? Math.min(pourElapsed / phase.pourDuration, 1) : 0;
  const waitProgress = waitStartTime && waitDuration > 0 ? Math.min(waitElapsed / waitDuration, 1) : 0;

  const startPour = () => {
    const now = Date.now();
    if (!brewStartTime) {
      setBrewStartTime(now);
      // Fade in dots and button after first tap
      setTimeout(() => setShowDots(true), 100);
      setTimeout(() => setShowButton(true), 300);
    }
    setIsPouring(true);
    setPourStartTime(now);
    setPourElapsed(0);
    setWaitStartTime(null);
    setWaitElapsed(0);
  };

  const endPour = () => {
    setIsPouring(false);
    setPourStartTime(null);
    setPourElapsed(0);

    const currentElapsed = (Date.now() - brewStartTime) / 1000;
    if (isLastPhase) {
      setWaitStartTime(Date.now());
      setWaitDuration(Math.max(phase.waitUntil - currentElapsed, 5));
    } else {
      const nextStart = phases[phaseIndex + 1].startTime;
      setWaitDuration(Math.max(nextStart - currentElapsed, 2));
      setWaitStartTime(Date.now());
    }
  };

  const advancePhase = () => {
    if (isLastPhase) return;
    setPhaseIndex((i) => i + 1);
    setWaitStartTime(null);
    setWaitElapsed(0);
    setWaitDuration(0);
  };

  useEffect(() => {
    if (waitProgress >= 1 && !isPouring && !isFinished && !isLastPhase) {
      advancePhase();
    }
  }, [waitProgress]);

  const handleCircleTap = () => {
    if (isFinished) return;
    if (!hasStarted) {
      startPour();
    } else if (isPouring) {
      endPour();
    } else if (waitStartTime && !isLastPhase) {
      advancePhase();
      setTimeout(() => startPour(), 50);
    }
  };

  const handleButtonTap = () => {
    if (isFinished) {
      onFinish();
      return;
    }
    if (!isPouring && !waitStartTime) {
      startPour();
    } else if (isPouring) {
      endPour();
    } else if (waitStartTime && isLastPhase) {
      setIsFinished(true);
    } else if (waitStartTime && !isLastPhase) {
      advancePhase();
      setTimeout(() => startPour(), 50);
    }
  };

  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}`;
  };

  // Center display — adapts to state
  const centerContent = () => {
    if (!hasStarted) {
      return { big: `${phase.targetWeight}g`, small: phase.name, instruction: "Tap to begin" };
    }
    if (isFinished) {
      return { big: fmtTime(elapsed), small: "Brew complete", instruction: "" };
    }
    if (isPouring) {
      return { big: `${phase.cumulativeWeight}g`, small: phase.name, instruction: "POUR" };
    }
    const waitRemaining = Math.max(0, waitDuration - waitElapsed);
    return {
      big: fmtTime(waitRemaining),
      small: isLastPhase ? "Draining" : "Dripping",
      instruction: "WAIT",
    };
  };
  const center = centerContent();

  const buttonLabel = () => {
    if (isFinished) return "Continue";
    if (isPouring) return "Stop";
    if (waitStartTime && isLastPhase) return "Finish\nBrew";
    return "Start";
  };

  const buttonColor = () => {
    if (isPouring) return "linear-gradient(135deg, #6B1A1A, #9E2B2B)";
    if (isFinished) return `linear-gradient(135deg, ${palette[1]}, ${palette[2]})`;
    return "linear-gradient(135deg, #1A6E4A, #2B9E6E)";
  };

  const pourRingColor = "#4ADE80";

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(155deg, ${palette[0]} 0%, ${palette[1]} 50%, ${palette[2]} 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT_BODY, position: "relative", overflow: "hidden",
    }}>
      {/* Fixed layout container — circle always centered */}
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>

        {/* Phase dots — fade up from above circle */}
        <div style={{
          height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, marginBottom: 16,
          opacity: showDots ? 1 : 0,
          transform: showDots ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>
          {phases.map((p, i) => (
            <div key={p.name} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < phaseIndex ? pourRingColor : i === phaseIndex ? "#fff" : "rgba(255,255,255,0.2)",
              transition: "all 0.3s ease",
              boxShadow: i === phaseIndex ? "0 0 8px rgba(255,255,255,0.4)" : "none",
            }} />
          ))}
        </div>

        {/* Timer circle — POSITION LOCKED */}
        <div
          style={{ position: "relative", width: 320, height: 320, cursor: "pointer" }}
          onClick={handleCircleTap}
        >
          <svg width="320" height="320" viewBox="0 0 320 320">
            {/* Track backgrounds */}
            <circle cx="160" cy="160" r="140" fill="none" stroke="rgba(74,222,128,0.1)" strokeWidth="8" />
            <circle cx="160" cy="160" r="126" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />

            {/* Inner disc */}
            <circle cx="160" cy="160" r="112"
              fill={isPouring ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.02)"}
              style={{ transition: "fill 0.4s ease" }}
            />

            {/* Pour ring (outer) */}
            <TimerRing progress={pourProgress} radius={140} strokeWidth={8} color={pourRingColor} glow={isPouring} />

            {/* Wait ring (inner) */}
            <TimerRing progress={waitProgress} radius={126} strokeWidth={5} color="rgba(255,255,255,0.45)" />
          </svg>

          {/* Center content */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            userSelect: "none",
          }}>
            {center.instruction && (
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 3,
                textTransform: "uppercase",
                color: isPouring ? pourRingColor : "rgba(255,255,255,0.35)",
                marginBottom: 4, fontFamily: FONT_BODY,
                transition: "color 0.3s ease",
              }}>
                {center.instruction}
              </div>
            )}

            <div style={{
              fontSize: 48, fontWeight: 700, color: "#fff",
              fontFamily: FONT_MONO, lineHeight: 1,
            }}>
              {center.big}
            </div>

            <div style={{
              fontSize: 14, color: "rgba(255,255,255,0.55)",
              marginTop: 6, fontFamily: FONT_DISPLAY,
            }}>
              {center.small}
            </div>

            {(!hasStarted || isPouring) && (
              <div style={{
                marginTop: 10,
                opacity: isPouring ? 1 : 0.4,
                transition: "opacity 0.3s ease",
              }}>
                <PixelKettle pouring={isPouring} size={36} color="#fff" />
              </div>
            )}
          </div>
        </div>

        {/* Action button — fades down from below circle */}
        <div style={{
          height: 140, marginTop: 24,
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          opacity: showButton ? 1 : 0,
          transform: showButton ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s",
          pointerEvents: showButton ? "auto" : "none",
        }}>
          <button
            onClick={handleButtonTap}
            style={{
              width: 110, height: 110, borderRadius: "50%",
              background: buttonColor(),
              border: "2px solid rgba(255,255,255,0.12)",
              color: "#fff", fontSize: 14, fontWeight: 700,
              fontFamily: FONT_DISPLAY, cursor: "pointer",
              transition: "all 0.25s ease",
              boxShadow: isPouring
                ? "0 4px 20px rgba(158,43,43,0.35)"
                : "0 4px 20px rgba(43,158,110,0.25)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 2, whiteSpace: "pre-line", textAlign: "center",
              lineHeight: 1.3,
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.93)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {isPouring && <PixelKettle pouring={true} size={24} color="#fff" />}
            <span>{buttonLabel()}</span>
          </button>
        </div>
      </div>

      {/* Elapsed time (subtle, bottom) */}
      {hasStarted && !isFinished && (
        <div style={{
          position: "absolute", bottom: 24,
          fontSize: 12, color: "rgba(255,255,255,0.2)",
          fontFamily: FONT_MONO,
          opacity: showDots ? 1 : 0,
          transition: "opacity 0.6s ease",
        }}>
          {fmtTime(elapsed)} elapsed
        </div>
      )}
    </div>
  );
}

// ─── SCREEN 3: TRANSITION (gentle, no text, mug rises) ───
function TransitionScreen({ coffee, onComplete }) {
  const palette = PALETTES[coffee.colorIndex];
  const [mugY, setMugY] = useState(100); // starts below
  const [mugOpacity, setMugOpacity] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Mug rises in
    const riseIn = setTimeout(() => {
      setMugY(0);
      setMugOpacity(1);
    }, 200);

    // Begin fade out
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
      setMugOpacity(0);
      setMugY(-30);
    }, 3200);

    // Complete transition
    const completeTimer = setTimeout(onComplete, 4200);

    return () => {
      clearTimeout(riseIn);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(155deg, ${palette[0]} 0%, ${palette[1]} 50%, ${palette[2]} 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT_BODY, overflow: "hidden",
    }}>
      <div style={{
        transform: `translateY(${mugY}px)`,
        opacity: mugOpacity,
        transition: fadeOut
          ? "transform 1.2s ease-in, opacity 1.2s ease-in"
          : "transform 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 1.5s ease",
      }}>
        <PixelMug palette={palette} size={160} />
      </div>
    </div>
  );
}

// ─── SCREEN 4: RATING ───
function RatingScreen({ coffee, onRate, onDismiss }) {
  const palette = PALETTES[coffee.colorIndex];
  const [rating, setRating] = useState(null);
  const [showVersionPrompt, setShowVersionPrompt] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 50);
  }, []);

  const handleRate = (stars) => {
    setRating(stars);
    if (stars < 5) {
      setTimeout(() => setShowVersionPrompt(true), 400);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(155deg, ${palette[0]}30 0%, ${palette[1]}20 50%, ${palette[2]}15 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px", fontFamily: FONT_BODY,
      opacity: fadeIn ? 1 : 0,
      transition: "opacity 0.8s ease",
    }}>
      {/* Dismiss */}
      <button onClick={onDismiss} style={{
        position: "absolute", top: 20, right: 20,
        background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "50%",
        width: 36, height: 36, cursor: "pointer",
        color: "rgba(0,0,0,0.3)", fontSize: 18,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        ✕
      </button>

      <div style={{
        fontSize: 22, fontFamily: FONT_DISPLAY,
        color: "#1a1a2e", marginBottom: 32, opacity: 0.8,
      }}>
        Rate This Brew
      </div>

      {/* Stars */}
      <div style={{ display: "flex", gap: 12, marginBottom: 40 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} onClick={() => handleRate(star)} style={{
            background: "none", border: "none", fontSize: 44, cursor: "pointer",
            color: star <= (rating || 0) ? palette[2] : "rgba(0,0,0,0.1)",
            transition: "all 0.2s ease",
            transform: star <= (rating || 0) ? "scale(1.1)" : "scale(1)",
            filter: star <= (rating || 0) ? `drop-shadow(0 2px 8px ${palette[2]}50)` : "none",
          }}>
            ★
          </button>
        ))}
      </div>

      {/* Extraction question + new version prompt */}
      {showVersionPrompt && rating < 5 && (
        <div style={{
          background: "rgba(255,255,255,0.6)", borderRadius: 16,
          padding: "24px 28px", maxWidth: 320, width: "100%",
          backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.7)",
          textAlign: "center",
          opacity: showVersionPrompt ? 1 : 0,
          transform: showVersionPrompt ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}>
          <div style={{ fontSize: 15, color: "#1a1a2e", marginBottom: 16, fontWeight: 600 }}>
            Over-extracted or under-extracted?
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            {["Over", "Under"].map((label) => (
              <button key={label} style={{
                padding: "10px 22px", borderRadius: 24,
                background: `linear-gradient(135deg, ${palette[1]}90, ${palette[2]}90)`,
                border: "none", color: "#fff", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
                transition: "transform 0.15s ease",
              }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {label}
              </button>
            ))}
          </div>
          <button style={{
            marginTop: 20, background: "none", border: "none",
            color: palette[2], fontSize: 14, fontWeight: 600,
            cursor: "pointer", opacity: 0.8,
          }}>
            Create new version →
          </button>
        </div>
      )}

      {/* 5-star save */}
      {rating === 5 && (
        <button onClick={() => onRate(rating)} style={{
          width: 120, height: 120, borderRadius: "50%",
          background: `linear-gradient(135deg, ${palette[1]}, ${palette[2]})`,
          border: "2px solid rgba(255,255,255,0.15)",
          color: "#fff", fontSize: 15, fontWeight: 600,
          fontFamily: FONT_DISPLAY, cursor: "pointer",
          boxShadow: `0 8px 32px ${palette[0]}40`,
          opacity: rating ? 1 : 0,
          transform: rating ? "scale(1)" : "scale(0.9)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}>
          Save
        </button>
      )}
    </div>
  );
}

// ─── MAIN APP ───
export default function CoffeeBuddyPrototype() {
  const [screen, setScreen] = useState("quantity");
  const [multiplier, setMultiplier] = useState(1.0);
  const coffee = SAMPLE_COFFEE;

  if (screen === "quantity") {
    return <QuantityScreen coffee={coffee} onStart={(m) => { setMultiplier(m); setScreen("timer"); }} />;
  }
  if (screen === "timer") {
    return <TimerScreen coffee={coffee} multiplier={multiplier} onFinish={() => setScreen("transition")} />;
  }
  if (screen === "transition") {
    return <TransitionScreen coffee={coffee} onComplete={() => setScreen("rating")} />;
  }
  if (screen === "rating") {
    return <RatingScreen coffee={coffee} onRate={() => setScreen("quantity")} onDismiss={() => setScreen("quantity")} />;
  }
  return null;
}
