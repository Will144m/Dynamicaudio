import { getFragmentById } from './fragments.js'

export function ensurePlayerState(state) {
  if (!state.player) {
    state.player = {
      currentQueueIndex: null,
      queuedQueueIndex: null,
      advanceRequested: false,
      lastHandledEndAt: 0,
    }
  }

  return state.player
}

export function resetPlayerRuntime(state) {
  cancelLinkedCrossfade({ setVolume() {} }, 1)
  pauseAndClearManagedPlayback()
  const player = ensurePlayerState(state)

  player.currentQueueIndex = null
  player.queuedQueueIndex = null
  player.advanceRequested = false
  player.lastHandledEndAt = 0
}

export function getQueueFragments(track) {
  if (!track) return []

  return (track.queue || [])
    .map((item) => getFragmentById(track.fragments, item.fragmentId))
    .filter(Boolean)
}

export function getCurrentQueueFragment(state, track) {
  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)

  if (player.currentQueueIndex === null) return null

  return queueFragments[player.currentQueueIndex] || null
}

export function getQueuedQueueFragment(state, track) {
  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)

  if (player.queuedQueueIndex === null) return null

  return queueFragments[player.queuedQueueIndex] || null
}

export function getPlayerSnapshot(state, track) {
  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)
  const currentFragment = getCurrentQueueFragment(state, track)
  const queuedFragment = getQueuedQueueFragment(state, track)

  return {
    currentQueueIndex: player.currentQueueIndex,
    queuedQueueIndex: player.queuedQueueIndex,
    advanceRequested: player.advanceRequested,
    currentFragment,
    queuedFragment,
    queueFragments,
  }
}

function getFirstQueueIndex(track) {
  return getQueueFragments(track).length ? 0 : null
}

function getNextQueueIndex(track, currentIndex) {
  const queueFragments = getQueueFragments(track)

  if (!queueFragments.length) return null

  if (currentIndex === null || currentIndex === undefined || currentIndex < 0) {
    return 0
  }

  const nextIndex = currentIndex + 1

  return nextIndex < queueFragments.length ? nextIndex : null
}

function getQueueIndexByFragmentId(track, fragmentId) {
  return getQueueFragments(track).findIndex((fragment) => fragment.id === fragmentId)
}

let activeLinkedCrossfade = null
let activeManagedPlayback = null

function getActiveManagedAudio() {
  return activeManagedPlayback?.audio || null
}

export function isManagedPlaybackActive() {
  return Boolean(activeManagedPlayback?.audio)
}

function clearManagedMonitor() {
  if (activeManagedPlayback?.intervalId !== null && activeManagedPlayback?.intervalId !== undefined) {
    window.clearInterval(activeManagedPlayback.intervalId)
  }
}

function pauseAndClearManagedPlayback() {
  clearManagedMonitor()

  if (activeManagedPlayback?.audio) {
    activeManagedPlayback.audio.pause()
    activeManagedPlayback.audio.removeAttribute('src')
    activeManagedPlayback.audio.load()
  }

  activeManagedPlayback = null
}

export function setManagedPlaybackVolume(state) {
  const audio = getActiveManagedAudio()

  if (!audio) return

  audio.volume = getPlayerVolume(state)
}

export function toggleManagedPlayback(state) {
  const audio = getActiveManagedAudio()

  if (!audio) {
    return { handled: false, isPlaying: false }
  }

  if (audio.paused) {
    audio.play().catch((error) => {
      console.warn('Could not resume managed playback.', error)
    })

    return { handled: true, isPlaying: true }
  }

  audio.pause()
  return { handled: true, isPlaying: false }
}

function findQueueIndexByFragment(track, fragment) {
  return getQueueFragments(track).findIndex((candidate) => candidate.id === fragment?.id)
}

function getManagedNextQueueIndex(state, track, currentFragment) {
  const player = ensurePlayerState(state)
  const currentIndex = findQueueIndexByFragment(track, currentFragment)

  if (player.queuedQueueIndex !== null) {
    return player.queuedQueueIndex
  }

  return getNextQueueIndex(track, currentIndex)
}

