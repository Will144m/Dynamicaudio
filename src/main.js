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
  getElements,
  setStatus,
  updateControls,
  updatePlayPauseButton,
  updateTimeDisplay,
} from './ui.js'
import { formatRange } from './utils.js'
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
      const fragment = getFragmentById(state.fragments, id)
      const message = playFragment(state, waveform, fragment, time)

      refreshUi()
      setStatus(elements, message)
    },

    onRegionCreated: ({ id, start, end }) => {
      state.lastRegionCreatedAt = performance.now()

      const fragment = createFragmentFromDrag(state.fragments, start, end, id)

      state.fragments.push(fragment)
      state.selectedFragmentId = fragment.id

      waveform.setRegionColor(fragment.id, fragment.color)
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

function refreshUi() {
  applyModeToUi(elements, state.mode)
  updateControls(elements, state)

  renderFragmentList({
    container: elements.fragmentsEl,
    fragments: state.fragments,
    selectedFragmentId: state.selectedFragmentId,
    onFragmentClick: (fragmentId) => {
      const fragment = getFragmentById(state.fragments, fragmentId)
      const message = playFragment(state, waveform, fragment)

      refreshUi()
      setStatus(elements, message)
    },
  })
}

function setMode(mode) {
  state.mode = mode
  waveform.setMode(mode)

  if (state.hasLoadedAudio) {
    waveform.renderFragments(state.fragments)
  }

  refreshUi()
  setStatus(
    elements,
    mode === 'editor'
    ? 'Editor mode. Fragments can be created, moved, resized, or deleted.'
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

async function exportProjectBundle() {
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
  await waveform.playPause()
})

elements.stopBtn.addEventListener('click', () => {
  const message = stopPlayback(state, waveform)

  updateTimeDisplay(elements, 0, state.audio.duration)
  refreshUi()
  setStatus(elements, message)
})

elements.loopToggleBtn.addEventListener('click', () => {
  const message = toggleLoop(state)

  refreshUi()
  setStatus(elements, message)
})

elements.addFragmentBtn.addEventListener('click', addFragmentAtCurrentPlayhead)
elements.deleteFragmentBtn.addEventListener('click', deleteSelectedFragment)
elements.editorModeBtn.addEventListener('click', () => setMode('editor'))
elements.playerModeBtn.addEventListener('click', () => setMode('player'))
elements.exportProjectBtn.addEventListener('click', exportProjectBundle)
elements.projectFileInput.addEventListener('change', (event) => {
  const [file] = event.target.files
  importProjectBundle(file)
})

window.addEventListener('beforeunload', () => {
  clearAudioObjectUrl()
})

refreshUi()
