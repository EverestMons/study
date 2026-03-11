// --- Classification Options ---
export const CLS = [
  { v: "syllabus", l: "Syllabus / Schedule" },
  { v: "lecture", l: "Lecture Transcript" },
  { v: "slides", l: "Lecture Slides" },
  { v: "assignment", l: "Assignment / Homework" },
  { v: "notes", l: "Notes" },
  { v: "textbook", l: "Textbook" },
  { v: "reference", l: "Reference / Other" },
];

// --- Subfolder → classification mapping (for folder imports) ---
const SUBFOLDER_HINTS = {
  assignments: "assignment", hw: "assignment", homework: "assignment",
  readings: "textbook", textbook: "textbook", textbooks: "textbook",
  lectures: "lecture", slides: "slides",
  syllabus: "syllabus",
};

// --- Auto-Classifier ---
// subfolder: optional string (subfolder name from folder import)
export const autoClassify = (file, subfolder) => {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop();

  // Extension-based
  if (ext === "epub") return "textbook";
  if (ext === "srt" || ext === "vtt") return "lecture";
  if (ext === "pptx") return "slides";

  // Subfolder-based (folder imports)
  if (subfolder) {
    var hint = SUBFOLDER_HINTS[subfolder.toLowerCase()];
    if (hint) return hint;
  }

  // Name-based patterns
  if (/syllabus|schedule|course.?outline|calendar/i.test(name)) return "syllabus";
  if (/homework|\bhw|assignment|asgn|quiz|exam|midterm|final|problem.?set|worksheet|lab\d/i.test(name)) return "assignment";
  if (/lecture|transcript|recording|class.?notes|week.?\d/i.test(name)) return "lecture";
  if (/notes|review|summary|study.?guide|cheat.?sheet|outline/i.test(name)) return "notes";
  if (/textbook|chapter|ch\d|reading/i.test(name)) return "textbook";

  return "";
};

// --- Parse Status ---
export const parseFailed = (content) => {
  if (!content) return true;
  if (typeof content !== "string") return false;
  var t = content.trim();
  // Matches strings that start with [ and contain failure keywords
  if (/^\[.*(?:failed|not supported|could not|error|empty)/i.test(t)) return true;
  return false;
};
