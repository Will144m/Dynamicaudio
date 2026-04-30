import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import RegionsPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js'

const fileInput = document.getElementById('audioFile')
const playPauseBtn = document.getElementById('playPauseBtn')
const stopBtn = document.getElementById('stopBtn')
const loopToggleBtn = document.getElementById('loopToggleBtn')
const addFragmentBtn = document.getElementById('addFragmentBtn')
const deleteFragmentBtn = document.getElementById('deleteFragmentBtn')
const regenFragmentsBtn = document.getElementById('regenFragmentsBtn')
const statusEl = document.getElementById('status')
const timeEl = document.getElementById('time')
const fragmentsEl = document.getElementById('fragments')

const MIN_FRAGMENT_LENGTH = 0.25
const DEFAULT_FRAGMENT_LENGTH = 5

const FRAGMENT_COLORS = [
    'rgba(56, 189, 248, 0.20)',
    'rgba(34, 197, 94, 0.20)',
    'rgba(251, 191, 36, 0.22)',
    'rgba(168, 85, 247, 0.22)',
    'rgba(244, 114, 182, 0.22)',
]

const USER_FRAGMENT_COLOR = FRAGMENT_COLORS[3]

const wavesurfer = WaveSurfer.create({
    container: '#waveform',
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
const regionMap = new Map()
const regionLabels = new Map()
const regionColors = new Map()

let hasLoadedAudio = false
let selectedRegion = null
let isLooping = false
let lastLoopRestartTime = 0
let lastRegionEditAt = 0
let lastRegionCreatedAt = 0
let fragmentCounter = 1
let fragmentColorIndex = 0
let disableDragSelection = null
let currentAudioUrl = null
let isBuildingDemoFragments = false

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0))
    const mins = Math.floor(safeSeconds / 60)
    const secs = safeSeconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatRange(region) {
    return `${formatTime(region.start)}-${formatTime(region.end)}`
}

