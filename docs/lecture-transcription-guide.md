# How to Capture Lecture Transcripts for Study

A setup guide for recording and transcribing your lectures so you can feed them into Study.

---

## The Goal

You attend your lecture, pay attention, and learn. Meanwhile, a transcription tool quietly captures everything being said and produces a text file you can upload to Study afterward. Study then knows exactly what your professor taught and can help you master the material.

---

## Recommended Tool: Buzz

Buzz is free, open-source, and runs on Mac, Windows, and Linux. It uses OpenAI's Whisper models to transcribe audio to text entirely offline -- nothing leaves your computer. It has a simple graphical interface (no command line needed) and exports to `.txt`, `.srt`, and `.vtt` formats that Study can ingest directly.

**Why Buzz over other options:** It's cross-platform, completely free, works offline, and has a clean GUI. MacWhisper is an excellent alternative if you're on a Mac and want a more polished experience (free version available, Pro is a one-time $30 payment).

---

## Setup: Step by Step

### 1. Install Buzz

Go to the Buzz GitHub releases page: `github.com/chidiwilliams/buzz/releases`

Download the latest version for your operating system. On Mac, open the `.dmg` and drag to Applications. On Windows, run the `.exe` installer -- Windows Defender may warn you since the app isn't signed; click "More info" then "Run anyway." On Linux, install via Flatpak (`flatpak install flathub io.github.chidiwilliams.Buzz`) or Snap.

The install is roughly 1 GB because it includes the AI models needed for transcription.

### 2. Choose Your Whisper Model

When you first open Buzz, you'll need to select a transcription model. This is the tradeoff between speed and accuracy.

**For most lectures, use the "Medium" or "Small" model.** The Medium model gives strong accuracy for clear lecture audio. The Small model is faster and still quite good if your professor speaks clearly into a microphone. The Large model gives the best accuracy but takes significantly longer to process.

If your computer has a dedicated GPU (Nvidia), Buzz can use it for much faster processing. Check Buzz's preferences to enable GPU acceleration if available.

### 3. Recording the Lecture

You have two paths depending on how you attend class.

**If the lecture is in-person:** Use your phone or a portable recorder to capture the audio. Place it as close to the speaker as practical -- front row or near the podium microphone gives the best results. After class, transfer the audio file to your computer (AirDrop, USB cable, cloud sync, whatever works). Then drag and drop the file into Buzz.

**If the lecture is online (Zoom, Teams, etc.):** You need to capture the system audio coming through your computer. This requires a virtual audio device so Buzz can "listen" to what's playing through your speakers.

On Mac, install BlackHole (free, open source): `existential.audio/blackhole`. This creates a virtual audio device. Set up a Multi-Output Device in Audio MIDI Setup that sends sound to both your speakers (so you can hear) and BlackHole (so Buzz can capture). Then in Buzz, select BlackHole as your input source and start recording.

On Windows, you can use VB-Audio Virtual Cable (free): `vb-audio.com/Cable`. Install it, set your system output to the virtual cable, and select it as Buzz's input. You may need to also set up monitoring so you can still hear the lecture yourself.

Alternatively, most video conferencing platforms let you record the meeting directly. Record the session, then after class, drag the video or audio file into Buzz for transcription.

### 4. Transcribing

Once you have your audio file (or are recording live via microphone input), Buzz handles the rest.

**For a pre-recorded file:** Open Buzz, click File, then Import. Select your audio or video file. Choose your model, set the language (or leave on auto-detect), and click Transcribe. Buzz will process the file and show you the transcript in real time as it works. A one-hour lecture typically takes 5-15 minutes to transcribe depending on your model choice and hardware.

**For live transcription:** In Buzz, select "Record" and choose your microphone or virtual audio device as the input. Hit start. Buzz will transcribe in near real-time, though note this is resource-intensive and may lag on older hardware. For most users, recording first and transcribing after class is more reliable.

### 5. Exporting the Transcript

