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
import {
  armQueueFragment,
  getPlayerSnapshot,
  handleQueueFragmentEnded,
  jumpToNextQueueFragment,
  playQueueFragmentNow,
  requestNextQueueFragment,
  resetPlayerRuntime,
  restartCurrentQueueFragment,
  startQueuePlayback,
  switchToLinkedFragment,
  stopQueuePlayback,
  toggleManagedPlayback,
  setManagedPlaybackVolume,
} from './playerRuntime.js'
import { clearTrackObjectUrls, normalizeMilliseconds, normalizeVolume, replaceProject, resetPlaybackState, state } from './state.js'
import { downloadProjectBundle, readProjectBundle } from './storage.js'
import {
  createTrackFromFile,
  createTrackFromImportedData,
  addTrackQueueItem,
  getActiveTrack,
  getAvailableQueueFragments,
  getFragmentLink,
  getLinkedTargetFragment,
  getTrackById,
  moveTrackQueueItem,
  moveTrackQueueItemToPosition,
  normalizeFragmentLinks,
  normalizeTrackQueue,
  removeFragmentLink,
  removeTrackQueueItem,
  resetTrackQueueOrder,
  setFragmentLink,
} from './tracks.js'
import {
  applyModeToUi,
  clearFragmentDetailsInvalid,
  getElements,
  readFragmentDetails,
  renderFragmentDetails,
  renderGlobalControls,
  renderPlayerLinkedTargets,
  renderPlayerQueue,
  renderTrackList,
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

let pendingLoadSource = 'track'
let loadingTrackId = null

const waveform = createWaveform({
  container: '#waveform',
  callbacks: {
    onDecode: ({ duration }) => {
      const activeTrack = getActiveTrack(state)

      if (!activeTrack || activeTrack.id !== loadingTrackId) {
        return
      }

      state.hasLoadedAudio = true
      applyVolume()
      activeTrack.audio.duration = duration
      activeTrack.fragments = clampFragmentsToDuration(activeTrack.fragments, duration)
      normalizeFragmentLinks(activeTrack)
      normalizeTrackQueue(activeTrack)

      waveform.renderFragments(activeTrack.fragments)
      updateTimeDisplay(elements, 0, activeTrack.audio.duration)
      refreshUi()

      if (pendingLoadSource === 'bundle') {
        setStatus(
          elements,
          `Project bundle loaded. Active track: ${activeTrack.name}.`,
        )
      } else if (pendingLoadSource === 'switch') {
        setStatus(elements, `Switched to track: ${activeTrack.name}.`)
      } else {
        setStatus(
          elements,
          `Added track: ${activeTrack.name}. Add fragments in Editor mode.`,
        )
      }

      pendingLoadSource = 'track'
      loadingTrackId = null
    },

    onReady: ({ duration }) => {
      updateTimeDisplay(elements, 0, duration)
    },

    onTimeUpdate: ({ currentTime }) => {
      const activeTrack = getActiveTrack(state)
      updateTimeDisplay(elements, currentTime, activeTrack?.audio?.duration || 0)
    },

    onPlay: () => {
      updatePlayPauseButton(elements, true)
    },

    onPause: () => {
      updatePlayPauseButton(elements, false)
    },

    onFinish: () => {
      const activeTrack = getActiveTrack(state)

      if (state.mode === 'player') {
        const queueResult = handleQueueFragmentEnded(state, waveform, activeTrack)

        if (queueResult) {
          refreshUi()
          setStatus(elements, queueResult.message)
          return
        }
      }

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
      if (state.mode === 'player') {
        return
      }

      const activeTrack = getActiveTrack(state)

      // If the active track was deleted or no audio is loaded, WaveSurfer may
      // still have an old decoded buffer internally. Never let a waveform click
      // restart that orphaned audio.
      if (!activeTrack || !state.hasLoadedAudio) {
        waveform.pause()
        return
      }

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
          ? 'Seeking to selected point. Looping whole track.'
          : 'Seeking to selected point...',
      )
    },

    onRegionClick: ({ id, time }) => {
      const activeTrack = getActiveTrack(state)

      if (!activeTrack) return

      if (state.mode === 'player') {
        const queueResult = playQueueFragmentNow(state, waveform, activeTrack, id)

        if (queueResult.played) {
          refreshUi()
          setStatus(elements, queueResult.message)
          return
        }
      }

      if (state.selectedFragmentId !== id) {
        if (!saveSelectedFragmentDetails({ syncDetails: true })) {
          return
        }
      }

      const fragment = getFragmentById(activeTrack.fragments, id)
      const message = playFragment(state, waveform, fragment, time)

      refreshUi()
      setStatus(elements, message)
    },

    onRegionCreated: ({ id, start, end }) => {
      const activeTrack = getActiveTrack(state)

      if (!activeTrack) return

      state.lastRegionCreatedAt = performance.now()

      saveSelectedFragmentDetails({ syncDetails: false })

      const snappedBounds = getSnappedFragmentBounds(activeTrack, { start, end }, { excludeId: id })
      const fragment = createFragmentFromDrag(activeTrack.fragments, snappedBounds.start, snappedBounds.end, id)

      activeTrack.fragments.push(fragment)
      normalizeFragmentLinks(activeTrack)
      normalizeTrackQueue(activeTrack)
      resetPlayerRuntime(state)
      state.selectedFragmentId = fragment.id

      waveform.renderFragments(activeTrack.fragments)
      refreshUi()
      setStatus(elements, `Created fragment: ${fragment.name}. Drag it to move it or resize its edges.`)
    },

    onRegionUpdated: ({ id, start, end }) => {
      const activeTrack = getActiveTrack(state)

      if (!activeTrack) return

      if (end - start < MIN_FRAGMENT_LENGTH) {
        deleteFragment(activeTrack.fragments, id)
        normalizeFragmentLinks(activeTrack)
        normalizeTrackQueue(activeTrack)
        resetPlayerRuntime(state)
        state.selectedFragmentId = null
        waveform.renderFragments(activeTrack.fragments)
        refreshUi()
        setStatus(elements, 'Removed fragment because it was too short.')
        return
      }

      const snappedBounds = getSnappedFragmentBounds(activeTrack, { start, end }, { excludeId: id })
      const fragment = updateFragment(activeTrack.fragments, id, snappedBounds)

      if (!fragment) return

      normalizeFragmentLinks(activeTrack)
      normalizeTrackQueue(activeTrack)
      resetPlayerRuntime(state)
      state.selectedFragmentId = fragment.id
      waveform.renderFragments(activeTrack.fragments)
      refreshUi()
      setStatus(elements, `Updated fragment: ${fragment.name} (${formatRange(fragment)}).`)
    },

    onRegionOut: ({ id }) => {
      const activeTrack = getActiveTrack(state)

      if (state.mode === 'player') {
        const queueResult = handleQueueFragmentEnded(state, waveform, activeTrack, id)

        if (queueResult) {
          refreshUi()
          setStatus(elements, queueResult.message)
        }

        return
      }

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


function applyVolume() {
  const volume = normalizeVolume(state.playerSettings?.volume)
  state.playerSettings.volume = volume
  waveform.setVolume?.(volume)
  setManagedPlaybackVolume(state)
}

function stopAllPlaybackForUi() {
  const activeTrack = getActiveTrack(state)

  stopQueuePlayback(state, waveform)
  state.isLooping = false
  updatePlayPauseButton(elements, false)
  updateTimeDisplay(elements, 0, activeTrack?.audio?.duration || 0)
}

function getSnapEdges(track, excludeId = null) {
  return (track?.fragments || [])
    .filter((fragment) => fragment.id !== excludeId)
    .flatMap((fragment) => [fragment.start, fragment.end])
    .filter((value) => Number.isFinite(value))
}

function getSnapThresholdForTrack(track) {
  const duration = Number(track?.audio?.duration || 0)

  if (!Number.isFinite(duration) || duration <= 0) {
    return 0.12
  }

  return Math.min(Math.max(duration * 0.0045, 0.15), 1.0)
}

function snapValueToEdges(value, edges, threshold) {
  let closestValue = value
  let closestDistance = threshold

  for (const edge of edges) {
    const distance = Math.abs(value - edge)

    if (distance <= closestDistance) {
      closestDistance = distance
      closestValue = edge
    }
  }

  return closestValue
}

function getSnappedFragmentBounds(track, bounds, options = {}) {
  const start = Number(bounds.start)
  const end = Number(bounds.end)

  if (!state.editorSettings?.snapEnabled || !track || !Number.isFinite(start) || !Number.isFinite(end)) {
    return { start, end }
  }

  const duration = Number(track.audio?.duration || 0)
  const edges = getSnapEdges(track, options.excludeId)

  if (!edges.length) {
    return { start, end }
  }

  const snapThreshold = getSnapThresholdForTrack(track)

  let snappedStart = snapValueToEdges(start, edges, snapThreshold)
  let snappedEnd = snapValueToEdges(end, edges, snapThreshold)

  snappedStart = Math.max(0, Math.min(snappedStart, Math.max(0, duration - MIN_FRAGMENT_LENGTH)))
  snappedEnd = Math.max(snappedStart + MIN_FRAGMENT_LENGTH, Math.min(snappedEnd, duration || snappedEnd))

  if (snappedEnd - snappedStart < MIN_FRAGMENT_LENGTH) {
    return { start, end }
  }

  return {
    start: snappedStart,
    end: snappedEnd,
  }
}

function getSelectedFragment() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return null

  return getFragmentById(activeTrack.fragments, state.selectedFragmentId)
}


function getLinkedTargetsForFragment(track, fragment) {
  if (!track || !fragment) return []

  const target = getLinkedTargetFragment(track, fragment.id)

  return target ? [target] : []
}

function forceFragmentLengthToMatchTarget(track, fragment, targetFragment) {
  if (!track || !fragment || !targetFragment) return false

  const targetLength = Math.max(MIN_FRAGMENT_LENGTH, targetFragment.end - targetFragment.start)
  const duration = Number(track.audio?.duration || 0)
  let start = fragment.start
  let end = start + targetLength

  if (duration && end > duration) {
    end = duration
    start = Math.max(0, end - targetLength)
  }

  if (end - start < MIN_FRAGMENT_LENGTH) {
    return false
  }

  const changed =
    Math.abs(start - fragment.start) > 0.001 ||
    Math.abs(end - fragment.end) > 0.001

  if (changed) {
    updateFragment(track.fragments, fragment.id, { start, end })
  }

  return changed
}

function renderFragmentsListOnly() {
  const activeTrack = getActiveTrack(state)

  renderFragmentList({
    container: elements.fragmentsEl,
    fragments: activeTrack?.fragments || [],
    selectedFragmentId: state.selectedFragmentId,
    onFragmentClick: (fragmentId) => {
      const currentTrack = getActiveTrack(state)

      if (!currentTrack) return

      if (state.mode === 'player') {
        const queueResult = playQueueFragmentNow(state, waveform, currentTrack, fragmentId)

        if (queueResult.played) {
          refreshUi()
          setStatus(elements, queueResult.message)
          return
        }
      }

      if (state.selectedFragmentId !== fragmentId) {
        if (!saveSelectedFragmentDetails({ syncDetails: true })) {
          return
        }
      }

      const fragment = getFragmentById(currentTrack.fragments, fragmentId)
      const message = playFragment(state, waveform, fragment)

      refreshUi()
      setStatus(elements, message)
    },
  })
}

function refreshUi({ syncDetails = true } = {}) {
  const activeTrack = getActiveTrack(state)
  const selectedFragment = getSelectedFragment()

  applyModeToUi(elements, state.mode)
  updateControls(elements, state)
  renderGlobalControls(elements, state)

  renderTrackList({
    container: elements.tracksEl,
    tracks: state.tracks,
    activeTrackId: state.activeTrackId,
    onTrackClick: switchToTrack,
  })

  const playerSnapshot = getPlayerSnapshot(state, activeTrack)

  renderPlayerQueue({
    elements,
    snapshot: {
      ...playerSnapshot,
      availableFragments: getAvailableQueueFragments(activeTrack),
    },
    hasLoadedAudio: state.hasLoadedAudio,
    onQueueItemClick: (fragmentId) => {
      const currentTrack = getActiveTrack(state)

      if (!currentTrack) return

      const queueResult = playQueueFragmentNow(state, waveform, currentTrack, fragmentId)

      refreshUi()
      setStatus(elements, queueResult.message)
    },
    onQueueItemArm: armPlayerQueueItem,
    onQueueItemMove: movePlayerQueueItem,
    onQueueItemDrop: movePlayerQueueItemToPosition,
    onQueueItemRemove: removePlayerQueueItem,
    onQueueItemAdd: addPlayerQueueItem,
    onQueueReset: resetPlayerQueueOrder,
  })

  renderPlayerLinkedTargets({
    elements,
    currentFragment: playerSnapshot.currentFragment,
    linkedTargets: getLinkedTargetsForFragment(activeTrack, playerSnapshot.currentFragment),
    hasLoadedAudio: state.hasLoadedAudio,
    onLinkedTargetClick: switchPlayerLinkedFragment,
  })

  if (syncDetails) {
    renderFragmentDetails(elements, selectedFragment, activeTrack)
  }

  renderFragmentsListOnly()
}

function setMode(mode) {
  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  // Changing modes should never leave audio running or restart from a random fragment.
  // Treat it as a clean stop, then let the user deliberately start playback again.
  stopAllPlaybackForUi()

  state.mode = mode
  waveform.setMode(mode)

  const activeTrack = getActiveTrack(state)

  if (state.hasLoadedAudio && activeTrack) {
    waveform.renderFragments(activeTrack.fragments)
  }

  refreshUi()
  setStatus(
    elements,
    mode === 'editor'
      ? 'Editor mode. Playback stopped. Fragments can be created, moved, resized, renamed, or deleted.'
      : 'Player mode. Playback stopped. Use the queue controls to start, advance, or jump between fragments.',
  )
}

async function loadActiveTrack({ source = 'track' } = {}) {
  const activeTrack = getActiveTrack(state)

  waveform.pause()
  waveform.clearRegions()
  updatePlayPauseButton(elements, false)
  updateTimeDisplay(elements, 0, 0)

  state.hasLoadedAudio = false
  state.selectedFragmentId = null
  state.lastLoopRestartTime = 0
  resetPlayerRuntime(state)
  pendingLoadSource = source
  loadingTrackId = activeTrack?.id || null

  refreshUi()

  if (!activeTrack) {
    waveform.clearAudio?.()
    setStatus(elements, 'Add a track to begin.')
    return
  }

  setStatus(elements, `Loading track: ${activeTrack.name}`)

  try {
    await waveform.load(activeTrack.audio.objectUrl)
  } catch (error) {
    console.error(error)
    state.hasLoadedAudio = false
    waveform.clearRegions()
    refreshUi()
    setStatus(elements, `Could not load track: ${activeTrack.name}.`)
  }
}

async function addTracksFromFiles(files) {
  const audioFiles = Array.from(files || []).filter((file) => file.type.startsWith('audio/'))

  if (!audioFiles.length) return

  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  let newActiveTrackId = null

  for (const file of audioFiles) {
    const track = createTrackFromFile(file, state.tracks)
    state.tracks.push(track)

    if (!newActiveTrackId) {
      newActiveTrackId = track.id
    }
  }

  state.activeTrackId = newActiveTrackId
  resetPlaybackState()
  await loadActiveTrack({ source: 'track' })
}

async function switchToTrack(trackId) {
  if (trackId === state.activeTrackId) return

  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  const track = getTrackById(state.tracks, trackId)

  if (!track) return

  state.activeTrackId = track.id
  state.selectedFragmentId = null
  state.lastLoopRestartTime = 0
  resetPlayerRuntime(state)

  await loadActiveTrack({ source: 'switch' })
}

async function deleteActiveTrack() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const confirmed = window.confirm(`Delete track "${activeTrack.name}" from this project?`)

  if (!confirmed) return

  stopAllPlaybackForUi()

  const currentIndex = state.tracks.findIndex((track) => track.id === activeTrack.id)

  if (activeTrack.audio?.objectUrl) {
    URL.revokeObjectURL(activeTrack.audio.objectUrl)
    activeTrack.audio.objectUrl = null
  }

  state.tracks = state.tracks.filter((track) => track.id !== activeTrack.id)
  state.activeTrackId = state.tracks[currentIndex]?.id || state.tracks[currentIndex - 1]?.id || state.tracks[0]?.id || null
  resetPlaybackState()
  waveform.clearRegions()
  updateTimeDisplay(elements, 0, 0)
  updatePlayPauseButton(elements, false)

  if (!state.activeTrackId) {
    waveform.clearAudio?.()
    refreshUi()
    setStatus(elements, `Deleted track: ${activeTrack.name}. Add a track to continue.`)
    return
  }

  await loadActiveTrack({ source: 'switch' })
  setStatus(elements, `Deleted track: ${activeTrack.name}.`)
}

function addFragmentAtCurrentPlayhead() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  if (!saveSelectedFragmentDetails({ syncDetails: true })) {
    return
  }

  const fragment = createFragmentAtPlayhead(
    activeTrack.fragments,
    waveform.getCurrentTime(),
    activeTrack.audio.duration,
  )

  if (!fragment) return

  const snappedBounds = getSnappedFragmentBounds(activeTrack, {
    start: fragment.start,
    end: fragment.end,
  }, { excludeId: fragment.id })

  fragment.start = snappedBounds.start
  fragment.end = snappedBounds.end

  activeTrack.fragments.push(fragment)
  normalizeFragmentLinks(activeTrack)
  normalizeTrackQueue(activeTrack)
  resetPlayerRuntime(state)
  state.selectedFragmentId = fragment.id

  waveform.renderFragments(activeTrack.fragments)
  refreshUi()
  setStatus(elements, `Created fragment: ${fragment.name}. Drag it to move it or resize its edges.`)
}

function deleteSelectedFragment() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack || !state.selectedFragmentId) return

  const deletedFragment = deleteFragment(activeTrack.fragments, state.selectedFragmentId)

  if (!deletedFragment) return

  normalizeFragmentLinks(activeTrack)
  normalizeTrackQueue(activeTrack)
  resetPlayerRuntime(state)
  state.selectedFragmentId = null
  waveform.renderFragments(activeTrack.fragments)
  refreshUi()

  setStatus(
    elements,
    state.isLooping
      ? `Deleted fragment: ${deletedFragment.name}. Looping now targets the whole track.`
      : `Deleted fragment: ${deletedFragment.name}.`,
  )
}

