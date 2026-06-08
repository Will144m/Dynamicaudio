import JSZip from 'jszip'

import { FRAGMENT_COLORS } from './config.js'
import { normalizePlaybackMode } from './fragments.js'
import { getAudioPathForTrack } from './tracks.js'
import { createId, downloadBlob, getExtension, safeFilename, stripExtension } from './utils.js'

const PROJECT_VERSION = 4
const PROJECT_JSON_PATH = 'project.json'
const AUDIO_FOLDER = 'audio'

function getJSZip() {
  return JSZip
}

function isNativeCapacitor() {
  const capacitor = globalThis.Capacitor

  if (!capacitor) return false

  if (typeof capacitor.isNativePlatform === 'function') {
    return capacitor.isNativePlatform()
  }

  if (typeof capacitor.getPlatform === 'function') {
    return ['android', 'ios'].includes(capacitor.getPlatform())
  }

  return false
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = String(reader.result || '')
      const [, base64 = ''] = result.split(',')
      resolve(base64)
    }

    reader.onerror = () => {
      reject(reader.error || new Error('Could not read export blob.'))
    }

    reader.readAsDataURL(blob)
  })
}

async function writeBundleToNativeDocuments(filename, blob) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const base64Data = await blobToBase64(blob)

  const result = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Documents,
    recursive: true,
  })

  return result
}

async function saveBundleNatively(filename, blob) {
  const [result, shareModule] = await Promise.all([
    writeBundleToNativeDocuments(filename, blob),
    import('@capacitor/share').catch(() => null),
  ])

  const Share = shareModule?.Share

  if (Share?.share) {
    await Share.share({
      title: 'Export Dynamicaudio project',
      text: 'Dynamicaudio project bundle',
      url: result.uri,
      dialogTitle: 'Share project bundle',
    })
  }

  return {
    filename,
    native: true,
    local: false,
    uri: result.uri,
    shared: Boolean(Share?.share),
  }
}

async function saveBundleLocallyNatively(filename, blob) {
  const result = await writeBundleToNativeDocuments(filename, blob)

  return {
    filename,
    native: true,
    local: true,
    uri: result.uri,
    shared: false,
  }
}

function getBundleFilename(state) {
  const firstTrackName = state.tracks[0]?.name || state.tracks[0]?.audio?.fileName
  const baseName = firstTrackName
    ? stripExtension(safeFilename(firstTrackName))
    : 'dynamic-audio-project'

  return `${baseName}.dynamic-audio.zip`
}

export function buildProjectDocument(state, audioPathByTrackId) {
  return {
    version: PROJECT_VERSION,
    createdAt: new Date().toISOString(),
    activeTrackId: state.activeTrackId,
    editorSettings: {
      snapEnabled: Boolean(state.editorSettings?.snapEnabled),
    },
    playerSettings: {
      volume: Number.isFinite(Number(state.playerSettings?.volume))
        ? Number(state.playerSettings.volume)
        : 1,
      linkedFragmentCrossfadeMs: Number.isFinite(Number(state.playerSettings?.linkedFragmentCrossfadeMs))
        ? Number(state.playerSettings.linkedFragmentCrossfadeMs)
        : 250,
      linkedFragmentOffsetMs: Number.isFinite(Number(state.playerSettings?.linkedFragmentOffsetMs))
        ? Number(state.playerSettings.linkedFragmentOffsetMs)
        : 0,
    },

    tracks: state.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      audio: {
        path: audioPathByTrackId.get(track.id),
        name: track.audio.fileName,
        type: track.audio.fileType,
        size: track.audio.fileSize,
        lastModified: track.audio.lastModified,
        duration: track.audio.duration,
      },
      fragments: track.fragments.map((fragment) => ({
        id: fragment.id,
        name: fragment.name,
        start: fragment.start,
        end: fragment.end,
        color: fragment.color,
        playbackMode: normalizePlaybackMode(fragment.playbackMode),
      })),
      fragmentLinks: (track.fragmentLinks || []).map((link) => ({
        id: link.id,
        fromFragmentId: link.fromFragmentId,
        toFragmentId: link.toFragmentId,
        mode: link.mode || 'relative',
        crossfadeMs: Number.isFinite(Number(link.crossfadeMs))
          ? Number(link.crossfadeMs)
          : 250,
      })),
      queue: (track.queue || []).map((item) => ({
        fragmentId: item.fragmentId,
      })),
      queueMode: track.queueMode === 'manual' ? 'manual' : 'auto',
    })),

  }
}

