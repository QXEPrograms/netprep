// Input: tracks keyboard state and exposes a simple, device-agnostic snapshot.
// Later steps can feed touch controls into the same fields.
ISO.Input = class {
  constructor() {
    this.keys = new Set();
    this.bindings = {
      up: ['KeyW', 'ArrowUp'],
      down: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      sprint: ['ShiftLeft', 'ShiftRight'],
    };
    // Keys whose default browser behavior (page scrolling) we suppress.
    this.captured = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

    window.addEventListener('keydown', (e) => {
      if (this.captured.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Releasing keys while the window is unfocused would otherwise leave them "stuck".
    window.addEventListener('blur', () => this.keys.clear());
  }

  pressed(action) {
    return this.bindings[action].some((code) => this.keys.has(code));
  }

  // Raw movement axes in screen space: x = right, y = up. Diagonals are normalized.
  getMoveAxes() {
    let x = (this.pressed('right') ? 1 : 0) - (this.pressed('left') ? 1 : 0);
    let y = (this.pressed('up') ? 1 : 0) - (this.pressed('down') ? 1 : 0);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  isSprinting() {
    return this.pressed('sprint');
  }
};