function validateFragmentDetailsInput() {
  const activeTrack = getActiveTrack(state)
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

  if (!Number.isFinite(end) || end > (activeTrack?.audio?.duration || 0)) {
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
  const activeTrack = getActiveTrack(state)
  const fragment = getSelectedFragment()

  if (!activeTrack || !fragment) return true

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

  updateFragment(activeTrack.fragments, fragment.id, {
    name: trimmedName,
  })

  renderFragmentsListOnly()
  waveform.renderFragmentLabels?.(activeTrack.fragments)
  refreshUi({ syncDetails: false })

  return true
}

function saveSelectedFragmentPlaybackMode() {
  const activeTrack = getActiveTrack(state)
  const fragment = getSelectedFragment()

  if (!activeTrack || !fragment) return true

  const { playbackMode } = readFragmentDetails(elements)

  if (playbackMode === fragment.playbackMode) {
    return true
  }

  updateFragment(activeTrack.fragments, fragment.id, {
    playbackMode,
  })

  renderFragmentsListOnly()
  refreshUi({ syncDetails: false })

  return true
}

function saveSelectedFragmentDetails({ syncDetails = false } = {}) {
  const activeTrack = getActiveTrack(state)
  const fragment = getSelectedFragment()

  if (!activeTrack || !fragment) return true

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
      renderFragmentDetails(elements, fragment, activeTrack)
    }

    return true
  }

  const updatedFragment = updateFragment(activeTrack.fragments, fragment.id, {
    name,
    start,
    end,
    playbackMode,
  })

  if (!updatedFragment) return false

  state.selectedFragmentId = updatedFragment.id
  normalizeFragmentLinks(activeTrack)
  normalizeTrackQueue(activeTrack)
  resetPlayerRuntime(state)

  if (timeChanged) {
    waveform.renderFragments(activeTrack.fragments)
  } else if (nameChanged) {
    waveform.renderFragmentLabels?.(activeTrack.fragments)
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
    for (const track of state.tracks) {
      normalizeFragmentLinks(track)
      normalizeTrackQueue(track)
    }

    await downloadProjectBundle(state)

    setStatus(
      elements,
      `Exported project bundle with ${state.tracks.length} tracks.`,
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

    const { project, audioFilesByTrackId } = await readProjectBundle(file)
    const importedTracks = []

    for (const projectTrack of project.tracks) {
      const audioFile = audioFilesByTrackId.get(projectTrack.id)

      if (!audioFile) {
        throw new Error(`Missing audio file for track ${projectTrack.name}.`)
      }

      const track = createTrackFromImportedData(projectTrack, audioFile, importedTracks)
      normalizeFragmentLinks(track)
      normalizeTrackQueue(track)
      importedTracks.push(track)
    }

    replaceProject({
      tracks: importedTracks,
      activeTrackId: project.activeTrackId,
      editorSettings: project.editorSettings || {},
      playerSettings: project.playerSettings || {},
    })

    resetFragmentCounters()
    await loadActiveTrack({ source: 'bundle' })
  } catch (error) {
    console.error(error)
    setStatus(elements, `Could not import project bundle: ${error.message}`)
  } finally {
    elements.projectFileInput.value = ''
  }
}


