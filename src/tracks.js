import { createId, safeFilename, stripExtension } from './utils.js'

export function createTrackFromFile(file, existingTracks = []) {
  const id = createId('track')
  const name = createUniqueTrackName(existingTracks, stripExtension(file.name) || 'Track')

  return {
    id,
    name,
    audio: {
      file,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      lastModified: file.lastModified,
      duration: 0,
      objectUrl: URL.createObjectURL(file),
    },
    fragments: [],
    fragmentLinks: [],
    queue: [],
    queueMode: 'auto',
  }
}

export function createTrackFromImportedData(projectTrack, audioFile, existingTracks = []) {
  const id = projectTrack.id || createId('track')
  const fallbackName = stripExtension(audioFile.name) || 'Track'

  return {
    id,
    name: createUniqueTrackName(
      existingTracks,
      projectTrack.name || fallbackName,
      id,
    ),
    audio: {
      file: audioFile,
      fileName: audioFile.name,
      fileType: audioFile.type,
      fileSize: audioFile.size,
      lastModified: audioFile.lastModified,
      duration: Number(projectTrack.audio?.duration || 0),
      objectUrl: URL.createObjectURL(audioFile),
    },
    fragments: Array.isArray(projectTrack.fragments)
      ? projectTrack.fragments.map((fragment) => ({ ...fragment }))
      : [],
    fragmentLinks: Array.isArray(projectTrack.fragmentLinks)
      ? projectTrack.fragmentLinks.map((link) => ({ ...link }))
      : [],
    queue: Array.isArray(projectTrack.queue)
      ? projectTrack.queue.map((item) => ({ ...item }))
      : [],
    queueMode: projectTrack.queueMode === 'manual' ? 'manual' : 'auto',
  }
}

export function createUniqueTrackName(tracks, baseName, allowedTrackId = null) {
  const cleanBaseName = String(baseName || 'Track').trim() || 'Track'
  let candidate = cleanBaseName
  let suffix = 2

  while (tracks.some((track) => track.id !== allowedTrackId && track.name === candidate)) {
    candidate = `${cleanBaseName} ${suffix}`
    suffix += 1
  }

  return candidate
}

export function getTrackById(tracks, id) {
  return tracks.find((track) => track.id === id) || null
}

export function getActiveTrack(state) {
  return getTrackById(state.tracks, state.activeTrackId)
}

export function getTrackDisplayName(track) {
  return track?.name || track?.audio?.fileName || 'Untitled track'
}

export function renameTrack(track, name, tracks) {
  if (!track) return null

  const trimmedName = String(name || '').trim()

  if (!trimmedName) return null

  track.name = createUniqueTrackName(tracks, trimmedName, track.id)

  return track
}

export function getSortedFragmentsForQueue(track) {
  return [...(track?.fragments || [])].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return a.end - b.end
  })
}

export function regenerateTrackQueue(track) {
  if (!track) return []

  track.queue = getSortedFragmentsForQueue(track).map((fragment) => ({
    fragmentId: fragment.id,
  }))

  return track.queue
}


export function moveTrackQueueItem(track, fragmentId, direction) {
  if (!track || !Array.isArray(track.queue)) return false

  const index = track.queue.findIndex((item) => item.fragmentId === fragmentId)

  if (index === -1) return false

  const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
  const nextIndex = index + offset

  if (nextIndex < 0 || nextIndex >= track.queue.length || offset === 0) {
    return false
  }

  const [item] = track.queue.splice(index, 1)
  track.queue.splice(nextIndex, 0, item)
  track.queueMode = 'manual'

  return true
}


export function moveTrackQueueItemToPosition(track, sourceFragmentId, targetFragmentId, placement = 'before') {
  if (!track || !Array.isArray(track.queue)) return false

  if (!sourceFragmentId || !targetFragmentId || sourceFragmentId === targetFragmentId) {
    return false
  }

  const sourceIndex = track.queue.findIndex((item) => item.fragmentId === sourceFragmentId)
  const targetIndex = track.queue.findIndex((item) => item.fragmentId === targetFragmentId)

  if (sourceIndex === -1 || targetIndex === -1) {
    return false
  }

  const [item] = track.queue.splice(sourceIndex, 1)
  let insertIndex = track.queue.findIndex((queueItem) => queueItem.fragmentId === targetFragmentId)

  if (insertIndex === -1) {
    track.queue.splice(sourceIndex, 0, item)
    return false
  }

  if (placement === 'after') {
    insertIndex += 1
  }

  track.queue.splice(insertIndex, 0, item)
  track.queueMode = 'manual'

  return true
}



export function removeTrackQueueItem(track, fragmentId) {
  if (!track || !Array.isArray(track.queue)) return false

  const before = track.queue.length
  track.queue = track.queue.filter((item) => item.fragmentId !== fragmentId)

  if (track.queue.length === before) {
    return false
  }

  track.queueMode = 'manual'
  return true
}

