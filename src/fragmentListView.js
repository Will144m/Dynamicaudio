import { formatRange } from './utils.js'
import { getSortedFragments } from './fragments.js'

export function renderFragmentList({
  container,
  fragments,
  selectedFragmentId,
  onFragmentClick,
}) {
  container.innerHTML = ''

  for (const fragment of getSortedFragments(fragments)) {
    const chip = document.createElement('button')
    const label = document.createElement('span')
    const range = document.createElement('small')

    chip.type = 'button'
    chip.className = 'fragment-chip'
    chip.dataset.fragmentId = fragment.id
    chip.classList.toggle('active', fragment.id === selectedFragmentId)

    label.textContent = fragment.name
    range.textContent = formatRange(fragment)

    chip.append(label, range)
    chip.addEventListener('click', () => onFragmentClick(fragment.id))

    container.appendChild(chip)
  }
}
