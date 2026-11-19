# HARP Studio (Kitharaion)

Local-first song creation engine and UI for **[HARP](https://github.com/goldennftplatform-svg/HARP)**. It runs on your PC, uses your local Maestro/Pinokio models for neural song generation, and keeps audio/models/data on local/D: storage.

> Greek 1500s-inspired "Kitharaion" atelier UI (formerly codenamed Harpsachord). This is an **original local implementation**, not a fork of proprietary source code, models, or hosted services.

## What works now

- **Local web studio** at `http://127.0.0.1:3210`
  - Prompt-based instrumental **sketch engine** (procedural synthesis, no model download, no GPU required)
  - 4 stems: drums, bass, atmosphere, melody
  - **Editable drum sequencer (sketch sessions):** step grid with bar/beat labels, transport-synced playhead highlight, per-lane controls (clear / every beat / offbeats), and a reset-to-last-rendered action
  - **Pattern saved vs rendered state:** draft edits (including tempo/length/grid-size changes) autosave as pattern data, while audio updates only on **Save & render**; re-renders keep playback position non-jarring and preserve mix/FX/solo/mute
  - **Mixer & monitoring:** per-stem volume, mute, solo (sensible solo/mute interaction), pan/low/high/delay/reverb, master volume with a live peak meter/clipping indicator
  - **Playback/export parity:** offline export applies the same effective mix (volume/mute/solo) and FX chain as playback
  - **Consistent export naming:** `Session Name - Mix.wav` and `Session Name - Stem Name.wav`
  - Transport, loop, timeline seek, session rename/favorites/library
  - Audio import/playback (browser session import)
  - Projects and generated audio saved locally
- **Neural stem separation (best-effort, local):**
  - Studio panel shows resolved separator availability/config up front (`/api/separator`: exe path, model directory, default model, first-run download warning)
  - Runs as a background job (`POST /api/separate` → `GET /api/jobs/:id`, one background job at a time/shared tracking) via local `audio-separator`
  - Model selection field (and a stem-hint selector; actual output/stem count depends on the chosen model/tool and is detected from produced files)
  - Imports separated WAVs as a **new editable session** with per-stem mix/FX/solo/mute/export
  - Clearer job status/errors and guarded edge cases (unavailable separator, imported/browser-only sessions, missing audio, busy jobs, already-separated sessions handled explicitly)
- **D: drive storage**
  - Studio data/audio/projects: `D:\Harpsachord\data`
  - Maestro model downloads (primary): `D:\Harpsachord\models`
  - Separator model dir (default): `D:\Harpsachord\models\audio-separator` (or `config.separatorModelDir`)
  - Maestro Harpsachord workspace outputs: `D:\Harpsachord\maestro-output` (linked from `C:\pinokio\api\Maestro.git\app\outputs\Harpsachord`)
  - Logs/backups: `D:\Harpsachord\logs`, `D:\Harpsachord\backups`
- **Pinokio/Maestro integration**
  - Engines view discovers Maestro music models via Pinokio + Maestro API
  - Neural generation adapter submits to Maestro `POST /api/v1/director/generate-music` and imports finished audio into Harpsachord
  - Background job tracking (`/api/jobs/:id`) so the UI can resume watching after refresh
  - **Verified on this machine:** `ACE-Step v1.5 Turbo 2B` downloaded to D: and generated a 24s 48kHz instrumental WAV (`Midnight on the Sound`) which was imported, playable, and exportable in Harpsachord.

## Start

1. **Kitharaion only (scribe’s sketch engine):**
   - Double-click `Start Harpsachord.cmd`, or run `node start.js` from this folder.
   - Opens `http://127.0.0.1:3210`. Data path is read from `config.json`.
2. **Neural AI music (Maestro):**
   - Start Pinokio.
   - Start Maestro (Pinokio UI, or `C:\pinokio\bin\npm\pterm.cmd run pinokio://192.168.12.135:42000/api/Maestro.git --default start.js`).
   - Download a music model if needed (ACE-Step v1.5 Turbo is the lightweight starting point used here).
   - In Harpsachord, open **Engines → Check connection**, choose model, enter prompt/optional lyrics, generate. Keep the page open while rendering (can take minutes); jobs continue on the server and the page can resume polling.

## Sequencer & separation notes

- **Sequencer:** sketch patterns are normalized/persisted per session (`pattern`, 4 steps/beat). Editing the grid, per-lane fills/clears, or tempo/length saves a **draft**; use **Save & render** to regenerate the drum (and sketch) audio. Grid/step count stays in sync with BPM/duration; transport playhead highlights the current step during playback.
- **Mix/monitoring:** soloing any stem makes only soloed, unmuted stems audible (effective gain used in playback and offline export). The master peak meter is a live indicator to help avoid clipping (it does not limit audio).
- **Separation config:** `config.json` may set `separatorExe` and `separatorModelDir`. If unset, Harpsachord looks for `C:\pinokio\api\Maestro.git\app\env\Scripts\audio-separator.exe` and uses `D:\Harpsachord\models\audio-separator` for models. The UI calls `GET /api/separator` to surface resolved paths and warnings before running.

## Storage (current / expected)

**Current usage (after setup + one ACE-Step model + test outputs):**
- `D:\Harpsachord\models`: ~3.94 GB
- `D:\Harpsachord\data`: ~0.04 GB
- `D:\Harpsachord\maestro-output`: ~0.005 GB
- D: free during setup: ~1.84 TB

**Rough expectations (depends on chosen models):**
- Harpsachord app + sketch sessions: negligible to a few GB over time
- One lightweight neural music model/runtime: ~5–15 GB
- ACE-Step variants/support files: commonly several GB (quantized Turbo path used ~4 GB in this install)
- Larger music models (e.g. MiniMax-Music3 catalog states ~15 GB default download) or multiple models: ~15–60+ GB
- Separation models (audio-separator, downloaded on first run as needed): varies by model, often several GB
- Broader local stack (music + TTS + stem separation + image/video tools): ~80–150+ GB
- Generated audio/projects: grows with use (24s WAVs are a few MB each)

Keep models and long-term audio on D: (`config.json`, Maestro `wgp_config.json` primary checkpoint path set to `D:/Harpsachord/models`).

## Machine notes

Detected during setup: Windows, RTX 3080 10 GB VRAM, ~32 GB RAM, Node 22, Python installed, Maestro present in Pinokio. Quantized ACE-Step Turbo 2B ran on this GPU; speed/quality/length limits depend on model and system load.

## Limitations / honest status

- **Sketch engine** is deterministic procedural synthesis, not a trained generative model. It does not produce AI vocals, lyrics singing, or photorealistic “Suno-like” neural songs. Sketch audio is 22.05 kHz / 16-bit WAV.
- **Neural mode** imports one full-song audio result per generation (not natively separated neural stems). Use the **local separation** workflow to split a stored render into editable stems (best-effort).
- **Stem separation** depends on local `audio-separator`/model availability and runtime. First run may download a model and can take several minutes; results, quality, and stem count vary by model/audio and failures surface via job errors. Imported browser-only sessions cannot be separated from stored-session flow.
- **No proprietary access:** cannot use Suno/Bagpipes private models, accounts, catalogs, or closed-source features.
- **Model requirements:** neural generation needs Maestro running, a downloaded model, and sufficient disk/GPU/RAM; first runs may compile/load and take longer. Some model licenses restrict commercial use (check each model, e.g. noncommercial variants).
- **Reliability:** this is a prototype. Long generations/separations can fail or be interrupted; outputs may also appear in Maestro’s Harpsachord workspace. Pinokio control plane must be reachable for discovery/control.

## What it would take to become a fuller “Bagpipes + Suno” platform

- High-quality song generation: vocals/lyrics alignment, multiple model backends, extend/inpaint/remix, style/voice controls, faster inference
- Arrangement/DAW: multi-track timeline editing, MIDI/instruments, effects, automation, comping/takes
- Audio intelligence: more robust stem separation, transcription, beat/key detection, source separation, mastering
- Product/platform: robust job queue & GPU scheduling, user accounts/projects/cloud sync (optional), sharing/export formats, rights/licensing workflow, moderation/safety
- Integration: stable adapters for local tools (Pinokio apps) and optional external APIs, with clear model/license management
- Significant engineering effort beyond this prototype (UI/UX, audio DSP/ML, backend reliability, testing, and ongoing model maintenance).

## Tests

```bash
node --test
node --check server.js public/app.js maestro.js synth.js
```

## Key files

- `server.js`, `public/` – studio server/UI, sketch re-render, neural & separation jobs
- `synth.js` – procedural sketch renderer (deterministic, pattern-driven drums)
- `maestro.js` – Pinokio/Maestro discovery and neural generation/import
- `audio.js` – WAV inspection for imported/generated audio
- `config.json` – D: storage paths (and optional `separatorExe` / `separatorModelDir`)
- `start.js`, `Start Harpsachord.cmd` – launcher
- `pinokio_agent/skills/api/maestro/SKILL.md` – app-specific Maestro API notes