export function addTrackQueueItem(track, fragmentId, placement = 'end') {
  if (!track || !fragmentId) return false

  const fragmentExists = (track.fragments || []).some((fragment) => fragment.id === fragmentId)

  if (!fragmentExists) return false

  if (!Array.isArray(track.queue)) {
    track.queue = []
  }

  if (track.queue.some((item) => item.fragmentId === fragmentId)) {
    return false
  }

  const item = { fragmentId }

  if (placement === 'start') {
    track.queue.unshift(item)
  } else {
    track.queue.push(item)
  }

  track.queueMode = 'manual'
  return true
}

export function getAvailableQueueFragments(track) {
  if (!track) return []

  const queuedIds = new Set((track.queue || []).map((item) => item.fragmentId))

  return getSortedFragmentsForQueue(track).filter((fragment) => !queuedIds.has(fragment.id))
}

export function resetTrackQueueOrder(track) {
  if (!track) return []

  track.queueMode = 'auto'
  return regenerateTrackQueue(track)
}

export function normalizeTrackQueue(track) {
  if (!track) return []

  if (track.queueMode !== 'manual') {
    track.queueMode = 'auto'
    return regenerateTrackQueue(track)
  }

  const fragmentIds = new Set(track.fragments.map((fragment) => fragment.id))
  const usedIds = new Set()
  const normalizedQueue = []

  for (const item of track.queue || []) {
    const fragmentId = String(item?.fragmentId || '')

    if (!fragmentIds.has(fragmentId) || usedIds.has(fragmentId)) {
      continue
    }

    normalizedQueue.push({ fragmentId })
    usedIds.add(fragmentId)
  }

  // In manual mode, do not automatically add missing fragments back.
  // Removed items should stay out of the queue until the user adds them again.
  track.queue = normalizedQueue

  return track.queue
}

export function getAudioPathForTrack(track) {
  return `audio/${safeFilename(track.id, 'track')}/${safeFilename(track.audio.fileName, 'audio-file')}`
}


export function getFragmentLink(track, fromFragmentId) {
  if (!track || !fromFragmentId) return null

  return (track.fragmentLinks || []).find((link) => link.fromFragmentId === fromFragmentId) || null
}

export function getLinkedTargetFragment(track, fromFragmentId) {
  const link = getFragmentLink(track, fromFragmentId)

  if (!link) return null

  return (track.fragments || []).find((fragment) => fragment.id === link.toFragmentId) || null
}

export function setFragmentLink(track, fromFragmentId, toFragmentId, options = {}) {
  if (!track || !fromFragmentId || !toFragmentId || fromFragmentId === toFragmentId) {
    return null
  }

  const fragmentIds = new Set((track.fragments || []).map((fragment) => fragment.id))

  if (!fragmentIds.has(fromFragmentId) || !fragmentIds.has(toFragmentId)) {
    return null
  }

  if (!Array.isArray(track.fragmentLinks)) {
    track.fragmentLinks = []
  }

  track.fragmentLinks = track.fragmentLinks.filter((link) => link.fromFragmentId !== fromFragmentId)

  const link = {
    id: options.id || createId('fragment_link'),
    fromFragmentId,
    toFragmentId,
    mode: 'relative',
    crossfadeMs: Number.isFinite(Number(options.crossfadeMs))
      ? Number(options.crossfadeMs)
      : 250,
  }

  track.fragmentLinks.push(link)
  return link
}

export function removeFragmentLink(track, fromFragmentId) {
  if (!track || !Array.isArray(track.fragmentLinks)) return false

  const before = track.fragmentLinks.length
  track.fragmentLinks = track.fragmentLinks.filter((link) => link.fromFragmentId !== fromFragmentId)

  return track.fragmentLinks.length !== before
}

export function normalizeFragmentLinks(track) {
  if (!track) return []

  const fragmentIds = new Set((track.fragments || []).map((fragment) => fragment.id))
  const usedFromIds = new Set()
  const normalizedLinks = []

  for (const link of track.fragmentLinks || []) {
    const fromFragmentId = String(link?.fromFragmentId || '')
    const toFragmentId = String(link?.toFragmentId || '')

    if (
      !fragmentIds.has(fromFragmentId) ||
      !fragmentIds.has(toFragmentId) ||
      fromFragmentId === toFragmentId ||
      usedFromIds.has(fromFragmentId)
    ) {
      continue
    }

    normalizedLinks.push({
      id: String(link.id || createId('fragment_link')),
      fromFragmentId,
      toFragmentId,
      mode: 'relative',
      crossfadeMs: Number.isFinite(Number(link.crossfadeMs))
        ? Number(link.crossfadeMs)
        : 250,
    })

    usedFromIds.add(fromFragmentId)
  }

  track.fragmentLinks = normalizedLinks
  return track.fragmentLinks
}