function saveSelectedFragmentLink() {
  const activeTrack = getActiveTrack(state)
  const fragment = getSelectedFragment()

  if (!activeTrack || !fragment) return

  const { linkedFragmentId } = readFragmentDetails(elements)

  if (!linkedFragmentId) {
    const removed = removeFragmentLink(activeTrack, fragment.id)
    normalizeFragmentLinks(activeTrack)
    refreshUi()

    if (removed) {
      setStatus(elements, `Removed linked target from ${fragment.name}.`)
    }

    return
  }

  const targetFragment = getFragmentById(activeTrack.fragments, linkedFragmentId)

  if (!targetFragment) return

  setFragmentLink(activeTrack, fragment.id, targetFragment.id)
  normalizeFragmentLinks(activeTrack)
  normalizeTrackQueue(activeTrack)
  resetPlayerRuntime(state)

  // Do not auto-resize either fragment here. Linked fragments should be edited
  // manually; mismatched lengths can be warned about later, but selecting a link
  // should never move the user's precise split point.
  waveform.renderFragmentLabels?.(activeTrack.fragments)

  refreshUi()
  setStatus(elements, `Linked ${fragment.name} to ${targetFragment.name}.`)
}

async function switchPlayerLinkedFragment(targetFragmentId) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const result = await switchToLinkedFragment(state, waveform, activeTrack, targetFragmentId)

  refreshUi()
  updatePlayPauseButton(elements, Boolean(result.played))
  setStatus(elements, result.message)
}

