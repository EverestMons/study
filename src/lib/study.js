import { DB } from './db.js';
import { callClaude, extractJSON } from './api.js';
import { getMatContent } from './skills.js';

// --- Strength Decay Model ---
const DECAY_BASE = 0.05; // Base decay rate per day
const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
const MAX_EASE = 4.0;

export const effectiveStrength = (skillData) => {
  if (!skillData || !skillData.strength) return 0;
  var lastPracticed = skillData.lastPracticed;
  if (!lastPracticed) return skillData.strength;
  var daysSince = (Date.now() - new Date(lastPracticed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) daysSince = 0;
  // Higher ease = slower decay
  var decayRate = DECAY_BASE / (skillData.ease || DEFAULT_EASE);
  return skillData.strength * Math.exp(-decayRate * daysSince);
};

// Estimate next review date: when strength will drop below threshold
export const nextReviewDate = (skillData, threshold) => {
  if (!skillData || !skillData.strength || !skillData.lastPracticed) return null;
  if (!threshold) threshold = 0.4;
  if (skillData.strength <= threshold) return "now";
  var decayRate = DECAY_BASE / (skillData.ease || DEFAULT_EASE);
  // strength * e^(-rate * days) = threshold => days = -ln(threshold/strength) / rate
  var days = -Math.log(threshold / skillData.strength) / decayRate;
  var reviewDate = new Date(new Date(skillData.lastPracticed).getTime() + days * 86400000);
  return reviewDate.toISOString().split("T")[0];
};

// --- Strength Update (replaces point-only system) ---
export const applySkillUpdates = async (courseId, updates) => {
  if (!updates.length) return;
  var profile = await DB.getProfile(courseId);
  var now = new Date().toISOString();
  var date = now.split("T")[0];

  for (var u of updates) {
    if (!profile.skills[u.skillId]) {
      profile.skills[u.skillId] = { points: 0, strength: 0, ease: DEFAULT_EASE, lastPracticed: null, entries: [] };
    }
    var sk = profile.skills[u.skillId];

    // Calculate current effective strength before update
    var current = effectiveStrength(sk);

    // Rating-based adjustments
    var strengthGain, easeAdj, pointGain;
    switch (u.rating) {
      case "struggled":
        strengthGain = 0.05;
        easeAdj = -0.2;
        pointGain = 1;
        break;
      case "hard":
        strengthGain = 0.15;
        easeAdj = 0;
        pointGain = 2;
        break;
      case "good":
        strengthGain = 0.25;
        easeAdj = 0.1;
        pointGain = 3;
        break;
      case "easy":
        strengthGain = 0.35;
        easeAdj = 0.15;
        pointGain = 5;
        break;
      default:
        strengthGain = 0.15;
        easeAdj = 0;
        pointGain = 2;
    }

    // Apply: strength is based on decayed value + gain, capped at 1.0
    sk.strength = Math.min(1.0, current + strengthGain);
    sk.ease = Math.max(MIN_EASE, Math.min(MAX_EASE, (sk.ease || DEFAULT_EASE) + easeAdj));
    sk.lastPracticed = now;
    sk.points = (sk.points || 0) + pointGain; // Keep points for display/backward compat
    sk.entries.push({ date, rating: u.rating, reason: u.reason });
  }

  profile.sessions = (profile.sessions || 0) + 1;
  await DB.saveProfile(courseId, profile);
  return profile;
};

// --- Smart Context Builder ---
export const buildContext = async (courseId, materials, skills, assignments, profile, recentMsgs) => {
  let ctx = "";

  // 1. Skill tree
  ctx += "SKILL TREE:\n";
  if (Array.isArray(skills)) {
    const categories = {};
    for (const s of skills) {
      const cat = s.category || "General";
      if (!categories[cat]) categories[cat] = [];
      const pts = profile.skills[s.id]?.points || 0;
      const str = effectiveStrength(profile.skills[s.id]);
      const strPct = Math.round(str * 100);
      const sessions = profile.skills[s.id]?.entries?.length || 0;
      const lastRating = profile.skills[s.id]?.entries?.slice(-1)[0]?.rating || "";
      categories[cat].push("  " + s.id + ": " + s.name + " [strength: " + strPct + "%" + (lastRating ? ", last: " + lastRating : "") + ", " + sessions + " sessions] -- " + s.description + (s.prerequisites?.length ? " (needs: " + s.prerequisites.join(", ") + ")" : ""));
    }
    for (const [cat, items] of Object.entries(categories)) {
      ctx += "\n" + cat + ":\n" + items.join("\n") + "\n";
    }
  } else {
    ctx += skills + "\n";
  }

  // 2. Assignment decomposition
  if (Array.isArray(assignments) && assignments.length > 0) {
    ctx += "\nASSIGNMENTS & SKILL REQUIREMENTS:\n";
    for (const a of assignments) {
      ctx += "\n" + a.title + (a.dueDate ? " (Due: " + a.dueDate + ")" : "") + ":\n";
      if (a.questions) {
        for (const q of a.questions) {
          ctx += "  " + q.id + ": " + q.description + " [" + q.difficulty + "] -- needs: " + (q.requiredSkills?.join(", ") || "unknown") + "\n";
        }
      }
    }
  }

  // 3. Student profile
  ctx += "\nSTUDENT PROFILE:\n";
  ctx += "Total study sessions: " + profile.sessions + "\n";
  const skillEntries = Object.entries(profile.skills);
  if (skillEntries.length > 0) {
    const sorted = skillEntries.sort((a, b) => effectiveStrength(b[1]) - effectiveStrength(a[1]));
    ctx += "Skill strength (accounts for time decay):\n";
    for (const [sid, data] of sorted) {
      const skillName = Array.isArray(skills) ? skills.find(s => s.id === sid)?.name || sid : sid;
      const str = effectiveStrength(data);
      ctx += "  " + skillName + ": " + Math.round(str * 100) + "% strength";
      if (data.entries?.length) {
        const last = data.entries[data.entries.length - 1];
        ctx += " (last: " + last.rating + " on " + last.date + ")";
      }
      ctx += "\n";
    }
  } else {
    ctx += "New student -- no skill history yet.\n";
  }

  // 4. Selectively load relevant source documents
  const recentText = recentMsgs.slice(-6).map(m => m.content).join(" ").toLowerCase();
  const keywords = recentText.split(/\s+/).filter(w => w.length > 3);

  let relevantSkillIds = [];
  if (Array.isArray(skills)) {
    for (const s of skills) {
      const nameLower = s.name.toLowerCase();
      if (keywords.some(kw => nameLower.includes(kw))) relevantSkillIds.push(s.id);
    }
  }

  const neededDocs = new Set();
  if (Array.isArray(skills)) {
    for (const sid of relevantSkillIds) {
      const skill = skills.find(s => s.id === sid);
      if (skill?.sources) skill.sources.forEach(src => neededDocs.add(src.toLowerCase()));
    }
  }

  const asgnRelated = ["assignment", "homework", "due", "question", "problem", "exercise", "submit"].some(w => recentText.includes(w));

  ctx += "\nLOADED SOURCE MATERIAL:\n";
  let loadedCount = 0;

  for (const mat of materials) {
    const loaded = await getMatContent(courseId, mat);
    var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
    if (!activeChunks.length) continue;

    const nameLower = mat.name.toLowerCase();
    const isNeeded = neededDocs.has(nameLower) ||
      keywords.some(kw => nameLower.includes(kw)) ||
      mat.classification === "syllabus" ||
      (mat.classification === "assignment" && asgnRelated);

    if (!isNeeded && loadedCount >= 3) continue;

    if (activeChunks.length > 1) {
      // Multi-chunk (textbook or large doc): show index, load relevant chunks
      ctx += "\n--- " + mat.name + " (chunk index) ---\n";
      for (const ch of activeChunks) ctx += "  " + ch.id + ": \"" + ch.label + "\"\n";

      const relChs = activeChunks.filter(ch => {
        const tl = ch.label.toLowerCase();
        const preview = ch.content.substring(0, 800).toLowerCase();
        return keywords.some(kw => kw.length > 3 && (tl.includes(kw) || preview.includes(kw))) ||
          [...neededDocs].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)));
      });
      for (const ch of relChs.slice(0, 3)) {
        ctx += "\n--- " + ch.label + " (full) ---\n" + ch.content + "\n";
      }
    } else if (isNeeded && activeChunks[0]?.content) {
      ctx += "\n--- " + mat.classification.toUpperCase() + ": " + mat.name + " ---\n" + activeChunks[0].content + "\n";
      loadedCount++;
    }
  }

  return ctx;
};

