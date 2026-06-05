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

    fragmentDetailsEl: document.getElementById('fragmentDetails'),
    fragmentNameInput: document.getElementById('fragmentNameInput'),
    fragmentStartInput: document.getElementById('fragmentStartInput'),
    fragmentEndInput: document.getElementById('fragmentEndInput'),
    fragmentLengthValue: document.getElementById('fragmentLengthValue'),
    fragmentLoopModeInput: document.getElementById('fragmentLoopModeInput'),
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

export function renderFragmentDetails(elements, fragment) {
  clearFragmentDetailsInvalid(elements)

  const editableControls = [
    elements.fragmentNameInput,
    elements.fragmentStartInput,
    elements.fragmentEndInput,
    elements.fragmentLoopModeInput,
  ]

  if (!fragment) {
    elements.fragmentDetailsEl.classList.add('is-disabled')

    for (const control of editableControls) {
      control.disabled = true
    }

    elements.fragmentNameInput.value = ''
    elements.fragmentStartInput.value = ''
    elements.fragmentEndInput.value = ''
    elements.fragmentLoopModeInput.checked = false
    elements.fragmentNameInput.placeholder = 'No fragment selected'
    elements.fragmentLengthValue.textContent = '--'
    return
  }

  elements.fragmentDetailsEl.classList.remove('is-disabled')

  for (const control of editableControls) {
    control.disabled = false
  }

  elements.fragmentNameInput.placeholder = ''
  elements.fragmentNameInput.value = fragment.name
  elements.fragmentStartInput.value = formatTime(fragment.start)
  elements.fragmentEndInput.value = formatTime(fragment.end)
  elements.fragmentLoopModeInput.checked = fragment.playbackMode !== 'transition'
  elements.fragmentLengthValue.textContent = formatTime(fragment.end - fragment.start)
}

export function readFragmentDetails(elements) {
  return {
    name: elements.fragmentNameInput.value,
    startText: elements.fragmentStartInput.value,
    endText: elements.fragmentEndInput.value,
    playbackMode: elements.fragmentLoopModeInput.checked ? 'loop' : 'transition',
  }
}

export function updateFragmentDetailsLength(elements, length) {
  elements.fragmentLengthValue.textContent = Number.isFinite(length)
  ? formatTime(length)
  : '--'
}

export function setFragmentDetailsInvalid(elements, invalidFields = []) {
  const invalidSet = new Set(invalidFields)

  const fieldMap = {
    name: elements.fragmentNameInput,
    start: elements.fragmentStartInput,
    end: elements.fragmentEndInput,
  }

  for (const [field, input] of Object.entries(fieldMap)) {
    const isInvalid = invalidSet.has(field)

    input.classList.toggle('is-invalid', isInvalid)
    input.setAttribute('aria-invalid', String(isInvalid))
  }
}

export function clearFragmentDetailsInvalid(elements) {
  setFragmentDetailsInvalid(elements, [])
}