function stopQueueForEdit(message) {
  if (state.mode === 'player') {
    stopQueuePlayback(state, waveform)
    updatePlayPauseButton(elements, false)
  } else {
    resetPlayerRuntime(state)
  }

  refreshUi()
  setStatus(elements, message)
}

function movePlayerQueueItem(fragmentId, direction) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const moved = moveTrackQueueItem(activeTrack, fragmentId, direction)

  if (!moved) return

  const fragment = getFragmentById(activeTrack.fragments, fragmentId)
  const directionLabel = direction === 'up' ? 'up' : 'down'

  stopQueueForEdit(`Moved ${fragment?.name || 'queue item'} ${directionLabel}.`)
}

function movePlayerQueueItemToPosition(sourceFragmentId, targetFragmentId, placement) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const moved = moveTrackQueueItemToPosition(
    activeTrack,
    sourceFragmentId,
    targetFragmentId,
    placement,
  )

  if (!moved) return

  const sourceFragment = getFragmentById(activeTrack.fragments, sourceFragmentId)
  const targetFragment = getFragmentById(activeTrack.fragments, targetFragmentId)
  const placementLabel = placement === 'after' ? 'after' : 'before'

  stopQueueForEdit(
    `Moved ${sourceFragment?.name || 'queue item'} ${placementLabel} ${targetFragment?.name || 'target item'}.`,
  )
}

