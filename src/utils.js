export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const totalCentiseconds = Math.round(safeSeconds * 100)

  const mins = Math.floor(totalCentiseconds / 6000)
  const secs = Math.floor((totalCentiseconds % 6000) / 100)
  const centiseconds = totalCentiseconds % 100

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

export function parseTimeInput(value) {
  const text = String(value || '').trim().replace(',', '.')

  if (!text) {
    return Number.NaN
  }

  const parts = text.split(':').map((part) => part.trim())

  if (parts.some((part) => part === '')) {
    return Number.NaN
  }

  if (parts.length === 1) {
    const seconds = Number(parts[0])
    return Number.isFinite(seconds) ? seconds : Number.NaN
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0])
    const seconds = Number(parts[1])

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return Number.NaN
    }

    return minutes * 60 + seconds
  }

  if (parts.length === 3) {
    const hours = Number(parts[0])
    const minutes = Number(parts[1])
    const seconds = Number(parts[2])

    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds)
    ) {
      return Number.NaN
    }

    return hours * 3600 + minutes * 60 + seconds
  }

  return Number.NaN
}

export function formatRange(fragment) {
  return `${formatTime(fragment.start)}-${formatTime(fragment.end)}`
}

export function createId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })

  downloadBlob(filename, blob)
}
