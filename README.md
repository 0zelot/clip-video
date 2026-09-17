# Clip

**A private video editor for TikTok, YouTube Shorts and Reels that runs entirely in your browser.**

Import your footage, cut it, add photos, text and TikTok-style captions, then export a finished MP4 - all on your own
device. There is no account, no upload and no server: your files never leave your computer or phone, and once the app
has loaded it keeps working with the internet switched off.

---

## Contents

- [What you can do](#what-you-can-do)
- [Getting started](#getting-started)
- [A typical edit, step by step](#a-typical-edit-step-by-step)
- [Captions](#captions)
- [Exporting](#exporting)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Your projects and files](#your-projects-and-files)
- [Supported formats](#supported-formats)
- [Running and building the app](#running-and-building-the-app)
- [The Android app](#the-android-app)
- [Good to know](#good-to-know)
- [For developers](#for-developers)
- [License](#license)

---

## What you can do

**Cut and arrange**
- Trim clips by dragging their edges, split at the playhead, delete, duplicate and reorder.
- Join several videos into one, drop photos or title cards between them and set how long each is on screen.
- Mark an In and an Out point and ripple-delete everything in between.
- Multiple video and audio tracks with mute, hide, lock and layer reordering.

**Speed**
- Presets from 0.25× to 4× plus any custom value.
- Apply speed to a whole clip or only to the part between your In and Out marks.
- Pitch is preserved, so sped-up speech does not turn into a chipmunk.

**Pictures, overlays and text**
- Add images at any point on the timeline, then drag, scale and rotate them directly on the preview.
- Position, scale, rotation, opacity, flip, fit/fill and crop (with 9:16, 16:9, 1:1, 4:5 presets) for every visual clip.
- Text clips with font, size, colour, opacity, bold/italic, alignment, line height, letter spacing, outline, shadow and a
  background box - plus ready-made looks and in/out animations (fade, pop, slide, zoom, bounce, typewriter).
- Import your own fonts (`.ttf`, `.otf`, `.woff2`); they are used in the preview and in the export.

**Transitions and looks**
- Transitions between neighbouring clips: cut, fade, crossfade, dip to black/white, slide, wipe and zoom, each with an
  adjustable duration.
- Filters (Natural, Warm, Cold, B&W, Vintage, Cinematic, High contrast, Dreamy) and manual controls for brightness,
  contrast, saturation, hue, blur, grayscale, sepia, invert and vignette - for a whole clip or just a marked range.
- Project background: solid colour, gradient or a blurred copy of the video (handy for landscape footage in a vertical
  frame).

**Sound**
- Several audio tracks at once - for example music plus a voice-over.
- Per clip: volume, mute, fade in/out, trim, split, loop, speed and pitch (±12 semitones).
- Turn the volume down for just one part of a clip by marking a range and applying it there.
- Waveforms on the timeline make it easy to line audio up with the picture.

**Captions (the TikTok kind)**
- Generate them automatically from speech - the recognition model runs on your device.
- Or import an `.srt` / `.vtt` file, or paste your script and let Clip split it into short phrases.
- Every phrase is a clip you can retime, re-word, split or merge.
- Styles like CapCut Pro: the word being spoken can change colour, scale, pop, bounce or get a highlight box; outline,
  shadow, background, custom fonts, entry animations and five ready-made presets.
- Choose where captions sit on the frame (top, middle, lower third, bottom) or drag them anywhere on the preview.

**Export**
- MP4 (H.264 + AAC) by default, WebM as an alternative, with automatic fallback when a browser lacks a codec.
- Pick resolution, frame rate, quality (or an exact bitrate) and audio bitrate.
- Progress, time remaining, cancel - and a preview of the result before you download it.

---

## Getting started

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

For a real (faster) build:

```bash
npm run build
npx serve .output/public
```

The build in `.output/public` is a plain folder of static files - you can host it anywhere (GitHub Pages, Netlify, your
own server) as long as unknown paths fall back to `index.html`.

**Browser:** Chrome or Edge 94+, Firefox 130+, Safari 16.4+. Exporting needs WebCodecs; everything else (importing,
editing, saving) also works without it.

---

## A typical edit, step by step

1. **Create a project.** Pick a format - 9:16 for TikTok/Shorts/Reels, 16:9 for YouTube, 1:1 or 4:5 - and a frame rate.
   You can also drop video files straight onto the start page and Clip will create the project for you.
2. **Import media.** Drag files into the window, or use **Import** in the Media panel. Dropping a file directly onto a
   track puts it exactly where you dropped it. On a phone the same button opens your gallery.
3. **Arrange the timeline.** Drag clips to move them (also between tracks), drag their edges to trim, press `S` to split
   at the playhead. Zoom with `+` / `−`, `Ctrl`+scroll or a pinch.
4. **Adjust a clip.** Select it and use the panel on the right: timing, speed, transform, effects, transition and audio.
   Images and text can also be dragged, scaled and rotated right on the preview.
5. **Add text.** Press `T` or open the **Text** tab, pick a look, type your words and place them on the frame.
6. **Add captions.** See below.
7. **Add music or a voice-over.** Import the audio file - it lands on an audio track. Set volume and fades, and mark a
   range if you want to duck the music under a voice-over.
8. **Export.** `Ctrl+E`, choose quality, and download or share the file.

Everything is saved as you go, and every change can be undone with `Ctrl+Z`.

---

## Captions

Open the **Captions** tab in the left panel (or the captions button above the timeline). There are three ways to get
started:

**Auto - from speech.** Choose the clip with the voice, a model size and a language, then press *Generate captions*.
The speech model runs locally in your browser (WebGPU when available, otherwise WebAssembly). The first run downloads
the model once - about 45 MB for the fastest one - and the browser caches it, so later runs work offline too. Your audio
is never uploaded anywhere.

**From a subtitle file.** Import `.srt` or `.vtt` and the timings come with it.

**From your script.** Paste the text; Clip splits it into short phrases and spreads them over the project. Then fix the
timings phrase by phrase - the waveform on the timeline helps.

Afterwards:

- Every phrase is listed in the panel: edit the words, nudge the start/end times, split a phrase in two or merge it with
  the next one, or jump the playhead to it.
- Pick a preset (Word pop, Karaoke box, Bounce, Minimal, Scale focus) and then fine-tune anything: font, size, colour,
  outline, shadow, background box, and how the spoken word is highlighted.
- Choose a position preset or drag the captions anywhere on the preview.
- Changing the style updates every caption at once; selecting a single caption lets you edit just that one.

Captions live on their own track, so you can still move, trim and delete them like any other clip.

---

## Exporting

Press **Export** (or `Ctrl+E`):

| Option | What it does |
| --- | --- |
| Format | MP4 (H.264 + AAC) or WebM (VP9 + Opus). If your browser can't encode the choice, Clip uses the best available codec and tells you. |
| Resolution | The project resolution, or a smaller 1080p / 720p / 480p version. |
| Frame rate | 24, 25, 30, 50 or 60 fps. |
| Quality | Low / Medium / High, or type an exact bitrate. |
| Audio | Bitrate, or turn audio off entirely. |

Rendering happens in the background, so the app stays responsive, and you can cancel at any time. When it finishes you
get a preview plus **Download** (on Android: *Save to device* and the system share sheet).

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` `→` | One frame back / forward |
| `Shift` + `←` `→` | Jump one second |
| `Home` / `End` | Go to start / end |
| `S` or `Ctrl+B` | Split at the playhead |
| `T` | Add text at the playhead |
| `Delete` / `Backspace` | Delete the selected clips |
| `Shift+Delete` | Ripple-delete the In→Out range |
| `I` / `O` | Set the In / Out point |
| `Ctrl+D` | Duplicate |
| `Ctrl+A` / `Esc` | Select all / deselect |
| `N` | Snapping on/off |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` | Save now |
| `Ctrl+E` | Export |
| `+` / `−` | Zoom the timeline |
| `?` | Show this list in the app |

On a touch screen: tap a clip to select it, then drag it or its edges; pinch the timeline to zoom; long-press a clip for
more actions.

---

## Your projects and files

- Projects are stored **on your device** (in the browser's IndexedDB), together with the media you import.
- **Autosave** runs shortly after you stop editing. The top bar shows *Saved*, *Saving…*, *Unsaved changes* or
  *Save failed*, and `Ctrl+S` saves immediately.
- Refreshing the page reopens the same project; restarting the app offers to continue where you left off.
- The start page lists your projects - open, rename, duplicate or delete them there. It also shows how much storage you
  are using and can ask the browser to make that storage permanent (worth doing).
- If a file is too big to store (or the browser blocks storage), Clip tells you and keeps the project intact: the clip is
  marked as offline and a **Re-link** button lets you point at the original file again later.
- Deleting a project also deletes the media only that project used.

---

## Supported formats

| Type | Formats |
| --- | --- |
| Video | MP4, M4V, WebM, MOV, MKV (depending on the codecs your browser supports) |
| Audio | MP3, WAV, M4A/AAC, OGG/Opus, FLAC |
| Images | PNG, JPG, WebP, AVIF, GIF (first frame) |
| Subtitles | SRT, VTT, plain text |
| Fonts | TTF, OTF, WOFF, WOFF2 |

If a file uses a codec your browser can't decode, Clip says so when you import it instead of silently showing a black
frame.

---

## Running and building the app

```bash
npm install        # install dependencies
npm run dev        # development server on http://localhost:3000
npm run build      # static production build in .output/public
npm test           # unit tests for the editing core
```

The project is plain JavaScript (Nuxt 4 + Vue 3, no TypeScript build step). There is no backend to configure, no
environment variables and no API keys.

---

## The Android app

The same code ships as an Android app through Capacitor; the `android/` project is already set up.

```bash
npm run build            # build the web app
npx cap sync android     # copy it into the Android project
npx cap open android     # open in Android Studio, then run it or build an APK
```

Or, with a device connected: `npm run android`.

From the command line (requires the Android SDK):

```bash
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

On Android you get gallery and file import, saving exports to `Documents/Clip`, the system share sheet, touch gestures
with pinch-to-zoom, and a layout made for small screens.

---

## Good to know

- **Exporting needs WebCodecs.** Without it the editor still works, but the export button explains that the browser
  can't encode video.
- **Clip is built for short-form video.** The exported file is assembled in memory, so very long, very high-bitrate
  exports can run out of RAM.
- **Automatic captions download a model once.** Everything else in Clip works offline from the first load; the speech
  model is the only thing fetched from the network, and only when you ask for it.
- **Exotic codecs** (HEVC or ProRes inside `.mov`, for instance) only work if your system and browser can decode them.
- **Animated GIFs/WebP** are used as a still image.

---

## For developers

The code is split so that features can be added without rewriting the app:

```
app/core/        project model, editing operations, time math, frame + text renderer  (no Vue, no DOM)
app/services/    storage (IndexedDB), media probing, playback engine, export pipeline, captions, platform glue
app/stores/      Pinia state: project + undo history, editor UI, media, captions
app/components/  ui / editor / media / canvas / timeline / properties / captions / text / export
app/workers/     export and media-analysis Web Workers
```

Key ideas: the project is an immutable value changed through Immer, so undo/redo is cheap and never copies media; the
same compositor draws the preview and the export, fed by different frame providers; the playhead lives outside Vue's
reactivity so playback never re-renders components; media binaries stay out of the project model and are streamed from
IndexedDB.

`npm test` covers the editing core (timeline operations, snapping, time mapping, project migration).

---

## License

MIT - see [LICENSE](LICENSE).