function removePlayerQueueItem(fragmentId) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const removed = removeTrackQueueItem(activeTrack, fragmentId)

  if (!removed) return

  const fragment = getFragmentById(activeTrack.fragments, fragmentId)

  stopQueueForEdit(`Removed ${fragment?.name || 'fragment'} from the queue.`)
}

function addPlayerQueueItem(fragmentId) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const added = addTrackQueueItem(activeTrack, fragmentId)

  if (!added) return

  const fragment = getFragmentById(activeTrack.fragments, fragmentId)

  stopQueueForEdit(`Added ${fragment?.name || 'fragment'} to the queue.`)
}

function resetPlayerQueueOrder() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  resetTrackQueueOrder(activeTrack)
  stopQueueForEdit('Reset queue order to fragment start times.')
}

function startPlayerQueue() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const result = startQueuePlayback(state, waveform, activeTrack)

  refreshUi()
  setStatus(elements, result.message)
}

function requestPlayerNext() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const result = requestNextQueueFragment(state, activeTrack)

  refreshUi()
  setStatus(elements, result.message)
}

function armPlayerQueueItem(fragmentId) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const result = armQueueFragment(state, activeTrack, fragmentId)

  refreshUi()
  setStatus(elements, result.message)
}

function jumpPlayerNext() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const result = jumpToNextQueueFragment(state, waveform, activeTrack)

  refreshUi()
  setStatus(elements, result.message)
}

