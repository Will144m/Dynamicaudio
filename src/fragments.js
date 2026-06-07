import {
  DEFAULT_FRAGMENT_LENGTH,
  FRAGMENT_COLORS,
  MIN_FRAGMENT_LENGTH,
} from './config.js'
import { clamp, createId } from './utils.js'

const DEFAULT_PLAYBACK_MODE = 'loop'
const PLAYBACK_MODES = new Set(['loop', 'transition'])

let fragmentCounter = 1
let fragmentColorIndex = 0

export function resetFragmentCounters() {
  fragmentCounter = 1
  fragmentColorIndex = 0
}

export function normalizePlaybackMode(playbackMode) {
  return PLAYBACK_MODES.has(playbackMode)
    ? playbackMode
    : DEFAULT_PLAYBACK_MODE
}

function labelExists(fragments, label) {
  return fragments.some((fragment) => fragment.name === label)
}

function createFragmentName(fragments) {
  let name = `Fragment ${fragmentCounter}`

  while (labelExists(fragments, name)) {
    fragmentCounter += 1
    name = `Fragment ${fragmentCounter}`
  }

  fragmentCounter += 1
  return name
}

function getUsedFragmentColors(fragments) {
  return new Set(fragments.map((fragment) => fragment.color).filter(Boolean))
}

function getNextFragmentColor(fragments) {
  const usedColors = getUsedFragmentColors(fragments)

  for (let offset = 0; offset < FRAGMENT_COLORS.length; offset += 1) {
    const colorIndex = (fragmentColorIndex + offset) % FRAGMENT_COLORS.length
    const candidateColor = FRAGMENT_COLORS[colorIndex]

    if (!usedColors.has(candidateColor)) {
      fragmentColorIndex = (colorIndex + 1) % FRAGMENT_COLORS.length
      return candidateColor
    }
  }

  const fallbackColor = FRAGMENT_COLORS[fragmentColorIndex % FRAGMENT_COLORS.length]
  fragmentColorIndex = (fragmentColorIndex + 1) % FRAGMENT_COLORS.length

  return fallbackColor
}

export function getFragmentById(fragments, id) {
  return fragments.find((fragment) => fragment.id === id) || null
}

export function getSortedFragments(fragments) {
  return [...fragments].sort((a, b) => a.start - b.start)
}

export function createFragment({
  fragments,
  id = createId('fragment'),
  name = createFragmentName(fragments),
  start,
  end,
  color = getNextFragmentColor(fragments),
  playbackMode = DEFAULT_PLAYBACK_MODE,
}) {
  return {
    id,
    name,
    start,
    end,
    color,
    playbackMode: normalizePlaybackMode(playbackMode),
  }
}

export function createFragmentFromDrag(fragments, start, end, id = createId('fragment')) {
  return createFragment({
    fragments,
    id,
    start,
    end,
  })
}

export function createFragmentAtPlayhead(fragments, playhead, duration) {
  if (!duration) return null

  const defaultLength = Math.min(
    DEFAULT_FRAGMENT_LENGTH,
    Math.max(MIN_FRAGMENT_LENGTH, duration / 5),
  )

  let start = clamp(playhead, 0, Math.max(0, duration - MIN_FRAGMENT_LENGTH))
  let end = clamp(start + defaultLength, MIN_FRAGMENT_LENGTH, duration)

  if (end - start < MIN_FRAGMENT_LENGTH) {
    start = Math.max(0, end - MIN_FRAGMENT_LENGTH)
  }

  return createFragment({
    fragments,
    start,
    end,
  })
}

export function updateFragment(fragments, id, patch) {
  const fragment = getFragmentById(fragments, id)

  if (!fragment) return null

  Object.assign(fragment, patch)

  if (patch.playbackMode !== undefined) {
    fragment.playbackMode = normalizePlaybackMode(patch.playbackMode)
  }

  return fragment
}

export function deleteFragment(fragments, id) {
  const index = fragments.findIndex((fragment) => fragment.id === id)

  if (index === -1) return null

  const [deletedFragment] = fragments.splice(index, 1)

  return deletedFragment
}

export function clampFragmentsToDuration(fragments, duration) {
  return fragments
    .map((fragment, index) => {
      const rawStart = Number(fragment.start)
      const rawEnd = Number(fragment.end)

      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
        return null
      }

      const start = clamp(rawStart, 0, Math.max(0, duration - MIN_FRAGMENT_LENGTH))
      const end = clamp(rawEnd, start + MIN_FRAGMENT_LENGTH, duration)

      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null
      }

      return {
        id: String(fragment.id || createId('fragment')),
        name: String(fragment.name || `Fragment ${index + 1}`),
        start,
        end,
        color: String(fragment.color || FRAGMENT_COLORS[index % FRAGMENT_COLORS.length]),
        playbackMode: normalizePlaybackMode(fragment.playbackMode),
      }
    })
    .filter(Boolean)
}
