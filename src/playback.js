import { clamp } from './utils.js'
import { getActiveTrack } from './tracks.js'
import { getFragmentById } from './fragments.js'

function getPlayableStart(fragment, requestedStart = fragment.start) {
  const maxStart = fragment.end > fragment.start
    ? fragment.end - 0.01
    : fragment.start

  return clamp(requestedStart, fragment.start, Math.max(fragment.start, maxStart))
}

function getWholeTrackLoopTarget(state) {
  const activeTrack = getActiveTrack(state)
  const duration = activeTrack?.audio?.duration || 0

  if (!duration) {
    return null
  }

  return {
    id: 'whole-track',
    label: activeTrack.name || 'whole track',
    start: 0,
    end: duration,
    isFragment: false,
  }
}

function getCurrentLoopTarget(state) {
  const activeTrack = getActiveTrack(state)

  if (!activeTrack) return null

  if (state.selectedFragmentId) {
    const fragment = getFragmentById(activeTrack.fragments, state.selectedFragmentId)

    if (fragment) {
      return {
        id: fragment.id,
        label: fragment.name,
        start: fragment.start,
        end: fragment.end,
        isFragment: true,
      }
    }
  }

  return getWholeTrackLoopTarget(state)
}

export function playFragment(state, waveform, fragment, startTime = fragment?.start) {
  if (!fragment) return 'No fragment selected.'

  const playableStart = getPlayableStart(fragment, startTime)

  state.selectedFragmentId = fragment.id
  waveform.play(playableStart, fragment.end)

  return state.isLooping
    ? `Looping fragment: ${fragment.name} from ${playableStart.toFixed(2)}s`
    : `Playing fragment: ${fragment.name} from ${playableStart.toFixed(2)}s`
}

export function replayCurrentLoopTarget(state, waveform) {
  if (!state.isLooping) return null

  const now = performance.now()

  if (now - state.lastLoopRestartTime < 100) {
    return null
  }

  state.lastLoopRestartTime = now

  const target = getCurrentLoopTarget(state)

  if (!target) return null

  waveform.play(target.start, target.end)

  return {
    target,
    message: target.isFragment
      ? `Looping fragment: ${target.label}`
      : 'Looping whole track.',
  }
}

export function stopPlayback(state, waveform) {
  const wasLooping = state.isLooping

  state.selectedFragmentId = null

  waveform.pause()
  waveform.seekTo(0)

  return wasLooping
    ? 'Stopped. Looping is still on for the whole track.'
    : 'Stopped.'
}

export function toggleLoop(state) {
  state.isLooping = !state.isLooping

  if (!state.isLooping) {
    return 'Loop disabled.'
  }

  const target = getCurrentLoopTarget(state)

  if (!target) {
    return 'Loop enabled.'
  }

  return target.isFragment
    ? `Loop enabled for fragment: ${target.label}`
    : 'Loop enabled for the whole track.'
}
