// --- Classification Options ---
export const CLS = [
  { v: "syllabus", l: "Syllabus / Schedule" },
  { v: "lecture", l: "Lecture Transcript" },
  { v: "assignment", l: "Assignment / Homework" },
  { v: "notes", l: "Notes" },
  { v: "textbook", l: "Textbook" },
  { v: "reference", l: "Reference / Other" },
];

// --- Auto-Classifier ---
export const autoClassify = (file) => {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop();

  // Extension-based
  if (ext === "epub") return "textbook";
  if (ext === "srt" || ext === "vtt") return "lecture";

  // Name-based patterns
  if (/syllabus|schedule|course.?outline|calendar/i.test(name)) return "syllabus";
  if (/homework|hw\d|assignment|asgn|quiz|exam|midterm|final|problem.?set|worksheet|lab\d/i.test(name)) return "assignment";
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
