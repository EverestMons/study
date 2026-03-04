# Encoding Safety Guide: Preventing Mojibake in AI-Assisted Projects

## What This Is

A reference for preventing and fixing UTF-8 double-encoding corruption (mojibake) in projects where AI generates or modifies source files. Born from a painful debugging session where a ~3000-line JSX file had every emoji, em-dash, smart quote, and special character corrupted beyond recognition.

---

## The Root Cause

**Double-encoding** happens when UTF-8 bytes are misinterpreted as Latin-1 or CP1252, then re-encoded back to UTF-8. Each original byte becomes 2-3 bytes of garbage.

Example chain:
```
folder emoji (U+1F4C2)
  -> UTF-8 bytes: F0 9F 93 82
  -> Misread as CP1252: 4 garbled characters
  -> Re-encoded to UTF-8: C3B0 C5B8 E2809C E2809A
  -> Displayed as garbled sequences
```

This happens silently. The file opens fine, the code runs fine, but every special character is now 2-3x as many bytes of nonsense. It compounds if the file gets round-tripped again.

**When it happens in AI workflows:**
- AI generates content with Unicode characters (emoji, em-dashes, smart quotes)
- File gets copied, pasted, or transferred through a layer that doesn't preserve UTF-8
- The artifact renderer, file I/O operation, or clipboard misinterprets the encoding
- The corrupted file gets fed back to the AI, which writes more content on top of it

---

## Prevention Rules

### Rule 1: ASCII-Only Source Code

Never put literal emoji or special Unicode characters in source code. Use escape sequences or constants.

**Bad:**
```jsx
const icon = '\u{1F4DA}'; // emoji pasted literally
const label = "Student doesn't complete homework \u2014 they outgrow it"; // em-dash pasted literally
```

**Good:**
```jsx
// Unicode constants -- defined once, used everywhere
const ICONS = {
  BOOKS: '\u{1F4DA}',
  FOLDER: '\u{1F4C2}',
  BOOKMARK: '\u{1F4D6}',
  CLIPBOARD: '\u{1F4CB}',
  MEMO: '\u{1F4DD}',
  PAGE: '\u{1F4C4}',
  INBOX: '\u{1F4E5}',
  MIC: '\u{1F399}\uFE0F',
  FRAME: '\u{1F5BC}\uFE0F',
  TRASH: '\u{1F5D1}',
  MAG: '\u{1F50D}',
  REPEAT: '\u{1F501}',
};

const label = "Student doesn't complete homework \u2014 they outgrow it";
```

**Even better -- skip emoji entirely:**
Use SVG icons, CSS symbols, or HTML entities. They can't get double-encoded.

### Rule 2: ASCII-Only in AI Prompts and Template Strings

System prompts, boot prompts, and any long text blocks embedded in code are especially vulnerable because they're full of natural language punctuation.

**Characters to avoid in string literals:**

| Character | Name | ASCII Alternative | Escape Sequence |
|-----------|------|-------------------|-----------------|
| -- (em) | Em-dash | `--` | `\u2014` |
| - (en) | En-dash | `-` | `\u2013` |
| smart quotes | Left/right single | `'` | `\u2018` `\u2019` |
| smart double | Left/right double | `"` | `\u201C` `\u201D` |
| -> | Arrow | `->` | `\u2192` |
| bullet | Bullet | `-` or `*` | `\u2022` |
| x | Multiplication | `x` | `\u00D7` |
| ... | Ellipsis | `...` | `\u2026` |

**Practical recommendation:** Just use ASCII punctuation in prompts. `--` instead of em-dash, straight quotes instead of smart quotes. The AI doesn't care, and it eliminates the risk entirely.

### Rule 3: Explicit Encoding in All File I/O

Never rely on default encoding. Always specify UTF-8 explicitly.

**Python:**
```python
# Reading
with open("file.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Writing
with open("file.txt", "w", encoding="utf-8") as f:
    f.write(text)

# Binary mode when you need byte-level control
with open("file.txt", "rb") as f:
    raw = f.read()

with open("file.txt", "wb") as f:
    f.write(raw)
```

**Node.js:**
```javascript
// Reading
const text = fs.readFileSync('file.txt', 'utf-8');

// Writing
fs.writeFileSync('file.txt', content, 'utf-8');

// Streams
const stream = fs.createReadStream('file.txt', { encoding: 'utf-8' });
```

**Fetch / Response handling:**
```javascript
// Ensure response is decoded as UTF-8
const text = await response.text(); // Uses UTF-8 by default
// But if you're handling raw bytes:
const buffer = await response.arrayBuffer();
const text = new TextDecoder('utf-8').decode(buffer);
```

### Rule 4: Validate After Every File Operation

After any operation that writes or transforms a file, run a quick encoding check.

**Quick shell check:**
```bash
# Look for mojibake indicators
grep -P '[\xC3][\x80-\xBF]' file.jsx && echo "MOJIBAKE DETECTED" || echo "Clean"
```

