import { formatRange } from './utils.js'

export function renderFragmentList({
  container,
  fragments,
  selectedFragmentId,
  onFragmentClick,
}) {
  container.innerHTML = ''

  const sortedFragments = [...fragments].sort((a, b) => a.start - b.start)

  for (const fragment of sortedFragments) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'fragment-chip'
    chip.dataset.fragmentId = fragment.id

    if (fragment.id === selectedFragmentId) {
      chip.classList.add('active')
    }

    const name = document.createElement('span')
    name.textContent = fragment.name

    const range = document.createElement('small')
    range.textContent = formatRange(fragment)

    const mode = document.createElement('em')
    mode.textContent = fragment.playbackMode === 'transition' ? 'transition' : 'loop'

    chip.append(name, range, mode)

    chip.addEventListener('click', () => {
      onFragmentClick(fragment.id)
    })

    container.appendChild(chip)
  }
}
