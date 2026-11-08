# Clip

**A private video editor for TikTok, YouTube Shorts, Reels and full-length YouTube videos - in your browser, on
Android and as a desktop app for Windows, Linux and macOS.**

Import your footage, cut it, change the speed, add photos, stickers, text, AI voice-overs and TikTok-style captions, then
export a finished MP4 - all on your own device. There is no account, no upload and no server: your files never leave
your computer or phone, and the app keeps working with the internet switched off (only the optional AI models and
voices are downloaded once, the first time you use them).

---

## Contents

- [Quick start (the 2-minute version)](#quick-start-the-2-minute-version)
- [What you can do](#what-you-can-do)
- [A typical edit, step by step](#a-typical-edit-step-by-step)
- [Captions](#captions)
- [AI voice-over (text to speech)](#ai-voice-over-text-to-speech)
- [Exporting](#exporting)
- [Keyboard shortcuts and gestures](#keyboard-shortcuts-and-gestures)
- [Your projects and files](#your-projects-and-files)
- [Supported formats](#supported-formats)
- [Building and running - step by step](#building-and-running---step-by-step)
- [Good to know](#good-to-know)
- [For developers](#for-developers)
- [License](#license)

---

## Quick start (the 2-minute version)

**I just want to use it.** Download the ready-made file for your system from the releases (or build it yourself, see
below) and double-click it. Nothing to install:

| System | File | How to start it |
| --- | --- | --- |
| Windows | `Clip-<version>-windows-portable.exe` | Double-click. (Windows SmartScreen may warn about an unknown app: *More info* → *Run anyway*.) |
| Linux | `Clip-<version>-linux-x86_64.AppImage` | Right-click → *Properties* → *Allow executing as program*, then double-click. Or in a terminal: `chmod +x Clip-*.AppImage && ./Clip-*.AppImage` |
| macOS | `Clip-<version>-mac-arm64.zip` (Apple M1 and newer) or `-mac-x64.zip` (Intel) | Unzip and move `Clip.app` to *Applications*. The app is not signed with an Apple certificate, so the first time macOS refuses it ("damaged" or "cannot be opened") - run `xattr -cr /Applications/Clip.app` in *Terminal* once, then open it normally. |
| Android | `app-debug.apk` | Copy it to the phone, open it and allow installing from this source. |
| Browser | - | Open the hosted web version (any static hosting, see below). |

**I have the source code.** Install [Node.js](https://nodejs.org) 20.19 or newer, open a terminal in this folder and run:

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:3000** in Chrome or Edge. That's it.

---

## What you can do

**Cut and arrange**
- Trim clips by dragging their edges, split at the playhead, delete, duplicate and reorder.
- Join several videos into one, drop photos or title cards between them and set how long each is on screen.
- Mark an In and an Out point and ripple-delete everything in between.
- Multiple video and audio tracks with mute, hide, lock and layer reordering. The *+ video* / *+ audio* buttons sit in
  the top-left corner of the timeline, so they stay visible however many tracks you have.
- **Freeze frame** (`F`): insert a 2-second still of the current frame.
- **Markers** (`M`): mark beats or ideas on the ruler, jump between them with `[` and `]`; clips snap to them.

**Speed**
- Any speed from 0.1× to 16× with 0.001 precision (e.g. 1.16×): logarithmic slider, presets, ±0.01 / ±0.1 nudges.
- *Fit to duration*: type how long the clip should last and the speed is calculated for you.
- **Smooth speed ramps**: a clip can glide from its edge speed (e.g. 1×) to the main speed (e.g. 3×) and back, with
  adjustable ease-in and ease-out times.
- **Speed for just a part of a clip**: mark In/Out, choose how gradual the change should be, and only that range speeds
  up (or slows down) - easing in and out instead of jumping.
- Pitch is preserved, so sped-up speech does not turn into a chipmunk.

**Photos, stickers and overlays**
- Put any photo or video *on top* of your footage (Elements → *Photo or video on top*, or *Add as overlay* in the media
  library) and move it anywhere, scale it with the corner handles or a two-finger pinch, rotate it with the round handle.
  It snaps to the centre lines.
- 12 built-in shapes (arrow, circle, frame, heart, star, "WOW" burst, speech bubble, Subscribe, Like, NEW, swoosh, bar)
  and 28 emoji stickers.
- **Opacity and transparency in %** for every photo, sticker, video, text and caption.
- Blend modes (multiply, screen, overlay, soft light, difference, …) and **mask shapes** (circle, oval, square, rounded,
  heart) for picture-in-picture.
- Quick positions for picture-in-picture (corners / centre), flip, fit / fill / stretch and crop with aspect presets.
- **Keyframes**: add a key, move the playhead, then move / scale / rotate / fade the item - it animates between keys.
- **Clip animations**: fade, pop, zoom, slide, rise, drop, blur, spin or bounce a photo or video in and out.
- **Motion**: Ken Burns zoom and pan, shake and pulse for photos and static shots.
- Tap an overlay or text on the preview to select it.

**Text**
- Font, size, colour, gradient fill, opacity, bold / italic / uppercase, alignment, line height, letter spacing, outline,
  second (outer) outline, hollow letters, shadow and background box.
- **Looping effects**: wavy, shake, glitch, RGB split, 3D extrusion, rainbow, neon flicker.
- 33 ready-made looks - clean, bold outline, boxed, neon, subtitle, meme, yellow punch, gradient, retro 3D, glow, outline
  only, pill, lower third, typewriter, elegant, wave, double outline, comic, glitch, RGB split, 3D block, rainbow, wavy,
  shaky, neon flicker, sticker, handwritten, gold serif, code tag, highlighter, cinema title, breaking news.
- 13 enter / exit animations: fade, pop, slide up, slide sideways, rise, drop, zoom, blur, spin, bounce, wave, typewriter.
- 14 system fonts plus your own font files (`.ttf`, `.otf`, `.woff`, `.woff2`).

**Transitions, filters and effects**
- 18 transitions between neighbouring clips: fade, crossfade, dip to black / white, slide, push, wipe, whip pan, zoom
  in / out, blur, spin, flash, circle, doors, clock and glitch - with adjustable duration, a *Preview* button and *Apply
  to all cuts*.
- 19 filters (Vivid, Golden hour, Teal & orange, Moody, Noir, Film, Retro, …) and manual brightness, contrast,
  saturation, hue, temperature, blur, grayscale, sepia, invert, vignette and film grain.
- **Effects that fade in and out**: switch on *Fade the look in / out* (with fade times), or mark In/Out and press *Edit
  the In→Out range only* - brightness, colours, blur etc. then change gradually in that range and return gradually.
- **Blur & hide**: *Blur area* or *Pixelate* a face, number plate or screen (oval or rectangle, adjustable strength,
  follow a moving object with keyframes), or *Blur background* to keep only your subject sharp.
- Project background: solid colour, gradient or a blurred copy of the video (for landscape footage in a vertical frame).

**AI and smart tools (all on your device)**
- **AI voice-over (text to speech)** with several voices - write a dialogue (`A: …`, `B: …`) and every speaker gets
  their own voice, pitch, tempo, volume and effect (radio, robot, echo, hall, monster, …); single lines can be changed
  with `[+3, 1.2x, echo]`, and every line can be previewed. Polish voices (Bass - high quality, Gosia, Darkman, MC Speech, MLS), English (US/UK), German, Spanish,
  French, Italian, Ukrainian, Czech, Russian, Portuguese and more. Optional captions for the lines. Every project keeps
  its own dialogue.
- **Voice-over of a video's speech (lektor)**: recognises what is said in a clip, writes it as timed lines (optionally
  translated into English), reads them with your voice at the same moments and turns the original sound down.
- **Auto captions** from speech (Whisper).
- **Remove silences**: jump-cuts pauses out of talking clips (adjustable threshold and minimum pause).
- **Auto enhance**: corrects exposure, contrast and dull colours from the current frame.
- **Remove background** from photos (MODNet).

**Free stock videos**
- The **Stock** tab: Minecraft gameplay, nature, landscapes, sea & beach, sky & weather, animals, city & trains,
  fire & fireworks and Earth from space - free clips from Wikimedia Commons and NASA, loaded in the background when the
  app starts. *Add* puts a clip on the timeline (720p at most, so phones cope), the library button only downloads it.
- Author and licence are shown on every clip and kept with the imported media; *Copy credits* gives you the lines to
  paste into the video description. **CC BY / CC BY-SA clips must credit their author when you publish.**
- If a source is down or you are offline, its categories are simply not shown (or the last loaded list is used) - the
  rest of the app is not affected.

**Sound**
- Several audio tracks at once - for example music plus a voice-over.
- Per clip: volume, mute, fade in / out, trim, split, loop, speed and pitch (±12 semitones).
- Turn the volume down for just one part of a clip by marking a range and applying it there.
- Waveforms on the timeline make it easy to line audio up with the picture.

**Preview**
- Smooth playback without black flashes: upcoming clips are prepared in advance, and while a video seeks the last good
  frame stays on screen.
- Zoom the preview (pinch, `Ctrl`+wheel or the −/+ buttons) and pan around when zoomed in.
- Drag sideways on the preview to scrub, double-tap its left / right edge to jump 5 s, tap to play / pause.
- Scrub bar, ±5 s buttons, frame stepping and `J` / `K` / `L`.

**Made for phones (mobile-first)**
- A CapCut-style tool bar at the bottom that changes with the selected clip (speed, volume, filters, opacity, animate,
  motion, keyframes, transition, crop, AI, freeze, duration, split, duplicate, delete).
- Each tool opens just the settings you need in a bottom sheet; swipe it down to close.
- The timeline scrolls under a fixed centre playhead - scrolling *is* scrubbing (toggle with the crosshair button).
- Resizable timeline, compact track headers, large touch targets.

**Formats**
- 9:16 (TikTok / Shorts / Reels), 16:9 (YouTube), 4K, 1:1, 4:5, 4:3, 21:9 or any custom size, 24 - 60 fps.
- Long videos are fine for editing; see *Good to know* for export memory limits.

**Projects**
- Autosave, undo / redo for everything, *Save as a copy*.
- Project names are always unique: a second "My vlog" becomes "My vlog (2)"; new projects get a readable default name
  such as *Short · 4 Nov 14:32*.

**Captions (the TikTok kind)**
- Generate them automatically from speech - the recognition model runs on your device.
- Or import an `.srt` / `.vtt` file, paste your script, or let the voice-over tool create them.
- Every phrase is a clip you can retime, re-word, split or merge.
- 17 caption looks; the spoken word can change colour, scale, pop, bounce, get a box, an underline, a glow, or be
  revealed word by word; plus all text effects.

**Export**
- MP4 (H.264 + AAC, or Opus audio where the browser has no AAC encoder - e.g. Chrome on Linux and the desktop app) by default, WebM as an alternative, with automatic fallback when a codec is missing.
- Pick resolution, frame rate, quality (or an exact bitrate) and audio bitrate.
- Progress, time remaining, cancel - and a preview of the result before you save it.

---

## A typical edit, step by step

1. **Create a project.** Pick a format - 9:16 for TikTok/Shorts/Reels, 16:9 for YouTube - and a frame rate. You can
   also drop video files straight onto the start page.
2. **Import media.** Drag files into the window, or use **Import** in the Media panel (*Add media* on a phone).
3. **Arrange the timeline.** Drag clips to move them, drag their edges to trim, press `S` to split at the playhead.
4. **Adjust a clip.** Select it: timing, speed, transform, opacity, keyframes, filters, motion, animation, transition,
   audio and smart tools. On a phone use the tool bar at the bottom.
5. **Add text, stickers, photos.** *Text* and *Elements* tabs. Drag, pinch and rotate them on the preview.
6. **Add a voice-over and captions.** *Voice* and *Captions* tabs.
7. **Add music.** Import the audio file - it lands on an audio track.
8. **Export.** `Ctrl+E`, choose quality, save or share.

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

## AI voice-over (text to speech)

Open the **Voice** tab (*Voice AI* on a phone).

1. Every **speaker** has a name (`A`, `B`, or `Anna`, `Tom`…) and a voice. Press ▶ to hear it. Open the speaker's
   settings (the arrow) to shape the voice:
   - **Pitch** -12 … +12 semitones (the tempo stays the same),
   - **Tempo** 0.5× … 2× (the pitch stays the same),
   - **Effect**: radio, telephone, megaphone, robot, alien, echo, hall, cave, underwater, monster, breathy - with an
     *Effect amount* slider,
   - **Volume** in dB,
   - one-tap characters: Deep, Giant, Chipmunk, Child, Elderly, Fast talker, Robot, Radio host, Narrator.
2. Write the **script** - one line per sentence, as many speakers as you like (a dialogue uses several voices in one
   go):

   ```
   A: Hi! What are we recording today?
   B: A quick reel about our new app.
   A [+2, fast]: Seriously? Let's go!
   B [radio, pause 0.5]: This is Radio Clip, live.
   ```

   Text in square brackets changes the voice of **just that line**: `+3` / `-2` (semitones), `high` / `low`, `1.2x`,
   `fast` / `slow`, any effect name, `loud` / `quiet`, `pause 1` (seconds of silence before the line), `at 0:12.5`
   (start the line at that time of the video). Lines without a name continue with the previous speaker; unknown names
   can be added with one click.
3. **Listen before you generate:**
   - in a speaker's settings type any **Test text** (or leave it empty to use that speaker's first line from the
     script) and press **Listen with these settings** - change pitch, tempo or the effect and press it again;
   - press ▶ next to a line in the list under the script to hear just that line, with its `[ … ]` changes;
   - **Listen to the whole dialogue** plays all lines in order with the pauses (the line being spoken is highlighted).
   Nothing is added to the timeline until you press *Generate*; speech is cached, so re-listening is instant.
4. Choose the pause between lines and whether captions should be created, then press **Generate voice-over**.

The lines are placed one after another from the playhead on a new audio track; lines with `[at …]` start at their time
(or right after the previous line, if it is still speaking). Each voice (~20-115 MB) is downloaded once from Hugging
Face the first time it is used and then stored on the device - later generations work offline. The text is never sent
anywhere. Pitch, tempo and effects are baked into the generated audio, so the preview and the export sound the same.
The script and the speakers are saved with the project - a new project starts with an empty script.

**Voice-over of the speech in a video (lektor).** Open *Voice-over from the video's speech* at the top of the Voice
tab, pick the clip, the language of the lines (*Spoken language*, or *English (translated)*) and how loud the original
should stay underneath, then press **Write the lines from the speech**. The speech is recognised on your device
(Whisper) and appears as timed lines such as `A [at 0:03.20]: …` - correct them, translate them, split them between
speakers, then press *Generate voice-over*. Every line starts when it was said in the video; a line that would run into
the next one is read up to 1.3× faster. If the recognised language does not match the speaker's voice, the speaker is
switched to a voice of that language.

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
| Save straight to a file | (Chrome / Edge on a computer and the desktop app) you choose the file first and the video is written to disk while it renders - no memory limit, the right choice for long YouTube videos. On by default for projects longer than 3 minutes. |

Rendering happens in the background, so the app stays responsive, and you can cancel at any time. When it finishes you
get a preview plus **Download** (on Android: *Save to device* and the system share sheet).

---

## Keyboard shortcuts and gestures

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause |
| `J` / `K` / `L` | Back 5 s / pause / forward 5 s |
| `←` `→` | One frame back / forward |
| `Shift` + `←` `→` | Jump one second |
| `Home` / `End` | Go to start / end |
| `S` or `Ctrl+B` | Split at the playhead |
| `T` | Add text at the playhead |
| `F` | Freeze frame |
| `M` | Add / remove a marker |
| `[` / `]` | Previous / next marker |
| `Delete` / `Backspace` | Delete the selected clips |
| `Shift+Delete` | Ripple-delete the In→Out range |
| `I` / `O` | Set the In / Out point |
| `Ctrl+D` | Duplicate |
| `Ctrl+A` / `Esc` | Select all / deselect |
| `N` | Snapping on / off |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` | Save now |
| `Ctrl+E` | Export |
| `+` / `−` | Zoom the timeline |
| `Ctrl` + wheel | Zoom the timeline or the preview (under the cursor) |
| `?` | Show this list in the app |

**Touch:** tap a clip to select it, then drag it or its edges; pinch the timeline to zoom; scroll the timeline to scrub;
pinch the preview to zoom it; drag an overlay to move it and pinch it to scale / rotate; double-tap the preview edges to
jump 5 s; long-press a clip for more actions.

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

## Building and running - step by step

Everything below is done in a terminal (Windows: *PowerShell*; macOS: *Terminal*; Linux: any terminal), inside the
project folder.

### 0. One-time preparation

1. Install **Node.js 20.19 or newer** from <https://nodejs.org> (the "LTS" button is fine). Check it:

   ```bash
   node --version
   ```

2. Install the project's dependencies (downloads a few hundred MB, takes a minute or two):

   ```bash
   npm install
   ```

   If `npm install` stops with an error about `onnxruntime-node` (a download that is only needed on servers), run this
   instead - it skips the optional download scripts:

   ```bash
   npm install --ignore-scripts
   ```

   and then fetch Electron once (only needed for the desktop app):

   ```bash
   node node_modules/electron/install.js
   ```

### 1. Try it in the browser (development)

```bash
npm run dev
```

Open **http://localhost:3000**. Changes to the code reload automatically. Stop with `Ctrl+C`.

### 2. Build the website (static files)

```bash
npm run build
```

The result is the folder **`.output/public`** - plain static files. Upload it to any static hosting (GitHub Pages,
Netlify, Cloudflare Pages, your own server). Unknown paths must fall back to `index.html` (or `200.html`). To look at the
build locally:

```bash
npx serve .output/public
```

### 3. Desktop app (Windows, Linux, macOS) - no installation needed

Run the desktop app straight from the source (builds the web app first):

```bash
npm run desktop:dev
```

Build double-clickable files (they appear in **`dist-desktop/`**):

| Command | Produces |
| --- | --- |
| `npm run build:desktop` | the right file for the computer you are on |
| `npm run build:desktop:win` | `Clip-<version>-windows-portable.exe` - one file, just run it |
| `npm run build:desktop:linux` | `Clip-<version>-linux-x86_64.AppImage` - one file, just run it |
| `npm run build:desktop:mac` | `Clip-<version>-mac-arm64.zip` and `Clip-<version>-mac-x64.zip` with `Clip.app` |

Every command works on Windows, Linux and macOS. Two things electron-builder cannot do on every system are handled by
the build script itself: on Windows it packs the AppImage with a built-in SquashFS writer (the usual `mksquashfs` tool
does not exist for Windows), and outside macOS it assembles `Clip.app` from the official Electron build. The macOS app
is unsigned either way, exactly as electron-builder would make it on a Mac without an Apple developer certificate.

The desktop app is the same editor in its own window (Electron). It needs no internet and no server: the files are
served from inside the app. Your projects are stored in the app's own data folder:

- Windows: `%APPDATA%\Clip`
- Linux: `~/.config/Clip`
- macOS: `~/Library/Application Support/Clip`

Exports open a *Save as* dialog (default folder: *Videos*).

Linux notes: the AppImage runs on any modern 64-bit distribution. If double-clicking does nothing, make it executable
(`chmod +x Clip-*.AppImage`). On some systems AppImages need `libfuse2` (`sudo apt install libfuse2`).

### 4. Android app

You need [Android Studio](https://developer.android.com/studio) (it brings the Android SDK and Java).

Easiest - open the project in Android Studio and press *Run*:

```bash
npm run build
```

```bash
npx cap sync android
```

```bash
npx cap open android
```

Or build an APK from the command line (the SDK must be installed and `ANDROID_HOME` set):

```bash
npm run build:android
```

The APK is then at `android/app/build/outputs/apk/debug/app-debug.apk` - copy it to your phone and open it. With a phone
connected over USB (developer mode on) you can also run `npm run android`.

### 5. Everything at once

```bash
npm run build:all
```

Builds the website (`.output/public`), the desktop apps for Windows, Linux and macOS (`dist-desktop/`) and the Android
APK.

### 6. Tests

```bash
npm test
```

Runs the unit tests of the editing core (timeline operations, speed ramps, keyframes, effects, naming, silence detection,
…).

### Command overview

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Static website in `.output/public` |
| `npm run desktop` | Start the desktop app from the last web build |
| `npm run desktop:dev` | Build the website, then start the desktop app |
| `npm run build:desktop[:win\|:linux\|:mac]` | Portable desktop app(s) in `dist-desktop/` |
| `npm run build:android` | Android debug APK |
| `npm run android` | Build and run on a connected Android device |
| `npm run build:all` | Website + Windows + Linux + macOS + Android |
| `npm test` | Unit tests |

---

## Good to know

- **Browser support:** Chrome or Edge 94+ work best (also inside the desktop app). Firefox 130+ and Safari 16.4+ work for
  editing; exporting needs WebCodecs.
- **Downloads on first use only:** auto captions (~45-250 MB model), background removal (~25 MB) and each AI voice
  (~20-115 MB) are downloaded once and then work offline. Stock videos need the internet when you browse and add them;
  once added they are stored in the project like your own files. Everything else works offline from the first start.
- **Strict autoplay browsers** (Safari / iOS and some mobile browsers only let sound start right after a tap): the
  preview and the voice tab start their players inside your tap, so every clip keeps playing. If a browser still
  refuses, Clip says so ("press play again") instead of skipping lines.
- **Long videos:** editing hour-long projects is fine (tested with a 15-minute 720p file, 15 tracks and 840+ clips at
  ~60 fps on a desktop). For the export use *Save straight to a file* (desktop app, Chrome, Edge): the video is written to
  disk as it renders and the sound is mixed in 20-second chunks, so memory use stays flat (a 4-minute test export
  peaked at ~40 MB of JavaScript memory). Browsers without that option (Firefox, Safari, Android) build the file in
  memory - Clip warns when that gets risky.
- **Slow phones:** *⋮ → Preview quality* switches between *Auto* (lighter while playing, sharp when paused), *High* and
  *Fast*. The export always uses full quality.
- **Speed ramps in the export** are rendered in short slices with natural pitch; extreme ramps on music may sound a little
  grainy.
- **Exotic codecs** (HEVC or ProRes inside `.mov`, for instance) only work if your system can decode them.
- **Animated GIFs/WebP** are used as a still image.
- **Voices need a browser with a private file system (OPFS):** Chrome, Edge, the Android app and the desktop app.

---

## For developers

The code is split so that features can be added without rewriting the app:

```
app/core/        project model, editing operations, time math, frame + text renderer  (no Vue, no DOM)
app/services/    storage (IndexedDB), media probing, playback engine, export pipeline, captions, platform glue
app/stores/      Pinia state: project + undo history, editor UI, media, captions
app/components/  ui / editor / media / canvas / timeline / properties / captions / text / elements / voice / ai / export
app/workers/     export and media-analysis Web Workers
desktop/         Electron shell (serves the static build through a private app:// scheme)
android/         Capacitor Android project
scripts/         precache list, icons, desktop packaging
```

Key ideas: the project is an immutable value changed through Immer, so undo/redo is cheap and never copies media; the
same compositor draws the preview and the export, fed by different frame providers; the playhead lives outside Vue's
reactivity so playback never re-renders components; media binaries stay out of the project model and are streamed from
IndexedDB.

`npm test` covers the editing core (timeline operations, snapping, time mapping, project migration).

---

## License

MIT - see [LICENSE](LICENSE).