// --- Focused Context Builder ---
export const buildFocusedContext = async (courseId, materials, focus, skills, profile) => {
  let ctx = "";
  const allSkills = Array.isArray(skills) ? skills : [];

  if (focus.type === "assignment") {
    // Load only this assignment and its required skills
    const asgn = focus.assignment;
    ctx += "CURRENT ASSIGNMENT: " + asgn.title + (asgn.dueDate ? " (Due: " + asgn.dueDate + ")" : "") + "\n\n";
    ctx += "QUESTIONS:\n";
    const requiredSkillIds = new Set();
    if (asgn.questions) {
      for (const q of asgn.questions) {
        ctx += "  " + q.id + ": " + q.description + " [" + q.difficulty + "]\n";
        ctx += "    Required skills: " + (q.requiredSkills?.join(", ") || "unknown") + "\n";
        if (q.requiredSkills) q.requiredSkills.forEach(s => requiredSkillIds.add(s));
      }
    }

    // Only the skills this assignment needs, with student's current level
    ctx += "\nREQUIRED SKILLS FOR THIS ASSIGNMENT:\n";
    const neededSources = new Set();
    for (const sid of requiredSkillIds) {
      const skill = allSkills.find(s => s.id === sid);
      const sd = profile.skills[sid];
      const str = effectiveStrength(sd);
      const strPct = Math.round(str * 100);
      const lastRating = sd?.entries?.slice(-1)[0]?.rating || "untested";
      if (skill) {
        ctx += "  " + sid + ": " + skill.name + " [strength: " + strPct + "%, last: " + lastRating + "] -- " + skill.description + "\n";
        if (skill.sources) skill.sources.forEach(src => neededSources.add(src.toLowerCase()));
      } else {
        ctx += "  " + sid + ": [strength: " + strPct + "%, last: " + lastRating + "]\n";
      }
    }

    // Load only source materials referenced by required skills
    ctx += "\nSOURCE MATERIAL:\n";
    for (const mat of materials) {
      const loaded = await getMatContent(courseId, mat);
      var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
      if (!activeChunks.length) continue;
      const nameLower = mat.name.toLowerCase();
      const isNeeded = neededSources.has(nameLower) ||
        mat.classification === "assignment" ||
        [...neededSources].some(src => nameLower.includes(src) || src.includes(nameLower.substring(0, 15)));
      if (!isNeeded) continue;

      if (activeChunks.length > 1) {
        for (const ch of activeChunks) {
          const tl = ch.label.toLowerCase();
          if ([...neededSources].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)))) {
            ctx += "\n--- " + ch.label + " ---\n" + ch.content + "\n";
          }
        }
      } else if (activeChunks[0]?.content) {
        ctx += "\n--- " + mat.name + " ---\n" + activeChunks[0].content + "\n";
      }
    }

  } else if (focus.type === "skill") {
    const skill = focus.skill;
    const sd = profile.skills[skill.id];
    const str = effectiveStrength(sd);
    const strPct = Math.round(str * 100);
    const lastRating = sd?.entries?.slice(-1)[0]?.rating || "untested";
    ctx += "FOCUS SKILL: " + skill.id + ": " + skill.name + " [strength: " + strPct + "%, last: " + lastRating + "]\n";
    ctx += "Description: " + skill.description + "\n";
    if (skill.prerequisites?.length) {
      ctx += "Prerequisites: " + skill.prerequisites.join(", ") + "\n";
      ctx += "\nPREREQUISITE STATUS:\n";
      for (const pid of skill.prerequisites) {
        const prereq = allSkills.find(s => s.id === pid);
        const pStr = effectiveStrength(profile.skills[pid]);
        const pStrPct = Math.round(pStr * 100);
        ctx += "  " + pid + ": " + (prereq?.name || pid) + " [strength: " + pStrPct + "%]\n";
      }
    }

    // Load only source materials this skill references
    const neededSources = new Set();
    if (skill.sources) skill.sources.forEach(src => neededSources.add(src.toLowerCase()));

    if (neededSources.size > 0) {
      ctx += "\nSOURCE MATERIAL:\n";
      for (const mat of materials) {
        const loaded = await getMatContent(courseId, mat);
        var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
        if (!activeChunks.length) continue;
        const nameLower = mat.name.toLowerCase();
        const isNeeded = neededSources.has(nameLower) ||
          [...neededSources].some(src => nameLower.includes(src) || src.includes(nameLower.substring(0, 15)));
        if (!isNeeded) continue;

        if (activeChunks.length > 1) {
          for (const ch of activeChunks) {
            const tl = ch.label.toLowerCase();
            if ([...neededSources].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)))) {
              ctx += "\n--- " + ch.label + " ---\n" + ch.content + "\n";
            }
          }
        } else if (activeChunks[0]?.content) {
          ctx += "\n--- " + mat.name + " ---\n" + activeChunks[0].content + "\n";
        }
      }
    }

  } else if (focus.type === "recap") {
    // Just profile summary, no materials
    ctx += "STUDENT PROFILE:\n";
    ctx += "Total sessions: " + profile.sessions + "\n";
    const entries = Object.entries(profile.skills).sort((a, b) => effectiveStrength(b[1]) - effectiveStrength(a[1]));
    if (entries.length > 0) {
      ctx += "Skills engaged:\n";
      for (const [sid, data] of entries) {
        const name = allSkills.find(s => s.id === sid)?.name || sid;
        const str = effectiveStrength(data);
        ctx += "  " + name + ": " + Math.round(str * 100) + "% strength\n";
      }
    }
  }

  return ctx;
};

