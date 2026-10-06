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
      crossover: ['KeyE'],
      stepBack: ['KeyQ'],
      shoot: ['Space'],
      pass: ['KeyF'],
      spinLeft: ['KeyZ'],
      spinRight: ['KeyX'],
      hesitation: ['KeyC'],
      behindBack: ['KeyV'],
      inAndOut: ['KeyR'],
      // CPU offense test patterns (while you defend)
      bot0: ['Digit0'], bot1: ['Digit1'], bot2: ['Digit2'], bot3: ['Digit3'],
      bot4: ['Digit4'], bot5: ['Digit5'], bot6: ['Digit6'], bot7: ['Digit7'], bot8: ['Digit8'],
      // ?scenario: restart the reference scenario
      scenarioReset: ['Enter'],
    };
    // Fresh presses (not OS key-repeat) waiting to be consumed, per key code.
    this.presses = new Set();
    // Keys whose default browser behavior (page scrolling) we suppress.
    this.captured = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

    window.addEventListener('keydown', (e) => {
      if (this.captured.has(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.presses.add(e.code);
      this.keys.add(e.code);
    });
    // When each key was last released (event time, ms), for sub-frame timing.
    this.upTime = {};
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.upTime[e.code] = e.timeStamp;
    });
    // Releasing keys while the window is unfocused would otherwise leave them "stuck".
    window.addEventListener('blur', () => { this.keys.clear(); this.presses.clear(); });
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

  // True once per physical key press: holding the key does not repeat it.
  consumePress(action) {
    let hit = false;
    for (const code of this.bindings[action]) {
      if (this.presses.delete(code)) hit = true;
    }
    return hit;
  }

  // Seconds since `action` was released, clamped to [0, maxAge]. Lets timing
  // judge a release between frames instead of at the next frame.
  releaseAge(action, maxAge) {
    if (this.pressed(action)) return 0;
    let latest = -Infinity;
    for (const code of this.bindings[action]) latest = Math.max(latest, this.upTime[code] ?? -Infinity);
    if (!isFinite(latest)) return 0;
    return Math.max(0, Math.min(maxAge, (performance.now() - latest) / 1000));
  }

  isDown(action) {
    return this.pressed(action);
  }

  isSprinting() {
    return this.pressed('sprint');
  }
};