function syncWaveformVisualToManagedAudio(waveform, track, audio) {
  if (!audio || !track?.audio?.duration || typeof waveform.seekTo !== 'function') {
    return
  }

  const now = performance.now()

  if (activeManagedPlayback && now - activeManagedPlayback.lastVisualSyncAt < 160) {
    return
  }

  if (activeManagedPlayback) {
    activeManagedPlayback.lastVisualSyncAt = now
  }

  const progress = clampTime(audio.currentTime / track.audio.duration, 0, 1)
  waveform.seekTo(progress)
}

function monitorManagedPlayback(state, waveform, track, fragment) {
  clearManagedMonitor()

  const audio = getActiveManagedAudio()

  if (!audio) return

  activeManagedPlayback.intervalId = window.setInterval(() => {
    const currentAudio = getActiveManagedAudio()

    if (!currentAudio || currentAudio !== audio || currentAudio.paused) return

    syncWaveformVisualToManagedAudio(waveform, track, currentAudio)

    if (currentAudio.currentTime < fragment.end - 0.025) return

    const player = ensurePlayerState(state)

    if (fragment.playbackMode === 'transition') {
      const nextIndex = getManagedNextQueueIndex(state, track, fragment)
      const nextFragment = getQueueFragments(track)[nextIndex]

      if (!nextFragment) {
        pauseAndClearManagedPlayback()
        player.currentQueueIndex = null
        player.queuedQueueIndex = null
        player.advanceRequested = false
        state.selectedFragmentId = null
        return
      }

      playManagedFragment(state, waveform, track, nextFragment, nextFragment.start)
      return
    }

    if (player.advanceRequested && player.queuedQueueIndex !== null) {
      const nextFragment = getQueueFragments(track)[player.queuedQueueIndex]

      if (nextFragment) {
        playManagedFragment(state, waveform, track, nextFragment, nextFragment.start)
        return
      }
    }

    currentAudio.currentTime = fragment.start
    currentAudio.play().catch((error) => {
      console.warn('Could not loop managed fragment.', error)
    })
  }, 25)
}

function adoptManagedAudio(state, waveform, track, fragment, audio) {
  pauseAndClearManagedPlayback()

  const player = ensurePlayerState(state)
  const queueIndex = findQueueIndexByFragment(track, fragment)

  player.currentQueueIndex = queueIndex >= 0 ? queueIndex : null
  player.queuedQueueIndex = null
  player.advanceRequested = false
  state.selectedFragmentId = fragment.id

  activeManagedPlayback = {
    audio,
    trackId: track.id,
    fragmentId: fragment.id,
    intervalId: null,
    lastVisualSyncAt: 0,
  }

  audio.volume = getPlayerVolume(state)
  syncWaveformVisualToManagedAudio(waveform, track, audio)
  monitorManagedPlayback(state, waveform, track, fragment)
}

function playManagedFragment(state, waveform, track, fragment, startTime) {
  const audio = new Audio(track.audio.objectUrl)

  audio.preload = 'auto'
  audio.volume = getPlayerVolume(state)
  audio.currentTime = clampTime(
    startTime,
    fragment.start,
    Math.max(fragment.start, fragment.end - 0.01),
  )

  adoptManagedAudio(state, waveform, track, fragment, audio)

  audio.play().catch((error) => {
    console.warn('Managed fragment playback failed; falling back to WaveSurfer.', error)
    pauseAndClearManagedPlayback()
    waveform.setVolume?.(getPlayerVolume(state))
    waveform.play(startTime, fragment.end)
  })
}

function getPlayerVolume(state) {
  const volume = Number(state?.playerSettings?.volume)

  if (!Number.isFinite(volume)) return 1

  return Math.min(Math.max(volume, 0), 1)
}

function getLinkedCrossfadeMs(state, link = null) {
  const linkValue = Number(link?.crossfadeMs)
  const settingValue = Number(state?.playerSettings?.linkedFragmentCrossfadeMs)

  if (Number.isFinite(linkValue)) {
    return Math.min(Math.max(linkValue, 0), 2000)
  }

  if (Number.isFinite(settingValue)) {
    return Math.min(Math.max(settingValue, 0), 2000)
  }

  return 250
}