**Python validation function:**
```python
def check_encoding(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    mojibake_indicators = [
        '\u00c3\u00a2',  # double-encoded common prefix
        '\u00c3\u00b0\u0178',  # double-encoded emoji prefix
        '\u00c3\u00a9',  # double-encoded e-acute
        '\u00c5\u00b8',  # double-encoded character
        '\u00c2\u00a0',  # double-encoded non-breaking space
    ]

    issues = []
    for indicator in mojibake_indicators:
        count = text.count(indicator)
        if count:
            issues.append(f"Found {count}x: {repr(indicator)}")

    if issues:
        print(f"ENCODING ISSUES in {filepath}:")
        for issue in issues:
            print(f"  {issue}")
        return False

    print(f"Clean: {filepath}")
    return True
```

---

## Detection: How to Spot Mojibake Early

### Visual Indicators
If you see garbled multi-character sequences where a single character should be (especially sequences starting with what looks like "A" with diacritics), you have mojibake. Common patterns:

- 4-6 garbled characters where an emoji should be
- 3 garbled characters where an em-dash should be
- 3 garbled characters where a smart quote should be
- 3 garbled characters where an arrow should be

### The Garbled-A Test
If you see characters that look like capital A with accent marks followed by other unusual characters, that's almost certainly mojibake. Correct UTF-8 text should never produce these sequences visibly in source code.

---

## Recovery: Fixing Mojibake When Prevention Fails

### Attempt 1: Reverse the Double-Encoding (Python)

Works when the entire file was uniformly double-encoded:

```python
with open("corrupted.jsx", "rb") as f:
    raw = f.read()

try:
    # Decode as UTF-8, re-encode as Latin-1, decode as UTF-8 again
    text = raw.decode('utf-8')
    fixed = text.encode('latin-1').decode('utf-8')

    with open("fixed.jsx", "w", encoding="utf-8") as f:
        f.write(fixed)
    print("Fixed via latin-1 reversal")
except (UnicodeDecodeError, UnicodeEncodeError):
    print("Simple reversal failed -- need byte-level approach")
```

**This often only partially works.** If the file has a mix of correct and corrupted text (common when AI added new content on top of previously corrupted content), it will break the already-correct characters.

### Attempt 2: Byte-Level Replacement (The Nuclear Option)

When the simple reversal fails, you need to map specific corrupted byte sequences to their correct values.

```python
with open("corrupted.jsx", "rb") as f:
    raw = f.read()

# Map: (corrupted bytes) -> (correct bytes)
# Build your own map using the helper function below
byte_pairs = [
    # Add your specific corrupted -> correct byte mappings here
    # Example: folder emoji corrupted bytes -> correct UTF-8
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9c\xe2\x80\x9a', b'\xf0\x9f\x93\x82'),
    # em-dash corrupted -> correct
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9c', b'\xe2\x80\x94'),
]

for bad, good in byte_pairs:
    count = raw.count(bad)
    if count:
        print(f"Replacing {count}x")
        raw = raw.replace(bad, good)

with open("fixed.jsx", "wb") as f:
    f.write(raw)
```

### How to Build Your Own Byte Map

When you encounter a new corrupted character:

```python
# 1. Find the correct Unicode codepoint
char = '\u{1F4C2}'  # folder emoji
correct_bytes = char.encode('utf-8')
print(f"Correct UTF-8: {correct_bytes.hex()}")

# 2. Simulate the double-encoding via CP1252 (most common on Windows)
import codecs
corrupted_cp1252 = correct_bytes.decode('cp1252').encode('utf-8')
print(f"Corrupted via CP1252: {corrupted_cp1252.hex()}")
```

The CP1252 path is more common because bytes 0x80-0x9F map to different characters in CP1252 vs Latin-1 (Latin-1 leaves them as control characters, CP1252 maps them to smart quotes, dashes, etc.).

---

## Gotchas We Learned the Hard Way

1. **String-level replacement can fail where byte-level succeeds.** Python's string representation of mojibake characters can be ambiguous. When in doubt, work in binary mode (`rb`/`wb`).

2. **False positives in detection.** The byte sequence for a correct em-dash partially overlaps with mojibake search patterns. Your detector needs to check for the full corrupted sequence, not just fragments.

3. **Mixed corruption is the worst case.** If some characters are correct and others corrupted (because new content was added after initial corruption), the `encode('latin-1').decode('utf-8')` reversal will break the correct characters. You must use targeted byte replacement instead.

4. **It compounds.** If a corrupted file gets round-tripped again, you get triple-encoding. At that point, each emoji is 9+ bytes of garbage. Catch it early.

5. **The AI will happily write corrupted content.** If you feed a file with mojibake to an AI and ask it to modify the file, it may preserve the corrupted bytes in its output. Always validate the file before and after AI modifications.

---

## Checklist for New Projects

- [ ] Define a `ICONS` or `CHARS` constants object for any Unicode characters needed
- [ ] Use ASCII punctuation in all embedded strings (prompts, comments, labels)
- [ ] Specify `encoding='utf-8'` on every file read/write operation
- [ ] Add an encoding validation step to your build/test process
- [ ] If using emoji in UI, prefer SVG icons or CSS over literal emoji characters
- [ ] When AI generates or modifies files, validate encoding before committing changes
