import { MIN_FRAGMENT_LENGTH } from './config.js'
import {
  clampFragmentsToDuration,
  createFragmentAtPlayhead,
  createFragmentFromDrag,
  deleteFragment,
  getFragmentById,
  resetFragmentCounters,
  updateFragment,
} from './fragments.js'
import { renderFragmentList } from './fragmentListView.js'
import {
  playFragment,
  replayCurrentLoopTarget,
  stopPlayback,
  toggleLoop,
} from './playback.js'
import { clearAudioObjectUrl, resetLoadedAudioState, setAudioObjectUrl, state } from './state.js'
import { downloadProjectBundle, readProjectBundle } from './storage.js'
import {
  applyModeToUi,
  clearFragmentDetailsInvalid,
  getElements,
  readFragmentDetails,
  renderFragmentDetails,
  setFragmentDetailsInvalid,
  setStatus,
  updateControls,
  updateFragmentDetailsLength,
  updatePlayPauseButton,
  updateTimeDisplay,
} from './ui.js'
import { formatRange, parseTimeInput } from './utils.js'
import { createWaveform } from './waveform.js'

const elements = getElements()

let pendingLoadSource = 'audio'

const waveform = createWaveform({
  container: '#waveform',
  callbacks: {
    onDecode: ({ duration }) => {
      state.hasLoadedAudio = true
      state.audio.duration = duration

      state.fragments = clampFragmentsToDuration(state.fragments, duration)

      waveform.renderFragments(state.fragments)
      updateTimeDisplay(elements, 0, state.audio.duration)
      refreshUi()

      if (pendingLoadSource === 'bundle') {
        setStatus(
          elements,
          `Project bundle loaded: ${state.audio.fileName}. Imported ${state.fragments.length} fragments.`,
        )
      } else {
        setStatus(
          elements,
          'Audio loaded with no fragments. Add fragments in Editor mode, then export a project bundle.',
        )
      }

      pendingLoadSource = 'audio'
    },

    onReady: ({ duration }) => {
      updateTimeDisplay(elements, 0, duration)
    },

    onTimeUpdate: ({ currentTime }) => {
      updateTimeDisplay(elements, currentTime, state.audio.duration)
    },

    onPlay: () => {
      updatePlayPauseButton(elements, true)
    },

    onPause: () => {
      updatePlayPauseButton(elements, false)
    },

    onFinish: () => {
      const loopResult = replayCurrentLoopTarget(state, waveform)

      if (loopResult) {
        setStatus(elements, loopResult.message)
        refreshUi()
        return
      }

      updatePlayPauseButton(elements, false)
      state.selectedFragmentId = null
      refreshUi()
      setStatus(elements, 'Playback finished.')
    },

    onInteraction: () => {
      if (performance.now() - state.lastRegionCreatedAt < 150) {
        return
      }

      if (!saveSelectedFragmentDetails({ syncDetails: true })) {
        return
      }

      state.selectedFragmentId = null
      waveform.play()
      refreshUi()

      setStatus(
        elements,
        state.isLooping
        ? 'Seeking to selected point. Looping whole file.'
        : 'Seeking to selected point...',
      )
    },

    onRegionClick: ({ id, time }) => {
      if (state.selectedFragmentId !== id) {
        if (!saveSelectedFragmentDetails({ syncDetails: true })) {
          return
        }
      }

      const fragment = getFragmentById(state.fragments, id)
      const message = playFragment(state, waveform, fragment, time)

      refreshUi()
      setStatus(elements, message)
    },

    onRegionCreated: ({ id, start, end }) => {
      state.lastRegionCreatedAt = performance.now()

      saveSelectedFragmentDetails({ syncDetails: false })

      const fragment = createFragmentFromDrag(state.fragments, start, end, id)

      state.fragments.push(fragment)
      state.selectedFragmentId = fragment.id

      waveform.setRegionColor(fragment.id, fragment.color)
      waveform.renderFragmentLabels?.(state.fragments)
      refreshUi()
      setStatus(elements, `Created fragment: ${fragment.name}. Drag it to move it or resize its edges.`)
    },

    onRegionUpdated: ({ id, start, end }) => {
      if (end - start < MIN_FRAGMENT_LENGTH) {
        deleteFragment(state.fragments, id)
        state.selectedFragmentId = null
        waveform.renderFragments(state.fragments)
        refreshUi()
        setStatus(elements, 'Removed fragment because it was too short.')
        return
      }

      const fragment = updateFragment(state.fragments, id, { start, end })

      if (!fragment) return

        state.selectedFragmentId = fragment.id
        waveform.renderFragmentLabels?.(state.fragments)
        refreshUi()
        setStatus(elements, `Updated fragment: ${fragment.name} (${formatRange(fragment)}).`)
    },

    onRegionOut: ({ id }) => {
      if (!state.isLooping || state.selectedFragmentId !== id) {
        return
      }

      const loopResult = replayCurrentLoopTarget(state, waveform)

      if (loopResult) {
        setStatus(elements, loopResult.message)
        refreshUi()
      }
    },
  },
})

