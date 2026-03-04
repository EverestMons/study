# Buzz on macOS: Troubleshooting & Advanced Setup

A companion guide for when things don't go smoothly. If you followed the main lecture transcription guide and hit a wall installing or running Buzz on your Mac, start here.

---

## "Buzz is damaged and can't be opened"

This is the single most common issue on macOS. Buzz isn't code-signed or notarized by Apple, so Gatekeeper blocks it on every fresh install. You'll see one of three warnings: "Buzz.app is damaged and can't be opened," "can't be opened because Apple cannot check it for malicious software," or "from an unidentified developer."

**The fix:** After mounting the DMG and dragging Buzz into your Applications folder, open Terminal and run:

```bash
xattr -cr /Applications/Buzz.app
```

This strips the quarantine flag that macOS attaches to all downloaded files. Without it, Gatekeeper has nothing to complain about. Launch Buzz normally after this.

**Alternative approaches if Terminal isn't your thing:**

Right-click (or Control-click) Buzz.app in your Applications folder and choose "Open." A dialog will appear with an explicit "Open" button -- clicking it creates a permanent exception. Or go to System Settings -> Privacy & Security, where macOS shows an "Open Anyway" button for the most recently blocked app.

**On macOS Sequoia (15.x):** Gatekeeper enforcement got stricter. If the `xattr` command doesn't resolve it, try all three methods above in sequence. Sequoia users have reported needing both the `xattr` command and the right-click approach before it sticks.

---

## "This application is not supported on this Mac"

You downloaded the wrong architecture. There are two separate DMG files on SourceForge -- one for Apple Silicon (M1, M2, M3, M4) and one for Intel.

**Check your chip:** Apple menu -> About This Mac -> look for "Chip" (Apple Silicon) or "Processor" (Intel).

**Download the right one from SourceForge** (the macOS builds are not on GitHub):

- Apple Silicon: `Buzz-1.4.3-mac-arm64.dmg`
- Intel: `Buzz-1.4.3-mac-X64.dmg`

Both are at: `sourceforge.net/projects/buzz-captions/files/`

---

## Buzz is extremely slow or freezing during transcription

This usually means the Whisper model is too large for your hardware.

**If you have 8 GB of RAM:** Use the Small model. Medium will work but may be sluggish, especially on longer recordings.

**If you have 16 GB of RAM:** Medium is the sweet spot. Large-V3 will work but takes significantly longer.

**Make sure you're using the Whisper.cpp backend.** In Buzz, the backend is labeled "Model type" in the UI. Whisper.cpp is optimized for Mac hardware and uses GPU acceleration on Apple Silicon via Vulkan. The default OpenAI Whisper backend works but uses considerably more RAM and CPU.

**For Apple Silicon users wanting maximum speed:** Consider quantized models. In the model size dropdown, select "Custom" and paste a Hugging Face URL for a `q_5` quantized variant. This reduces memory usage and speeds up transcription with minimal accuracy loss.

---

## Live recording produces garbled or inaccurate results

**Check your Mic Mode.** macOS Sonoma and Sequoia include a Voice Isolation feature that processes microphone input before apps receive it. This can alter the audio in ways that confuse Whisper. Open the menu bar audio controls (click the sound icon or use Control Center) and set Mic Mode to "Standard" instead of Voice Isolation or Wide Spectrum.

**Grant microphone access.** The first time you try live recording, macOS prompts for permission. If you dismissed it, go to System Settings -> Privacy & Security -> Microphone and make sure Buzz is toggled on.

**When in doubt, record first, transcribe later.** Live transcription is resource-intensive and can lag on older hardware. Recording the lecture on your phone or computer and then dragging the file into Buzz afterward is more reliable and typically produces better results.

---

## Can't capture system audio from Zoom/Teams/browser

Buzz can only record from audio input devices. To capture what's playing through your speakers (like a Zoom call), you need a virtual audio loopback driver.

**Install BlackHole** (free, open source). The easiest method is via Homebrew:

```bash
brew install blackhole-2ch
```

If you don't have Homebrew, download BlackHole directly from `existential.audio/blackhole`.

**Set up a Multi-Output Device** so you can hear the lecture *and* Buzz can capture it:

