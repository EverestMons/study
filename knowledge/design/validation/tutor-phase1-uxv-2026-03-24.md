# study — Tutor Phase 1 UXV Report
**Date:** 2026-03-24 | **Agent:** Study UX Validator | **Output Receipt:** Complete

---

## UXV Check 1: Cognitive Overhead (MAX_SKILLS cap)

**Status: PASS**

`buildFacetAssessmentBlock()` at line 1337-1339:
```javascript
var MAX_SKILLS = 3;
// ...
if (processed >= MAX_SKILLS) break;
```

The cap is still in place. At most 3 skills' facets are emitted per context build, keeping the block within the ~400-600 token budget documented in the code comment (line 1336). When more than 3 skills have facets, a truncation note is appended: `[N more skills with facets -- rate by skill-level]`.

This cap applies identically to the new `buildContext()` call site (uses the same function) as to the existing `buildFocusedContext()` call sites.

## UXV Check 2: Assessment Continuity (Format Match)

**Status: PASS**

### Block output format (lines 1359, 1370)
```
FACETS FOR skill_name (concept_key):
  facet-key: facet_name [mastery: X%] [blooms: level]
    Demonstrates: criteria text
```

### System prompt expects (FACET-LEVEL ASSESSMENT section)
```
When the context includes a FACETS section for a skill, rate individual facets
instead of the skill as a whole. Use the facet keys shown in the context.

[SKILL_UPDATE]
concept-key: good | reason | context:tag
  facet-key-1: easy | reason | context:tag
  facet-key-2: good | reason | context:guided
[/SKILL_UPDATE]
```

### Match analysis
- System prompt says "FACETS section" — block produces "FACETS FOR skill_name" — **keyword match** ("FACETS" is the trigger word the AI looks for)
- System prompt says "Use the facet keys shown in the context" — block emits `facet-key: name [mastery: X%]` where `facet-key` is `f.concept_key` — **key format matches** the `facet-key-1` placeholder in the system prompt example
- `parseSkillUpdates()` regex for facet lines: `^(?:\s+|>)\s*([\w-]+):\s*(struggled|hard|good|easy)` — matches indented lines using the same `concept_key` format emitted by the block

**No format discrepancy. No blocking issues.**

---

## Summary

Both UXV checks PASS. The facet assessment block in `buildContext()` uses the identical function as the existing call sites in `buildFocusedContext()`, so format consistency is structurally guaranteed. The MAX_SKILLS=3 cap prevents token bloat in all modes.
