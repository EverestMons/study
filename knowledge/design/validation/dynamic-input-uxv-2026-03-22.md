# Dynamic Input — UX Validation
**Date:** 2026-03-22 | **Agent:** Study UX Validator | **Step:** 5

---

## Area 1: Mode Selector Discoverability — APPROVED

The 3-way segmented control (T / </> / π) sits next to the send button — always visible during sessions. The active mode highlights with `T.acS` background + `T.ac` text, making the current state immediately obvious.

**Strengths:**
- Segmented control is a well-understood UI pattern — users intuit that clicking a segment switches modes
- Tooltips on each button include keyboard shortcut hints ("Code mode (Ctrl+Shift+C)")
- The π symbol for math mode is universally recognizable for mathematics
- Mode-specific hint text below input (code: "Esc exit", math: "Click symbols to insert") provides contextual guidance

**Minor consideration:** "T" for text mode is slightly ambiguous — could mean "Title" or "Template". However, in the context of a 3-way selector where the other two modes are clearly code and math, "T" reads correctly as "Text" by elimination. The tooltip confirms it.

**Verdict:** APPROVED

---

## Area 2: Math Toolbar Usability — APPROVED

**Symbol organization:** 6 groups (Greek, Ops, Calc, Sup/Sub, Arrows, Sets) map to how students think about math notation. A calculus student looking for ∫ goes to "Calc". A linear algebra student looking for ∈ goes to "Ops". The grouping is cognitively aligned with subject domains.

**Compactness:** Default state is collapsed — just 6 small pills (fontSize 10, padding 2px 8px) occupying a single row above the textarea. Total vertical footprint when collapsed: ~24px. When one category is expanded, symbols appear in a single wrapped row (28x28 buttons with 4px gap). Even the largest group (Greek, 14 symbols) fits in ~2 rows. The toolbar never dominates the input area.

**Discoverability of collapse:** Category pills are styled as clickable tags with border + color changes on active state. Clicking an active pill collapses it. Clicking a symbol auto-collapses. This matches accordion/pill patterns users know from filter UIs.

**Insertion speed:** Click inserts immediately, cursor repositions via `requestAnimationFrame`, focus returns to textarea. The flow is: click pill → click symbol → type. Three actions to insert one symbol. For expressions requiring multiple symbols (e.g., "∫₀¹ x² dx"), the user must re-expand a category for each symbol — but categories can differ between clicks, which is natural for mixed expressions.

**Verdict:** APPROVED

---

## Area 3: AI-Driven Switching Feel — APPROVED

The AI emits `[INPUT_MODE: math]` as part of its response. The tag is stripped from displayed text (invisible to the student). The input mode switches after the full response is processed — not mid-stream. This means the student sees the AI's question/prompt first, then the input transforms to match.

**Why this feels natural:** The AI asks "Solve this integral..." and the input area gains a math toolbar. The cause-effect relationship is clear — the AI asked for math, so the input became math-friendly. There's no animation or toast notification, which keeps it subtle.

**Potential concern — unexpected switching:** If the AI switches to code mode during a conceptual discussion, the student might be confused. However, the system prompt guidelines mitigate this: "Switch back to text when you shift to conceptual discussion." The AI is instructed to only switch when the task actually changes.

**Manual override always available:** The segmented control remains clickable regardless of AI suggestions. If the student doesn't want math mode, one click on "T" returns to text. No "locked" state.

**Verdict:** APPROVED

---

## Area 4: Mode Persistence — APPROVED

Mode persists after sending a message. This is correct for the primary use cases:

- **Coding conversation:** Student writes code, sends, AI responds with code feedback, student writes more code. Staying in code mode avoids the friction of re-enabling it every message.
- **Math problem set:** Student sends an equation, AI evaluates, student sends another. Staying in math mode keeps the toolbar available.

**Topic-switching within a session:** If a student shifts from coding to conceptual discussion, they need to manually click "T" or let the AI emit `[INPUT_MODE: text]`. This is a minor friction point but acceptable — the AI is prompted to switch modes when the focus shifts, and manual switching is one click away.

**Session reset:** `clearSessionState` resets `inputMode` to "text" when exiting a session, so stale mode doesn't carry across sessions.

**Verdict:** APPROVED

---

## Area 5: Math Input Ergonomics — APPROVED

**Realistic expression test:** To type "∫₀¹ x² dx = 1/3", a student would:
1. Click "Calc" → click ∫ (toolbar collapses)
2. Click "Sup/Sub" → click ₀ (toolbar collapses)
3. Click "Sup/Sub" → click ¹ (not available as subscript — would need to type "1" normally)
4. Type " x"
5. Click "Sup/Sub" → click ² (toolbar collapses)
6. Type " dx = 1/3"

That's ~6 toolbar clicks interspersed with typing for a moderately complex expression. For simpler inputs like "α + β = γ", it's 3 clicks from the Greek group.

**Is this fast enough?** For a study tool where students type one expression per response, yes. This isn't a LaTeX editor for writing papers — it's a conversational input where students occasionally need a symbol. The toolbar covers the 80% case (common symbols) without the learning curve of LaTeX syntax.

**Alternative considered:** LaTeX input with live preview would be more powerful but requires students to know LaTeX. The toolbar approach is zero-learning-curve — see symbol, click symbol.

**Verdict:** APPROVED

---

## Area 6: Learning Science Risk — LOW, APPROVED

**Risk:** Math mode could encourage students to respond with pure symbols (e.g., just "∫x²dx") without verbal explanation of their reasoning.

**Mitigation already in place:** The system prompt instructs the AI to "Ask students to explain reasoning, not just give answers" and "Walk me through your thinking." The AI will continue requesting verbal explanations regardless of input mode. Math mode provides notation tools — it doesn't change the AI's teaching methodology.

**Additional consideration:** The `[INPUT_MODE: text]` tag gives the AI the ability to switch back to text mode when it wants verbal reasoning. The system prompt says "Switch back to text when you shift to conceptual discussion, explanation requests, or non-technical dialogue." This means the AI can explicitly request text input when it wants words, not symbols.

**Verdict:** LOW risk, APPROVED

---

## Summary

| Area | Verdict |
|---|---|
| 1. Mode selector discoverability | APPROVED |
| 2. Math toolbar usability | APPROVED |
| 3. AI-driven switching feel | APPROVED |
| 4. Mode persistence | APPROVED |
| 5. Math input ergonomics | APPROVED |
| 6. Learning science risk | LOW, APPROVED |

**Overall: 6/6 APPROVED**
