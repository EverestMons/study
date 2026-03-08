# Python Sidecar Packaging Spec

## Overview

Study uses pymupdf4llm (Python) for PDF parsing. Tauri is Rust + webview. The sidecar approach bundles a PyInstaller-compiled binary alongside the Tauri app so the user never needs Python installed.

**Scope:** macOS only (aarch64-apple-darwin) for now. Cross-platform and web deployment are future concerns.

---

## Architecture

```
Study.app
├── Tauri app (Rust + webview)
└── binaries/
    └── pdf-parser-aarch64-apple-darwin    ← PyInstaller binary
```

The frontend invokes the sidecar via `tauri-plugin-shell` (already in Cargo.toml). The sidecar is a short-lived CLI process: receives a file path, outputs JSON to stdout, exits. No long-running server, no HTTP, no socket.

---

## Sidecar Script: `pdf-parser`

A single Python script that wraps pymupdf4llm. Input: file path as CLI argument. Output: JSON to stdout.

```python
#!/usr/bin/env python3
"""Study PDF parser sidecar. Extracts markdown + structure from PDFs."""

import sys
import json
import hashlib
import pymupdf4llm
import pymupdf

def parse_pdf(path):
    """Extract structured content from a PDF file."""
    doc = pymupdf.open(path)
    
    # 1. Basic metadata
    meta = {
        "page_count": doc.page_count,
        "title": doc.metadata.get("title", ""),
        "author": doc.metadata.get("author", ""),
    }
    
    # 2. Full markdown extraction via pymupdf4llm
    md_text = pymupdf4llm.to_markdown(
        path,
        write_images=True,       # Extract images
        image_path="__IMAGES__", # Placeholder — replaced by caller with actual path
        show_progress=False,
    )
    
    # 3. Per-page extraction for page boundary tracking
    pages = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        page_md = pymupdf4llm.to_markdown(
            doc,
            pages=[page_num],
            show_progress=False,
        )
        
        # Font analysis for heading detection
        blocks = page.get_text("dict")["blocks"]
        font_sizes = {}
        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    size = round(span["size"], 1)
                    text = span["text"].strip()
                    if text:
                        font_sizes.setdefault(size, []).append({
                            "text": text[:200],
                            "flags": span["flags"],  # bold, italic, etc.
                        })
        
        pages.append({
            "page_num": page_num,
            "markdown": page_md,
            "char_count": len(page_md),
            "font_sizes": font_sizes,
            "image_count": len([b for b in blocks if b["type"] == 1]),
        })
    
    # 4. Table detection
    tables = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        page_tables = page.find_tables()
        for i, table in enumerate(page_tables.tables):
            tables.append({
                "page": page_num,
                "index": i,
                "rows": table.row_count,
                "cols": table.col_count,
                "content": table.extract(),
            })
    
    doc.close()
    
    return {
        "metadata": meta,
        "markdown": md_text,
        "pages": pages,
        "tables": tables,
    }


def extract_images(path, output_dir):
    """Extract images from PDF to filesystem. Returns image manifest."""
    doc = pymupdf.open(path)
    images = []
    
    for page_num in range(doc.page_count):
        page = doc[page_num]
        image_list = page.get_images(full=True)
        
        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            if not base_image:
                continue
            
            image_bytes = base_image["image"]
            ext = base_image["ext"]
            img_hash = hashlib.sha256(image_bytes).hexdigest()[:16]
            filename = f"p{page_num}-i{img_index}-{img_hash}.{ext}"
            filepath = f"{output_dir}/{filename}"
            
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            
            images.append({
                "page": page_num,
                "index": img_index,
                "filename": filename,
                "ext": ext,
                "size_bytes": len(image_bytes),
                "width": base_image.get("width", 0),
                "height": base_image.get("height", 0),
                "hash": img_hash,
            })
    
    doc.close()
    return images


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: pdf-parser <command> <path> [output_dir]"}))
        sys.exit(1)
    
    command = sys.argv[1]
    path = sys.argv[2]
    
    try:
        if command == "parse":
            result = parse_pdf(path)
        elif command == "images":
            if len(sys.argv) < 4:
                print(json.dumps({"error": "images command requires output_dir"}))
                sys.exit(1)
            result = {"images": extract_images(path, sys.argv[3])}
        else:
            result = {"error": f"Unknown command: {command}"}
            sys.exit(1)
        
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__}))
        sys.exit(1)
```

---

## Build Process

### Directory Structure

```
study/
├── src-tauri/
│   ├── binaries/           ← PyInstaller output goes here
│   └── tauri.conf.json
├── sidecar/
│   ├── pdf_parser.py       ← The script above
│   ├── requirements.txt    ← pymupdf, pymupdf4llm
│   ├── build.sh            ← PyInstaller build script
│   └── venv/               ← Python venv (gitignored)
```

### requirements.txt

```
pymupdf>=1.25.0
pymupdf4llm>=0.3.0
```

### build.sh

```bash
#!/bin/bash
# Build the PDF parser sidecar for macOS
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY_DIR="$SCRIPT_DIR/../src-tauri/binaries"

# Get target triple
TARGET_TRIPLE=$(rustc --print host-tuple 2>/dev/null || rustc -Vv | grep 'host:' | cut -d' ' -f2)
echo "Building for target: $TARGET_TRIPLE"

# Ensure venv exists
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    python3 -m venv "$SCRIPT_DIR/venv"
fi
source "$SCRIPT_DIR/venv/bin/activate"

# Install deps
pip install -r "$SCRIPT_DIR/requirements.txt" pyinstaller --quiet

# Build
pyinstaller \
    --onefile \
    --name "pdf-parser" \
    --distpath "$SCRIPT_DIR/dist" \
    --workpath "$SCRIPT_DIR/build" \
    --specpath "$SCRIPT_DIR" \
    --clean \
    --noconfirm \
    "$SCRIPT_DIR/pdf_parser.py"

# Copy with target triple suffix
mkdir -p "$BINARY_DIR"
cp "$SCRIPT_DIR/dist/pdf-parser" "$BINARY_DIR/pdf-parser-$TARGET_TRIPLE"

echo "Built: $BINARY_DIR/pdf-parser-$TARGET_TRIPLE"
echo "Size: $(du -h "$BINARY_DIR/pdf-parser-$TARGET_TRIPLE" | cut -f1)"

deactivate
```

