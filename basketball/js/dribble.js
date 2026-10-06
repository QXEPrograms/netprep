// DribbleController: decides where a controlled ball is during a dribble and
// where the dribbling hand should be. It reads the ball handler's movement
// (position, facing, velocity) but never changes it, so locomotion stays
// independent of ball handling.
//
// One dribble cycle (phase 0..1):
//   0.0  ball at the hand (top)  -> pushed down
//   0.5  ball contacts the floor -> rebounds
//   1.0  ball back in the hand
//
// Hooks for later steps: `hand` (switch sides for crossovers), `active`
// (pick up the ball to shoot / step back), and `settings` for feel tuning.
(function () {
ISO.DribbleController = class {
  constructor(ball) {
    this.ball = ball;
    this.hand = 'right';        // 'right' | 'left'
    this.active = true;
    this.phase = 0.15;          // start just after the push so it reads immediately
    this.freq = 1.6;            // current bounces per second (smoothed)
    this.top = 0.8;             // current top-of-dribble ball height (smoothed)

    this.settings = {
      freqStill: 1.55,   freqRun: 2.05,  freqSprint: 2.35,  // bounces per second
      topStill: 0.80,    topRun: 0.87,   topSprint: 0.95,   // ball center height at the hand
      side: 0.34,                       // lateral offset of the ball from the body center
      forwardStill: 0.27, forwardSprint: 0.42,
      lead: 0.055,                      // seconds of velocity lead at floor contact
      maxLead: 0.3,                     // cap on that lead (m)
      maxSwing: 14,                     // rad/s the ball can swing around the body
      handLowStill: 0.93, handLowRun: 1.02, // lowest the hand waits while the ball is down (taller stance when running)
      handAbove: 0.015,                 // palm clearance above the ball's top
    };

    this.handTarget = new THREE.Vector3();
    this._ballPos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._top = new THREE.Vector3();
    this._floor = new THREE.Vector3();
    this._lead = new THREE.Vector3();
    this._leadTarget = new THREE.Vector3();
    this._offAngle = null;      // smoothed world angle of the ball's offset from the body
    this._offRadius = 0;
  }

  // +1 = character's right side, -1 = left. Used to place ball/hand.
  get sideSign() { return this.hand === 'right' ? 1 : -1; }

  // mover: { position, facing, velocity, speed, runSpeed, sprintSpeed }
  update(dt, mover) {
    if (!this.active) return;
    const s = this.settings;
    const r = this.ball.radius;

    // How "fast" we're going, as smooth 0..1 blends.
    const runAmt = Math.min(1, mover.speed / mover.runSpeed);
    const sprintAmt = clamp01((mover.speed - mover.runSpeed) / (mover.sprintSpeed - mover.runSpeed));

    // Smoothly retune rhythm and height so speed changes never pop the ball.
    const k = 1 - Math.exp(-6 * dt);
    const targetFreq = lerp(lerp(s.freqStill, s.freqRun, runAmt), s.freqSprint, sprintAmt);
    const targetTop = lerp(lerp(s.topStill, s.topRun, runAmt), s.topSprint, sprintAmt);
    this.freq += (targetFreq - this.freq) * k;
    this.top += (targetTop - this.top) * k;
    this.phase = (this.phase + this.freq * dt) % 1;

    // Body frame. The model faces +z locally, so its right side is -x local.
    const f = mover.facing;
    this._fwd.set(Math.sin(f), 0, Math.cos(f));
    this._right.set(-Math.cos(f), 0, Math.sin(f));

    // Where the ball sits at the top (in the hand), as an offset around the body.
    const forward = lerp(s.forwardStill, s.forwardSprint, sprintAmt) + 0.05 * runAmt;
    const side = s.side * this.sideSign;
    this._top.set(0, 0, 0)
      .addScaledVector(this._right, side)
      .addScaledVector(this._fwd, forward);
    this._smoothOffset(dt, this._top);
    this._top.set(Math.sin(this._offAngle), 0, Math.cos(this._offAngle))
      .multiplyScalar(this._offRadius)
      .add(mover.position);

    // Where it meets the floor: slightly outside the hand and pushed ahead when moving.
    // (smoothed so a sudden stop, e.g. at a wall, eases the ball back in)
    this._leadTarget.copy(mover.velocity).multiplyScalar(s.lead).clampLength(0, s.maxLead);
    this._lead.lerp(this._leadTarget, dt === 0 ? 1 : 1 - Math.exp(-12 * dt));
    this._floor.copy(this._top)
      .addScaledVector(this._right, 0.03 * this.sideSign)
      .addScaledVector(this._fwd, 0.04)
      .add(this._lead);

    // Vertical path: pushed down (accelerating), then rebounds and decelerates
    // into the hand.
    const t = this.phase;
    const span = this.top - r;
    let y;
    if (t < 0.5) {
      const u = t / 0.5;
      y = this.top - span * (0.55 * u + 0.45 * u * u);
    } else {
      const u = (t - 0.5) / 0.5;
      y = r + span * (1 - Math.pow(1 - u, 1.7));
    }

    // Horizontal path follows the height: in the hand at the top, at the floor
    // point at contact.
    const b = 1 - (y - r) / span;
    this._ballPos.lerpVectors(this._top, this._floor, b);
    this._ballPos.y = y;
    this.ball.place(this._ballPos, dt);

    // The palm rides on top of the ball, but can't reach all the way down: it
    // waits low above the return point and meets the ball on the way back up.
    this.handTarget.lerpVectors(this._ballPos, this._top, b);
    this.handTarget.y = Math.max(lerp(s.handLowStill, s.handLowRun, runAmt), y + r + s.handAbove);
  }

  // The ball's spot around the body turns at a limited rate, so quick turns and
  // reversals swing the ball around the player instead of snapping it across.
  // Translation is never smoothed: the ball always moves with the body.
  _smoothOffset(dt, target) {
    const angle = Math.atan2(target.x, target.z);
    const radius = Math.hypot(target.x, target.z);
    if (this._offAngle === null || dt === 0) {
      this._offAngle = angle;
      this._offRadius = radius;
      return;
    }
    let diff = Math.atan2(Math.sin(angle - this._offAngle), Math.cos(angle - this._offAngle));
    const maxStep = this.settings.maxSwing * dt;
    diff *= 1 - Math.exp(-16 * dt);
    this._offAngle += Math.max(-maxStep, Math.min(maxStep, diff));
    this._offRadius += (radius - this._offRadius) * (1 - Math.exp(-12 * dt));
  }

  // Arm pose request for PlayerModel.
  getArmPose() {
    return this.active ? { side: this.sideSign, target: this.handTarget } : null;
  }
};

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
})();
