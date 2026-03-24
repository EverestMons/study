import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEYS = {
  COURSES: "study-courses",
  ACTIVE_COURSE: "study-active-course",
  CHAT_PREFIX: "study-chat:",
};

// ─── System Prompt: The teaching philosophy ───
const buildSystemPrompt = (course) => {
  const materialsContext = course.materials
    .map((m, i) => `--- MATERIAL ${i + 1}: ${m.name} ---\n${m.content}`)
    .join("\n\n");

  const assignmentsContext = course.assignments.length
    ? `\n\n--- TRACKED ASSIGNMENTS ---\n${course.assignments
        .map(
          (a) =>
            `• ${a.title} | Due: ${a.dueDate || "not set"} | Status: ${a.status}`
        )
        .join("\n")}`
    : "";

  const conceptsContext = course.concepts.length
    ? `\n\n--- CONCEPT MASTERY ---\n${course.concepts
        .map((c) => `• ${c.name}: ${c.mastery}%`)
        .join("\n")}`
    : "";

  return `You are Study — a dedicated teacher for this student. You have read all of their course materials and your sole purpose is to ensure they MASTER the knowledge contained within.

YOUR TEACHING PHILOSOPHY:
- Never give answers first. Always teach the underlying concept before applying it.
- When a student asks about an assignment problem, reverse-engineer what they need to know. Identify prerequisite concepts and teach from the foundation up.
- The assignment is PROOF of learning, not the goal. A completed assignment means nothing if the student doesn't own the knowledge underneath it.
- You are building a student who executes from understanding, not one who fumbles to a finish line.

YOUR METHODS:
1. TEACH: Break concepts down to the student's level. Use analogies, examples, step-by-step breakdowns. If one explanation doesn't land, try a completely different angle.
2. VERIFY: After teaching, check understanding. Ask them to explain it back, apply it to a small example, or reason through a related scenario. Don't move on until they demonstrate they get it.
3. TEST: When appropriate, generate meaningful diagnostic tests. These should reveal true understanding vs surface familiarity. Questions should require APPLICATION of concepts, not memorization. Format tests clearly with numbered questions.
4. APPLY: Only after concepts are solid, walk them through their actual assignment. Guide them — don't do it for them. They should feel the connection between what they learned and what they're doing.

TRACKING:
- Keep mental track of what concepts the student is strong in and where gaps exist.
- If during an assignment you detect a gap, STOP. Go back and re-teach that piece. Verify it. Then return to the assignment.
- Celebrate genuine understanding. Acknowledge when they've leveled up on a concept.

ASSIGNMENT AWARENESS:
- You know the student's assignments and due dates. Prioritize teaching concepts that feed into upcoming work.
- When a student says they completed an assignment, acknowledge it and note what knowledge they demonstrated.
- Help them see progress — what they've mastered and what's ahead.

PERSONALITY:
- You are warm, patient, and genuinely invested in this student's success.
- You are direct — if they don't understand something, you say so kindly and try again.
- You are not a chatbot. You are their teacher. You have read their materials. You know the curriculum.
- Keep responses focused and appropriately sized. Don't overwhelm with walls of text. Teach in digestible pieces.

IMPORTANT RULES:
- NEVER fabricate information that isn't in the course materials. If you don't have enough context, say so.
- NEVER just hand over answers. The student must earn understanding.
- When referencing course materials, be specific about where the information comes from.
- If the student asks you to just give them the answer, redirect: teach them how to arrive at it themselves.

COURSE MATERIALS:
${materialsContext || "No materials uploaded yet. Ask the student to upload their course materials so you can begin teaching."}
${assignmentsContext}
${conceptsContext}

When the student first engages, greet them by acknowledging what materials you've reviewed and suggest where to start based on what you see in the curriculum. If they have upcoming assignments, mention those as natural starting points.

SPECIAL COMMANDS (when the student asks for these):
- If asked to generate a test: Create a well-structured test with 5-8 questions that range from foundational to applied. Include a mix of question types. After they answer, grade thoroughly and identify specific gaps.
- If asked to add an assignment: Extract the title, due date, and details. Confirm with the student before tracking it.
- If asked about their progress: Give an honest assessment of where they stand conceptually.`;
};

