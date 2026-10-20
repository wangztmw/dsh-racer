const KEYMAP = {
  ArrowUp: 'gas', KeyW: 'gas',
  ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake',
};

export function createInput() {
  const held = new Set();
  const state = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const events = [];

  const onKey = (e, down) => {
    const action = KEYMAP[e.code];
    if (action) {
      e.preventDefault();
      if (down) held.add(action); else held.delete(action);
      return;
    }
    if (down && !e.repeat) events.push(e.code);
  };

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => held.clear());

  // touch buttons
  document.querySelectorAll('#touches button').forEach((btn) => {
    const action = btn.dataset.k === 'gas' ? 'gas'
      : btn.dataset.k === 'brake' ? 'brake'
      : btn.dataset.k === 'left' ? 'left' : 'right';
    const press = (e) => { e.preventDefault(); held.add(action); };
    const release = (e) => { e.preventDefault(); held.delete(action); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  return {
    /** Continuous axes, read once per frame. */
    read() {
      const gas = held.has('gas') ? 1 : 0;
      const brake = held.has('brake') ? 1 : 0;
      const left = held.has('left') ? 1 : 0;
      const right = held.has('right') ? 1 : 0;
      state.throttle = gas;
      state.brake = brake;
      state.steer = right - left;
      state.handbrake = held.has('handbrake');
      return state;
    },
    /** One-shot key codes pressed since last call. */
    consume() {
      const out = events.slice();
      events.length = 0;
      return out;
    },
  };
}