1. Open Audio MIDI Setup (search for it in Spotlight).
2. Click the "+" button at the bottom left and choose "Create Multi-Output Device."
3. Check both your speakers/headphones and BlackHole 2ch.
4. Make sure your speakers/headphones are listed first (this is your "master" device).
5. Set this Multi-Output Device as your system output in System Settings -> Sound -> Output.
6. In Buzz, select "BlackHole 2ch" as your microphone input.

Now your system audio routes to both your ears and Buzz simultaneously.

**If audio still isn't captured:** Restart Buzz after changing audio settings. Buzz sometimes doesn't pick up new audio devices until relaunch.

---

## Transcript is in the wrong language

Whisper's auto-detection guesses the language from the first few seconds of audio. If those seconds contain silence, background noise, or a brief aside in another language, it can lock in the wrong language for the entire transcription.

**The fix:** Always manually select the source language in Buzz's settings before transcribing. This single change eliminates the most common accuracy issues.

---

## Transcript is mostly gibberish or highly inaccurate

This is almost always an audio quality problem. Whisper is remarkably accurate with clear audio and struggles badly with poor recordings.

**For next time:** Sit closer to the speaker. Even a cheap lapel mic connected to your phone dramatically improves capture quality. Front row or near the podium mic makes a noticeable difference.

**For the recording you already have:** Try transcribing again with a larger model. If you used Small, try Medium. If you used Medium, try Large-V3 or Turbo. Larger models handle noise and distance better.

**You can also guide the model** with the "Initial prompt" field under Advanced settings. Enter technical terms, proper nouns, or domain-specific vocabulary that Whisper might misinterpret. For example, if your professor frequently says "Krebs cycle" and Whisper keeps writing "Crabs cycle," adding "Krebs cycle" to the initial prompt helps.

**If parts are still unusable:** Manually fill in what you can remember. Even a rough note like "[professor discussed enzyme kinetics here but audio was unclear]" gives Study context to work with when you upload the transcript.

---

## macOS version-specific issues

**Sequoia (15.x):** Strictest Gatekeeper enforcement. See the first section above. Also inherits Sonoma's Voice Isolation mic behavior -- disable it for clean recording input.

**Sonoma (14.x):** Some users experienced transcription jobs hanging at the very end when using the Whisper.cpp backend. This was caused by GPU-related changes in Sonoma that affected the upstream whisper.cpp library. Buzz v1.4.x includes fixes for this. If you're on an older version of Buzz, update to v1.4.3.

**Ventura (13.x):** Generally the smoothest experience. No known Buzz-specific issues.

**Monterey (12.x) and older / older Intel Macs:** Compatibility is limited and not officially documented. Buzz v1.4.3 improved whisper.cpp support for older CPUs, but if you're on a pre-2018 Mac, you may encounter issues. As a practical baseline, macOS 13 Ventura or later gives the most reliable experience.

---

## Alternative installation: PyPI (for power users)

If the DMG doesn't work on your system or you prefer managing Buzz via Python, you can install from PyPI:

1. Install Python 3.12 (via `python.org` or Homebrew: `brew install python@3.12`).
2. Install ffmpeg: `brew install ffmpeg`.
3. Install and run Buzz:

```bash
pip install buzz-captions
python -m buzz
```

This method bypasses the DMG and Gatekeeper entirely. It's also useful if you want to run Buzz from the command line for batch scripting:

```bash
buzz add --task transcribe --model-type whispercpp --model-size medium --srt /path/to/lecture.mp3
```

---

## Quick reference: which model should I use?

| Model | RAM needed | Speed | Best for |
|-------|-----------|-------|----------|
| Tiny | 2 GB | Very fast | Quick drafts, very old hardware |
| Small | 4 GB | Fast | 8 GB Macs, clear audio |
| **Medium** | **8 GB** | **Moderate** | **16 GB Macs -- recommended starting point** |
| Turbo | 8 GB | Moderate | Near-Large accuracy, faster than Large |
| Large-V3 | 10+ GB | Slow | Maximum accuracy, noisy recordings |

Always use the **Whisper.cpp** backend on Mac. It's the only backend that efficiently uses Apple Silicon's GPU without requiring an NVIDIA card.