// ─── Utility: Read file content ───
const readFileContent = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    if (file.type.startsWith("image/")) {
      reader.onload = () => {
        resolve({
          type: "image",
          name: file.name,
          content: `[Image: ${file.name}]`,
          base64: reader.result.split(",")[1],
          mediaType: file.type,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        resolve({
          type: "text",
          name: file.name,
          content: reader.result,
        });
      };
      reader.readAsText(file);
    }
  });
};

// ─── Storage helpers ───
const storage = {
  async get(key) {
    try {
      const result = await window.storage.get(key);
      return result ? JSON.parse(result.value) : null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      await window.storage.set(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage error:", e);
    }
  },
};

// ─── Styles ───
const fonts = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');
`;

const theme = {
  bg: "#0F1115",
  surface: "#181A20",
  surfaceHover: "#1E2028",
  border: "#2A2D37",
  borderLight: "#353842",
  text: "#E8E9ED",
  textMuted: "#8B8F9E",
  textDim: "#5C6070",
  accent: "#6C9CFC",
  accentSoft: "rgba(108,156,252,0.12)",
  accentGlow: "rgba(108,156,252,0.25)",
  green: "#5CBB8A",
  greenSoft: "rgba(92,187,138,0.12)",
  orange: "#E8A44A",
  orangeSoft: "rgba(232,164,74,0.12)",
  red: "#E06C75",
  redSoft: "rgba(224,108,117,0.12)",
};

// ─── Main App ───
export default function Study() {
  const [courses, setCourses] = useState([]);
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [view, setView] = useState("home"); // home | course | chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ title: "", dueDate: "" });
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const activeCourse = courses.find((c) => c.id === activeCourseId);

  // ─── Load from storage ───
  useEffect(() => {
    (async () => {
      const saved = await storage.get(STORAGE_KEYS.COURSES);
      if (saved) setCourses(saved);
      const activeId = await storage.get(STORAGE_KEYS.ACTIVE_COURSE);
      if (activeId) setActiveCourseId(activeId);
      setInitialized(true);
    })();
  }, []);

  // ─── Persist courses ───
  useEffect(() => {
    if (initialized) storage.set(STORAGE_KEYS.COURSES, courses);
  }, [courses, initialized]);

  // ─── Load chat history when course changes ───
  useEffect(() => {
    if (activeCourseId) {
      (async () => {
        const saved = await storage.get(STORAGE_KEYS.CHAT_PREFIX + activeCourseId);
        setChatMessages(saved || []);
      })();
      storage.set(STORAGE_KEYS.ACTIVE_COURSE, activeCourseId);
    }
  }, [activeCourseId]);

  // ─── Save chat on change ───
  useEffect(() => {
    if (activeCourseId && chatMessages.length > 0) {
      storage.set(STORAGE_KEYS.CHAT_PREFIX + activeCourseId, chatMessages);
    }
  }, [chatMessages, activeCourseId]);

  // ─── Auto scroll chat ───
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isLoading]);

  // ─── Auto resize textarea ───
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [chatInput]);

  // ─── Create course ───
  const createCourse = () => {
    if (!newCourseName.trim()) return;
    const course = {
      id: Date.now().toString(),
      name: newCourseName.trim(),
      materials: [],
      assignments: [],
      concepts: [],
      createdAt: new Date().toISOString(),
    };
    setCourses((prev) => [...prev, course]);
    setNewCourseName("");
    setShowAddCourse(false);
    setActiveCourseId(course.id);
    setView("course");
  };

  // ─── Upload files ───
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !activeCourseId) return;
    setUploading(true);

    const newMaterials = await Promise.all(files.map(readFileContent));

    setCourses((prev) =>
      prev.map((c) =>
        c.id === activeCourseId
          ? { ...c, materials: [...c.materials, ...newMaterials] }
          : c
      )
    );
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Remove material ───
  const removeMaterial = (index) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === activeCourseId
          ? { ...c, materials: c.materials.filter((_, i) => i !== index) }
          : c
      )
    );
  };

  // ─── Add assignment ───
  const addAssignment = () => {
    if (!newAssignment.title.trim()) return;
    const assignment = {
      id: Date.now().toString(),
      title: newAssignment.title.trim(),
      dueDate: newAssignment.dueDate || null,
      status: "pending",
      concepts: [],
    };
    setCourses((prev) =>
      prev.map((c) =>
        c.id === activeCourseId
          ? { ...c, assignments: [...c.assignments, assignment] }
          : c
      )
    );
    setNewAssignment({ title: "", dueDate: "" });
    setShowAssignmentModal(false);
  };

  // ─── Toggle assignment status ───
  const toggleAssignment = (assignmentId) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === activeCourseId
          ? {
              ...c,
              assignments: c.assignments.map((a) =>
                a.id === assignmentId
                  ? { ...a, status: a.status === "done" ? "pending" : "done" }
                  : a
              ),
            }
          : c
      )
    );
  };

  // ─── Delete assignment ───
  const deleteAssignment = (assignmentId) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === activeCourseId
          ? {
              ...c,
              assignments: c.assignments.filter((a) => a.id !== assignmentId),
            }
          : c
      )
    );
  };

  // ─── Send message to Claude ───
  const sendMessage = async () => {
    if (!chatInput.trim() || isLoading || !activeCourse) return;

    const userMsg = { role: "user", content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setIsLoading(true);

    try {
      // Build messages for API — include image content for image materials
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(activeCourse),
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      const assistantContent = data.content
        ?.map((block) => (block.type === "text" ? block.text : ""))
        .filter(Boolean)
        .join("\n");

      if (assistantContent) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent },
        ]);
      }
    } catch (err) {
      console.error("API error:", err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I had trouble connecting. Let's try that again — what were you working on?",
        },
      ]);
    }
    setIsLoading(false);
  };

  // ─── Clear chat ───
  const clearChat = async () => {
    setChatMessages([]);
    if (activeCourseId) {
      try {
        await window.storage.delete(STORAGE_KEYS.CHAT_PREFIX + activeCourseId);
      } catch {}
    }
  };

  // ─── Delete course ───
  const deleteCourse = (courseId) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    if (activeCourseId === courseId) {
      setActiveCourseId(null);
      setView("home");
    }
  };

  // ─── Render markdown-lite (bold, italic, code, lists, headers) ───
  const renderContent = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    const elements = [];
    let inCodeBlock = false;
    let codeBuffer = [];

    lines.forEach((line, i) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${i}`}
              style={{
                background: theme.bg,
                borderRadius: 8,
                padding: "12px 16px",
                overflowX: "auto",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                lineHeight: 1.6,
                margin: "8px 0",
                border: `1px solid ${theme.border}`,
              }}
            >
              {codeBuffer.join("\n")}
            </pre>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }
      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(
          <h4
            key={i}
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 18,
              fontWeight: 400,
              margin: "16px 0 8px",
              color: theme.text,
            }}
          >
            {line.slice(4)}
          </h4>
        );
        return;
      }
      if (line.startsWith("## ")) {
        elements.push(
          <h3
            key={i}
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 20,
              fontWeight: 400,
              margin: "16px 0 8px",
              color: theme.text,
            }}
          >
            {line.slice(3)}
          </h3>
        );
        return;
      }

      // Numbered list
      const numMatch = line.match(/^(\d+)\.\s(.+)/);
      if (numMatch) {
        elements.push(
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              margin: "4px 0",
              paddingLeft: 4,
            }}
          >
            <span
              style={{
                color: theme.accent,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                minWidth: 20,
              }}
            >
              {numMatch[1]}.
            </span>
            <span>{renderInline(numMatch[2])}</span>
          </div>
        );
        return;
      }

      // Bullet
      if (line.startsWith("- ") || line.startsWith("• ")) {
        elements.push(
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              margin: "4px 0",
              paddingLeft: 4,
            }}
          >
            <span style={{ color: theme.accent, marginTop: 2 }}>•</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        );
        return;
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={i} style={{ height: 8 }} />);
        return;
      }

      // Regular text
      elements.push(
        <p key={i} style={{ margin: "4px 0", lineHeight: 1.65 }}>
          {renderInline(line)}
        </p>
      );
    });

    return elements;
  };

  // Inline formatting
  const renderInline = (text) => {
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Inline code
      const codeMatch = remaining.match(/`([^`]+)`/);
      // Italic
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);

      const matches = [
        boldMatch && { type: "bold", index: boldMatch.index, match: boldMatch },
        codeMatch && { type: "code", index: codeMatch.index, match: codeMatch },
        italicMatch && {
          type: "italic",
          index: italicMatch.index,
          match: italicMatch,
        },
      ].filter(Boolean);

      if (!matches.length) {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }

      const first = matches.reduce((a, b) => (a.index < b.index ? a : b));
      if (first.index > 0) {
        parts.push(
          <span key={key++}>{remaining.slice(0, first.index)}</span>
        );
      }

      if (first.type === "bold") {
        parts.push(
          <strong key={key++} style={{ fontWeight: 600, color: theme.text }}>
            {first.match[1]}
          </strong>
        );
      } else if (first.type === "code") {
        parts.push(
          <code
            key={key++}
            style={{
              background: theme.bg,
              padding: "2px 6px",
              borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.88em",
              color: theme.accent,
            }}
          >
            {first.match[1]}
          </code>
        );
      } else {
        parts.push(
          <em key={key++} style={{ fontStyle: "italic", color: theme.textMuted }}>
            {first.match[1]}
          </em>
        );
      }

      remaining = remaining.slice(first.index + first.match[0].length);
    }

    return parts;
  };

  // ─── Stats for a course ───
  const getCourseStats = (course) => {
    const total = course.assignments.length;
    const done = course.assignments.filter((a) => a.status === "done").length;
    const upcoming = course.assignments.filter((a) => {
      if (!a.dueDate || a.status === "done") return false;
      const due = new Date(a.dueDate);
      const now = new Date();
      const diff = (due - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length;
    return { total, done, upcoming };
  };

  // ─── Sorted assignments (upcoming first) ───
  const sortedAssignments = activeCourse
    ? [...activeCourse.assignments].sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      })
    : [];

  // ─── RENDER ───
  if (!initialized) {
    return (
      <div
        style={{
          background: theme.bg,
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.textMuted,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        background: theme.bg,
        minHeight: "100vh",
        fontFamily: "'DM Sans', sans-serif",
        color: theme.text,
        fontSize: 14,
      }}
    >
      <style>{fonts}</style>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: ${theme.accentSoft}; color: ${theme.accent}; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 3px; }
        textarea:focus, input:focus { outline: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ─── HEADER ─── */}
      <div
        style={{
          borderBottom: `1px solid ${theme.border}`,
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: theme.bg,
          zIndex: 100,
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {view !== "home" && (
            <button
              onClick={() => {
                if (view === "chat") setView("course");
                else {
                  setView("home");
                  setActiveCourseId(null);
                }
              }}
              style={{
                background: "none",
                border: "none",
                color: theme.textMuted,
                cursor: "pointer",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
              }}
            >
              ← {view === "chat" ? activeCourse?.name : "Home"}
            </button>
          )}
          <h1
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: view === "home" ? 28 : 22,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: theme.text,
            }}
          >
            {view === "home"
              ? "Study"
              : view === "course"
              ? activeCourse?.name
              : "Session"}
          </h1>
        </div>

        {view === "course" && (
          <button
            onClick={() => {
              setChatMessages([]);
              (async () => {
                const saved = await storage.get(
                  STORAGE_KEYS.CHAT_PREFIX + activeCourseId
                );
                setChatMessages(saved || []);
              })();
              setView("chat");
            }}
            style={{
              background: theme.accent,
              color: "#0F1115",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Start Studying
          </button>
        )}

        {view === "chat" && (
          <button
            onClick={clearChat}
            style={{
              background: theme.surface,
              color: theme.textMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            New Session
          </button>
        )}
      </div>

      {/* ─── HOME VIEW ─── */}
      {view === "home" && (
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            padding: "48px 24px",
            animation: "fadeIn 0.3s ease",
          }}
        >
          <p
            style={{
              color: theme.textMuted,
              fontSize: 16,
              lineHeight: 1.6,
              marginBottom: 40,
              maxWidth: 480,
            }}
          >
            Upload your course materials. Study reads them, teaches you the
            concepts, tests your understanding, and makes sure your assignments
            get done.
          </p>

          {courses.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {courses.map((course) => {
                const stats = getCourseStats(course);
                return (
                  <div
                    key={course.id}
                    onClick={() => {
                      setActiveCourseId(course.id);
                      setView("course");
                    }}
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      padding: "18px 20px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = theme.borderLight;
                      e.currentTarget.style.background = theme.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = theme.border;
                      e.currentTarget.style.background = theme.surface;
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "'Instrument Serif', serif",
                          fontSize: 20,
                          marginBottom: 6,
                        }}
                      >
                        {course.name}
                      </div>
                      <div
                        style={{
                          color: theme.textMuted,
                          fontSize: 13,
                          display: "flex",
                          gap: 16,
                        }}
                      >
                        <span>{course.materials.length} materials</span>
                        {stats.total > 0 && (
                          <span>
                            {stats.done}/{stats.total} assignments done
                          </span>
                        )}
                        {stats.upcoming > 0 && (
                          <span style={{ color: theme.orange }}>
                            {stats.upcoming} due soon
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${course.name}"?`))
                            deleteCourse(course.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: theme.textDim,
                          cursor: "pointer",
                          fontSize: 16,
                          padding: "4px 8px",
                        }}
                      >
                        ×
                      </button>
                      <span style={{ color: theme.textDim, fontSize: 18 }}>→</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showAddCourse ? (
            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: 20,
                animation: "slideUp 0.2s ease",
              }}
            >
              <input
                autoFocus
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCourse()}
                placeholder="Course name (e.g. Calculus II)"
                style={{
                  width: "100%",
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: theme.text,
                  fontSize: 15,
                  fontFamily: "'DM Sans', sans-serif",
                  marginBottom: 12,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={createCourse}
                  style={{
                    background: theme.accent,
                    color: "#0F1115",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => setShowAddCourse(false)}
                  style={{
                    background: "none",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: "8px 16px",
                    color: theme.textMuted,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCourse(true)}
              style={{
                background: "none",
                border: `2px dashed ${theme.border}`,
                borderRadius: 12,
                padding: "20px",
                width: "100%",
                color: theme.textMuted,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accent;
                e.currentTarget.style.color = theme.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.color = theme.textMuted;
              }}
            >
              + Add Course
            </button>
          )}
        </div>
      )}

      {/* ─── COURSE VIEW ─── */}
      {view === "course" && activeCourse && (
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "32px 24px",
            animation: "fadeIn 0.3s ease",
          }}
        >
          {/* Materials */}
          <section style={{ marginBottom: 36 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 22,
                  fontWeight: 400,
                }}
              >
                Materials
              </h2>
              <label
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  color: theme.textMuted,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {uploading ? "Uploading..." : "+ Upload Files"}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.pdf,image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {activeCourse.materials.length === 0 ? (
              <div
                style={{
                  border: `2px dashed ${theme.border}`,
                  borderRadius: 12,
                  padding: "40px 20px",
                  textAlign: "center",
                  color: theme.textDim,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14 }}>
                  Upload syllabi, assignments, notes, screenshots
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: theme.textDim }}>
                  Text files, images, PDFs — anything from your course
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {activeCourse.materials.map((mat, i) => (
                  <div
                    key={i}
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 16 }}>
                        {mat.type === "image" ? "🖼" : "📝"}
                      </span>
                      <div>
                        <div style={{ fontSize: 14 }}>{mat.name}</div>
                        <div style={{ fontSize: 12, color: theme.textDim }}>
                          {mat.type === "image"
                            ? "Image"
                            : `${mat.content.length.toLocaleString()} characters`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeMaterial(i)}
                      style={{
                        background: "none",
                        border: "none",
                        color: theme.textDim,
                        cursor: "pointer",
                        fontSize: 16,
                        padding: "2px 6px",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Assignments */}
          <section style={{ marginBottom: 36 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 22,
                  fontWeight: 400,
                }}
              >
                Assignments
              </h2>
              <button
                onClick={() => setShowAssignmentModal(true)}
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  color: theme.textMuted,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                + Add Assignment
              </button>
            </div>

            {showAssignmentModal && (
              <div
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 12,
                  animation: "slideUp 0.2s ease",
                }}
              >
                <input
                  autoFocus
                  value={newAssignment.title}
                  onChange={(e) =>
                    setNewAssignment({ ...newAssignment, title: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && addAssignment()}
                  placeholder="Assignment title"
                  style={{
                    width: "100%",
                    background: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: theme.text,
                    fontSize: 14,
                    fontFamily: "'DM Sans', sans-serif",
                    marginBottom: 10,
                  }}
                />
                <input
                  type="date"
                  value={newAssignment.dueDate}
                  onChange={(e) =>
                    setNewAssignment({ ...newAssignment, dueDate: e.target.value })
                  }
                  style={{
                    width: "100%",
                    background: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: theme.text,
                    fontSize: 14,
                    fontFamily: "'DM Sans', sans-serif",
                    marginBottom: 12,
                    colorScheme: "dark",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={addAssignment}
                    style={{
                      background: theme.accent,
                      color: "#0F1115",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAssignmentModal(false)}
                    style={{
                      background: "none",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      padding: "8px 16px",
                      color: theme.textMuted,
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {sortedAssignments.length === 0 && !showAssignmentModal ? (
              <div
                style={{
                  border: `2px dashed ${theme.border}`,
                  borderRadius: 12,
                  padding: "30px 20px",
                  textAlign: "center",
                  color: theme.textDim,
                  fontSize: 14,
                }}
              >
                No assignments tracked yet. Add them here or mention them in your
                study session.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sortedAssignments.map((a) => {
                  const isOverdue =
                    a.dueDate &&
                    a.status !== "done" &&
                    new Date(a.dueDate) < new Date();
                  const isDueSoon =
                    a.dueDate &&
                    a.status !== "done" &&
                    !isOverdue &&
                    (new Date(a.dueDate) - new Date()) / (1000 * 60 * 60 * 24) <= 3;

                  return (
                    <div
                      key={a.id}
                      style={{
                        background: theme.surface,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        opacity: a.status === "done" ? 0.5 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleAssignment(a.id)}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            border: `2px solid ${
                              a.status === "done" ? theme.green : theme.border
                            }`,
                            background:
                              a.status === "done" ? theme.greenSoft : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            color: theme.green,
                            flexShrink: 0,
                          }}
                        >
                          {a.status === "done" && "✓"}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              textDecoration:
                                a.status === "done" ? "line-through" : "none",
                            }}
                          >
                            {a.title}
                          </div>
                          {a.dueDate && (
                            <div
                              style={{
                                fontSize: 12,
                                color: isOverdue
                                  ? theme.red
                                  : isDueSoon
                                  ? theme.orange
                                  : theme.textDim,
                                marginTop: 2,
                              }}
                            >
                              {isOverdue ? "Overdue — " : ""}
                              Due{" "}
                              {new Date(a.dueDate + "T00:00:00").toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteAssignment(a.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: theme.textDim,
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "2px 6px",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick stats */}
          {activeCourse.materials.length > 0 && (
            <section
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 8 }}>
                Ready to study
              </div>
              <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.6 }}>
                {activeCourse.materials.length} material
                {activeCourse.materials.length !== 1 ? "s" : ""} loaded
                {activeCourse.assignments.length > 0 &&
                  ` · ${activeCourse.assignments.filter((a) => a.status !== "done").length} assignments remaining`}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: theme.textDim,
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Hit "Start Studying" to begin a session. Study will teach you
                the concepts in your materials and help you work through your
                assignments.
              </div>
            </section>
          )}
        </div>
      )}

      {/* ─── CHAT VIEW ─── */}
      {view === "chat" && activeCourse && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 57px)",
          }}
        >
          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 16px",
            }}
          >
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              {chatMessages.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "60px 20px",
                    color: theme.textDim,
                    animation: "fadeIn 0.4s ease",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Instrument Serif', serif",
                      fontSize: 28,
                      color: theme.textMuted,
                      marginBottom: 12,
                    }}
                  >
                    Ready when you are
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
                    {activeCourse.materials.length > 0
                      ? `I've read your ${activeCourse.materials.length} uploaded material${activeCourse.materials.length !== 1 ? "s" : ""}. Ask me to teach you a concept, generate a test, or help you work through an assignment.`
                      : "Upload some course materials first, then come back and we'll get to work."}
                  </div>
                  {activeCourse.assignments.filter((a) => a.status !== "done")
                    .length > 0 && (
                    <div
                      style={{
                        marginTop: 16,
                        fontSize: 13,
                        color: theme.orange,
                      }}
                    >
                      {
                        activeCourse.assignments.filter(
                          (a) => a.status !== "done"
                        ).length
                      }{" "}
                      assignment
                      {activeCourse.assignments.filter(
                        (a) => a.status !== "done"
                      ).length !== 1
                        ? "s"
                        : ""}{" "}
                      pending
                    </div>
                  )}
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 20,
                    animation: "fadeIn 0.25s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems:
                      msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: msg.role === "user" ? "75%" : "100%",
                      background:
                        msg.role === "user" ? theme.accentSoft : "transparent",
                      border:
                        msg.role === "user"
                          ? `1px solid rgba(108,156,252,0.2)`
                          : "none",
                      borderRadius:
                        msg.role === "user"
                          ? "16px 16px 4px 16px"
                          : "0",
                      padding:
                        msg.role === "user"
                          ? "12px 16px"
                          : "4px 0",
                      color: theme.text,
                      lineHeight: 1.65,
                      fontSize: 14,
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <div>{renderContent(msg.content)}</div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    padding: "12px 0",
                    animation: "fadeIn 0.2s ease",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: theme.accent,
                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input */}
          <div
            style={{
              borderTop: `1px solid ${theme.border}`,
              padding: "16px",
              background: theme.bg,
            }}
          >
            <div
              style={{
                maxWidth: 680,
                margin: "0 auto",
                display: "flex",
                gap: 10,
                alignItems: "flex-end",
              }}
            >
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  activeCourse.materials.length > 0
                    ? "Ask me to teach you something, or let's work on an assignment..."
                    : "Upload materials to your course first..."
                }
                disabled={activeCourse.materials.length === 0}
                rows={1}
                style={{
                  flex: 1,
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: "12px 16px",
                  color: theme.text,
                  fontSize: 14,
                  fontFamily: "'DM Sans', sans-serif",
                  resize: "none",
                  lineHeight: 1.5,
                  maxHeight: 160,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || isLoading}
                style={{
                  background:
                    chatInput.trim() && !isLoading
                      ? theme.accent
                      : theme.surface,
                  color:
                    chatInput.trim() && !isLoading
                      ? "#0F1115"
                      : theme.textDim,
                  border: "none",
                  borderRadius: 12,
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor:
                    chatInput.trim() && !isLoading
                      ? "pointer"
                      : "default",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