### .gitignore additions

```
sidecar/venv/
sidecar/build/
sidecar/dist/
sidecar/*.spec
# The compiled binary is large — don't commit it
src-tauri/binaries/pdf-parser-*
```

---

## Tauri Configuration

### tauri.conf.json additions

```json
{
  "bundle": {
    "externalBin": ["binaries/pdf-parser"]
  }
}
```

Tauri automatically appends the target triple, so `binaries/pdf-parser` resolves to `binaries/pdf-parser-aarch64-apple-darwin` on Apple Silicon.

### capabilities/default.json

Add shell permissions for the sidecar:

```json
{
  "permissions": [
    "shell:allow-execute",
    "shell:allow-spawn",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/pdf-parser",
          "sidecar": true,
          "args": [
            { "validator": "\\S+" },
            { "validator": "\\S+" },
            { "validator": "\\S+" }
          ]
        }
      ]
    }
  ]
}
```

---

## Frontend Invocation

From the Tauri frontend (JavaScript), invoke the sidecar:

```javascript
import { Command } from '@tauri-apps/plugin-shell';

export async function parsePdf(filePath) {
  const command = Command.sidecar('binaries/pdf-parser', ['parse', filePath]);
  const output = await command.execute();
  
  if (output.code !== 0) {
    throw new Error(`PDF parser failed: ${output.stderr}`);
  }
  
  return JSON.parse(output.stdout);
}

export async function extractPdfImages(filePath, outputDir) {
  const command = Command.sidecar('binaries/pdf-parser', ['images', filePath, outputDir]);
  const output = await command.execute();
  
  if (output.code !== 0) {
    throw new Error(`Image extraction failed: ${output.stderr}`);
  }
  
  return JSON.parse(output.stdout);
}
```

For large PDFs, use streaming via `spawn()` instead of `execute()` to avoid buffering the entire output:

```javascript
export async function parsePdfStreaming(filePath, onProgress) {
  const command = Command.sidecar('binaries/pdf-parser', ['parse', filePath]);
  
  return new Promise((resolve, reject) => {
    let stdout = '';
    
    command.on('close', (data) => {
      if (data.code !== 0) {
        reject(new Error(`PDF parser exited with code ${data.code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse output: ${e.message}`));
      }
    });
    
    command.on('error', reject);
    
    command.stdout.on('data', (line) => {
      stdout += line;
    });
    
    command.stderr.on('data', (line) => {
      // Progress messages go to stderr
      if (onProgress) onProgress(line);
    });
    
    command.spawn();
  });
}
```

---

## Development Workflow

### First-time setup

```bash
cd sidecar
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### During development

Run the parser directly without PyInstaller — faster iteration:

```bash
source sidecar/venv/bin/activate
python3 sidecar/pdf_parser.py parse "/path/to/test.pdf" | python3 -m json.tool
```

The Tauri dev mode can be configured to use the script directly instead of the compiled binary by conditionally checking for the sidecar binary and falling back to `python3 sidecar/pdf_parser.py` via a regular shell command.

### Before building the Tauri app

```bash
cd sidecar
./build.sh
```

This must be run once before `tauri build` and again whenever `pdf_parser.py` changes.

### Automating the build

Add to `tauri.conf.json`:

```json
{
  "build": {
    "beforeBuildCommand": "cd sidecar && ./build.sh && cd .. && npx vite build"
  }
}
```

This ensures the sidecar is always rebuilt before the Tauri bundle.

---

## Size Budget

Expected binary sizes (macOS aarch64, PyInstaller --onefile):

| Component | Size |
|-----------|------|
| Python interpreter | ~5 MB |
| PyMuPDF (includes MuPDF C lib) | ~25 MB |
| pymupdf4llm | ~1 MB |
| PyInstaller overhead | ~2 MB |
| **Total sidecar** | **~33 MB** |
| Tauri app (without sidecar) | ~8 MB |
| **Total app** | **~41 MB** |

This is acceptable for a desktop app. For reference, Electron apps typically start at 150+ MB.

---

## Licensing Note

PyMuPDF is AGPL-licensed. Since the sidecar runs as a separate process (not linked into the Tauri binary), AGPL copyleft applies to the sidecar script, not to Study's main codebase. The sidecar script (`pdf_parser.py`) is in the public repo, satisfying AGPL's source distribution requirement. The Tauri app communicates with it via stdio, which constitutes "mere aggregation" under GPL/AGPL terms.

---

## Future Considerations

- **Web deployment:** When Study becomes a web app, the Python sidecar won't be available. Options: server-side PDF parsing endpoint, or WASM-compiled MuPDF (experimental). This is a future architecture decision.
- **Windows/Linux:** PyInstaller builds per platform. Set up GitHub Actions to build sidecars for each target when cross-platform support is needed.
- **Startup time:** PyInstaller `--onefile` extracts to a temp directory on first run (~1-2 seconds). For frequent invocations, consider `--onedir` mode or keeping the process alive between parses. Current design (invoked only on document upload) makes this a non-issue.