// --- Session Journal ---
export const generateSessionEntry = (messages, startIdx, skillUpdatesLog) => {
  const sessionMsgs = messages.slice(startIdx);
  if (sessionMsgs.length < 2) return null;

  const userMsgs = sessionMsgs.filter(m => m.role === "user");
  const assistantMsgs = sessionMsgs.filter(m => m.role === "assistant");
  if (userMsgs.length === 0) return null;

  const allUserText = userMsgs.map(m => m.content).join(" ").toLowerCase();
  const words = allUserText.split(/\s+/).filter(w => w.length > 4);
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);

  const strugglePatterns = /don'?t understand|confused|what do you mean|can you explain|still not|lost|huh\??|wait what|i don'?t get|help me understand|go over.+again|one more time/i;
  const struggles = userMsgs.filter(m => strugglePatterns.test(m.content)).map(m => m.content.substring(0, 120));

  const confidencePatterns = /oh i see|makes sense|got it|i understand|that clicks|ah ok|so basically|let me try|i think i can/i;
  const wins = userMsgs.filter(m => confidencePatterns.test(m.content)).map(m => m.content.substring(0, 120));

  const lastUserMsg = userMsgs[userMsgs.length - 1]?.content || "";
  const lastStudyMsg = assistantMsgs[assistantMsgs.length - 1]?.content
    ?.replace(/\[SKILL_UPDATE\][\s\S]*?\[\/SKILL_UPDATE\]/g, "").replace(/\[UNLOCK_QUESTION\][\s\S]*?\[\/UNLOCK_QUESTION\]/g, "").substring(0, 200) || "";

  return {
    date: new Date().toISOString(),
    messageCount: sessionMsgs.length,
    userMessages: userMsgs.length,
    topicsDiscussed: topWords,
    skillsUpdated: skillUpdatesLog.map(u => u.skillId + ": +" + u.points + " (" + u.reason + ")"),
    struggles: struggles.slice(0, 3),
    wins: wins.slice(0, 3),
    lastStudentMessage: lastUserMsg.substring(0, 200),
    lastStudyContext: lastStudyMsg,
  };
};

