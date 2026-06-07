export const state = {
  mode: 'editor',
  activeTrackId: null,
  selectedFragmentId: null,
  isLooping: false,
  hasLoadedAudio: false,
  lastLoopRestartTime: 0,
  lastRegionCreatedAt: 0,
  tracks: [],
  editorSettings: {
    snapEnabled: false,
  },
  playerSettings: {
    volume: 1,
    linkedFragmentCrossfadeMs: 250,
    linkedFragmentOffsetMs: 0,
  },
  player: {
    currentQueueIndex: null,
    queuedQueueIndex: null,
    advanceRequested: false,
    lastHandledEndAt: 0,
  },
}

export function resetPlaybackState() {
  state.selectedFragmentId = null
  state.isLooping = false
  state.hasLoadedAudio = false
  state.lastLoopRestartTime = 0
  state.lastRegionCreatedAt = 0
  state.player.currentQueueIndex = null
  state.player.queuedQueueIndex = null
  state.player.advanceRequested = false
  state.player.lastHandledEndAt = 0
}

export function clearTrackObjectUrls(tracks = state.tracks) {
  for (const track of tracks) {
    if (track.audio?.objectUrl) {
      URL.revokeObjectURL(track.audio.objectUrl)
      track.audio.objectUrl = null
    }
  }
}

export function replaceProject({
  tracks = [],
  activeTrackId = null,
  editorSettings = {},
  playerSettings = {},
}) {
  clearTrackObjectUrls()

  state.tracks = tracks
  state.activeTrackId = activeTrackId || tracks[0]?.id || null
  state.editorSettings = {
    snapEnabled: Boolean(editorSettings.snapEnabled),
  }
  state.playerSettings = normalizePlayerSettings(playerSettings)
  resetPlaybackState()
}

export function normalizeVolume(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 1
  }

  return Math.min(Math.max(number, 0), 1)
}


export function normalizePlayerSettings(settings = {}) {
  return {
    volume: normalizeVolume(settings.volume),
    linkedFragmentCrossfadeMs: normalizeMilliseconds(
      settings.linkedFragmentCrossfadeMs,
      250,
      0,
      2000,
    ),
    linkedFragmentOffsetMs: normalizeMilliseconds(
      settings.linkedFragmentOffsetMs,
      0,
      -1000,
      1000,
    ),
  }
}

export function normalizeMilliseconds(value, fallback, min, max) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(Math.max(number, min), max)
}