async function createProjectBundleBlob(state) {
  if (!state.tracks.length) {
    throw new Error('No tracks are available for this project.')
  }

  const missingAudioTrack = state.tracks.find((track) => !track.audio?.file)

  if (missingAudioTrack) {
    throw new Error(`Track ${missingAudioTrack.name || missingAudioTrack.id} has no audio file.`)
  }

  const JSZip = getJSZip()
  const zip = new JSZip()
  const audioPathByTrackId = new Map()

  for (const track of state.tracks) {
    const audioPath = getAudioPathForTrack(track)
    audioPathByTrackId.set(track.id, audioPath)
    zip.file(audioPath, track.audio.file)
  }

  const project = buildProjectDocument(state, audioPathByTrackId)

  zip.file(PROJECT_JSON_PATH, JSON.stringify(project, null, 2))

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  })
}

export async function downloadProjectBundle(state) {
  const blob = await createProjectBundleBlob(state)
  const filename = getBundleFilename(state)

  if (isNativeCapacitor()) {
    return saveBundleNatively(filename, blob)
  }

  downloadBlob(filename, blob)

  return {
    filename,
    native: false,
    local: false,
  }
}

export async function exportProjectBundleLocally(state) {
  const blob = await createProjectBundleBlob(state)
  const filename = getBundleFilename(state)

  if (isNativeCapacitor()) {
    return saveBundleLocallyNatively(filename, blob)
  }

  downloadBlob(filename, blob)

  return {
    filename,
    native: false,
    local: true,
  }
}

export async function readProjectBundle(file) {
  if (!file) {
    throw new Error('No project bundle selected.')
  }

  const JSZip = getJSZip()
  const zip = await JSZip.loadAsync(file)

  const projectEntry = zip.file(PROJECT_JSON_PATH)

  if (!projectEntry) {
    throw new Error('Project bundle does not contain project.json.')
  }

  const projectText = await projectEntry.async('text')
  const rawProject = JSON.parse(projectText)
  const project = validateProjectDocument(rawProject)
  const audioFilesByTrackId = new Map()

  for (const track of project.tracks) {
    const audioEntry = findAudioEntry(zip, track)

    if (!audioEntry) {
      throw new Error(`Project bundle does not contain audio for track ${track.name}.`)
    }

    const audioBlob = await audioEntry.async('blob')
    const audioName = track.audio.name || audioEntry.name.split('/').pop() || 'audio-file'
    const audioType = track.audio.type || audioBlob.type || guessAudioType(audioName)

    const audioFile = new File([audioBlob], audioName, {
      type: audioType,
      lastModified: track.audio.lastModified || Date.now(),
    })

    audioFilesByTrackId.set(track.id, audioFile)
  }

  return {
    project,
    audioFilesByTrackId,
  }
}

function findAudioEntry(zip, track) {
  if (track.audio.path) {
    const exactEntry = zip.file(track.audio.path)

    if (exactEntry) {
      return exactEntry
    }
  }

  const audioEntries = Object.values(zip.files).filter((entry) => {
    if (entry.dir) return false

    const name = entry.name.toLowerCase()

    return (
      name.startsWith(`${AUDIO_FOLDER}/`) ||
      name.endsWith('.mp3') ||
      name.endsWith('.wav') ||
      name.endsWith('.ogg') ||
      name.endsWith('.m4a') ||
      name.endsWith('.flac') ||
      name.endsWith('.aac')
    )
  })

  if (track.audio.name) {
    const matchingName = audioEntries.find((entry) => {
      return entry.name.split('/').pop() === track.audio.name
    })

    if (matchingName) {
      return matchingName
    }
  }

  return audioEntries[0] || null
}

function guessAudioType(filename) {
  const extension = getExtension(filename).toLowerCase()

  if (extension === '.mp3') return 'audio/mpeg'
  if (extension === '.wav') return 'audio/wav'
  if (extension === '.ogg') return 'audio/ogg'
  if (extension === '.m4a') return 'audio/mp4'
  if (extension === '.flac') return 'audio/flac'
  if (extension === '.aac') return 'audio/aac'

  return 'audio/*'
}

function validateProjectDocument(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('Project file is not a valid JSON object.')
  }

  if (Array.isArray(project.tracks)) {
    return validateV4Project(project)
  }

  if (project.audio && Array.isArray(project.fragments)) {
    return migrateSingleTrackProject(project)
  }

  throw new Error('Project file does not contain tracks.')
}

function validateV4Project(project) {
  const tracks = project.tracks
    .map((track, index) => normalizeImportedTrack(track, index))
    .filter(Boolean)

  if (!tracks.length) {
    throw new Error('Project file does not contain any valid tracks.')
  }

  const trackIds = new Set(tracks.map((track) => track.id))

  return {
    version: Number(project.version || PROJECT_VERSION),
    createdAt: String(project.createdAt || ''),
    activeTrackId: trackIds.has(project.activeTrackId)
      ? project.activeTrackId
      : tracks[0].id,
    tracks,
    editorSettings: normalizeImportedEditorSettings(project.editorSettings),
    playerSettings: normalizeImportedPlayerSettings(project.playerSettings),
  }
}

