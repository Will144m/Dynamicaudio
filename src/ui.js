import { formatTime } from './utils.js'
import { getTrackDisplayName } from './tracks.js'

export function getElements() {
  return {
    body: document.body,
    trackFileInput: document.getElementById('trackFile'),
    projectFileInput: document.getElementById('projectFile'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    loopToggleBtn: document.getElementById('loopToggleBtn'),
    volumeInput: document.getElementById('volumeInput'),
    linkedCrossfadeInput: document.getElementById('linkedCrossfadeInput'),
    linkedOffsetInput: document.getElementById('linkedOffsetInput'),
    snapToggleInput: document.getElementById('snapToggleInput'),
    addFragmentBtn: document.getElementById('addFragmentBtn'),
    deleteFragmentBtn: document.getElementById('deleteFragmentBtn'),
    exportProjectBtn: document.getElementById('exportProjectBtn'),
    exportLocalProjectBtn: document.getElementById('exportLocalProjectBtn'),
    deleteTrackBtn: document.getElementById('deleteTrackBtn'),
    editorModeBtn: document.getElementById('editorModeBtn'),
    playerModeBtn: document.getElementById('playerModeBtn'),
    statusEl: document.getElementById('status'),
    timeEl: document.getElementById('time'),
    tracksEl: document.getElementById('tracks'),
    fragmentsEl: document.getElementById('fragments'),

    playerPanel: document.getElementById('playerPanel'),
    playerCurrent: document.getElementById('playerCurrent'),
    playerQueued: document.getElementById('playerQueued'),
    playerQueue: document.getElementById('playerQueue'),
    playerAvailableQueue: document.getElementById('playerAvailableQueue'),
    playerLinkedTargets: document.getElementById('playerLinkedTargets'),
    startQueueBtn: document.getElementById('startQueueBtn'),
    nextQueueBtn: document.getElementById('nextQueueBtn'),
    jumpQueueBtn: document.getElementById('jumpQueueBtn'),
    restartQueueBtn: document.getElementById('restartQueueBtn'),
    resetQueueBtn: document.getElementById('resetQueueBtn'),

    fragmentDetailsEl: document.getElementById('fragmentDetails'),
    fragmentNameInput: document.getElementById('fragmentNameInput'),
    fragmentStartInput: document.getElementById('fragmentStartInput'),
    fragmentEndInput: document.getElementById('fragmentEndInput'),
    fragmentLengthValue: document.getElementById('fragmentLengthValue'),
    fragmentLoopModeInput: document.getElementById('fragmentLoopModeInput'),
    fragmentLinkSelect: document.getElementById('fragmentLinkSelect'),
    setStartToPlayheadBtn: document.getElementById('setStartToPlayheadBtn'),
    setEndToPlayheadBtn: document.getElementById('setEndToPlayheadBtn'),
    nudgeFragmentLeftBtn: document.getElementById('nudgeFragmentLeftBtn'),
    nudgeFragmentRightBtn: document.getElementById('nudgeFragmentRightBtn'),
  }
}

export function setStatus(elements, message) {
  elements.statusEl.textContent = message
}

export function updateTimeDisplay(elements, currentTime = 0, duration = 0) {
  elements.timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`
}

export function updatePlayPauseButton(elements, isPlaying) {
  elements.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play'
}

export function applyModeToUi(elements, mode) {
  elements.body.dataset.mode = mode
  elements.editorModeBtn.classList.toggle('active', mode === 'editor')
  elements.playerModeBtn.classList.toggle('active', mode === 'player')
}

export function renderGlobalControls(elements, state) {
  if (elements.volumeInput && document.activeElement !== elements.volumeInput) {
    const volume = Number.isFinite(Number(state.playerSettings?.volume))
      ? Number(state.playerSettings.volume)
      : 1

    elements.volumeInput.value = String(Math.round(volume * 100))
  }

  if (elements.linkedCrossfadeInput && document.activeElement !== elements.linkedCrossfadeInput) {
    const crossfadeMs = Number.isFinite(Number(state.playerSettings?.linkedFragmentCrossfadeMs))
      ? Number(state.playerSettings.linkedFragmentCrossfadeMs)
      : 250

    elements.linkedCrossfadeInput.value = String(Math.round(crossfadeMs))
  }

  if (elements.linkedOffsetInput && document.activeElement !== elements.linkedOffsetInput) {
    const offsetMs = Number.isFinite(Number(state.playerSettings?.linkedFragmentOffsetMs))
      ? Number(state.playerSettings.linkedFragmentOffsetMs)
      : 0

    elements.linkedOffsetInput.value = String(Math.round(offsetMs))
  }

  if (elements.snapToggleInput) {
    elements.snapToggleInput.checked = Boolean(state.editorSettings?.snapEnabled)
  }
}

export function updateControls(elements, state) {
  const isEditor = state.mode === 'editor'
  const isPlayer = state.mode === 'player'
  const hasActiveTrack = Boolean(state.activeTrackId)
  const hasLoadedAudio = Boolean(state.hasLoadedAudio)

  elements.playPauseBtn.disabled = !hasLoadedAudio
  elements.stopBtn.disabled = !hasLoadedAudio
  elements.loopToggleBtn.disabled = !hasLoadedAudio || isPlayer

  elements.addFragmentBtn.disabled = !hasLoadedAudio || !isEditor
  elements.deleteFragmentBtn.disabled = !state.selectedFragmentId || !isEditor

  for (const button of [
    elements.setStartToPlayheadBtn,
    elements.setEndToPlayheadBtn,
    elements.nudgeFragmentLeftBtn,
    elements.nudgeFragmentRightBtn,
  ]) {
    if (button) {
      button.disabled = !state.selectedFragmentId || !hasLoadedAudio || !isEditor
    }
  }

  elements.exportProjectBtn.disabled = state.tracks.length === 0

  if (elements.exportLocalProjectBtn) {
    elements.exportLocalProjectBtn.disabled = state.tracks.length === 0
  }

  if (elements.deleteTrackBtn) {
    elements.deleteTrackBtn.disabled = !hasActiveTrack
  }

  if (isPlayer) {
    elements.loopToggleBtn.textContent = 'Queue handles looping'
  } else {
    elements.loopToggleBtn.textContent = state.isLooping
      ? 'Loop current fragment: On'
      : 'Loop current fragment: Off'
  }

  elements.trackFileInput.disabled = false

  if (!hasActiveTrack) {
    elements.playPauseBtn.disabled = true
    elements.stopBtn.disabled = true
    elements.loopToggleBtn.disabled = true
    elements.addFragmentBtn.disabled = true
    elements.deleteFragmentBtn.disabled = true

    for (const button of [
      elements.setStartToPlayheadBtn,
      elements.setEndToPlayheadBtn,
      elements.nudgeFragmentLeftBtn,
      elements.nudgeFragmentRightBtn,
    ]) {
      if (button) button.disabled = true
    }
  }
}

export function renderTrackList({
  container,
  tracks,
  activeTrackId,
  onTrackClick,
}) {
  container.innerHTML = ''

  if (!tracks.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-list-hint'
    empty.textContent = 'No tracks yet. Add audio to begin.'
    container.appendChild(empty)
    return
  }

  for (const track of tracks) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'track-chip'
    chip.dataset.trackId = track.id

    if (track.id === activeTrackId) {
      chip.classList.add('active')
    }

    const name = document.createElement('span')
    name.textContent = getTrackDisplayName(track)

    const meta = document.createElement('small')
    meta.textContent = `${track.fragments.length} fragments`

    chip.append(name, meta)

    chip.addEventListener('click', () => {
      onTrackClick(track.id)
    })

    container.appendChild(chip)
  }
}

export function renderFragmentDetails(elements, fragment, track = null) {
  clearFragmentDetailsInvalid(elements)

  const editableControls = [
    elements.fragmentNameInput,
    elements.fragmentStartInput,
    elements.fragmentEndInput,
    elements.fragmentLoopModeInput,
    elements.fragmentLinkSelect,
  ]

  if (!fragment) {
    elements.fragmentDetailsEl.classList.add('is-disabled')

    for (const control of editableControls) {
      control.disabled = true
    }

    elements.fragmentNameInput.value = ''
    elements.fragmentStartInput.value = ''
    elements.fragmentEndInput.value = ''
    elements.fragmentLoopModeInput.checked = false
    elements.fragmentLinkSelect.innerHTML = ''
    const emptyLinkOption = document.createElement('option')
    emptyLinkOption.value = ''
    emptyLinkOption.textContent = 'No linked fragment'
    elements.fragmentLinkSelect.appendChild(emptyLinkOption)
    elements.fragmentNameInput.placeholder = 'No fragment selected'
    elements.fragmentLengthValue.textContent = '--'
    return
  }

  elements.fragmentDetailsEl.classList.remove('is-disabled')

  for (const control of editableControls) {
    control.disabled = false
  }

  elements.fragmentNameInput.placeholder = ''
  elements.fragmentNameInput.value = fragment.name
  elements.fragmentStartInput.value = formatTime(fragment.start)
  elements.fragmentEndInput.value = formatTime(fragment.end)
  elements.fragmentLoopModeInput.checked = fragment.playbackMode !== 'transition'
  renderFragmentLinkSelect(elements, fragment, track)
  elements.fragmentLengthValue.textContent = formatTime(fragment.end - fragment.start)
}

function renderFragmentLinkSelect(elements, fragment, track) {
  elements.fragmentLinkSelect.innerHTML = ''

  const emptyOption = document.createElement('option')
  emptyOption.value = ''
  emptyOption.textContent = 'No linked fragment'
  elements.fragmentLinkSelect.appendChild(emptyOption)

  const link = (track?.fragmentLinks || []).find((item) => item.fromFragmentId === fragment.id)
  const fragmentLength = Math.max(0, fragment.end - fragment.start)

  for (const candidate of track?.fragments || []) {
    if (candidate.id === fragment.id) continue

    const option = document.createElement('option')
    const candidateLength = Math.max(0, candidate.end - candidate.start)
    const lengthDelta = Math.abs(candidateLength - fragmentLength)
    const lengthNote = lengthDelta > 0.01
      ? ` · ${formatTime(candidateLength)}`
      : ''

    option.value = candidate.id
    option.textContent = `${candidate.name}${lengthNote}`
    elements.fragmentLinkSelect.appendChild(option)
  }

  elements.fragmentLinkSelect.value = link?.toFragmentId || ''
}


export function readFragmentDetails(elements) {
  return {
    name: elements.fragmentNameInput.value,
    startText: elements.fragmentStartInput.value,
    endText: elements.fragmentEndInput.value,
    playbackMode: elements.fragmentLoopModeInput.checked ? 'loop' : 'transition',
    linkedFragmentId: elements.fragmentLinkSelect.value || '',
  }
}

export function updateFragmentDetailsLength(elements, length) {
  elements.fragmentLengthValue.textContent = Number.isFinite(length)
    ? formatTime(length)
    : '--'
}

export function setFragmentDetailsInvalid(elements, invalidFields = []) {
  const invalidSet = new Set(invalidFields)

  const fieldMap = {
    name: elements.fragmentNameInput,
    start: elements.fragmentStartInput,
    end: elements.fragmentEndInput,
  }

  for (const [field, input] of Object.entries(fieldMap)) {
    const isInvalid = invalidSet.has(field)

    input.classList.toggle('is-invalid', isInvalid)
    input.setAttribute('aria-invalid', String(isInvalid))
  }
}

export function clearFragmentDetailsInvalid(elements) {
  setFragmentDetailsInvalid(elements, [])
}



export function renderPlayerLinkedTargets({
  elements,
  currentFragment,
  linkedTargets = [],
  hasLoadedAudio,
  onLinkedTargetClick,
}) {
  if (!elements.playerLinkedTargets) return

  elements.playerLinkedTargets.innerHTML = ''

  const title = document.createElement('div')
  title.className = 'linked-targets-header'

  const heading = document.createElement('strong')
  heading.textContent = 'Linked fragment switches'

  const hint = document.createElement('span')
  hint.textContent = currentFragment
    ? 'Switch to the same relative position in a linked fragment.'
    : 'Start a queue item to show linked switches.'

  title.append(heading, hint)
  elements.playerLinkedTargets.appendChild(title)

  if (!currentFragment || !linkedTargets.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-list-hint'
    empty.textContent = currentFragment
      ? 'No linked fragments for the current fragment.'
      : 'No current fragment.'
    elements.playerLinkedTargets.appendChild(empty)
    return
  }

  const list = document.createElement('div')
  list.className = 'linked-targets-list'

  for (const target of linkedTargets) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'linked-target-button'
    button.disabled = !hasLoadedAudio

    const name = document.createElement('strong')
    name.textContent = target.name

    const range = document.createElement('small')
    range.textContent = `${formatTime(target.start)}-${formatTime(target.end)}`

    button.append(name, range)
    button.addEventListener('click', () => {
      onLinkedTargetClick?.(target.id)
    })

    list.appendChild(button)
  }

  elements.playerLinkedTargets.appendChild(list)
}

export function renderPlayerQueue({
  elements,
  snapshot,
  hasLoadedAudio,
  onQueueItemClick,
  onQueueItemArm,
  onQueueItemMove,
  onQueueItemDrop,
  onQueueItemRemove,
  onQueueItemAdd,
  onQueueReset,
}) {
  const queueFragments = snapshot?.queueFragments || []
  const availableFragments = snapshot?.availableFragments || []
  const currentFragment = snapshot?.currentFragment || null
  const queuedFragment = snapshot?.queuedFragment || null
  const isAdvanceArmed = Boolean(snapshot?.advanceRequested && queuedFragment)

  elements.playerCurrent.textContent = currentFragment
    ? currentFragment.name
    : '--'

  elements.playerQueued.textContent = queuedFragment
    ? queuedFragment.name
    : snapshot?.advanceRequested
      ? 'Waiting for next queue item...'
      : '--'

  elements.startQueueBtn.textContent = currentFragment
    ? 'Resume queue'
    : 'Start queue'

  elements.nextQueueBtn.textContent = isAdvanceArmed
    ? 'Next armed'
    : 'Queue next'

  elements.jumpQueueBtn.textContent = 'Skip now'
  elements.restartQueueBtn.textContent = 'Restart'
  elements.resetQueueBtn.textContent = 'Reset order'

  elements.nextQueueBtn.classList.toggle('armed', isAdvanceArmed)

  elements.startQueueBtn.disabled = !hasLoadedAudio || queueFragments.length === 0
  elements.nextQueueBtn.disabled = !hasLoadedAudio || queueFragments.length === 0
  elements.jumpQueueBtn.disabled = !hasLoadedAudio || queueFragments.length === 0
  elements.restartQueueBtn.disabled = !hasLoadedAudio || queueFragments.length === 0
  elements.resetQueueBtn.disabled = !hasLoadedAudio || queueFragments.length < 2

  elements.playerQueue.innerHTML = ''
  if (elements.playerAvailableQueue) {
    elements.playerAvailableQueue.innerHTML = ''
  }

  if (!queueFragments.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-list-hint'
    empty.textContent = availableFragments.length
      ? 'Queue is empty. Add fragments from Available fragments below.'
      : 'No queue items yet. Add fragments in Editor mode.'
    elements.playerQueue.appendChild(empty)
  }

  queueFragments.forEach((fragment, index) => {
    const item = document.createElement('div')
    const isCurrent = index === snapshot.currentQueueIndex
    const isQueued = index === snapshot.queuedQueueIndex
    const isTransition = fragment.playbackMode === 'transition'

    item.className = 'player-queue-item'
    item.dataset.fragmentId = fragment.id
    item.draggable = true
    item.classList.add(isTransition ? 'mode-transition' : 'mode-loop')

    item.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', fragment.id)
      event.dataTransfer?.setDragImage?.(item, 18, 18)
      item.classList.add('dragging')
    })

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging')
      elements.playerQueue.querySelectorAll('.drag-over-before, .drag-over-after').forEach((row) => {
        row.classList.remove('drag-over-before', 'drag-over-after')
      })
    })

    item.addEventListener('dragover', (event) => {
      event.preventDefault()

      const rect = item.getBoundingClientRect()
      const placement = event.clientY > rect.top + rect.height / 2
        ? 'after'
        : 'before'

      item.classList.toggle('drag-over-before', placement === 'before')
      item.classList.toggle('drag-over-after', placement === 'after')
    })

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-before', 'drag-over-after')
    })

    item.addEventListener('drop', (event) => {
      event.preventDefault()

      const sourceFragmentId = event.dataTransfer?.getData('text/plain')

      item.classList.remove('drag-over-before', 'drag-over-after')

      if (!sourceFragmentId || sourceFragmentId === fragment.id) {
        return
      }

      const rect = item.getBoundingClientRect()
      const placement = event.clientY > rect.top + rect.height / 2
        ? 'after'
        : 'before'

      onQueueItemDrop?.(sourceFragmentId, fragment.id, placement)
    })

    if (isCurrent) {
      item.classList.add('active')
    }

    if (isQueued) {
      item.classList.add('queued')
    }

    if (isQueued && snapshot.advanceRequested) {
      item.classList.add('armed')
    }

    const playButton = document.createElement('button')
    playButton.type = 'button'
    playButton.className = 'player-queue-play'
    playButton.title = `Play ${fragment.name}`

    const queueIndex = document.createElement('span')
    queueIndex.className = 'player-queue-index'
    queueIndex.textContent = String(index + 1).padStart(2, '0')

    const main = document.createElement('span')
    main.className = 'player-queue-main'

    const name = document.createElement('strong')
    name.textContent = fragment.name

    const range = document.createElement('small')
    range.textContent = `${formatTime(fragment.start)}-${formatTime(fragment.end)}`

    main.append(name, range)

    const badges = document.createElement('span')
    badges.className = 'player-queue-badges'

    if (isCurrent) {
      const currentBadge = document.createElement('span')
      currentBadge.className = 'player-queue-state player-queue-state-current'
      currentBadge.textContent = 'current'
      badges.appendChild(currentBadge)
    }

    if (isQueued && snapshot.advanceRequested) {
      const armedBadge = document.createElement('span')
      armedBadge.className = 'player-queue-state player-queue-state-armed'
      armedBadge.textContent = 'armed next'
      badges.appendChild(armedBadge)
    } else if (isQueued) {
      const queuedBadge = document.createElement('span')
      queuedBadge.className = 'player-queue-state player-queue-state-queued'
      queuedBadge.textContent = 'next'
      badges.appendChild(queuedBadge)
    }

    const mode = document.createElement('span')
    mode.className = 'player-queue-mode'
    mode.textContent = isTransition
      ? 'transition'
      : 'loop'

    badges.appendChild(mode)
    playButton.append(queueIndex, main, badges)

    playButton.addEventListener('click', () => {
      onQueueItemClick(fragment.id)
    })

    const queueEdit = document.createElement('span')
    queueEdit.className = 'player-queue-edit'

    const dragHandle = document.createElement('span')
    dragHandle.className = 'queue-drag-handle'
    dragHandle.textContent = '↕'
    dragHandle.title = 'Drag to reorder'

    const armButton = document.createElement('button')
    armButton.type = 'button'
    armButton.className = 'queue-edit-button queue-arm-button'
    armButton.textContent = isQueued && snapshot.advanceRequested ? 'armed' : 'arm'
    armButton.title = `Arm ${fragment.name} as next`
    armButton.disabled = isCurrent

    const upButton = document.createElement('button')
    upButton.type = 'button'
    upButton.className = 'queue-edit-button'
    upButton.textContent = '↑'
    upButton.title = 'Move up'
    upButton.disabled = index === 0

    const downButton = document.createElement('button')
    downButton.type = 'button'
    downButton.className = 'queue-edit-button'
    downButton.textContent = '↓'
    downButton.title = 'Move down'
    downButton.disabled = index === queueFragments.length - 1

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'queue-edit-button queue-remove-button'
    removeButton.textContent = '−'
    removeButton.title = 'Remove from queue'

    armButton.addEventListener('click', () => {
      onQueueItemArm?.(fragment.id)
    })

    upButton.addEventListener('click', () => {
      onQueueItemMove?.(fragment.id, 'up')
    })

    downButton.addEventListener('click', () => {
      onQueueItemMove?.(fragment.id, 'down')
    })

    removeButton.addEventListener('click', () => {
      onQueueItemRemove?.(fragment.id)
    })

    queueEdit.append(dragHandle, armButton, upButton, downButton, removeButton)
    item.append(playButton, queueEdit)

    elements.playerQueue.appendChild(item)
  })

  if (elements.playerAvailableQueue) {
    renderAvailableQueueFragments({
      container: elements.playerAvailableQueue,
      fragments: availableFragments,
      hasLoadedAudio,
      onQueueItemAdd,
    })
  }

  elements.resetQueueBtn.onclick = () => {
    onQueueReset?.()
  }
}

function renderAvailableQueueFragments({
  container,
  fragments = [],
  hasLoadedAudio,
  onQueueItemAdd,
}) {
  container.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'available-queue-header'

  const title = document.createElement('strong')
  title.textContent = 'Available fragments'

  const hint = document.createElement('span')
  hint.textContent = 'Fragments removed from the queue can be added back here.'

  header.append(title, hint)
  container.appendChild(header)

  if (!fragments.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-list-hint'
    empty.textContent = 'All fragments are currently in the queue.'
    container.appendChild(empty)
    return
  }

  const list = document.createElement('div')
  list.className = 'available-queue-list'

  for (const fragment of fragments) {
    const item = document.createElement('div')
    item.className = 'available-queue-item'

    const main = document.createElement('span')
    main.className = 'available-queue-main'

    const name = document.createElement('strong')
    name.textContent = fragment.name

    const range = document.createElement('small')
    range.textContent = `${formatTime(fragment.start)}-${formatTime(fragment.end)}`

    main.append(name, range)

    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.className = 'queue-edit-button queue-add-button'
    addButton.textContent = '+'
    addButton.title = `Add ${fragment.name} to queue`
    addButton.disabled = !hasLoadedAudio
    addButton.addEventListener('click', () => {
      onQueueItemAdd?.(fragment.id)
    })

    item.append(main, addButton)
    list.appendChild(item)
  }

  container.appendChild(list)
}
