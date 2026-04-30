# Dynamicaudio

python -m http.server 8000

## Checklist

### Setup

- [x] Create basic `index.html`, `styles.css`, and `app.js`
- [x] Load WaveSurfer.js and Regions plugin
- [x] Build simple responsive UI
- [ ] Move dependencies from CDN to package manager
- [ ] Add local dev/build tooling

### Audio playback

- [x] Load a local audio file
- [x] Render waveform
- [x] Play, pause, and stop audio
- [x] Show current time and total duration
- [x] Click waveform to seek/play
- [ ] Improve loading/error states

### Fragments

- [x] Generate demo fragments
- [x] Play fragments from chips or waveform regions
- [x] Start playback from clicked point inside a fragment
- [x] Highlight selected fragment
- [x] Drag fragments to move them
- [x] Resize fragment edges
- [x] Create fragment by dragging on waveform
- [x] Add fragment at playhead
- [x] Delete selected fragment
- [ ] Rename fragments
- [ ] Add precise time inputs for start/end

### Looping

- [x] Add global loop toggle
- [x] Loop selected fragment
- [x] Loop whole file when no fragment is selected
- [x] Preserve loop setting when switching fragments
- [ ] Improve visual indication of loop state

### Saving/loading

- [ ] Define simple project/config format
- [ ] Save fragment names, colors, start/end times
- [ ] Load saved fragment config

### Refactor

- [ ] Separate fragment data from WaveSurfer regions
- [ ] Separate playback logic from waveform UI
- [ ] Split large `app.js` into smaller modules

### Android/native app

- [ ] Decide packaging approach
- [ ] Evaluate Tauri for Android
- [ ] Consider Capacitor as an Android-first option
- [ ] Create Android proof of concept
- [ ] Test audio loading/playback on Android
- [ ] Test config saving/loading on Android