// --- Journal Formatter ---
export const formatJournal = (journal) => {
  if (!journal.length) return "No previous sessions recorded.\n";
  const recent = journal.slice(-10);
  let out = "";
  for (const entry of recent) {
    const d = new Date(entry.date).toLocaleDateString();
    out += "Session " + d + ": " + entry.messageCount + " messages, topics: " + (entry.topicsDiscussed?.slice(0, 5).join(", ") || "general") + "\n";
    if (entry.skillsUpdated?.length) out += "  Skills: " + entry.skillsUpdated.join(", ") + "\n";
    if (entry.struggles?.length) out += "  Struggled with: " + entry.struggles.map(s => "\"" + s.substring(0, 60) + "\"").join("; ") + "\n";
    if (entry.wins?.length) out += "  Breakthroughs: " + entry.wins.map(w => "\"" + w.substring(0, 60) + "\"").join("; ") + "\n";
    out += "  Left off: \"" + (entry.lastStudentMessage?.substring(0, 80) || "--") + "\"\n";
  }
  return out;
};

// --- System Prompt (Master Teacher) ---
export const buildSystemPrompt = (courseName, context, journal) => {
  return "You are Study -- a master teacher. Not a tutor. Not an assistant. A teacher.\n\nThe difference matters: a tutor helps someone get through homework. A teacher makes someone capable. You do both -- but in order. First, you make sure the student can handle what's due. Then you make sure they actually understand it deeply enough to not need you.\n\nCOURSE: " + courseName + "\n\n" + context + "\n\nSESSION HISTORY:\n" + formatJournal(journal) + "\n\n---\n\nMATERIAL FIDELITY DOCTRINE:\n\nYour primary obligation is to the course as designed by the professor. You are not inventing curriculum -- you are teaching the course that was uploaded.\n\nYou may introduce supporting analogies, foundational prerequisites, or bridging examples when they help the student understand concepts the course is actually teaching. However:\n\n- Never substitute your own curriculum for the professor's. The uploaded materials define what this course covers.\n- If a student lacks foundational knowledge required by the course, teach that foundation in service of returning them to the course material -- not as a detour into your own syllabus.\n- External examples should illuminate what's in the materials, not expand scope beyond what the professor assigned.\n- When the course doesn't cover something the student asks about, say so. Don't fill gaps with your own content unless it's genuinely prerequisite to what the course requires.\n\nThe test: \"Am I helping this student understand what the professor assigned, or am I teaching my own course?\"\n\n---\n\nASSIGNMENT-FIRST PRIORITY:\n\nEvery session starts from the same question: what does this student need to turn in, and can they do it?\n\nCheck the assignment list and deadlines. Check which skills each assignment requires. Check the student's skill profile. That's your opening diagnostic -- not \"what do you want to learn today\" but \"here's what's coming up and here's what you need to be able to do.\"\n\nThe student picks which assignment to work on. You orient them. If they have something due tomorrow, you flag it. Once they pick, you reverse-engineer it: what skills are required, which has the student demonstrated, which are gaps. Then start on the gaps.\n\nWhen all assignments are handled, shift to mastery mode. Find skills where they struggled or scraped by. Go back and build real depth.\n\n---\n\nPRE-QUESTION PHASE:\n\nWhen a student first engages with a skill -- whether starting fresh or returning after time away -- open with 1-2 quick diagnostic questions BEFORE any teaching. This is research-backed: pre-questions activate prior knowledge and focus attention.\n\nExamples:\n- \"Before we dig in -- what does [key term] mean to you?\"\n- \"Quick check: how would you explain [concept] in your own words?\"\n- \"What do you already know about [topic]?\"\n\nTheir answer tells you:\n- Whether they have any foundation to build on\n- Specific misconceptions to address\n- Where to pitch the instruction\n\nIf they say \"I don't know\" or \"I have no idea\" -- that's useful data. It means start from the ground floor, no assumptions.\n\nThis is distinct from ongoing diagnostic questions during teaching. Pre-questions happen at the START, before you've said anything substantive about the skill.\n\n---\n\nYOUR TEACHING METHOD -- ASK FIRST, TEACH SECOND:\n\nThis is the core rule: you do NOT teach until you've located the gap. Most of your responses should be questions, not explanations.\n\n1. ASK. When a student brings a topic or assignment, your first move is always a question. Not \"let me explain X\" but \"what do you think X is?\" or \"walk me through how you'd start this.\" You need to hear THEM before you say anything substantive. One question. Wait.\n\n2. LISTEN AND NARROW. Their answer tells you where the gap is. If they're close, ask a sharper question to find the exact edge of their understanding. If they're way off, you now know where to start -- but ask one more question to confirm: \"OK, so when you hear [term], what comes to mind?\" The goal is precision. You're not teaching a topic -- you're filling a specific hole.\n\n3. FILL THE GAP. Now -- and only now -- teach. And teach only what's missing. Use their course materials first. Keep it tight. One concept at a time. Don't build a lecture -- deliver the missing piece.\n\n4. VERIFY. Ask them to use what you just taught. \"OK, so with that in mind, how would you approach the problem now?\" If they can't apply it, the gap isn't filled. Reteach from a different angle.\n\n5. MOVE ON. Once verified, either move to the next gap or let them attempt the assignment question. Don't linger. Don't \"build wider\" unless they're in mastery mode and have time.\n\nThe ratio should be roughly: 60% of your messages are questions, 30% are short teaching, 10% are confirmations or redirects.\n\n---\n\nCONCRETENESS FADING:\n\nWhen teaching abstract concepts, follow this research-backed progression:\n\n1. CONCRETE FIRST. Start with a specific, tangible example the student can visualize or relate to. Use scenarios from the course materials when possible. \"Imagine you're [concrete situation]...\"\n\n2. BRIDGE. Connect the concrete to the underlying principle. \"Notice how [concrete example] works? That's because [abstract principle].\"\n\n3. ABSTRACT. Now state the general rule, formula, or concept. The abstraction now has a mental hook.\n\n4. VARY. Give a different concrete example to show the principle transfers. This prevents students from over-fitting to one context.\n\nThe trap: jumping straight to abstract definitions. Students can memorize abstractions without understanding them. Concrete-first builds genuine comprehension.\n\nWhen a student struggles with the abstract form, return to concrete. When they handle concrete easily, push toward abstract. Read their responses and adjust.\n\n---\n\nTHE ANSWER DOCTRINE:\n\nYou do not give answers to assignment or homework questions. Hard rule, no exceptions.\n\nWhen a student asks for an answer: redirect with purpose. \"What do you think the first step is?\"\n\nWhen they say \"just tell me, I'm running out of time\": hold firm, accelerate. \"Fastest path -- tell me what [X] is and we'll get there in two minutes.\"\n\nWhen they say \"I already know this\": test them. \"Walk me through it.\" They'll either prove it or see the gap.\n\nWhen frustrated: stay steady. \"I hear you. Let me come at this differently.\" Switch angles.\n\nWhen overwhelmed: shrink the problem. \"Forget the full question. Just this one piece.\"\n\n---\n\nHOW YOU SPEAK:\n\nShort by default. Most responses: 1-3 sentences. You're having a conversation, not writing.\n\nYour default response is a question. If you're not sure whether to ask or tell -- ask.\n\nWhen to go short (1-3 sentences):\n- Diagnostic questions (this is most of the time)\n- Confirming understanding\n- Hints and nudges\n- Routing (\"which assignment?\")\n- Redirects\n\nWhen to go medium (1-2 short paragraphs):\n- Teaching a specific concept AFTER diagnosing the gap\n- Worked examples the student asked for\n\nWhen to go long (rare):\n- Multi-step explanations where each step depends on the last\n- Even then: teach one step, ask, teach the next\n\nNever pad. No preamble. No \"Let's dive into this.\" Just start. If the answer is a question back to them, ask it.\n\nSpeak like a teacher mid-class. \"Alright.\" \"Here's the thing.\" \"Hold on.\" Not: \"Great question!\" \"I'd be happy to help!\" \"Certainly!\" No filler praise. When you praise, it's specific: \"good, you caught the sign error.\"\n\nConfident, not condescending. Point to course materials, don't quote them at length.\n\n---\n\nREADING THE STUDENT:\n\n- New, low points: Start with something they can answer. Build confidence with a small win. But don't go soft.\n- Moderate points: Push harder. Expect them to explain things back. Call out shortcuts.\n- High points: Move fast. Test edge cases. Ask \"why\" more than \"what.\"\n- Struggled last session: Try a different angle. Name it -- \"Last time my explanation of [X] didn't land. Different approach.\"\n- Breakthrough last session: Build on it. \"You nailed [X]. Today extends that.\"\n- All assignments done: Pivot to mastery. Find the shaky skills. \"Your assignments are handled. Let's make sure [weak area] is solid.\"\n\n---\n\nSKILL STRENGTH TRACKING:\n\nAfter meaningful teaching exchanges, rate how the student performed on the skill:\n[SKILL_UPDATE]\nskill-id: struggled|hard|good|easy | reason\n[/SKILL_UPDATE]\n\nRatings -- based on what the student DEMONSTRATED, not what you taught:\n- struggled: Could not answer diagnostic questions. Needed heavy guidance. Still shaky.\n- hard: Got there with significant help. Answered partially. Needed multiple attempts.\n- good: Answered correctly with minor nudges. Applied the concept to the problem.\n- easy: Nailed it cold. Handled variations. Connected it to other concepts unprompted.\n\nOnly rate when the student actually engaged with the skill. Don't rate for just listening.\nOne rating per skill per exchange. Be honest -- struggled is useful data, not a failure.";
};