function getSelectedFragment() {
  return getFragmentById(state.fragments, state.selectedFragmentId)
}

function renderFragmentsListOnly() {
  renderFragmentList({
    container: elements.fragmentsEl,
    fragments: state.fragments,
    selectedFragmentId: state.selectedFragmentId,
    onFragmentClick: (fragmentId) => {
      if (state.selectedFragmentId !== fragmentId) {
        if (!saveSelectedFragmentDetails({ syncDetails: true })) {
          return
        }
      }

      const fragment = getFragmentById(state.fragments, fragmentId)
      const message = playFragment(state, waveform, fragment)

      refreshUi()
      setStatus(elements, message)
    },
  })

  waveform.renderFragmentLabels?.(state.fragments)
}

function refreshUi({ syncDetails = true } = {}) {
  const selectedFragment = getSelectedFragment()

  applyModeToUi(elements, state.mode)
  updateControls(elements, state)

  if (syncDetails) {
    renderFragmentDetails(elements, selectedFragment)
  }

  renderFragmentsListOnly()
}

function setMode(mode) {
  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  state.mode = mode
  waveform.setMode(mode)

  if (state.hasLoadedAudio) {
    waveform.renderFragments(state.fragments)
  }

  refreshUi()
  setStatus(
    elements,
    mode === 'editor'
    ? 'Editor mode. Fragments can be created, moved, resized, renamed, or deleted.'
    : 'Player mode. Fragment editing is locked; click fragments to play them.',
  )
}

async function loadAudioFile(file, options = {}) {
  if (!file) return

    const {
      fragments = [],
      source = 'audio',
    } = options

    pendingLoadSource = source

    clearAudioObjectUrl()
    resetLoadedAudioState()
    resetFragmentCounters()

    state.fragments = fragments.map((fragment) => ({ ...fragment }))
    state.selectedFragmentId = null

    waveform.clearRegions()
    updateTimeDisplay(elements, 0, 0)
    updatePlayPauseButton(elements, false)
    refreshUi()

    const objectUrl = URL.createObjectURL(file)

    setAudioObjectUrl(objectUrl)

    state.audio.file = file
    state.audio.fileName = file.name
    state.audio.fileType = file.type
    state.audio.fileSize = file.size
    state.audio.lastModified = file.lastModified

    setStatus(
      elements,
      source === 'bundle'
      ? `Loading project bundle audio: ${file.name}`
      : `Loading audio: ${file.name}`,
    )

    try {
      await waveform.load(objectUrl)
    } catch (error) {
      console.error(error)
      clearAudioObjectUrl()
      resetLoadedAudioState()
      state.fragments = []
      waveform.clearRegions()
      refreshUi()
      setStatus(elements, 'Could not load that audio file.')
    }
}

function addFragmentAtCurrentPlayhead() {
  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  const fragment = createFragmentAtPlayhead(
    state.fragments,
    waveform.getCurrentTime(),
                                            state.audio.duration,
  )

  if (!fragment) return

    state.fragments.push(fragment)
    state.selectedFragmentId = fragment.id

    waveform.renderFragments(state.fragments)
    refreshUi()
    setStatus(elements, `Created fragment: ${fragment.name}. Drag it to move it or resize its edges.`)
}

function deleteSelectedFragment() {
  if (!state.selectedFragmentId) return

    const deletedFragment = deleteFragment(state.fragments, state.selectedFragmentId)

    if (!deletedFragment) return

      state.selectedFragmentId = null
      waveform.renderFragments(state.fragments)
      refreshUi()

      setStatus(
        elements,
        state.isLooping
        ? `Deleted fragment: ${deletedFragment.name}. Looping now targets the whole file.`
        : `Deleted fragment: ${deletedFragment.name}.`,
      )
}

function validateFragmentDetailsInput() {
  const { name, startText, endText } = readFragmentDetails(elements)

  const trimmedName = name.trim()
  const start = parseTimeInput(startText)
  const end = parseTimeInput(endText)
  const invalidFields = []

  if (!trimmedName) {
    invalidFields.push('name')
  }

  if (!Number.isFinite(start) || start < 0) {
    invalidFields.push('start')
  }

  if (!Number.isFinite(end) || end > state.audio.duration) {
    invalidFields.push('end')
  }

  if (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end - start < MIN_FRAGMENT_LENGTH
  ) {
    invalidFields.push('start', 'end')
  }

  return {
    isValid: invalidFields.length === 0,
    invalidFields,
    values: {
      name: trimmedName,
      start,
      end,
    },
  }
}

function saveSelectedFragmentName() {
  const fragment = getSelectedFragment()

  if (!fragment) return true

    const { name } = readFragmentDetails(elements)
    const trimmedName = name.trim()

    if (!trimmedName) {
      setFragmentDetailsInvalid(elements, ['name'])
      return false
    }

    clearFragmentDetailsInvalid(elements)

    if (trimmedName === fragment.name) {
      return true
    }

    updateFragment(state.fragments, fragment.id, {
      name: trimmedName,
    })

    renderFragmentsListOnly()

    return true
}

