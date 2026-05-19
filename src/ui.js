import { formatTime } from './utils.js'

export function getElements() {
  return {
    body: document.body,
    fileInput: document.getElementById('audioFile'),
    projectFileInput: document.getElementById('projectFile'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    loopToggleBtn: document.getElementById('loopToggleBtn'),
    addFragmentBtn: document.getElementById('addFragmentBtn'),
    deleteFragmentBtn: document.getElementById('deleteFragmentBtn'),
    exportProjectBtn: document.getElementById('exportProjectBtn'),
    editorModeBtn: document.getElementById('editorModeBtn'),
    playerModeBtn: document.getElementById('playerModeBtn'),
    statusEl: document.getElementById('status'),
    timeEl: document.getElementById('time'),
    fragmentsEl: document.getElementById('fragments'),
  }
}

export function setStatus(elements, message) {
  elements.statusEl.textContent = message
}

export function updateTimeDisplay(elements, currentTime = 0, duration = 0) {
  elements.timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`
}

export function updatePlayPauseButton(elements, isPlaying) {
  elements.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play'
}

export function applyModeToUi(elements, mode) {
  elements.body.dataset.mode = mode
  elements.editorModeBtn.classList.toggle('active', mode === 'editor')
  elements.playerModeBtn.classList.toggle('active', mode === 'player')
}

export function updateControls(elements, state) {
  const isEditor = state.mode === 'editor'

  elements.playPauseBtn.disabled = !state.hasLoadedAudio
  elements.stopBtn.disabled = !state.hasLoadedAudio
  elements.loopToggleBtn.disabled = !state.hasLoadedAudio

  elements.addFragmentBtn.disabled = !state.hasLoadedAudio || !isEditor
  elements.deleteFragmentBtn.disabled = !state.selectedFragmentId || !isEditor
  elements.exportProjectBtn.disabled = !state.hasLoadedAudio

  elements.loopToggleBtn.textContent = state.isLooping
  ? 'Loop current fragment: On'
  : 'Loop current fragment: Off'
}