function restartPlayerCurrent() {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return

  const result = restartCurrentQueueFragment(state, waveform, activeTrack)

  refreshUi()
  setStatus(elements, result.message)
}

elements.trackFileInput.addEventListener('change', async (event) => {
  await addTracksFromFiles(event.target.files)
  elements.trackFileInput.value = ''
})

elements.playPauseBtn.addEventListener('click', async () => {
  if (state.mode === 'player') {
    const activeTrack = getActiveTrack(state)

    if (!activeTrack) return

    const managedToggle = toggleManagedPlayback(state)

    if (managedToggle.handled) {
      updatePlayPauseButton(elements, managedToggle.isPlaying)
      return
    }

    const snapshot = getPlayerSnapshot(state, activeTrack)

    if (!snapshot.currentFragment) {
      if (!snapshot.queueFragments.length) {
        await waveform.playPause()
        setStatus(elements, 'Playing whole track.')
        return
      }

      const result = startQueuePlayback(state, waveform, activeTrack)
      refreshUi()
      setStatus(elements, result.message)
      return
    }
  } else {
    saveSelectedFragmentDetails({ syncDetails: true })
  }

  await waveform.playPause()
})

elements.stopBtn.addEventListener('click', () => {
  const activeTrack = getActiveTrack(state)

  let message

  if (state.mode === 'player') {
    message = stopQueuePlayback(state, waveform)
  } else {
    saveSelectedFragmentDetails({ syncDetails: true })
    message = stopPlayback(state, waveform)
  }

  updateTimeDisplay(elements, 0, activeTrack?.audio?.duration || 0)
  updatePlayPauseButton(elements, false)
  refreshUi()
  setStatus(elements, message)
})

