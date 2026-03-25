import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js'
import RegionsPlugin from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/plugins/regions.esm.js'

const fileInput = document.getElementById('audioFile')
const playPauseBtn = document.getElementById('playPauseBtn')
const stopBtn = document.getElementById('stopBtn')
const regenFragmentsBtn = document.getElementById('regenFragmentsBtn')
const statusEl = document.getElementById('status')
const timeEl = document.getElementById('time')
const fragmentsEl = document.getElementById('fragments')

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

function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0))
    const mins = Math.floor(safeSeconds / 60)
    const secs = safeSeconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function updateTimeDisplay(currentTime = 0) {
    timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(wavesurfer.getDuration())}`
}

function clearFragments() {
    for (const region of regionMap.values()) {
        region.remove()
    }
    regionMap.clear()
    fragmentsEl.innerHTML = ''
}

function highlightFragment(id) {
    document.querySelectorAll('.fragment-chip').forEach((button) => {
        button.classList.toggle('active', button.dataset.regionId === id)
    })
}

function playFragment(region) {
    if (!region) return
        highlightFragment(region.id)
        wavesurfer.play(region.start, region.end)
        statusEl.textContent = `Playing fragment: ${region.id}`
}

function addFragment(id, start, end, color) {
    const region = regions.addRegion({
        id,
        start,
        end,
        drag: false,
        resize: false,
        color,
    })

    region.on('click', (event) => {
        event.stopPropagation()
        playFragment(region)
    })

    regionMap.set(id, region)

    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'fragment-chip'
    chip.dataset.regionId = id
    chip.innerHTML = `${id}<small>${formatTime(start)}-${formatTime(end)}</small>`
    chip.addEventListener('click', () => playFragment(region))
    fragmentsEl.appendChild(chip)
}

function buildDemoFragments() {
    const duration = wavesurfer.getDuration()
    clearFragments()

    if (!duration || duration < 3) {
        statusEl.textContent = 'Audio loaded. The file is too short to create demo fragments.'
        return
    }

    const third = duration / 3
    addFragment('Intro', 0, Math.max(1, third), 'rgba(56, 189, 248, 0.20)')
    addFragment('Middle', third, Math.min(duration, third * 2), 'rgba(34, 197, 94, 0.20)')
    addFragment('End', Math.max(0, third * 2), duration, 'rgba(251, 191, 36, 0.22)')

    statusEl.textContent = 'Audio loaded. Click the waveform to seek, or use the fragment chips.'
}

fileInput.addEventListener('change', async (event) => {
    const [file] = event.target.files
    if (!file) return

        clearFragments()
        statusEl.textContent = `Loading: ${file.name}`
        playPauseBtn.disabled = true
        stopBtn.disabled = true
        regenFragmentsBtn.disabled = true

        try {
            await wavesurfer.loadBlob(file)
        } catch (error) {
            console.error(error)
            statusEl.textContent = 'Could not load that audio file.'
        }
})

playPauseBtn.addEventListener('click', async () => {
    await wavesurfer.playPause()
})

stopBtn.addEventListener('click', () => {
    wavesurfer.pause()
    wavesurfer.seekTo(0)
    updateTimeDisplay(0)
    statusEl.textContent = 'Stopped.'
    highlightFragment('')
})

regenFragmentsBtn.addEventListener('click', () => {
    buildDemoFragments()
})

wavesurfer.on('decode', () => {
    playPauseBtn.disabled = false
    stopBtn.disabled = false
    regenFragmentsBtn.disabled = false
    updateTimeDisplay(0)
    buildDemoFragments()
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
    playPauseBtn.textContent = 'Play'
    highlightFragment('')
    statusEl.textContent = 'Playback finished.'
})

wavesurfer.on('interaction', () => {
    wavesurfer.play()
    statusEl.textContent = 'Seeking to selected point...'
    highlightFragment('')
})
