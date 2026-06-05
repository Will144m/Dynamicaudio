import { clamp, formatTime } from './utils.js'
import { getFragmentById } from './fragments.js'

export function getPlayableStart(fragment, requestedStart = fragment.start) {
  const maxStart = fragment.end > fragment.start
    ? fragment.end - 0.01
    : fragment.start

  return clamp(requestedStart, fragment.start, Math.max(fragment.start, maxStart))
}

export function getCurrentLoopTarget(state) {
  const selectedFragment = getFragmentById(state.fragments, state.selectedFragmentId)

  if (selectedFragment) {
    return {
      id: selectedFragment.id,
      label: selectedFragment.name,
      start: selectedFragment.start,
      end: selectedFragment.end,
      isFragment: true,
    }
  }

  if (!state.audio.duration) {
    return null
  }

  return {
    id: 'whole-file',
    label: 'whole file',
    start: 0,
    end: state.audio.duration,
    isFragment: false,
  }
}

export function playFragment(state, waveform, fragment, startTime = fragment.start) {
  if (!fragment) return ''

  const playableStart = getPlayableStart(fragment, startTime)

  state.selectedFragmentId = fragment.id
  waveform.play(playableStart, fragment.end)

  return state.isLooping
    ? `Looping fragment: ${fragment.name} from ${formatTime(playableStart)}`
    : `Playing fragment: ${fragment.name} from ${formatTime(playableStart)}`
}

export function stopPlayback(state, waveform) {
  const wasLooping = state.isLooping

  // Clear the selected fragment before seeking away.
  // Otherwise WaveSurfer can emit region-out while looping is still on,
  // which immediately restarts the selected fragment.
  state.selectedFragmentId = null

  waveform.pause()
  waveform.seekTo(0)

  return wasLooping
  ? 'Stopped. Looping is still on for the whole file.'
  : 'Stopped.'
}

export function toggleLoop(state) {
  if (!state.hasLoadedAudio) return ''

  state.isLooping = !state.isLooping

  const target = getCurrentLoopTarget(state)

  if (state.isLooping && target) {
    return target.isFragment
      ? `Loop enabled for fragment: ${target.label}`
      : 'Loop enabled for the whole file.'
  }

  return 'Loop disabled.'
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
      : 'Looping whole file.',
  }
}
