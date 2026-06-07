import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import RegionsPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js'

import { MIN_FRAGMENT_LENGTH, USER_FRAGMENT_COLOR } from './config.js'
import { clamp, formatRange, formatTime } from './utils.js'

export function createWaveform({ container, callbacks = {} }) {
  const wavesurfer = WaveSurfer.create({
    container,
    waveColor: '#7dd3fc',
    progressColor: '#38bdf8',
    cursorColor: '#f8fafc',
    cursorWidth: 2,
    height: 140,
    barWidth: 3,
    barGap: 2,
    barRadius: 3,
    normalize: true,
    interact: true,
  })

  const regions = wavesurfer.registerPlugin(RegionsPlugin.create())
  const regionById = new Map()
  const labelByRegionId = new Map()

  const containerEl = typeof container === 'string'
    ? document.querySelector(container)
    : container

  const regionTimeTooltip = document.createElement('div')
  regionTimeTooltip.className = 'region-time-tooltip'
  regionTimeTooltip.hidden = true
  regionTimeTooltip.setAttribute('aria-hidden', 'true')

  Object.assign(regionTimeTooltip.style, {
    position: 'fixed',
    zIndex: '9999',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    padding: '7px 10px',
    border: '1px solid rgba(148, 163, 184, 0.32)',
    borderRadius: '999px',
    background: 'rgba(15, 23, 42, 0.98)',
    color: '#e0f2fe',
    fontSize: '13px',
    fontWeight: '800',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.35)',
  })

  document.body.appendChild(regionTimeTooltip)

  let mode = 'editor'
  let disableDragSelection = null
  let isRenderingRegions = false
  let lastRegionEditAt = 0

  let activePointerEdit = null
  let latestPointerEvent = null
  let previewAnimationFrame = null
  let hideRegionTimeTooltipTimer = null

  let labelRenderFrame = null
  let labelRenderTimer = null
  let lastLabelFragments = []

  function getWaveformRectInfo() {
    if (!containerEl) {
      return null
    }

    const rect = containerEl.getBoundingClientRect()
    const styles = window.getComputedStyle(containerEl)

    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0

    const left = rect.left + paddingLeft
    const width = Math.max(1, rect.width - paddingLeft - paddingRight)

    return {
      rect,
      left,
      width,
      right: left + width,
    }
  }

  function isPointerInsideWaveform(event) {
    const rectInfo = getWaveformRectInfo()

    if (!rectInfo) return false

    const { rect } = rectInfo

    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
  }

  function getTimeFromPointer(event) {
    const duration = wavesurfer.getDuration() || 0
    const rectInfo = getWaveformRectInfo()

    if (!duration || !rectInfo) {
      return 0
    }

    const progress = clamp(
      (event.clientX - rectInfo.left) / rectInfo.width,
      0,
      1,
    )

    return progress * duration
  }

  function getClientXForTime(time) {
    const duration = wavesurfer.getDuration() || 0
    const rectInfo = getWaveformRectInfo()

    if (!duration || !rectInfo) {
      return window.innerWidth / 2
    }

    const progress = clamp(time / duration, 0, 1)

    return rectInfo.left + rectInfo.width * progress
  }

  function findRegionAtPointer(event) {
    const matchingRegions = Array.from(regionById.values()).filter((region) => {
      if (!region?.element) return false

      const rect = region.element.getBoundingClientRect()

      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    })

    if (!matchingRegions.length) {
      return null
    }

    return matchingRegions.sort((a, b) => {
      const aWidth = a.element.getBoundingClientRect().width
      const bWidth = b.element.getBoundingClientRect().width

      return aWidth - bWidth
    })[0]
  }

  function getPointerEditKind(region, event) {
    if (!region?.element) {
      return 'move'
    }

    const rect = region.element.getBoundingClientRect()
    const distanceFromStart = Math.abs(event.clientX - rect.left)
    const distanceFromEnd = Math.abs(event.clientX - rect.right)
    const edgeThreshold = 22

    if (distanceFromStart <= edgeThreshold && distanceFromStart <= distanceFromEnd) {
      return 'start'
    }

    if (distanceFromEnd <= edgeThreshold && distanceFromEnd < distanceFromStart) {
      return 'end'
    }

    return 'move'
  }

  function getPreviewBounds() {
    if (!activePointerEdit || !latestPointerEvent) {
      return null
    }

    const duration = wavesurfer.getDuration() || 0
    const pointerTime = getTimeFromPointer(latestPointerEvent)
    const originalLength = Math.max(
      MIN_FRAGMENT_LENGTH,
      activePointerEdit.end - activePointerEdit.start,
    )

    if (activePointerEdit.kind === 'start') {
      return {
        kind: 'start',
        start: clamp(pointerTime, 0, activePointerEdit.end - MIN_FRAGMENT_LENGTH),
        end: activePointerEdit.end,
      }
    }

    if (activePointerEdit.kind === 'end') {
      return {
        kind: 'end',
        start: activePointerEdit.start,
        end: clamp(pointerTime, activePointerEdit.start + MIN_FRAGMENT_LENGTH, duration),
      }
    }

    const delta = pointerTime - activePointerEdit.pointerStartTime
    const start = clamp(
      activePointerEdit.start + delta,
      0,
      Math.max(0, duration - originalLength),
    )

    return {
      kind: 'move',
      start,
      end: start + originalLength,
    }
  }

  function getTooltipText(bounds) {
    const length = Math.max(0, bounds.end - bounds.start)

    if (bounds.kind === 'start') {
      return `Start ${formatTime(bounds.start)} · End ${formatTime(bounds.end)}`
    }

    if (bounds.kind === 'end') {
      return `Start ${formatTime(bounds.start)} · End ${formatTime(bounds.end)}`
    }

    return `${formatTime(bounds.start)}-${formatTime(bounds.end)} · Len ${formatTime(length)}`
  }

  function showTooltip(bounds) {
    if (!bounds || !containerEl) return

    window.clearTimeout(hideRegionTimeTooltipTimer)

    let preferredClientX

    if (bounds.kind === 'start') {
      preferredClientX = getClientXForTime(bounds.start)
    } else if (bounds.kind === 'end') {
      preferredClientX = getClientXForTime(bounds.end)
    } else {
      preferredClientX = getClientXForTime((bounds.start + bounds.end) / 2)
    }

    const waveformRect = containerEl.getBoundingClientRect()

    const left = clamp(
      preferredClientX,
      110,
      Math.max(110, window.innerWidth - 110),
    )

    const top = clamp(
      waveformRect.top + 10,
      8,
      Math.max(8, window.innerHeight - 40),
    )

    regionTimeTooltip.textContent = getTooltipText(bounds)
    regionTimeTooltip.style.left = `${left}px`
    regionTimeTooltip.style.top = `${top}px`
    regionTimeTooltip.hidden = false
  }

  function hideTooltip(delay = 650) {
    window.clearTimeout(hideRegionTimeTooltipTimer)

    hideRegionTimeTooltipTimer = window.setTimeout(() => {
      regionTimeTooltip.hidden = true
    }, delay)
  }

  function applyRegionLabelStyles(label, laneIndex) {
    Object.assign(label.style, {
      position: 'absolute',
      left: '6px',
      right: '6px',
      top: `${6 + laneIndex * 22}px`,
      zIndex: '12',
      height: '18px',
      lineHeight: '18px',
      padding: '0 6px',
      borderRadius: '999px',
      background: 'rgba(15, 23, 42, 0.72)',
      color: '#e0f2fe',
      fontSize: '12px',
      fontWeight: '800',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
      userSelect: 'none',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
    })
  }

  function cancelScheduledLabelRender() {
    if (labelRenderFrame !== null) {
      window.cancelAnimationFrame(labelRenderFrame)
      labelRenderFrame = null
    }

    if (labelRenderTimer !== null) {
      window.clearTimeout(labelRenderTimer)
      labelRenderTimer = null
    }
  }

  function clearRegionLabels() {
    for (const label of labelByRegionId.values()) {
      label.remove()
    }

    labelByRegionId.clear()
  }

  function getRegionLabelLane(region, lanes) {
    if (!region?.element) {
      return null
    }

    const rect = region.element.getBoundingClientRect()
    const minReadableWidth = 34
    const laneGap = 8
    const maxLanes = 5

    if (rect.width < minReadableWidth) {
      return null
    }

    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      if (rect.left >= lanes[laneIndex] + laneGap) {
        lanes[laneIndex] = rect.right
        return laneIndex
      }
    }

    if (lanes.length < maxLanes) {
      lanes.push(rect.right)
      return lanes.length - 1
    }

    return null
  }

  function renderRegionLabelsNow() {
    clearRegionLabels()

    const lanes = []
    const sortedFragments = [...lastLabelFragments].sort((a, b) => a.start - b.start)

    for (const fragment of sortedFragments) {
      const region = regionById.get(fragment.id)

      if (!region?.element) {
        continue
      }

      const laneIndex = getRegionLabelLane(region, lanes)

      if (laneIndex === null) {
        continue
      }

      const label = document.createElement('div')

      label.className = 'waveform-region-label'
      label.textContent = fragment.name
      label.title = `${fragment.name} (${formatRange(fragment)})`

      applyRegionLabelStyles(label, laneIndex)

      region.element.appendChild(label)
      labelByRegionId.set(fragment.id, label)
    }
  }

  function renderFragmentLabels(fragments = lastLabelFragments, options = {}) {
    lastLabelFragments = Array.isArray(fragments) ? fragments : []

    cancelScheduledLabelRender()

    labelRenderFrame = window.requestAnimationFrame(() => {
      labelRenderFrame = null
      renderRegionLabelsNow()

      if (options.retry === false) {
        return
      }

      // WaveSurfer sometimes attaches/positions region elements one tick later.
      // A tiny retry makes labels reliable after creating or rerendering fragments.
      labelRenderTimer = window.setTimeout(() => {
        labelRenderTimer = null
        renderFragmentLabels(lastLabelFragments, { retry: false })
      }, 80)
    })
  }

  function updatePointerPreview() {
    previewAnimationFrame = null

    const bounds = getPreviewBounds()

    if (!bounds) return

    showTooltip(bounds)
  }

  function schedulePointerPreview(event) {
    latestPointerEvent = event

    if (previewAnimationFrame !== null) {
      return
    }

    previewAnimationFrame = window.requestAnimationFrame(updatePointerPreview)
  }

  function stopPointerEdit() {
    if (!activePointerEdit) return

    activePointerEdit = null
    latestPointerEvent = null

    if (previewAnimationFrame !== null) {
      window.cancelAnimationFrame(previewAnimationFrame)
      previewAnimationFrame = null
    }

    window.removeEventListener('pointermove', handlePointerMove, true)
    window.removeEventListener('mousemove', handlePointerMove, true)
    window.removeEventListener('pointerup', stopPointerEdit, true)
    window.removeEventListener('mouseup', stopPointerEdit, true)
    window.removeEventListener('pointercancel', stopPointerEdit, true)

    hideTooltip()
  }

  function handlePointerMove(event) {
    if (!activePointerEdit) return

    schedulePointerPreview(event)
  }

  function startPointerEdit(region, event) {
    if (mode !== 'editor') return

    if (typeof event.button === 'number' && event.button !== 0) {
      return
    }

    const kind = getPointerEditKind(region, event)

    activePointerEdit = {
      regionId: region.id,
      kind,
      start: region.start,
      end: region.end,
      pointerStartTime: getTimeFromPointer(event),
    }

    schedulePointerPreview(event)

    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('mousemove', handlePointerMove, true)
    window.addEventListener('pointerup', stopPointerEdit, true)
    window.addEventListener('mouseup', stopPointerEdit, true)
    window.addEventListener('pointercancel', stopPointerEdit, true)
  }

  function handleGlobalPointerDown(event) {
    if (activePointerEdit) return
    if (mode !== 'editor') return
    if (!isPointerInsideWaveform(event)) return

    const region = findRegionAtPointer(event)

    if (!region) return

    startPointerEdit(region, event)
  }

  window.addEventListener('pointerdown', handleGlobalPointerDown, true)
  window.addEventListener('mousedown', handleGlobalPointerDown, true)

  function resetDragSelection() {
    if (typeof disableDragSelection === 'function') {
      disableDragSelection()
    }

    disableDragSelection = null
  }

  function enableDragSelection() {
    resetDragSelection()

    if (mode !== 'editor') return

    disableDragSelection = regions.enableDragSelection({
      color: USER_FRAGMENT_COLOR,
      drag: true,
      resize: true,
      minLength: MIN_FRAGMENT_LENGTH,
    })
  }

  function setupRegion(region) {
    if (region.__dynamicAudioSetup) return

    region.__dynamicAudioSetup = true

    region.on('click', (event) => {
      event.stopPropagation()

      if (performance.now() - lastRegionEditAt < 150) {
        return
      }

      callbacks.onRegionClick?.({
        id: region.id,
        time: getRegionClickTime(region, event),
      })
    })

    region.on('remove', () => {
      labelByRegionId.get(region.id)?.remove()
      labelByRegionId.delete(region.id)
      regionById.delete(region.id)
    })
  }

  function getRegionClickTime(region, event) {
    const regionElement = region.element

    if (!regionElement || typeof regionElement.getBoundingClientRect !== 'function') {
      return region.start
    }

    const rect = regionElement.getBoundingClientRect()

    if (!rect.width) {
      return region.start
    }

    const clickX = event.clientX

    if (typeof clickX !== 'number') {
      return region.start
    }

    const clickProgress = clamp((clickX - rect.left) / rect.width, 0, 1)

    return region.start + (region.end - region.start) * clickProgress
  }

  function clearRegions() {
    stopPointerEdit()
    hideTooltip(0)
    cancelScheduledLabelRender()
    clearRegionLabels()

    for (const region of Array.from(regionById.values())) {
      region.remove()
    }

    regionById.clear()
  }

  function renderFragments(fragments) {
    isRenderingRegions = true
    clearRegions()

    for (const fragment of fragments) {
      const region = regions.addRegion({
        id: fragment.id,
        start: fragment.start,
        end: fragment.end,
        drag: mode === 'editor',
        resize: mode === 'editor',
        minLength: MIN_FRAGMENT_LENGTH,
        color: fragment.color,
      })

      regionById.set(fragment.id, region)
      setupRegion(region)
    }

    isRenderingRegions = false
    renderFragmentLabels(fragments)
    enableDragSelection()
  }

  regions.on('region-created', (region) => {
    setupRegion(region)

    if (isRenderingRegions) {
      return
    }

    if (mode !== 'editor') {
      region.remove()
      return
    }

    regionById.set(region.id, region)

    callbacks.onRegionCreated?.({
      id: region.id,
      start: region.start,
      end: region.end,
    })
  })

  regions.on('region-updated', (region) => {
    if (isRenderingRegions) return

    lastRegionEditAt = performance.now()

    showTooltip({
      kind: 'move',
      start: region.start,
      end: region.end,
    })

    hideTooltip()

    callbacks.onRegionUpdated?.({
      id: region.id,
      start: region.start,
      end: region.end,
    })
  })

  regions.on('region-out', (region) => {
    callbacks.onRegionOut?.({ id: region.id })
  })

  wavesurfer.on('decode', () => {
    callbacks.onDecode?.({ duration: wavesurfer.getDuration() })
  })

  wavesurfer.on('ready', () => {
    callbacks.onReady?.({ duration: wavesurfer.getDuration() })
  })

  wavesurfer.on('timeupdate', (currentTime) => {
    callbacks.onTimeUpdate?.({ currentTime })
  })

  wavesurfer.on('play', () => {
    callbacks.onPlay?.()
  })

  wavesurfer.on('pause', () => {
    callbacks.onPause?.()
  })

  wavesurfer.on('finish', () => {
    callbacks.onFinish?.()
  })

  wavesurfer.on('interaction', () => {
    callbacks.onInteraction?.()
  })

  return {
    async load(url) {
      await wavesurfer.load(url)
    },

    play(start, end) {
      wavesurfer.play(start, end)
    },

    async playPause() {
      await wavesurfer.playPause()
    },

    pause() {
      wavesurfer.pause()
    },

    seekTo(progress) {
      wavesurfer.seekTo(progress)
    },

    setVolume(volume) {
      const safeVolume = Math.min(Math.max(Number(volume) || 0, 0), 1)

      if (typeof wavesurfer.setVolume === 'function') {
        wavesurfer.setVolume(safeVolume)
      }
    },

    getCurrentTime() {
      return typeof wavesurfer.getCurrentTime === 'function'
        ? wavesurfer.getCurrentTime()
        : 0
    },

    getDuration() {
      return wavesurfer.getDuration() || 0
    },

    setMode(nextMode) {
      mode = nextMode
      stopPointerEdit()
      hideTooltip(0)
      enableDragSelection()
      renderFragmentLabels()
    },

    renderFragments,
    renderFragmentLabels,
    clearRegions,

    clearAudio() {
      wavesurfer.pause()
      clearRegions()

      try {
        if (typeof wavesurfer.empty === 'function') {
          wavesurfer.empty()
        } else {
          wavesurfer.seekTo(0)
        }
      } catch (error) {
        console.warn('Could not fully clear waveform audio.', error)
      }
    },

    setRegionColor(id, color) {
      const region = regionById.get(id)

      if (!region || !color) return

      if (typeof region.setOptions === 'function') {
        region.setOptions({ color })
      } else if (region.element) {
        region.element.style.backgroundColor = color
      }

      renderFragmentLabels()
    },
  }
}
