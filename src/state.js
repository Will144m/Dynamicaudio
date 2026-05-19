export const state = {
  hasLoadedAudio: false,
  mode: 'editor',
  selectedFragmentId: null,
  isLooping: false,
  lastLoopRestartTime: 0,
  lastRegionCreatedAt: 0,

  audio: {
    file: null,
    fileName: '',
    fileType: '',
    fileSize: 0,
    lastModified: 0,
    duration: 0,
    objectUrl: null,
  },

  fragments: [],
}

export function resetLoadedAudioState() {
  state.hasLoadedAudio = false
  state.selectedFragmentId = null
  state.isLooping = false
  state.lastLoopRestartTime = 0
  state.lastRegionCreatedAt = 0

  state.audio.file = null
  state.audio.fileName = ''
  state.audio.fileType = ''
  state.audio.fileSize = 0
  state.audio.lastModified = 0
  state.audio.duration = 0
}

export function setAudioObjectUrl(url) {
  if (state.audio.objectUrl) {
    URL.revokeObjectURL(state.audio.objectUrl)
  }

  state.audio.objectUrl = url
}

export function clearAudioObjectUrl() {
  if (state.audio.objectUrl) {
    URL.revokeObjectURL(state.audio.objectUrl)
  }

  state.audio.objectUrl = null
}