function migrateSingleTrackProject(project) {
  const trackId = createId('track')
  const audioName = String(project.audio?.name || 'Imported track')

  return {
    version: PROJECT_VERSION,
    createdAt: String(project.createdAt || ''),
    activeTrackId: trackId,
    tracks: [
      {
        id: trackId,
        name: stripExtension(audioName) || 'Imported track',
        audio: {
          path: String(project.audio?.path || ''),
          name: audioName,
          type: String(project.audio?.type || ''),
          size: Number(project.audio?.size || 0),
          lastModified: Number(project.audio?.lastModified || 0),
          duration: Number(project.audio?.duration || 0),
        },
        fragments: project.fragments
          .map((fragment, index) => normalizeImportedFragment(fragment, index))
          .filter(Boolean),
        fragmentLinks: [],
        queue: project.fragments
          .filter((fragment) => fragment?.id)
          .map((fragment) => ({ fragmentId: String(fragment.id) })),
        queueMode: 'auto',
      },
    ],
    editorSettings: normalizeImportedEditorSettings(project.editorSettings),
    playerSettings: normalizeImportedPlayerSettings(project.playerSettings),
  }
}

function normalizeImportedEditorSettings(settings = {}) {
  return {
    snapEnabled: Boolean(settings?.snapEnabled),
  }
}

function normalizeImportedPlayerSettings(settings = {}) {
  const volume = Number(settings?.volume)
  const linkedFragmentCrossfadeMs = Number(settings?.linkedFragmentCrossfadeMs)
  const linkedFragmentOffsetMs = Number(settings?.linkedFragmentOffsetMs)

  return {
    volume: Number.isFinite(volume)
      ? Math.min(Math.max(volume, 0), 1)
      : 1,
    linkedFragmentCrossfadeMs: Number.isFinite(linkedFragmentCrossfadeMs)
      ? Math.min(Math.max(linkedFragmentCrossfadeMs, 0), 2000)
      : 250,
    linkedFragmentOffsetMs: Number.isFinite(linkedFragmentOffsetMs)
      ? Math.min(Math.max(linkedFragmentOffsetMs, -1000), 1000)
      : 0,
  }
}

function normalizeImportedTrack(track, index) {
  if (!track || typeof track !== 'object') return null

  const id = String(track.id || `track_${index + 1}`)
  const audioName = String(track.audio?.name || `track_${index + 1}`)
  const fragments = Array.isArray(track.fragments)
    ? track.fragments
      .map((fragment, fragmentIndex) => normalizeImportedFragment(fragment, fragmentIndex))
      .filter(Boolean)
    : []

  const fragmentIds = new Set(fragments.map((fragment) => fragment.id))
  const queueMode = track.queueMode === 'manual' ? 'manual' : 'auto'
  let queue

  if (queueMode === 'manual' && Array.isArray(track.queue)) {
    const usedIds = new Set()

    queue = track.queue
      .map((item) => ({ fragmentId: String(item?.fragmentId || '') }))
      .filter((item) => {
        if (!fragmentIds.has(item.fragmentId) || usedIds.has(item.fragmentId)) {
          return false
        }

        usedIds.add(item.fragmentId)
        return true
      })
  } else {
    queue = [...fragments]
      .sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start
        return a.end - b.end
      })
      .map((fragment) => ({ fragmentId: fragment.id }))
  }

  const fragmentLinks = normalizeImportedFragmentLinks(track.fragmentLinks, fragmentIds)

  return {
    id,
    name: String(track.name || stripExtension(audioName) || `Track ${index + 1}`),
    audio: {
      path: String(track.audio?.path || ''),
      name: audioName,
      type: String(track.audio?.type || ''),
      size: Number(track.audio?.size || 0),
      lastModified: Number(track.audio?.lastModified || 0),
      duration: Number(track.audio?.duration || 0),
    },
    fragments,
    fragmentLinks,
    queue,
    queueMode,
  }
}

function normalizeImportedFragmentLinks(fragmentLinks, fragmentIds) {
  if (!Array.isArray(fragmentLinks)) return []

  const usedFromIds = new Set()
  const normalizedLinks = []

  for (const link of fragmentLinks) {
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

  return normalizedLinks
}

function normalizeImportedFragment(fragment, index) {
  if (!fragment || typeof fragment !== 'object') return null

  const start = Number(fragment.start)
  const end = Number(fragment.end)

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null
  }

  return {
    id: String(fragment.id || `imported_fragment_${index + 1}`),
    name: String(fragment.name || `Fragment ${index + 1}`),
    start,
    end,
    color: String(fragment.color || FRAGMENT_COLORS[index % FRAGMENT_COLORS.length]),
    playbackMode: normalizePlaybackMode(fragment.playbackMode),
  }
}
