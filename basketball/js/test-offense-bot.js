// Development only (?defenseplayer): lets you play DEFENSE against a scripted
// ball handler so blocking/contesting can be tested by hand. This is not CPU
// offense: it just replays simple, repeatable offensive patterns through the
// same input interface a human uses (VirtualInput), then puts the ball handler
// back on their spot.
//
// Keys (while defending): 1 spot-up jumper, 2 pull-up, 3 step-back,
// 4 side-step, 5 drive (layup/dunk), 6 floater, 7 pump fake then go,
// 0 stand and dribble.
(function () {
// Same interface PlayerController/OffenseController read from Input.
ISO.VirtualInput = class {
  constructor() {
    this.axes = { x: 0, y: 0 };
    this.sprint = false;
    this.down = new Set();
    this.pressed = new Set();
  }
  getMoveAxes() { return this.axes; }
  isSprinting() { return this.sprint; }
  isDown(a) { return this.down.has(a); }
  consumePress(a) { return this.pressed.delete(a); }
  releaseAge() { return 0; }
  press(a) { this.pressed.add(a); this.down.add(a); }
  release(a) { this.down.delete(a); }
};

const MODES = {
  1: 'spot-up jumper', 2: 'pull-up', 3: 'step-back', 4: 'side-step', 5: 'drive to the rim',
  6: 'floater', 7: 'pump fake, then go', 0: 'stand and dribble',
};

ISO.OffenseTestBot = class {
  constructor({ player, input, camera, defender }) {
    this.player = player;
    this.input = input;           // VirtualInput driving the ball handler
    this.camera = camera;
    this.defender = defender;
    this.mode = 1;
    this.t = 0;
    this.phase = 'wait';
    this.rep = 0;
    this.spot = new THREE.Vector3(0, 0, 8.4);
    this._f = new THREE.Vector3();
  }

  static get MODES() { return MODES; }

  setMode(m) {
    if (!(m in MODES)) return;
    this.mode = m;
    this._resetRep(true);
  }

  // World direction -> the screen axes the controller expects.
  _move(x, z) {
    const f = this._f; this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const len = Math.hypot(x, z);
    if (len < 1e-6) { this.input.axes = { x: 0, y: 0 }; return; }
    x /= len; z /= len;
    this.input.axes = { x: x * -f.z + z * f.x, y: x * f.x + z * f.z };
  }

  _resetRep(now) {
    const P = this.player, I = this.input;
    I.down.clear(); I.pressed.clear(); I.sprint = false; this._move(0, 0);
    this.t = now ? -0.6 : 0;
    this.phase = 'wait';
    // put the ball handler back on the spot (dev reset), with the ball
    if (!P.hasBall || P.ball.mode === ISO.Basketball.MODES.FREE) P._regainBall('right');
    P.locomotion.position.copy(this.spot);
    P.locomotion.velocity.set(0, 0, 0);
    P.locomotion.facing = Math.PI;
    this.rep++;
  }

  update(dt) {
    const P = this.player, I = this.input, sh = P.shooting;
    this.t += dt;
    const holdGreen = () => { if (I.isDown('shoot') && sh.isShooting && sh.shotTime >= sh.settings.idealRelease) I.release('shoot'); };
    const toRim = () => this._move(-P.locomotion.position.x, 1.6 - P.locomotion.position.z);
    const rimDist = () => Math.hypot(P.locomotion.position.x, P.locomotion.position.z - 1.6);
    if (this.phase === 'done') {
      if (this.t > 1.8 && !P.busy) this._resetRep(false);   // watch the result, then go again
      return;
    }
    if (this.t < 0.9 || this.mode === 0) { this._move(0, 0); return; }
    const t = this.t - 0.9;
    switch (this.mode) {
      case 1: if (this.phase === 'wait') { I.press('shoot'); this.phase = 'shoot'; } holdGreen(); break;
      case 2:
        if (t < 0.5) this._move(1, 0);
        else if (this.phase === 'wait') { this._move(0, 0); I.press('shoot'); this.phase = 'shoot'; }
        holdGreen(); break;
      case 3:
        if (t < 0.4) this._move(0, -1);
        else if (this.phase === 'wait') { this._move(0, 0); I.press('stepBack'); this.phase = 'sb'; this._t2 = t; }
        else if (this.phase === 'sb' && t - this._t2 > 0.35) { I.press('shoot'); this.phase = 'shoot'; }
        holdGreen(); break;
      case 4:
        if (t < 0.5) this._move(-1, 0);
        else if (this.phase === 'wait') { I.press('shoot'); this._move(0, 0); this.phase = 'shoot'; }
        holdGreen(); break;
      case 5:
        I.sprint = this.rep % 2 === 0;           // alternate: sprint (dunk) / run (layup)
        if (this.phase === 'wait') { toRim(); if (rimDist() < 2.4) { I.press('shoot'); this.phase = 'fin'; } }
        else if (t > 0.05) { I.release('shoot'); this._move(0, 0); }
        break;
      case 6:
        if (this.phase === 'wait') { toRim(); if (rimDist() < 4.0) { I.press('shoot'); this.phase = 'fin'; } }
        else { I.release('shoot'); this._move(0, 0); }
        break;
      case 7:
        if (this.phase === 'wait') { I.press('shoot'); this.phase = 'fake'; this._t2 = t; }
        else if (this.phase === 'fake') { if (t - this._t2 > 0.06) I.release('shoot'); if (t - this._t2 > 0.55) this.phase = 'decide'; }
        else if (this.phase === 'decide') {
          // defender in the air? drive past; still down? shoot it
          if (this.defender && this.defender.isJumping) { this.phase = 'drive'; }
          else { I.press('shoot'); this.phase = 'shoot'; }
        } else if (this.phase === 'drive') {
          I.sprint = true; toRim();
          if (rimDist() < 2.6) { I.press('shoot'); this.phase = 'fin'; }
        } else if (this.phase === 'fin') { I.release('shoot'); this._move(0, 0); }
        holdGreen(); break;
    }
    // shot resolved / ball gone: finish the rep
    if (this.phase !== 'wait' && this.phase !== 'fake' && this.phase !== 'decide' && this.phase !== 'drive' &&
        !P.busy && (P.ball.mode === ISO.Basketball.MODES.FREE || t > 4)) {
      this._move(0, 0); I.sprint = false; this.phase = 'done'; this.t = 0;
    }
  }
};
})();