// --- Question Unlock Parser ---
export const parseQuestionUnlock = (response) => {
  var match = response.match(/\[UNLOCK_QUESTION\]\s*([\w-]+)\s*\[\/UNLOCK_QUESTION\]/);
  return match ? match[1].trim() : null;
};

export const parseSkillUpdates = (response) => {
  const match = response.match(/\[SKILL_UPDATE\]([\s\S]*?)\[\/SKILL_UPDATE\]/);
  if (!match) return [];
  const updates = [];
  const lines = match[1].trim().split("\n");
  for (const line of lines) {
    // New format: skill-id: struggled|hard|good|easy | reason
    var m = line.match(/^([\w-]+):\s*(struggled|hard|good|easy)\s*\|?\s*(.*)/i);
    if (m) {
      updates.push({ skillId: m[1], rating: m[2].toLowerCase(), reason: m[3].trim() });
      continue;
    }
    // Legacy format fallback: skill-id: +N points | reason
    m = line.match(/^([\w-]+):\s*\+(\d+)\s*(?:points?)?\s*\|?\s*(.*)/);
    if (m) {
      var pts = parseInt(m[2]);
      var rating = pts >= 5 ? "easy" : pts >= 3 ? "good" : pts >= 2 ? "hard" : "struggled";
      updates.push({ skillId: m[1], rating, reason: m[3].trim() });
    }
  }
  return updates;
};

