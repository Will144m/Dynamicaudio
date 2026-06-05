import { FRAGMENT_COLORS } from './config.js'
import { normalizePlaybackMode } from './fragments.js'
import { downloadBlob } from './utils.js'

const PROJECT_VERSION = 3
const PROJECT_JSON_PATH = 'project.json'
const AUDIO_FOLDER = 'audio'

function getJSZip() {
  if (!globalThis.JSZip) {
    throw new Error('JSZip is not loaded. Check the script tag in index.html.')
  }

  return globalThis.JSZip
}

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, '')
}

function getExtension(filename) {
  const match = filename.match(/\.[^/.]+$/)
  return match ? match[0] : ''
}

function safeFilename(filename, fallback = 'audio-file') {
  const cleaned = String(filename || fallback)
  .trim()
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')

  return cleaned || fallback
}

function getBundleFilename(audioFileName) {
  const baseName = audioFileName
  ? stripExtension(safeFilename(audioFileName))
  : 'dynamic-audio-project'

  return `${baseName}.dynamic-audio.zip`
}

function getAudioPath(audioFileName) {
  return `${AUDIO_FOLDER}/${safeFilename(audioFileName, 'audio-file')}`
}

export function buildProjectDocument(state, { audioPath }) {
  return {
    version: PROJECT_VERSION,
    createdAt: new Date().toISOString(),

    audio: {
      path: audioPath,
      name: state.audio.fileName,
      type: state.audio.fileType,
      size: state.audio.fileSize,
      lastModified: state.audio.lastModified,
      duration: state.audio.duration,
    },

    fragments: state.fragments.map((fragment) => ({
      id: fragment.id,
      name: fragment.name,
      start: fragment.start,
      end: fragment.end,
      color: fragment.color,
      playbackMode: normalizePlaybackMode(fragment.playbackMode),
    })),
  }
}

export async function downloadProjectBundle(state) {
  if (!state.audio.file) {
    throw new Error('No original audio file is available for this project.')
  }

  const JSZip = getJSZip()
  const zip = new JSZip()

  const audioPath = getAudioPath(state.audio.fileName)
  const project = buildProjectDocument(state, { audioPath })

  zip.file(PROJECT_JSON_PATH, JSON.stringify(project, null, 2))
  zip.file(audioPath, state.audio.file)

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  })

  downloadBlob(getBundleFilename(state.audio.fileName), blob)
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
  const project = validateProjectDocument(JSON.parse(projectText))

  const audioEntry = findAudioEntry(zip, project)

  if (!audioEntry) {
    throw new Error('Project bundle does not contain the associated audio file.')
  }

  const audioBlob = await audioEntry.async('blob')
  const audioName = project.audio.name || audioEntry.name.split('/').pop() || 'audio-file'
  const audioType = project.audio.type || audioBlob.type || guessAudioType(audioName)

  const audioFile = new File([audioBlob], audioName, {
    type: audioType,
    lastModified: project.audio.lastModified || Date.now(),
  })

  return {
    project,
    audioFile,
  }
}

function findAudioEntry(zip, project) {
  if (project.audio.path) {
    const exactEntry = zip.file(project.audio.path)

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

  if (!Array.isArray(project.fragments)) {
    throw new Error('Project file does not contain a fragments array.')
  }

  return {
    version: Number(project.version || 1),
    createdAt: String(project.createdAt || ''),
    audio: {
      path: String(project.audio?.path || ''),
      name: String(project.audio?.name || ''),
      type: String(project.audio?.type || ''),
      size: Number(project.audio?.size || 0),
      lastModified: Number(project.audio?.lastModified || 0),
      duration: Number(project.audio?.duration || 0),
    },
    fragments: project.fragments
    .map((fragment, index) => normalizeImportedFragment(fragment, index))
    .filter(Boolean),
  }
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