elements.loopToggleBtn.addEventListener('click', () => {
  if (state.mode === 'player') return

  saveSelectedFragmentDetails({ syncDetails: true })

  const message = toggleLoop(state)

  refreshUi()
  setStatus(elements, message)
})

if (elements.volumeInput) {
  elements.volumeInput.addEventListener('input', () => {
    state.playerSettings.volume = normalizeVolume(Number(elements.volumeInput.value) / 100)
    applyVolume()
  })
}

if (elements.linkedCrossfadeInput) {
  elements.linkedCrossfadeInput.addEventListener('input', () => {
    state.playerSettings.linkedFragmentCrossfadeMs = normalizeMilliseconds(
      elements.linkedCrossfadeInput.value,
      250,
      0,
      2000,
    )
  })
}

if (elements.linkedOffsetInput) {
  elements.linkedOffsetInput.addEventListener('input', () => {
    state.playerSettings.linkedFragmentOffsetMs = normalizeMilliseconds(
      elements.linkedOffsetInput.value,
      0,
      -1000,
      1000,
    )
  })
}

if (elements.snapToggleInput) {
  elements.snapToggleInput.addEventListener('change', () => {
    state.editorSettings.snapEnabled = Boolean(elements.snapToggleInput.checked)
    refreshUi({ syncDetails: false })
    setStatus(elements, state.editorSettings.snapEnabled
      ? 'Fragment snapping enabled.'
      : 'Fragment snapping disabled.')
  })
}