function saveSelectedFragmentPlaybackMode() {
  const fragment = getSelectedFragment()

  if (!fragment) return true

    const { playbackMode } = readFragmentDetails(elements)

    if (playbackMode === fragment.playbackMode) {
      return true
    }

    updateFragment(state.fragments, fragment.id, {
      playbackMode,
    })

    renderFragmentsListOnly()

    return true
}

function saveSelectedFragmentDetails({ syncDetails = false } = {}) {
  const fragment = getSelectedFragment()

  if (!fragment) return true

    const validation = validateFragmentDetailsInput()

    if (!validation.isValid) {
      setFragmentDetailsInvalid(elements, validation.invalidFields)
      return false
    }

    clearFragmentDetailsInvalid(elements)

    const { name, start, end } = validation.values
    const { playbackMode } = readFragmentDetails(elements)

    const timeChanged =
    Math.abs(start - fragment.start) > 0.001 ||
    Math.abs(end - fragment.end) > 0.001

    const nameChanged = name !== fragment.name
    const playbackModeChanged = playbackMode !== fragment.playbackMode

    if (!timeChanged && !nameChanged && !playbackModeChanged) {
      if (syncDetails) {
        renderFragmentDetails(elements, fragment)
      }

      return true
    }

    const updatedFragment = updateFragment(state.fragments, fragment.id, {
      name,
      start,
      end,
      playbackMode,
    })

    if (!updatedFragment) return false

      state.selectedFragmentId = updatedFragment.id

      if (timeChanged) {
        waveform.renderFragments(state.fragments)
      } else {
        waveform.renderFragmentLabels?.(state.fragments)
      }

      refreshUi({ syncDetails })

      return true
}

function previewFragmentDetailsLength() {
  const { startText, endText } = readFragmentDetails(elements)
  const start = parseTimeInput(startText)
  const end = parseTimeInput(endText)

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    updateFragmentDetailsLength(elements, Number.NaN)
    return
  }

  updateFragmentDetailsLength(elements, end - start)
}

async function exportProjectBundle() {
  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  try {
    await downloadProjectBundle(state)

    setStatus(
      elements,
      `Exported project bundle for ${state.audio.fileName} with ${state.fragments.length} fragments.`,
    )
  } catch (error) {
    console.error(error)
    setStatus(elements, `Could not export project bundle: ${error.message}`)
  }
}

async function importProjectBundle(file) {
  if (!file) return

    try {
      setStatus(elements, `Importing project bundle: ${file.name}`)

      const { project, audioFile } = await readProjectBundle(file)

      await loadAudioFile(audioFile, {
        fragments: project.fragments,
        source: 'bundle',
      })
    } catch (error) {
      console.error(error)
      setStatus(elements, `Could not import project bundle: ${error.message}`)
    } finally {
      elements.projectFileInput.value = ''
    }
}

elements.fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files
  loadAudioFile(file)
})

elements.playPauseBtn.addEventListener('click', async () => {
  saveSelectedFragmentDetails({ syncDetails: true })
  await waveform.playPause()
})

elements.stopBtn.addEventListener('click', () => {
  saveSelectedFragmentDetails({ syncDetails: true })

  const message = stopPlayback(state, waveform)

  updateTimeDisplay(elements, 0, state.audio.duration)
  refreshUi()
  setStatus(elements, message)
})

elements.loopToggleBtn.addEventListener('click', () => {
  saveSelectedFragmentDetails({ syncDetails: true })

  const message = toggleLoop(state)

  refreshUi()
  setStatus(elements, message)
})

elements.addFragmentBtn.addEventListener('click', addFragmentAtCurrentPlayhead)
elements.deleteFragmentBtn.addEventListener('click', deleteSelectedFragment)
elements.editorModeBtn.addEventListener('click', () => setMode('editor'))
elements.playerModeBtn.addEventListener('click', () => setMode('player'))
elements.exportProjectBtn.addEventListener('click', exportProjectBundle)

elements.fragmentNameInput.addEventListener('input', () => {
  saveSelectedFragmentName()
})

elements.fragmentLoopModeInput.addEventListener('change', () => {
  saveSelectedFragmentPlaybackMode()
})

for (const input of [elements.fragmentStartInput, elements.fragmentEndInput]) {
  input.addEventListener('input', previewFragmentDetailsLength)

  input.addEventListener('blur', () => {
    saveSelectedFragmentDetails({ syncDetails: true })
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (saveSelectedFragmentDetails({ syncDetails: true })) {
        input.blur()
      }
    }
  })
}

elements.fragmentNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()

    if (saveSelectedFragmentName()) {
      elements.fragmentNameInput.blur()
    }
  }
})

elements.projectFileInput.addEventListener('change', (event) => {
  const [file] = event.target.files
  importProjectBundle(file)
})

window.addEventListener('beforeunload', () => {
  saveSelectedFragmentDetails({ syncDetails: false })
  clearAudioObjectUrl()
})

refreshUi()