Once transcription is complete, export it as a `.txt` file. In Buzz, go to File, then Export, and select TXT format. Save it somewhere you'll remember.

The `.srt` subtitle format also works -- Study can read it. The `.srt` format includes timestamps, which can be useful if Study needs to reference specific moments in the lecture.

### 6. Review and Fill Gaps

Before uploading to Study, do a quick scan of the transcript. Whisper is remarkably accurate, but it can stumble on technical jargon specific to your field, proper nouns, or moments when the professor was far from the microphone.

**This is where you come in.** If you notice a section that was garbled or missed, type in what was actually said. You were there -- you watched the lecture. Your corrections ensure Study has accurate material to teach from. Even a rough note like "[professor discussed the Krebs cycle here but audio was unclear]" gives Study context to work with.

### 7. Upload to Study

Open Study, go to Upload Course Data, drag in your transcript file. When classifying, tag it as **Lecture Transcript**. Study will recognize it as content your professor delivered and will reference it accordingly -- "your professor explained..." rather than treating it as generic notes.

---

## Tips for Best Results

**Audio quality is everything.** A clear recording with the professor's voice as the dominant sound will transcribe far more accurately than a recording from the back of a 300-person lecture hall. Sit closer. Use an external microphone if you can. Even a cheap lapel mic connected to your phone dramatically improves capture quality.

**Name your files clearly.** Use a format like `lecture-03-organic-chem-feb-10.txt` so both you and Study can identify what the material covers at a glance.

**Don't skip the lecture.** Study is built on the assumption that you watched it. The transcript is a shared reference between you and Study -- it's not a replacement for being there. You bring the context of having heard the professor's tone, seen the slides, caught the emphasis. Study brings the ability to re-teach what you didn't fully absorb.

**Batch your transcriptions.** If you record all your lectures during the week, set aside time on the weekend to run them all through Buzz. Drag them all in at once -- Buzz can batch process multiple files.

---

## Quick Reference: Alternative Tools

If Buzz doesn't work for your setup, here are solid alternatives.

**MacWhisper** (Mac only) -- More polished interface, supports drag-and-drop, built-in AI prompts for summarization. Free version handles most needs. Pro version is $30 one-time. Available at `goodsnooze.gumroad.com/l/macwhisper`.

**Whishper** (self-hosted, any platform) -- Runs in Docker, provides a web UI. Good if you have a home server or want to run it on a more powerful machine. Supports translation to 60+ languages. Available at `whishper.net`.

**Scriberr** (self-hosted) -- Another Docker-based option with a polished web interface. Supports newer Nvidia Parakeet models alongside Whisper. Chat with your transcripts using local LLMs. Available at `github.com/rishikanthc/Scriberr`.

**YouTube auto-captions** -- If your lectures are posted to YouTube, you can download the auto-generated captions directly. Go to the video, click the three dots below it, and look for "Open transcript." Copy and paste into a text file. The accuracy varies but it's zero-effort.

**Zoom/Teams transcripts** -- Most video conferencing platforms now generate transcripts automatically. Check your meeting recordings for a downloadable transcript file.

---

## Troubleshooting

**Buzz is slow or freezing:** You're likely using too large a model for your hardware. Drop down to the Small or Tiny model. If you have an Nvidia GPU, make sure CUDA acceleration is enabled in Buzz's settings.

**Transcript is mostly gibberish:** The audio quality was too poor for the model to interpret. Try a larger model (Large-V3), or improve your recording setup for next time. In the meantime, manually fill in what you can remember and upload that -- even partial transcripts give Study something to work with.

**Can't capture system audio:** Virtual audio device setup can be tricky. On Mac, make sure BlackHole is properly configured as a Multi-Output Device in Audio MIDI Setup. On Windows, ensure VB-Audio Virtual Cable is set as your default output. Restart Buzz after changing audio settings.

**Transcript is in the wrong language:** Set the language explicitly in Buzz's settings rather than relying on auto-detect. Auto-detect occasionally misidentifies the language in the first few seconds and transcribes everything in the wrong one.