elements.addFragmentBtn.addEventListener('click', addFragmentAtCurrentPlayhead)
elements.deleteFragmentBtn.addEventListener('click', deleteSelectedFragment)
elements.editorModeBtn.addEventListener('click', () => setMode('editor'))
elements.playerModeBtn.addEventListener('click', () => setMode('player'))
elements.exportProjectBtn.addEventListener('click', exportProjectBundle)

if (elements.deleteTrackBtn) {
  elements.deleteTrackBtn.addEventListener('click', deleteActiveTrack)
}
elements.startQueueBtn.addEventListener('click', startPlayerQueue)
elements.nextQueueBtn.addEventListener('click', requestPlayerNext)
elements.jumpQueueBtn.addEventListener('click', jumpPlayerNext)
elements.restartQueueBtn.addEventListener('click', restartPlayerCurrent)

elements.fragmentNameInput.addEventListener('input', () => {
  saveSelectedFragmentName()
})

elements.fragmentLoopModeInput.addEventListener('change', () => {
  saveSelectedFragmentPlaybackMode()
})

if (elements.fragmentLinkSelect) {
  elements.fragmentLinkSelect.addEventListener('change', saveSelectedFragmentLink)
}

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
  clearTrackObjectUrls()
})

applyVolume()
refreshUi()
setStatus(elements, 'Add a track or import a project bundle to begin.')
