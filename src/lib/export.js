import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle
} from "docx";

/**
 * Generate a DOCX submission document from assignment answers.
 * @param {string} assignmentTitle - Title of the assignment
 * @param {Array<{id: string, description: string, answer: string, done: boolean, codeMode?: boolean}>} questions
 * @param {string} courseName - Name of the course
 * @returns {Promise<Blob>} - DOCX file as a Blob
 */
export const generateSubmission = async (assignmentTitle, questions, courseName) => {
  if (!questions?.length) return null;

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric"
  });

  const children = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: assignmentTitle, bold: true, size: 48, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));

  // Course name
  children.push(new Paragraph({
    children: [new TextRun({ text: courseName, size: 24, color: "666666", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
  }));

  // Date
  children.push(new Paragraph({
    children: [new TextRun({ text: date, size: 20, color: "999999", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  // Separator line
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    spacing: { after: 300 },
  }));

  // Questions and answers
  const answered = questions.filter(q => q.done && q.answer?.trim());
  for (let i = 0; i < answered.length; i++) {
    const q = answered[i];
    const qNum = q.id || "Question " + (i + 1);

    // Question heading
    children.push(new Paragraph({
      children: [new TextRun({ text: qNum, bold: true, size: 24, font: "Calibri" })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }));

    // Question description
    children.push(new Paragraph({
      children: [new TextRun({ text: q.description, italics: true, size: 22, color: "444444", font: "Calibri" })],
      spacing: { after: 150 },
    }));

    // Answer — strip code fences and detect if it looks like code
    const cleanAnswer = stripCodeFences(q.answer);
    const isCode = q.codeMode || looksLikeCode(cleanAnswer);
    if (isCode) {
      // Render as code block (monospace, shaded background)
      const codeLines = cleanAnswer.split("\n");
      for (const line of codeLines) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })],
          spacing: { after: 20 },
          shading: { fill: "F5F5F5" },
          indent: { left: 360 },
        }));
      }
      children.push(new Paragraph({ spacing: { after: 100 } }));
    } else {
      // Regular text answer — split by paragraphs
      const paragraphs = cleanAnswer.split(/\n\n+/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed, size: 22, font: "Calibri" })],
          spacing: { after: 120 },
        }));
      }
    }

    // Separator between questions (not after last)
    if (i < answered.length - 1) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" } },
        spacing: { before: 200, after: 200 },
      }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
};

/** Strip markdown code fences (``` or ```lang) from text */
const stripCodeFences = (text) => {
  if (!text) return text;
  return text.replace(/^```[a-zA-Z]*\s*$/gm, "").replace(/^```\s*$/gm, "").trim();
};

/** Heuristic: does this text look like code? */
const looksLikeCode = (text) => {
  if (!text) return false;
  const indicators = [
    /[{};]/, // braces and semicolons
    /^\s*(def |class |function |import |from |const |let |var |return |if\s*\(|for\s*\(|while\s*\()/m,
    /=>/,    // arrow functions
    /^\s*#include/m,
    /^\s*public\s+(static\s+)?/m,
  ];
  let score = 0;
  for (const re of indicators) {
    if (re.test(text)) score++;
  }
  return score >= 2;
};

/** Trigger browser download of a blob */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