function getLinkedOffsetSeconds(state) {
  const offsetMs = Number(state?.playerSettings?.linkedFragmentOffsetMs)

  if (!Number.isFinite(offsetMs)) return 0

  return Math.min(Math.max(offsetMs, -1000), 1000) / 1000
}

function cancelLinkedCrossfade(waveform, volume = 1) {
  if (!activeLinkedCrossfade) {
    waveform.setVolume?.(volume)
    return
  }

  if (activeLinkedCrossfade.frameId !== null) {
    window.cancelAnimationFrame(activeLinkedCrossfade.frameId)
  }

  activeLinkedCrossfade.audio.pause()
  activeLinkedCrossfade.audio.src = ''
  activeLinkedCrossfade = null
  waveform.setVolume?.(volume)
}

function clampTime(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function waitForAudioSeek(audio) {
  return new Promise((resolve) => {
    if (audio.readyState >= 2) {
      resolve()
      return
    }

    const cleanup = () => {
      audio.removeEventListener('canplay', cleanup)
      audio.removeEventListener('loadeddata', cleanup)
      resolve()
    }

    audio.addEventListener('canplay', cleanup, { once: true })
    audio.addEventListener('loadeddata', cleanup, { once: true })

    window.setTimeout(cleanup, 300)
  })
}

function fadeLinkedAudio({ state, waveform, track, secondaryAudio, sourceAudio, targetFragment, durationMs }) {
  const volume = getPlayerVolume(state)

  return new Promise((resolve) => {
    if (durationMs <= 0 || volume <= 0) {
      if (sourceAudio) {
        sourceAudio.pause()
      } else {
        waveform.pause()
      }

      waveform.setVolume?.(volume)
      secondaryAudio.volume = volume
      adoptManagedAudio(state, waveform, track, targetFragment, secondaryAudio)
      resolve()
      return
    }

    const startedAt = performance.now()

    activeLinkedCrossfade = {
      audio: secondaryAudio,
      frameId: null,
    }

    function step(now) {
      if (!activeLinkedCrossfade || activeLinkedCrossfade.audio !== secondaryAudio) {
        resolve()
        return
      }

      const progress = Math.min(Math.max((now - startedAt) / durationMs, 0), 1)
      const easedProgress = progress

      if (sourceAudio) {
        sourceAudio.volume = volume * (1 - easedProgress)
      } else {
        waveform.setVolume?.(volume * (1 - easedProgress))
      }

      secondaryAudio.volume = volume * easedProgress

      if (progress < 1) {
        activeLinkedCrossfade.frameId = window.requestAnimationFrame(step)
        return
      }

      if (sourceAudio) {
        sourceAudio.pause()
        sourceAudio.removeAttribute('src')
        sourceAudio.load()
      } else {
        waveform.pause()
      }

      activeLinkedCrossfade = null
      waveform.setVolume?.(volume)
      secondaryAudio.volume = volume
      adoptManagedAudio(state, waveform, track, targetFragment, secondaryAudio)
      resolve()
    }

    activeLinkedCrossfade.frameId = window.requestAnimationFrame(step)
  })
}

function playQueueIndex(state, waveform, track, queueIndex, options = {}) {
  cancelLinkedCrossfade(waveform, getPlayerVolume(state))
  pauseAndClearManagedPlayback()

  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)
  const fragment = queueFragments[queueIndex]

  if (!fragment) {
    return {
      played: false,
      message: 'No queue item selected.',
    }
  }

  player.currentQueueIndex = queueIndex
  player.queuedQueueIndex = null
  player.advanceRequested = false
  state.selectedFragmentId = fragment.id

  waveform.play(fragment.start, fragment.end)

  const modeLabel = fragment.playbackMode === 'transition'
    ? 'Playing transition'
    : 'Looping queue fragment'

  return {
    played: true,
    fragment,
    message: `${modeLabel}: ${fragment.name}`,
  }
}

export function startQueuePlayback(state, waveform, track) {
  const player = ensurePlayerState(state)

  let queueIndex = player.currentQueueIndex

  if (queueIndex === null || !getQueueFragments(track)[queueIndex]) {
    queueIndex = getFirstQueueIndex(track)
  }

  if (queueIndex === null) {
    return {
      played: false,
      message: 'This track has no fragments in its queue yet.',
    }
  }

  return playQueueIndex(state, waveform, track, queueIndex)
}