// =================================================================
// PRACTICE MODE - Problem set engine
// =================================================================

export const TIERS = [
  null, // index 0 unused
  { name: "Predict", desc: "What does this output/evaluate to?", basePoints: 3, instruction: "Show a code snippet or expression. Ask what it outputs or evaluates to. The student answers with the expected output only. Do NOT include starter code." },
  { name: "Fill", desc: "Complete the missing piece", basePoints: 5, instruction: "Provide code with a clearly marked blank (use ___ as placeholder). The student fills in the missing part to make the code work correctly. Include the template as starterCode." },
  { name: "Write", desc: "Write a function/solution from scratch", basePoints: 8, instruction: "Describe what a function or solution should do. The student writes it from scratch. Do NOT include starter code." },
  { name: "Debug", desc: "Find and fix the error", basePoints: 10, instruction: "Provide code with exactly one bug. The student must identify and fix it. Include the buggy code as starterCode." },
  { name: "Combine", desc: "Use multiple concepts together", basePoints: 13, instruction: "Create a problem that requires this skill PLUS a prerequisite or related skill. Describe the task. May or may not include starter code." },
  { name: "Apply", desc: "Mini-program / complex problem", basePoints: 16, instruction: "Create a multi-step problem or mini-program with a real-world-ish scenario. The student builds a small but complete solution." },
];

const ATTEMPT_MULTIPLIERS = [0, 1.0, 0.6, 0.35, 0.2]; // index = attempt number, 4+ = 0.2
export const attemptMultiplier = (n) => n <= 0 ? 1.0 : n < ATTEMPT_MULTIPLIERS.length ? ATTEMPT_MULTIPLIERS[n] : 0.2;
export const attemptRating = (n) => n <= 1 ? "strong" : n === 2 ? "developing" : "struggling";

export const strengthToTier = (strength) => {
  if (strength >= 0.80) return 6;
  if (strength >= 0.65) return 5;
  if (strength >= 0.50) return 4;
  if (strength >= 0.30) return 3;
  if (strength >= 0.15) return 2;
  return 1;
};

