import { TRACKS } from '../world/catalog.js';

/* Circuit picker on the splash screen: cards + left/right arrow keys. */

export function createPicker({ listEl, splash, onSelect }) {
  let selected = 0;

  function select(i) {
    selected = (i + TRACKS.length) % TRACKS.length;
    [...listEl.children].forEach((c, j) => c.classList.toggle('sel', j === selected));
    onSelect?.(TRACKS[selected], selected);
    return selected;
  }

  TRACKS.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = 'track' + (i === 0 ? ' sel' : '');
    card.innerHTML = `<b>${t.name}</b><span>${t.blurb}</span><em>${Math.round(t.length)} m · ${t.laps} LAPS</em>`;
    card.addEventListener('click', () => select(i));
    listEl.appendChild(card);
  });

  window.addEventListener('keydown', (e) => {
    if (splash.classList.contains('hide')) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      select(selected + (e.code === 'ArrowRight' ? 1 : -1));
    }
  });

  return {
    get selected() { return selected; },
    get track() { return TRACKS[selected]; },
    select,
  };
}