export function playQueueFragmentNow(state, waveform, track, fragmentId) {
  const queueIndex = getQueueIndexByFragmentId(track, fragmentId)

  if (queueIndex === -1) {
    return {
      played: false,
      message: 'That fragment is not in the queue.',
    }
  }

  return playQueueIndex(state, waveform, track, queueIndex)
}

export function restartCurrentQueueFragment(state, waveform, track) {
  const player = ensurePlayerState(state)

  if (player.currentQueueIndex === null) {
    return startQueuePlayback(state, waveform, track)
  }

  return playQueueIndex(state, waveform, track, player.currentQueueIndex)
}

export function requestNextQueueFragment(state, track) {
  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)

  if (!queueFragments.length) {
    return {
      queued: false,
      message: 'This track has no fragments in its queue yet.',
    }
  }

  if (player.currentQueueIndex === null) {
    player.currentQueueIndex = 0
    player.queuedQueueIndex = null
    player.advanceRequested = false

    return {
      queued: true,
      message: `Queue ready at: ${queueFragments[0].name}`,
    }
  }

  const nextIndex = getNextQueueIndex(track, player.currentQueueIndex)

  if (nextIndex === null) {
    return {
      queued: false,
      message: 'No next queue item. Current loop will continue.',
    }
  }

  const nextFragment = queueFragments[nextIndex]

  player.queuedQueueIndex = nextIndex
  player.advanceRequested = true

  return {
    queued: true,
    fragment: nextFragment,
    message: `Next armed: ${nextFragment.name}. It will start after the current loop ends.`,
  }
}

export function armQueueFragment(state, track, fragmentId) {
  const player = ensurePlayerState(state)
  const queueIndex = getQueueIndexByFragmentId(track, fragmentId)
  const queueFragments = getQueueFragments(track)

  if (queueIndex === -1) {
    return {
      queued: false,
      message: 'That fragment is not in the queue.',
    }
  }

  if (player.currentQueueIndex === queueIndex) {
    player.queuedQueueIndex = null
    player.advanceRequested = false

    return {
      queued: false,
      fragment: queueFragments[queueIndex],
      message: `${queueFragments[queueIndex].name} is already current.`,
    }
  }

  player.queuedQueueIndex = queueIndex
  player.advanceRequested = true

  return {
    queued: true,
    fragment: queueFragments[queueIndex],
    message: `Armed next: ${queueFragments[queueIndex].name}. It will start after the current loop ends.`,
  }
}

export function jumpToNextQueueFragment(state, waveform, track) {
  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)
  const targetIndex = player.queuedQueueIndex !== null
    ? player.queuedQueueIndex
    : getNextQueueIndex(track, player.currentQueueIndex)

  if (targetIndex === null || !queueFragments[targetIndex]) {
    return {
      played: false,
      message: 'No next queue item.',
    }
  }

  return playQueueIndex(state, waveform, track, targetIndex)
}

export function handleQueueFragmentEnded(state, waveform, track, endedFragmentId = null) {
  const player = ensurePlayerState(state)
  const now = performance.now()

  if (now - player.lastHandledEndAt < 120) {
    return null
  }

  const currentFragment = getCurrentQueueFragment(state, track)

  if (!currentFragment) return null

  if (endedFragmentId && endedFragmentId !== currentFragment.id) {
    return null
  }

  player.lastHandledEndAt = now

  if (currentFragment.playbackMode === 'transition') {
    const targetIndex = player.queuedQueueIndex !== null
      ? player.queuedQueueIndex
      : getNextQueueIndex(track, player.currentQueueIndex)

    if (targetIndex === null || !getQueueFragments(track)[targetIndex]) {
      player.currentQueueIndex = null
      player.queuedQueueIndex = null
      player.advanceRequested = false
      state.selectedFragmentId = null
      waveform.pause()

      return {
        handled: true,
        message: 'Queue finished.',
      }
    }

    return playQueueIndex(state, waveform, track, targetIndex)
  }

  if (player.advanceRequested && player.queuedQueueIndex !== null) {
    return playQueueIndex(state, waveform, track, player.queuedQueueIndex)
  }

  waveform.play(currentFragment.start, currentFragment.end)

  return {
    handled: true,
    fragment: currentFragment,
    message: `Looping queue fragment: ${currentFragment.name}`,
  }
}