export const detectLanguage = (courseName, skillName, skillDesc) => {
  var combined = " " + (courseName + " " + skillName + " " + (skillDesc || "")).toLowerCase() + " ";
  // Word-boundary match helper: checks pattern appears as whole word (surrounded by non-alpha)
  var wb = (pat) => { var re = new RegExp("(?<![a-z])" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-z])"); return re.test(combined); };
  var langs = [
    { id: "java", match: () => wb("java") && !wb("javascript") },
    { id: "python", match: () => wb("python") || wb("pip") || wb("pytest") || wb("django") || wb("flask") },
    { id: "javascript", match: () => wb("javascript") || wb("typescript") || (wb("react") && !combined.includes("reaction")) || wb("node.js") || wb("nodejs") },
    { id: "c++", match: () => combined.includes("c++") || wb("cpp") },
    { id: "c#", match: () => combined.includes("c#") || wb("csharp") || (wb(".net") && !combined.includes("network")) },
    { id: "c", match: () => wb("c programming") || wb("ansi c") || wb("gcc") || (/ c (?:language|program|code|compiler)/.test(combined)) },
    { id: "rust", match: () => wb("rustc") || wb("cargo") || wb("rust programming") || wb("rust language") || (wb("rust") && (wb("fn") || wb("struct") || wb("impl") || wb("crate"))) },
    { id: "go", match: () => wb("golang") || wb("go programming") || wb("go language") },
    { id: "sql", match: () => wb("sql") || wb("mysql") || wb("postgres") || wb("sqlite") },
    { id: "r", match: () => wb("rstudio") || wb("tidyverse") || wb("ggplot") || wb("r programming") || wb("r language") },
    { id: "matlab", match: () => wb("matlab") || wb("simulink") },
    { id: "swift", match: () => wb("swift") || wb("swiftui") || wb("xcode") },
    { id: "kotlin", match: () => wb("kotlin") },
    { id: "ruby", match: () => wb("ruby") || wb("rails") },
  ];
  for (var l of langs) {
    if (l.match()) return l.id;
  }
  return null;
};

export const createPracticeSet = (courseId, skill, courseName) => {
  var strength = skill.strength || 0;
  return {
    id: "prac-" + Date.now(),
    skillId: skill.id,
    courseId: courseId,
    detectedLanguage: detectLanguage(courseName, skill.name, skill.description),
    currentTier: strengthToTier(strength),
    tiers: {},
    problemSignatures: [],
    startedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
};

export const generateProblems = async (practiceSet, skill, courseName, materialCtx) => {
  var tier = practiceSet.currentTier;
  var tierInfo = TIERS[tier];
  var lang = practiceSet.detectedLanguage;
  var sigList = practiceSet.problemSignatures.length > 0
    ? practiceSet.problemSignatures.join("\n")
    : "None yet";

  var prompt = "Generate 5 practice problems for the skill: " + skill.name + "\n" +
    "Description: " + (skill.description || "N/A") + "\n" +
    "Course: " + courseName + "\n" +
    "Language: " + (lang || "use pseudocode or general notation") + "\n" +
    "Tier " + tier + " (" + tierInfo.name + "): " + tierInfo.desc + "\n\n" +
    "TIER INSTRUCTIONS:\n" + tierInfo.instruction + "\n\n" +
    (skill.prerequisites?.length ? "This skill has prerequisites: " + skill.prerequisites.join(", ") + ". For Tier 5 (Combine), reference these.\n\n" : "") +
    (materialCtx ? "SOURCE MATERIAL FOR REFERENCE:\n" + materialCtx.substring(0, 8000) + "\n\n" : "") +
    "ALREADY USED PROBLEMS (generate COMPLETELY DIFFERENT scenarios, variable names, and structures):\n" + sigList + "\n\n" +
    "Return ONLY a JSON array of exactly 5 problems:\n" +
    "[{\n" +
    "  \"id\": \"p1\",\n" +
    "  \"prompt\": \"the problem statement shown to the student\",\n" +
    "  \"starterCode\": \"code template if applicable, or null\",\n" +
    "  \"expectedApproach\": \"what a correct answer looks like - for evaluation only, never shown to student\",\n" +
    "  \"signature\": \"one-line unique summary of this problem for dedup\",\n" +
    "  \"workedExample\": {\n" +
    "    \"problem\": \"a SIMILAR but DIFFERENT problem (same concept, different specifics)\",\n" +
    "    \"solution\": \"step-by-step solution with annotations\",\n" +
    "    \"keyInsight\": \"one sentence: the principle this demonstrates\"\n" +
    "  }\n" +
    "}]\n\n" +
    "Rules:\n" +
    "- Each problem must be distinct from the others and from ALREADY USED.\n" +
    "- Problems should be focused solely on " + skill.name + ".\n" +
    "- Difficulty should be appropriate for Tier " + tier + " (" + tierInfo.name + ").\n" +
    "- Use " + (lang || "pseudocode") + " for all code snippets.\n" +
    "- For starterCode: use \\n for newlines within the string.\n" +
    "- workedExample must be DIFFERENT from prompt - same concept, different scenario.\n" +
    "- workedExample.solution shows work step by step, not just the answer.";

  var result = await callClaude(prompt, [{ role: "user", content: "Generate the practice problems." }], 8192);
  var parsed = extractJSON(result);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Failed to parse problem generation response");
  }

  // Normalize and build attempt
  var problems = parsed.slice(0, 5).map((p, i) => ({
    id: p.id || ("p" + (i + 1)),
    prompt: p.prompt || "Problem " + (i + 1),
    starterCode: p.starterCode || null,
    expectedApproach: p.expectedApproach || "",
    workedExample: p.workedExample || null,
    studentAnswer: null,
    evaluation: null,
    passed: null,
    exampleViewed: false,
    confidenceRating: null, // IES Rec 6a: self-assessment calibration
  }));

  // Store signatures
  var newSigs = parsed.slice(0, 5).map(p => p.signature || p.prompt.substring(0, 80)).filter(Boolean);
  practiceSet.problemSignatures.push(...newSigs);

  // Determine attempt number for this tier
  var tierData = practiceSet.tiers[tier] || { attempts: [], passed: false, pointsAwarded: 0 };
  var attemptNum = tierData.attempts.length + 1;

  tierData.attempts.push({
    problems: problems,
    passCount: 0,
    attemptNumber: attemptNum,
    completed: false,
  });
  practiceSet.tiers[tier] = tierData;
  practiceSet.lastActiveAt = new Date().toISOString();

  return practiceSet;
};

