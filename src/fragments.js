import { DEFAULT_FRAGMENT_LENGTH, FRAGMENT_COLORS, MIN_FRAGMENT_LENGTH } from './config.js'
import { clamp, createId } from './utils.js'

let fragmentCounter = 1
let fragmentColorIndex = 0

export function resetFragmentCounters() {
  fragmentCounter = 1
  fragmentColorIndex = 0
}

export function getSortedFragments(fragments) {
  return [...fragments].sort((a, b) => a.start - b.start)
}

export function getFragmentById(fragments, id) {
  return fragments.find((fragment) => fragment.id === id) || null
}

export function labelExists(fragments, name) {
  return fragments.some((fragment) => fragment.name === name)
}

export function createFragmentName(fragments, baseName = 'Fragment') {
  let name = `${baseName} ${fragmentCounter}`

  while (labelExists(fragments, name)) {
    fragmentCounter += 1
    name = `${baseName} ${fragmentCounter}`
  }

  fragmentCounter += 1
  return name
}

export function getNextFragmentColor(fragments) {
  const usedColors = new Set(fragments.map((fragment) => fragment.color))

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

export function createFragment({ fragments, id, name, start, end, color }) {
  return {
    id: id || createId('fragment'),
    name: name || createFragmentName(fragments),
    start,
    end,
    color: color || getNextFragmentColor(fragments),
  }
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
    color: getNextFragmentColor(fragments),
  })
}

export function createDemoFragments(duration) {
  resetFragmentCounters()

  if (!duration || duration < 3) {
    return []
  }

  const fragments = []
  const third = duration / 3

  fragments.push(
    createFragment({
      fragments,
      name: 'Intro',
      start: 0,
      end: Math.max(1, third),
      color: getNextFragmentColor(fragments),
    }),
  )

  fragments.push(
    createFragment({
      fragments,
      name: 'Middle',
      start: third,
      end: Math.min(duration, third * 2),
      color: getNextFragmentColor(fragments),
    }),
  )

  fragments.push(
    createFragment({
      fragments,
      name: 'End',
      start: Math.max(0, third * 2),
      end: duration,
      color: getNextFragmentColor(fragments),
    }),
  )

  return fragments
}

export function createFragmentFromDrag(fragments, start, end, id) {
  return createFragment({
    fragments,
    id,
    start,
    end,
    color: getNextFragmentColor(fragments),
  })
}

export function updateFragment(fragments, id, patch) {
  const fragment = getFragmentById(fragments, id)

  if (!fragment) return null

  Object.assign(fragment, patch)
  return fragment
}

export function deleteFragment(fragments, id) {
  const index = fragments.findIndex((fragment) => fragment.id === id)

  if (index === -1) return null

  const [deletedFragment] = fragments.splice(index, 1)
  return deletedFragment
}

export function clampFragmentsToDuration(fragments, duration) {
  if (!duration) return fragments

  return fragments
    .map((fragment) => {
      const start = clamp(fragment.start, 0, Math.max(0, duration - MIN_FRAGMENT_LENGTH))
      const end = clamp(fragment.end, start + MIN_FRAGMENT_LENGTH, duration)

      return {
        ...fragment,
        start,
        end,
      }
    })
    .filter((fragment) => fragment.end - fragment.start >= MIN_FRAGMENT_LENGTH)
}
