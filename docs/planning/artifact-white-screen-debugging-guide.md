# Artifact White Screen Debugging Guide

Catalogued from the study.jsx investigation (Feb 2026). Three sessions, ~40 bisection tests, one root cause.

---

## The Root Cause (study.jsx)

A `<div>` opened unconditionally at line 3268 had its closing `</div>` inside a `{!practiceMode && (...)}` conditional at line 3992. The overall div count was balanced (depth 0), so naive brace/tag counting showed no issue. But the artifact JSX transpiler choked on this cross-conditional nesting pattern, producing a silent white screen with no error output.

The fix: remove the wrapper div entirely. The layout didn't need it.

---

## What Does NOT Cause White Screens

Ruled out through controlled testing:

- **File size alone.** A 292KB file with 500 simple JSX `<div>` elements rendered fine. The broken file was 240KB.
- **JSX element count.** 628 elements rendered; 374 broke. It's about patterns, not quantity.
- **Comment padding.** 200KB of comments + working code = fine.
- **Mojibake / encoding corruption.** Fixed 20 CP1252 double-encoded sequences (smart quotes, em-dashes, emoji). White screen persisted. Mojibake CAN cause issues when corrupt bytes land inside JSX string expressions (e.g., `{"\u201D"}` producing a character that looks like a string terminator), but it wasn't the cause here.
- **Individual handler functions.** All ~15 handlers worked when tested in isolation.
- **Individual screen sections.** Home, upload, courses screens all worked independently.
- **IIFEs returning fragments.** `{(() => { return <>...</> })()}` inside JSX transpiled fine.

## What DOES Cause White Screens

### 1. Cross-conditional div nesting
**The killer pattern:**
```jsx
<div> {/* opens unconditionally */}
  {someCondition && (
    <div>
      ...
    </div>
    </div>  {/* closes the OUTER div inside a conditional */}
  )}
```

The transpiler sees balanced tags globally but the nesting tree is structurally incoherent. A div that opens at one scope level closes at a different scope level.

**Detection:** Count div depth and track which conditional scope each open/close lives in. If an open and its matching close are in different conditional branches, that's the bug.

### 2. Mismatched JSX tags from bad splicing
During debugging, several test files broke not because of the original bug but because manual JSX surgery introduced unmatched tags. A `</div>` meant for one context got duplicated or placed wrong.

**Detection:** Always verify div balance (depth = 0) for the entire return statement after any edit. But note that depth = 0 is necessary but NOT sufficient -- the study.jsx original had depth 0 and was still broken.

### 3. Silent transpiler failures
The artifact environment gives NO error message on transpiler failure. No console output, no error boundary trigger, just white. This makes every issue look identical.

---

## Debugging Methodology

### Phase 1: Quick Checks (5 min)
1. **Mojibake scan.** Search for sequences like `\xc3\xa2\xe2\x82\xac`, double-encoding patterns. Fix them but don't assume they're the root cause.
2. **Brace/bracket balance.** Count `{` vs `}`, `(` vs `)`, `[` vs `]` globally. Imbalance = immediate fix.
3. **Div balance per return statement.** Count `<div` (excluding self-closing `<div.../>`) minus `</div` for each screen's return block. Should be 0.

### Phase 2: Binary Bisection (30 min)
The fastest path to isolation. Key principles:

**Start from utilities, not from the full file.** Build up rather than tear down, because:
- Removing JSX sections risks introducing mismatches
- Adding sections to a known-working base gives cleaner signal
- Each test is definitively "working code + X" rather than "broken code - Y (maybe)"

**Bisection order:**
1. Utilities only (imports, constants, helpers, parsers, API, CSS) + minimal `return <div>test</div>`
2. Add state declarations + effects
3. Add handler functions (first half, second half, then one-by-one if needed)
4. Add screen returns one at a time (home, upload, courses, study)
5. Within the broken screen, add sections one at a time

**Critical rule for JSX splicing:** When extracting a JSX section, you MUST provide correct closing tags. Don't rely on the original file's closing structure because:
- A closing `</div>` might close a div from a DIFFERENT section you didn't include
- Conditional wrappers `{condition && ( ... )}` need their own closure
- Comments like `{/* end X */}` can be WRONG (they were in study.jsx)

### Phase 3: Pattern Isolation (15 min)
Once you've identified which section breaks things:

1. **Test the section's content as simple padding.** If 30KB of real JSX breaks but 30KB of simple `<div>` elements doesn't, the issue is a specific pattern.
2. **Check for cross-conditional nesting.** Any `<div>` whose matching `</div>` is inside a different conditional branch.
3. **Check for fragments inside IIFEs.** `<>...</>` inside `{(() => { ... })()}` -- these usually work but are worth testing.
4. **Check inline async handlers.** Long `onClick={async () => { ... }}` blocks with try/catch inside JSX attributes -- these can confuse some transpilers.

---

## Verification Checklist

Before declaring a fix:

- [ ] Div balance = 0 for every `if (screen === "X") { return (...) }` block
- [ ] No `<div>` opens in one conditional scope and closes in another
- [ ] No duplicate closing tags from copy-paste
- [ ] All conditional JSX wrappers `{condition && ( ... )}` are self-contained
- [ ] Artifact renders (not just "no white screen" -- actually navigate to every screen)
- [ ] All features present: check for key function names, component names, comment markers

---

## Time Estimates

| Scenario | Time |
|---|---|
| Mojibake-only issue | 15 min (scan + replace + test) |
| Brace mismatch | 10 min (count + fix + test) |
| Cross-conditional nesting | 1-2 hours (bisection required, root cause is non-obvious) |
| Unknown transpiler limit | 2-3 hours (requires systematic elimination) |

---

## Tools Used

```python
# Div balance checker
import re
depth = 0
for i, line in enumerate(lines):
    opens = len(re.findall(r'<div\b(?![^>]*/>)', line))
    closes = line.count('</div')
    depth += opens - closes
    if opens or closes:
        print(f"Line {i+1} (depth={depth}): {line.rstrip()[:80]}")
```

```python
# Mojibake detector
import re
mojibake = re.findall(r'[\xc0-\xdf][\x80-\xbf]|[\xe0-\xef][\x80-\xbf]{2}', text)
# Then decode each match as CP1252 bytes interpreted as UTF-8
```

```python
# Cross-conditional scope tracker (conceptual)
# For each <div>, record: line number, conditional depth, conditional chain
# For each </div>, find matching <div> and compare conditional contexts
# Flag mismatches
```
