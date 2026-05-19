# Dynamicaudio

```bash
python -m http.server 8000
```

## Checklist

### Setup

- [x] Create basic `index.html`, `styles.css`, and JavaScript entry point
- [x] Load WaveSurfer.js and Regions plugin
- [x] Load JSZip for project bundle import/export
- [x] Build simple responsive UI
- [x] Add Editor and Player modes
- [ ] Move dependencies from CDN to package manager
- [ ] Add local dev/build tooling

### Audio playback

- [x] Load a local audio file
- [x] Render waveform
- [x] Play, pause, and stop audio
- [x] Show current time and total duration
- [x] Show centisecond timestamp precision
- [x] Click waveform to seek/play
- [x] Load audio without auto-generating demo fragments
- [ ] Improve loading/error states

### Fragments

- [x] Play fragments from chips or waveform regions
- [x] Start playback from clicked point inside a fragment
- [x] Highlight selected fragment
- [x] Drag fragments to move them
- [x] Resize fragment edges
- [x] Show live timestamp tooltip while moving/resizing fragments
- [x] Create fragment by dragging on waveform
- [x] Add fragment at playhead
- [x] Delete selected fragment
- [ ] Rename fragments
- [ ] Add precise time inputs for start/end

### Editor / Player modes

- [x] Add Editor mode
- [x] Add Player mode
- [x] Hide editor-only controls in Player mode
- [x] Keep playback controls available in Player mode
- [x] Lock fragment editing in Player mode

### Looping

- [x] Add global loop toggle
- [x] Loop selected fragment
- [x] Loop whole file when no fragment is selected
- [x] Preserve loop setting when switching fragments
- [ ] Improve visual indication of loop state

### Saving/loading

- [x] Define project bundle format
- [x] Save fragment names, colors, start/end times
- [x] Bundle project metadata with associated audio file
- [x] Export project as `.dynamic-audio.zip`
- [x] Import project bundle as audio + fragments
- [ ] Add stronger project validation and user-facing warnings
- [ ] Add project version migration support
- [ ] Add autosave or recent-project storage

### Refactor

- [x] Separate fragment data from WaveSurfer regions
- [x] Separate playback logic from waveform UI
- [x] Split large `app.js` into smaller modules
- [x] Keep WaveSurfer as the waveform/audio view layer instead of the app state
- [ ] Move to a bundler-based source layout

### Android/native app

- [ ] Decide packaging approach
- [ ] Evaluate Tauri for Android
- [ ] Consider Capacitor as an Android-first option
- [ ] Create Android proof of concept
- [ ] Test audio loading/playback on Android
- [ ] Test project bundle saving/loading on Android
- [ ] Decide native storage strategy for audio + fragment projects
