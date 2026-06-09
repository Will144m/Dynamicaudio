# Dynamicaudio

```bash
npm install
npm run dev

npm run build
npx cap sync android
npm run preview
```

## Checklist

### Setup

* [x] Create basic `index.html`, `styles.css`, and JavaScript entry point
* [x] Load WaveSurfer.js and Regions plugin
* [x] Load JSZip for project bundle import/export
* [x] Build responsive browser UI
* [x] Add Editor and Player modes
* [x] Switch to darker neutral grey theme
* [x] Move dependencies from CDN to package manager
* [x] Add local dev/build tooling

### Project model

* [x] Replace single-audio project model with multi-track project model
* [x] Add multiple tracks to one project
* [x] Store fragments per track
* [x] Store queue per track
* [x] Store player settings in project bundle
* [x] Store editor settings in project bundle
* [x] Export project bundle with multiple audio files
* [x] Import project bundle with multiple audio files
* [x] Preserve queue state through export/import
* [x] Preserve linked fragment data through export/import

### Tracks

* [x] Add track from local audio file
* [x] Show track list
* [x] Switch active editor track
* [x] Keep one waveform visible at a time
* [x] Keep fragments separate per track
* [x] Delete selected track
* [x] Clean up audio state after deleting a track

### Audio playback

* [x] Load local audio files
* [x] Render waveform for active track
* [x] Play, pause, and stop audio
* [x] Play/pause whole track without fragments
* [x] Show current time and total duration
* [x] Show centisecond timestamp precision
* [x] Volume control
* [x] Stop playback when switching Editor/Player modes
* [x] Prevent deleted-track audio from continuing to play

### Editor fragments

* [x] Create fragments by dragging on waveform
* [x] Add fragment at playhead
* [x] Move fragments
* [x] Resize fragment edges
* [x] Delete selected fragment
* [x] Rename fragments
* [x] Edit exact start/end times
* [x] Highlight selected fragment
* [x] Show fragment names on waveform regions
* [x] Show live timestamp tooltip while moving/resizing fragments
* [x] Mark fragments as loop or transition
* [x] Keep selected-fragment panel visible but disabled when nothing is selected
* [x] Autosave fragment name and timing edits
* [x] Validate invalid fragment times

### Snapping

* [x] Add snapping toggle
* [x] Snap new fragment edges to nearby fragment edges
* [x] Snap moved/resized fragment edges to nearby fragment edges
* [x] Use duration-based snapping threshold
* [x] Preserve current stronger snapping multiplier: `duration * 0.0045`

### Editor / Player modes

* [x] Add Editor mode
* [x] Add Player mode
* [x] Hide editor-only controls in Player mode
* [x] Keep playback controls available in Player mode
* [x] Lock fragment editing in Player mode
* [x] Stop all playback when switching modes

### Player queue

* [x] Generate default queue from fragment start-time order
* [x] Start queue playback
* [x] Loop loop-fragments until told to advance
* [x] Play transition-fragments once
* [x] Queue next item after current loop finishes
* [x] Arm any queue item as next target
* [x] Skip now to armed target
* [x] Restart current queue item
* [x] Drag/drop queue reorder
* [x] Persist manual queue order
* [x] Remove fragments from queue
* [x] Show removed queue items as available fragments
* [x] Add available fragments back to queue
* [x] Reset queue to start-time order
* [x] Persist removed queue items through export/import

### Looping

* [x] Add global loop toggle
* [x] Loop selected fragment
* [x] Loop whole track when no fragment is selected
* [x] Preserve loop setting when switching fragments
* [x] Stop no longer restarts current fragment while looping
* [x] Queue runtime handles loop and transition fragment behavior

### Linked fragments

* [x] Add linked target selector for selected fragment
* [x] Save linked fragment metadata
* [x] Restore linked fragment metadata on import
* [x] Show linked fragment switch controls in Player mode
* [x] Linked switch jumps to equivalent elapsed position in target fragment
* [x] Add linked-fragment fade setting
* [x] Add linked-fragment offset setting
* [x] Fix linked switch Play/Pause button state
* [x] Fix linked switch cleanup on Stop
* [x] Treat linked-fragment crossfade as experimental

### Saving/loading

* [x] Define project bundle format
* [x] Bundle audio files and project metadata together
* [x] Export project as `.dynamic-audio.zip`
* [x] Import project bundle as tracks + fragments + queues
* [x] Save fragment names, colors, start/end times
* [x] Save loop/transition metadata
* [x] Save queue order and queue removals
* [x] Save volume setting
* [x] Save snapping setting
* [x] Save linked fragment settings

### Refactor

* [x] Separate fragment data from WaveSurfer regions
* [x] Separate playback logic from waveform UI
* [x] Split large script into modules
* [x] Keep WaveSurfer mostly as editor/waveform layer
* [x] Add player queue runtime
* [x] Add multi-track state model
* [x] Move to bundler-based source layout

### Android/native app

* [x] Decide packaging approach
* [x] Evaluate Capacitor
* [x] Create Android proof of concept
* [x] Test local audio file import on Android
* [x] Test project bundle import/export on Android
* [x] Add Android share export
* [x] Add Android local export

## Known notes

* Linked-fragment crossfade is experimental and not perfectly seamless.
* Waveform rendering can still feel slow on some track switches.
* Android waveform dragging may be limited depending on WebView touch behavior.
* Large project bundles may become slow or memory-heavy.
* Long-term Android storage should move toward an app-library/cache model instead of relying only on ZIP import/export.