export const evaluateAnswer = async (skill, problem, studentAnswer, tier) => {
  var prompt = "Evaluate this student's answer.\n\n" +
    "Skill: " + skill.name + "\n" +
    "Problem: " + problem.prompt + "\n" +
    (problem.starterCode ? "Starter code:\n" + problem.starterCode + "\n\n" : "") +
    "Expected approach: " + problem.expectedApproach + "\n\n" +
    "Student's answer:\n" + studentAnswer + "\n\n" +
    "Evaluate on conceptual correctness and proper application of " + skill.name + ".\n" +
    "For code: minor syntax issues (missing semicolon, slight formatting) are OK if the logic is sound.\n" +
    (tier === 1 ? "For Tier 1 (predict): answer must match expected output exactly or be semantically equivalent.\n" : "") +
    (tier === 2 ? "For Tier 2 (fill): the filled portion must make the code work correctly.\n" : "") +
    "\nReturn ONLY JSON:\n{\"passed\": true/false, \"feedback\": \"brief explanation, 2-3 sentences max\"}";

  var result = await callClaude(prompt, [{ role: "user", content: "Evaluate the answer." }], 1024);
  var parsed = extractJSON(result);

  if (!parsed || typeof parsed.passed !== "boolean") {
    return { passed: false, feedback: "Could not evaluate response. Please try again." };
  }
  return parsed;
};

export const completeTierAttempt = (practiceSet) => {
  var tier = practiceSet.currentTier;
  var tierData = practiceSet.tiers[tier];
  if (!tierData || !tierData.attempts.length) return { advanced: false, points: 0 };

  var currentAttempt = tierData.attempts[tierData.attempts.length - 1];
  var passCount = currentAttempt.problems.filter(p => p.passed === true).length;
  currentAttempt.passCount = passCount;
  currentAttempt.completed = true;

  if (passCount >= 4) {
    // Passed this tier
    tierData.passed = true;
    var attemptNum = currentAttempt.attemptNumber;
    var mult = attemptMultiplier(attemptNum);
    var points = Math.round(TIERS[tier].basePoints * mult);
    tierData.pointsAwarded = (tierData.pointsAwarded || 0) + points;

    // Advance to next tier if not at max
    var advanced = false;
    if (tier < 6) {
      practiceSet.currentTier = tier + 1;
      advanced = true;
    }

    return { advanced, points, passCount, attemptNum, rating: attemptRating(attemptNum), tierName: TIERS[tier].name };
  }

  // Failed -- will need new problems (same tier)
  return { advanced: false, points: 0, passCount, attemptNum: currentAttempt.attemptNumber, retry: true, tierName: TIERS[tier].name };
};

// Load relevant material context for a skill's practice problems
export const loadPracticeMaterialCtx = async (courseId, materials, skill) => {
  var neededSources = new Set();
  if (skill.sources) skill.sources.forEach(src => neededSources.add(src.toLowerCase()));
  if (neededSources.size === 0) return "";

  var ctx = "";
  for (var mat of materials) {
    var loaded = await getMatContent(courseId, mat);
    var activeChunks = loaded.chunks.filter(ch => ch.status !== "skipped");
    for (var ch of activeChunks) {
      var tl = ch.label.toLowerCase();
      if ([...neededSources].some(src => tl.includes(src) || src.includes(tl.substring(0, 15)))) {
        ctx += "\n--- " + ch.label + " ---\n" + ch.content.substring(0, 6000) + "\n";
      }
    }
    if (ctx.length > 12000) break; // Cap total context
  }
  return ctx;
};
