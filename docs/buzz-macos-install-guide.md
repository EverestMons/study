# Installing Buzz on macOS: a complete guide

Buzz v1.4.3 -- released January 25, 2026 -- is the latest version of the popular open-source Whisper-based transcription tool, and it runs natively on both Apple Silicon and Intel Macs via separate DMG downloads hosted on SourceForge. The biggest installation hurdle most users face isn't technical but rather macOS Gatekeeper blocking the unsigned app. A single Terminal command resolves it. Once past that, Buzz offers five transcription backends, multiple Whisper model sizes, live microphone recording, and file-based transcription with export to SRT, VTT, and TXT -- all running locally and offline after the initial model download.

## Downloading the correct DMG from SourceForge

Unlike the Windows and Linux builds, **macOS DMG files are not hosted on GitHub release assets**. They live exclusively on SourceForge. Two architecture-specific builds are available for v1.4.3:

| Build | File name | Download link |
|-------|-----------|---------------|
| Apple Silicon (M1-M4) | `Buzz-1.4.3-mac-arm64.dmg` | `https://sourceforge.net/projects/buzz-captions/files/Buzz-1.4.3-mac-arm64.dmg/download` |
| Intel | `Buzz-1.4.3-mac-X64.dmg` | `https://sourceforge.net/projects/buzz-captions/files/Buzz-1.4.3-mac-X64.dmg/download` |

The Apple Silicon DMG weighs roughly **466 MB**. Downloading the wrong architecture produces a cryptic "this application is not supported on this Mac" error, so verify which chip your Mac uses before downloading (Apple menu -> About This Mac -> Chip). An alternative installation path exists via PyPI: install Python 3.12 and ffmpeg (`brew install ffmpeg`), then run `pip install buzz-captions && python -m buzz`.

The v1.4.3 release fixed whisper.cpp support on older CPUs and resolved speaker identification issues. The prior v1.4.1 release was the major feature milestone, adding speaker identification, video support in the transcription viewer, and support for **1,000+ languages** via MMS models through the Hugging Face backend.

## Getting past Gatekeeper on macOS

Buzz is **not code-signed or notarized by Apple**, which means every macOS installation triggers Gatekeeper. Users typically see one of three warnings: "Buzz.app is damaged and can't be opened," "can't be opened because Apple cannot check it for malicious software," or "from an unidentified developer." The official docs acknowledge the signing issue but offer no macOS-specific guidance, so here is what actually works.

The most reliable method is removing the quarantine attribute before first launch. After mounting the DMG and dragging Buzz into `/Applications`, open Terminal and run:

```bash
xattr -cr /Applications/Buzz.app
```

This strips the `com.apple.quarantine` extended attribute that macOS applies to all downloaded files. Without it, Gatekeeper has nothing to flag. Alternatively, right-click (or Control-click) Buzz.app and choose "Open" -- a dialog appears with an explicit "Open" button that creates a permanent exception. A third option is navigating to **System Settings -> Privacy & Security**, where macOS displays an "Open Anyway" button for the most recently blocked app.

After clearing the Gatekeeper hurdle, macOS will prompt for **microphone access** the first time you attempt live recording. Grant this in System Settings -> Privacy & Security -> Microphone. No other special permissions are required for normal operation.

## Known issues on Sequoia, Sonoma, and older releases