function updateTimeDisplay(currentTime = 0) {
    timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(wavesurfer.getDuration())}`
}

function updateControls() {
    loopToggleBtn.disabled = !hasLoadedAudio
    addFragmentBtn.disabled = !hasLoadedAudio
    deleteFragmentBtn.disabled = !selectedRegion

    loopToggleBtn.textContent = isLooping
    ? 'Loop current fragment: On'
    : 'Loop current fragment: Off'
}

function getCurrentTime() {
    if (typeof wavesurfer.getCurrentTime === 'function') {
        return wavesurfer.getCurrentTime()
    }

    return 0
}

function getUsedFragmentColors() {
    return new Set(regionColors.values())
}

function getNextFragmentColor() {
    const usedColors = getUsedFragmentColors()

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

function setRegionColor(region, color) {
    if (!region || !color) return

        regionColors.set(region.id, color)

        if (typeof region.setOptions === 'function') {
            region.setOptions({ color })
            return
        }

        if (region.element) {
            region.element.style.backgroundColor = color
        }
}

function labelExists(label) {
    return Array.from(regionLabels.values()).includes(label)
}

function createFragmentLabel() {
    let label = `Fragment ${fragmentCounter}`

    while (labelExists(label)) {
        fragmentCounter += 1
        label = `Fragment ${fragmentCounter}`
    }

    fragmentCounter += 1
    return label
}

function createUniqueRegionId(label) {
    let id = label
    let suffix = 2

    while (regionMap.has(id) || regionLabels.has(id)) {
        id = `${label} ${suffix}`
        suffix += 1
    }

    return id
}

function ensureRegionId(region) {
    if (!region.id) {
        region.id = createUniqueRegionId('Fragment')
    }

    return region.id
}

function ensureRegionMetadata(region) {
    const id = ensureRegionId(region)

    if (!regionLabels.has(id)) {
        regionLabels.set(id, createFragmentLabel())
    }
}

function getRegionLabel(region) {
    if (!region) return ''
        return regionLabels.get(region.id) || region.id
}

function getWholeFileLoopTarget() {
    const duration = wavesurfer.getDuration()

    if (!duration) {
        return null
    }

    return {
        id: 'whole-file',
        label: 'whole file',
        start: 0,
        end: duration,
        isFragment: false,
    }
}

function getCurrentLoopTarget() {
    if (selectedRegion) {
        return {
            id: selectedRegion.id,
            label: getRegionLabel(selectedRegion),
            start: selectedRegion.start,
            end: selectedRegion.end,
            isFragment: true,
        }
    }

    return getWholeFileLoopTarget()
}

function setSelectedRegion(region) {
    selectedRegion = region || null
    updateControls()
}

function highlightFragment(id) {
    document.querySelectorAll('.fragment-chip').forEach((button) => {
        button.classList.toggle('active', button.dataset.regionId === id)
    })
}

function renderFragmentChips() {
    fragmentsEl.innerHTML = ''

    const sortedRegions = Array.from(regionMap.values()).sort((a, b) => {
        return a.start - b.start
    })

    for (const region of sortedRegions) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'fragment-chip'
        chip.dataset.regionId = region.id
        chip.innerHTML = `${getRegionLabel(region)}<small>${formatRange(region)}</small>`

        if (selectedRegion?.id === region.id) {
            chip.classList.add('active')
        }

        chip.addEventListener('click', () => {
            playFragment(region)
        })

        fragmentsEl.appendChild(chip)
    }

    updateControls()
}

function getPlayableStart(region, requestedStart = region.start) {
    const fragmentStart = region.start
    const fragmentEnd = region.end

    const maxStart = fragmentEnd > fragmentStart
    ? fragmentEnd - 0.01
    : fragmentStart

    return clamp(requestedStart, fragmentStart, Math.max(fragmentStart, maxStart))
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

    return region.start + ((region.end - region.start) * clickProgress)
}

function replayCurrentLoopTarget() {
    if (!isLooping) return

        const now = performance.now()

        if (now - lastLoopRestartTime < 100) {
            return
        }

        lastLoopRestartTime = now

        const target = getCurrentLoopTarget()

        if (!target) return

            if (target.isFragment) {
                highlightFragment(target.id)
                statusEl.textContent = `Looping fragment: ${target.label}`
            } else {
                highlightFragment('')
                statusEl.textContent = 'Looping whole file.'
            }

            wavesurfer.play(target.start, target.end)
}

function playFragment(region, startTime = region.start) {
    if (!region) return

        const playableStart = getPlayableStart(region, startTime)
        const label = getRegionLabel(region)

        setSelectedRegion(region)
        renderFragmentChips()
        highlightFragment(region.id)
        wavesurfer.play(playableStart, region.end)

        statusEl.textContent = isLooping
        ? `Looping fragment: ${label} from ${formatTime(playableStart)}`
        : `Playing fragment: ${label} from ${formatTime(playableStart)}`
}

function setupRegion(region) {
    const id = ensureRegionId(region)

    if (regionMap.has(id)) {
        return
    }

    ensureRegionMetadata(region)
    regionMap.set(id, region)

    region.on('click', (event) => {
        event.stopPropagation()

        if (performance.now() - lastRegionEditAt < 150) {
            return
        }

        const clickedTime = getRegionClickTime(region, event)
        playFragment(region, clickedTime)
    })

    region.on('remove', () => {
        const wasSelected = selectedRegion?.id === id

        regionMap.delete(id)
        regionLabels.delete(id)
        regionColors.delete(id)

        if (wasSelected) {
            setSelectedRegion(null)
            highlightFragment('')
        }

        renderFragmentChips()
    })

    renderFragmentChips()
}

function addFragment(label, start, end, color, options = {}) {
    const id = createUniqueRegionId(label)

    regionLabels.set(id, label)
    regionColors.set(id, color)

    const region = regions.addRegion({
        id,
        start,
        end,
        drag: true,
        resize: true,
        minLength: MIN_FRAGMENT_LENGTH,
        color,
    })

    setupRegion(region)
    setRegionColor(region, color)

    if (options.select) {
        setSelectedRegion(region)
        renderFragmentChips()
        highlightFragment(region.id)
    }

    return region
}

function addFragmentAtPlayhead() {
    const duration = wavesurfer.getDuration()

    if (!duration) return

        const defaultLength = Math.min(DEFAULT_FRAGMENT_LENGTH, Math.max(MIN_FRAGMENT_LENGTH, duration / 5))
        const playhead = getCurrentTime()

        let start = clamp(playhead, 0, Math.max(0, duration - MIN_FRAGMENT_LENGTH))
        let end = clamp(start + defaultLength, MIN_FRAGMENT_LENGTH, duration)

        if (end - start < MIN_FRAGMENT_LENGTH) {
            start = Math.max(0, end - MIN_FRAGMENT_LENGTH)
        }

        const label = createFragmentLabel()
        const region = addFragment(label, start, end, getNextFragmentColor(), {
            select: true,
        })

        statusEl.textContent = `Created fragment: ${getRegionLabel(region)}. Drag it to move it or resize its edges.`
}

function deleteSelectedFragment() {
    if (!selectedRegion) return

        const label = getRegionLabel(selectedRegion)

        selectedRegion.remove()

        statusEl.textContent = isLooping
        ? `Deleted fragment: ${label}. Looping now targets the whole file.`
        : `Deleted fragment: ${label}.`
}

function clearFragments() {
    setSelectedRegion(null)

    for (const region of Array.from(regionMap.values())) {
        region.remove()
    }

    regionMap.clear()
    regionLabels.clear()
    regionColors.clear()
    fragmentsEl.innerHTML = ''

    updateControls()
}

function buildDemoFragments() {
    const duration = wavesurfer.getDuration()

    isBuildingDemoFragments = true
    fragmentCounter = 1
    fragmentColorIndex = 0

    clearFragments()

    if (!duration || duration < 3) {
        isBuildingDemoFragments = false
        statusEl.textContent = 'Audio loaded. The file is too short to create demo fragments.'
        return
    }

    const third = duration / 3

    addFragment('Intro', 0, Math.max(1, third), getNextFragmentColor())
    addFragment('Middle', third, Math.min(duration, third * 2), getNextFragmentColor())
    addFragment('End', Math.max(0, third * 2), duration, getNextFragmentColor())

    isBuildingDemoFragments = false

    statusEl.textContent = isLooping
    ? 'Audio loaded. Looping is on. Select, drag, resize, or create fragments.'
    : 'Audio loaded. Drag fragments to edit them, or drag empty waveform space to create one.'
}

function resetDragSelection() {
    if (typeof disableDragSelection === 'function') {
        disableDragSelection()
    }

    disableDragSelection = null
}

function enableFragmentDragSelection() {
    resetDragSelection()

    disableDragSelection = regions.enableDragSelection({
        color: USER_FRAGMENT_COLOR,
        drag: true,
        resize: true,
        minLength: MIN_FRAGMENT_LENGTH,
    })
}

fileInput.addEventListener('change', async (event) => {
    const [file] = event.target.files
    if (!file) return

        hasLoadedAudio = false
        resetDragSelection()
        clearFragments()

        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl)
            currentAudioUrl = null
        }

        currentAudioUrl = URL.createObjectURL(file)

        statusEl.textContent = `Loading: ${file.name}`
        playPauseBtn.disabled = true
        stopBtn.disabled = true
        regenFragmentsBtn.disabled = true
        updateControls()

        try {
            await wavesurfer.load(currentAudioUrl)
        } catch (error) {
            console.error(error)
            statusEl.textContent = 'Could not load that audio file.'

            if (currentAudioUrl) {
                URL.revokeObjectURL(currentAudioUrl)
                currentAudioUrl = null
            }
        }
})

playPauseBtn.addEventListener('click', async () => {
    await wavesurfer.playPause()
})

stopBtn.addEventListener('click', () => {
    wavesurfer.pause()
    wavesurfer.seekTo(0)
    updateTimeDisplay(0)
    setSelectedRegion(null)
    renderFragmentChips()
    highlightFragment('')

    statusEl.textContent = isLooping
    ? 'Stopped. Looping is still on for the whole file.'
    : 'Stopped.'
})

loopToggleBtn.addEventListener('click', () => {
    if (!hasLoadedAudio) return

        isLooping = !isLooping
        updateControls()

        const target = getCurrentLoopTarget()

        if (isLooping && target) {
            statusEl.textContent = target.isFragment
            ? `Loop enabled for fragment: ${target.label}`
            : 'Loop enabled for the whole file.'
        } else {
            statusEl.textContent = 'Loop disabled.'
        }
})

addFragmentBtn.addEventListener('click', () => {
    addFragmentAtPlayhead()
})

deleteFragmentBtn.addEventListener('click', () => {
    deleteSelectedFragment()
})

regenFragmentsBtn.addEventListener('click', () => {
    buildDemoFragments()
})

wavesurfer.on('decode', () => {
    hasLoadedAudio = true
    playPauseBtn.disabled = false
    stopBtn.disabled = false
    regenFragmentsBtn.disabled = false

    updateControls()
    updateTimeDisplay(0)
    buildDemoFragments()
    enableFragmentDragSelection()
})

wavesurfer.on('ready', () => {
    updateTimeDisplay(0)
})

wavesurfer.on('timeupdate', (currentTime) => {
    updateTimeDisplay(currentTime)
})

wavesurfer.on('play', () => {
    playPauseBtn.textContent = 'Pause'
})

wavesurfer.on('pause', () => {
    playPauseBtn.textContent = 'Play'
})

wavesurfer.on('finish', () => {
    if (isLooping) {
        replayCurrentLoopTarget()
        return
    }

    playPauseBtn.textContent = 'Play'
    highlightFragment('')
    statusEl.textContent = 'Playback finished.'
})

wavesurfer.on('interaction', () => {
    if (performance.now() - lastRegionCreatedAt < 150) {
        return
    }

    setSelectedRegion(null)
    renderFragmentChips()
    highlightFragment('')
    wavesurfer.play()

    statusEl.textContent = isLooping
    ? 'Seeking to selected point. Looping whole file.'
    : 'Seeking to selected point...'
})

regions.on('region-created', (region) => {
    const id = ensureRegionId(region)
    const wasKnown = regionMap.has(id)
    const hadLabel = regionLabels.has(id)

    setupRegion(region)

    const isUserCreatedByDragging = !wasKnown && !hadLabel && !isBuildingDemoFragments

    if (isUserCreatedByDragging) {
        lastRegionCreatedAt = performance.now()

        setRegionColor(region, getNextFragmentColor())
        setSelectedRegion(region)
        renderFragmentChips()
        highlightFragment(region.id)

        statusEl.textContent = `Created fragment: ${getRegionLabel(region)}. Drag it to move it or resize its edges.`
    }
})

regions.on('region-updated', (region) => {
    lastRegionEditAt = performance.now()

    if (region.end - region.start < MIN_FRAGMENT_LENGTH) {
        region.remove()
        statusEl.textContent = 'Removed fragment because it was too short.'
        return
    }

    setupRegion(region)
    setSelectedRegion(region)
    renderFragmentChips()
    highlightFragment(region.id)

    statusEl.textContent = `Updated fragment: ${getRegionLabel(region)} (${formatRange(region)}).`
})

regions.on('region-out', (region) => {
    if (!isLooping || !selectedRegion) return
        if (region.id !== selectedRegion.id) return

            replayCurrentLoopTarget()
})

updateControls()