export async function switchToLinkedFragment(state, waveform, track, targetFragmentId) {
  const player = ensurePlayerState(state)
  const queueFragments = getQueueFragments(track)
  const currentFragment = getCurrentQueueFragment(state, track) || getFragmentById(track?.fragments || [], state.selectedFragmentId)
  const targetFragment = getFragmentById(track?.fragments || [], targetFragmentId)

  if (!currentFragment) {
    return {
      played: false,
      message: 'No current fragment to switch from.',
    }
  }

  if (!targetFragment) {
    return {
      played: false,
      message: 'Linked fragment was not found.',
    }
  }

  cancelLinkedCrossfade(waveform, getPlayerVolume(state))

  const link = (track.fragmentLinks || []).find((candidate) => {
    return candidate.fromFragmentId === currentFragment.id && candidate.toFragmentId === targetFragment.id
  })

  const currentLength = Math.max(0.001, currentFragment.end - currentFragment.start)
  const currentAudio = getActiveManagedAudio()
  const currentTime = currentAudio
    ? currentAudio.currentTime
    : typeof waveform.getCurrentTime === 'function'
      ? waveform.getCurrentTime()
      : currentFragment.start

  const elapsed = clampTime(currentTime - currentFragment.start, 0, currentLength)
  const rawTargetTime = targetFragment.start + elapsed + getLinkedOffsetSeconds(state)
  const targetTime = clampTime(
    rawTargetTime,
    targetFragment.start,
    Math.max(targetFragment.start, targetFragment.end - 0.01),
  )
  const targetQueueIndex = queueFragments.findIndex((fragment) => fragment.id === targetFragment.id)

  player.currentQueueIndex = targetQueueIndex >= 0 ? targetQueueIndex : null
  player.queuedQueueIndex = null
  player.advanceRequested = false
  state.selectedFragmentId = targetFragment.id

  const crossfadeMs = getLinkedCrossfadeMs(state, link)

  if (!track?.audio?.objectUrl) {
    waveform.play(targetTime, targetFragment.end)

    return {
      played: true,
      fragment: targetFragment,
      message: `Switched to linked fragment: ${targetFragment.name}`,
    }
  }

  if (crossfadeMs <= 0) {
    waveform.pause()
    waveform.setVolume?.(getPlayerVolume(state))
    playManagedFragment(state, waveform, track, targetFragment, targetTime)

    return {
      played: true,
      fragment: targetFragment,
      message: `Switched to linked fragment: ${targetFragment.name}`,
    }
  }

  try {
    const secondaryAudio = new Audio(track.audio.objectUrl)

    secondaryAudio.preload = 'auto'
    secondaryAudio.volume = 0
    secondaryAudio.currentTime = targetTime

    await waitForAudioSeek(secondaryAudio)
    await secondaryAudio.play()
    const sourceAudio = getActiveManagedAudio()

    await fadeLinkedAudio({
      state,
      waveform,
      track,
      secondaryAudio,
      sourceAudio,
      targetFragment,
      durationMs: crossfadeMs,
    })
  } catch (error) {
    console.warn('Linked fragment crossfade failed; falling back to direct switch.', error)
    cancelLinkedCrossfade(waveform, getPlayerVolume(state))
    playManagedFragment(state, waveform, track, targetFragment, targetTime)
  }

  return {
    played: true,
    fragment: targetFragment,
    message: `Crossfaded to linked fragment: ${targetFragment.name}`,
  }
}


export function stopQueuePlayback(state, waveform) {
  cancelLinkedCrossfade(waveform, getPlayerVolume(state))
  pauseAndClearManagedPlayback()
  resetPlayerRuntime(state)
  state.selectedFragmentId = null
  waveform.pause()
  waveform.seekTo(0)

  return 'Stopped queue playback.'
}