**macOS Sequoia (15.x)** tightened Gatekeeper enforcement, making the unsigned-app warnings more aggressive than on prior versions. An early Buzz issue (GitHub #924) reported a hard block on Sequoia 15.0 that prevented both the DMG and Homebrew installs from launching; this was resolved in later Buzz releases. Sequoia also continues Sonoma's **Voice Isolation** mic mode, which can alter audio channel mapping and degrade live transcription quality. If live recording produces garbled results, set Mic Mode to **"Standard"** from the menu bar's audio controls.

**macOS Sonoma (14.x)** introduced GPU-related changes that caused the upstream whisper.cpp library to occasionally hang at the end of transcription jobs. This manifests in Buzz when using the Whisper.cpp backend. The issue has been addressed in newer whisper.cpp releases bundled with Buzz 1.4.x, but users on older Buzz versions may still encounter it.

**macOS Monterey (12.x)** and older Intel Macs have limited compatibility. GitHub issue #826 documents a 2017 MacBook Air unable to run Buzz 1.0 despite successful installation. The v1.4.3 fix for "whisper.cpp on older CPUs" should improve the situation, but no official minimum macOS version is documented. As a practical guideline, **macOS 13 Ventura or later** appears to be the safe baseline for a smooth experience.

For Apple Silicon specifically, early releases had crashes during live recording on M1 Macs (issues #512 and #724), but these have been resolved. Performance on Apple Silicon is excellent -- whisper.cpp leverages the integrated GPU via **Vulkan acceleration**, enabling real-time transcription even on laptops.

## Choosing a Whisper model and transcription backend

On first launch, Buzz presents a clean main window. The critical first decision is selecting a **transcription backend** (called "Model type" in the UI). Five are available, but on macOS the clear winner is **Whisper.cpp** -- it runs efficiently on both Apple Silicon and Intel, supports GPU acceleration without requiring an NVIDIA card, and handles real-time transcription on modern MacBooks. Faster Whisper requires NVIDIA CUDA and is effectively unusable on Macs. The original OpenAI Whisper implementation works but consumes significantly more RAM. The Hugging Face backend unlocks 1,000+ languages via MMS models. The OpenAI Whisper API offloads computation to the cloud (requires an API key and incurs costs).

Model size selection depends on your hardware and accuracy needs:

| Model | Parameters | Best for |
|-------|-----------|----------|
| Tiny | ~39M | Quick drafts, older hardware |
| Base | ~74M | Casual use, fast results |
| Small | ~244M | Good accuracy, modest resources |
| **Medium** | **~769M** | **Best accuracy/speed balance on Apple Silicon** |
| Large-V3 | ~1.55B | Maximum accuracy, slow on laptops |
| Turbo (V3-Turbo) | ~809M | Near-Large accuracy at faster speed |

**Medium is the recommended starting point** for Apple Silicon Macs with 16 GB of RAM. On 8 GB machines, drop to Small. Models download automatically on first use and are cached in `~/Library/Caches/Buzz`. For Whisper.cpp specifically, quantized models (e.g., `q_5` variants from Hugging Face) reduce memory usage and improve speed with minimal accuracy loss -- load these by selecting "Custom" in the model size dropdown and pasting the Hugging Face download URL.

One critical accuracy tip: **always manually select the source language** rather than relying on auto-detection. This significantly reduces transcription errors. You can also pass commonly misspelled names or domain-specific terms in the "Initial prompt" field under Advanced settings to guide the model.

## Transcribing files and recording live audio

For file-based transcription, press **Cmd+O** or click File -> Import Media File. Buzz accepts MP3, WAV, M4A, MP4, MOV, AVI, and most other formats via FFmpeg. After selecting a file, configure the task (Transcribe or Translate to English), language, model, and export format, then click Run. Double-click a completed transcription to open the viewer, where you can edit text inline and export.

For live microphone transcription, select your input device from the Microphone dropdown and hit Record. macOS will request microphone permission on first use. To capture **system audio** (e.g., from a browser or video call), you need a virtual audio loopback driver. The recommended solution is **BlackHole** (`brew install blackhole-2ch`). After installation, create a Multi-Output Device in Audio MIDI Setup that combines your speakers with BlackHole, set it as your system output, then select BlackHole as the microphone input in Buzz.

Buzz also supports a **watch folder** feature that automatically transcribes new files placed in a designated directory -- useful for batch workflows. A full CLI is available for scripting: `buzz add --task transcribe --model-type whispercpp --model-size medium --srt /path/to/file.mp3`.

Export options include **TXT** (plain text), **SRT** (SubRip subtitles with timestamps), and **VTT** (WebVTT subtitles). Word-level timings can be enabled for per-word subtitle generation, and a Resize tool merges word-level segments into properly sized subtitle blocks. Live transcription can export in real-time to a `.txt` file, which integrates cleanly with OBS Studio for live captioning.

## Conclusion

Buzz v1.4.3 is a mature, capable transcription tool that runs well on modern Macs once you clear the Gatekeeper hurdle with `xattr -cr`. The key decisions that determine your experience are choosing the right architecture DMG (arm64 for Apple Silicon, X64 for Intel), selecting **Whisper.cpp** as your backend for optimal Mac performance, and picking the **Medium** model as your starting point. macOS Ventura 13 or later provides the most reliable baseline, and users on Sequoia should disable Voice Isolation for clean microphone input. A paid Mac App Store version exists with a native UI but fewer backends -- the free open-source version from SourceForge remains more feature-rich, offering five backends, speaker identification, speech separation, and the full CLI.
