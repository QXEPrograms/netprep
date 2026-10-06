// DribbleController: decides where a controlled ball is and where the hands
// should be. It reads the ball handler's movement (position, facing, velocity)
// but never changes it, so locomotion stays independent of ball handling.
//
// Modes:
//   DRIBBLE    normal one-hand dribble with the current `hand`.
//   CROSSOVER  ball is pushed low across the front of the body to the other
//              hand, which takes over control when it arrives.
//
// One dribble cycle (phase 0..1):
//   0.0  ball at the hand (top)  -> pushed down
//   0.5  ball contacts the floor -> rebounds
//   1.0  ball back in the hand
//
// Positions are worked out in a body frame (lateral = character's right,
// forward = facing) and converted to world space each frame, so the ball
// always moves with the body. The frame turns with the body at a limited rate
// so sharp turns swing the ball around instead of snapping it.
//
// State useful to other systems (e.g. a defender reading moves):
//   hand, isCrossingOver, crossoverDirection, crossoverProgress,
//   crossoverCompleted, crossoverCount, crossoverWorldDir
(function () {
const MODES = { DRIBBLE: 'dribble', CROSSOVER: 'crossover' };

ISO.DribbleController = class {
  constructor(ball) {
    this.ball = ball;
    this.hand = 'right';        // 'right' | 'left' — which hand controls the ball
    this.active = true;
    this.mode = MODES.DRIBBLE;
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
      maxSwing: 14,                     // rad/s the ball's body frame can turn
      handLowStill: 0.93, handLowRun: 1.02, // lowest the hand waits while the ball is down (taller stance when running)
      handAbove: 0.015,                 // palm clearance above the ball's top

      // Crossover
      xDuration: 0.4,                   // seconds from push to catch
      xBounceAt: 0.45,                  // fraction of the move when the ball hits the floor
      xBounceForward: 0.58,             // how far in front of the body it bounces (clears the legs)
      xImpactSpeed: 4.2,                // m/s downward at the bounce (a hard, low push)
      xReboundSpeed: 3.6,               // m/s upward leaving the floor
      xCooldown: 0.18,                  // seconds after a crossover before another can start
      xSpeedScale: 0.9,                 // movement speed multiplier while crossing over
    };

    // Public crossover state (read-only for other systems).
    this.isCrossingOver = false;
    this.crossoverDirection = 0;        // +1 ball moving to the character's right, -1 to the left
    this.crossoverProgress = 0;         // 0..1 while crossing over
    this.crossoverCompleted = false;    // true only on the frame a crossover finishes
    this.crossoverCount = 0;
    this.crossoverWorldDir = new THREE.Vector3();
    this.cooldown = 0;

    // Hand requests for the model (character side: +1 right, -1 left).
    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 1 },
      { side: -1, target: new THREE.Vector3(), weight: 0 },
    ];
    this.body = { crouch: 0, twist: 0, roll: 0 };

    this._ballPos = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._lead = new THREE.Vector3();
    this._leadTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._frameYaw = null;      // smoothed facing used for the ball's body frame
    this._x = null;             // active crossover data
  }

  static get MODES() { return MODES; }

  // +1 = character's right side, -1 = left.
  get sideSign() { return this.hand === 'right' ? 1 : -1; }

  get canCrossover() {
    return this.active && this.mode === MODES.DRIBBLE && this.cooldown <= 0;
  }

  // Ask for a crossover. Ignored while one is running or cooling down.
  requestCrossover() {
    if (!this.canCrossover || !this._lastPos) return false;
    this._startCrossover();
    return true;
  }

  // mover: { position, facing, velocity, speed, runSpeed, sprintSpeed }
  update(dt, mover) {
    this.crossoverCompleted = false;
    if (!this.active) return;
    const s = this.settings;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // How "fast" we're going, as smooth 0..1 blends. Smoothed because speed can
    // change in a single frame (e.g. running into a wall), which would otherwise
    // pull the ball and hand inward abruptly.
    const runAmt = Math.min(1, mover.speed / mover.runSpeed);
    const sprintAmt = clamp01((mover.speed - mover.runSpeed) / (mover.sprintSpeed - mover.runSpeed));
    const ka = dt > 0 && this._runAmt !== undefined ? 1 - Math.exp(-10 * dt) : 1;
    this._runAmt = (this._runAmt ?? runAmt) + (runAmt - (this._runAmt ?? runAmt)) * ka;
    this._sprintAmt = (this._sprintAmt ?? sprintAmt) + (sprintAmt - (this._sprintAmt ?? sprintAmt)) * ka;

    // Smoothly retune rhythm and height so speed changes never pop the ball.
    const k = 1 - Math.exp(-6 * dt);
    const targetFreq = lerp(lerp(s.freqStill, s.freqRun, this._runAmt), s.freqSprint, this._sprintAmt);
    const targetTop = lerp(lerp(s.topStill, s.topRun, this._runAmt), s.topSprint, this._sprintAmt);
    this.freq += (targetFreq - this.freq) * k;
    this.top += (targetTop - this.top) * k;

    this._updateFrame(dt, mover);

    // Velocity lead pushes the ball ahead near the floor when moving
    // (smoothed so a sudden stop, e.g. at a wall, eases the ball back in).
    this._leadTarget.copy(mover.velocity).multiplyScalar(s.lead).clampLength(0, s.maxLead);
    this._lead.lerp(this._leadTarget, dt === 0 ? 1 : 1 - Math.exp(-12 * dt));

    if (this.mode === MODES.CROSSOVER) this._updateCrossover(dt, mover);
    else this._updateDribble(dt, mover);
  }

  // ---- normal dribble -------------------------------------------------------

  _updateDribble(dt, mover) {
    const s = this.settings;
    const r = this.ball.radius;
    this.phase = (this.phase + this.freq * dt) % 1;

    // Ball spot at the top (in the hand), in the body frame.
    const lat = s.side * this.sideSign;
    const fwd = this._forward();

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

    // Horizontal path follows the height: in the hand at the top, slightly
    // outside and ahead (plus velocity lead) at the floor.
    const b = 1 - (y - r) / span;
    this._toWorld(mover, lat + 0.03 * this.sideSign * b, fwd + 0.04 * b, y, b, this._ballPos);
    this.ball.place(this._ballPos, dt);

    // The palm rides on top of the ball, but can't reach all the way down: it
    // waits low above the return point and meets the ball on the way back up.
    const top = this._toWorld(mover, lat, fwd, 0, 0, this._tmp);
    const hand = this._hand(this.sideSign);
    hand.target.lerpVectors(this._ballPos, top, b);
    hand.target.y = Math.max(this._handLow(), y + r + s.handAbove);
    hand.weight = 1;
    this._hand(-this.sideSign).weight = 0;

    this.body.crouch = 0;
    this.body.twist = 0.06 * this.sideSign; // shoulders turn slightly over the ball
    this.body.roll = 0;
  }

  // ---- crossover -------------------------------------------------------------

  _startCrossover() {
    const r = this.ball.radius;
    const from = this.sideSign;
    const p = this.ball.position;

    // Current ball position in the body frame (minus the lead it carries), so
    // the move starts exactly where the ball is.
    const span = Math.max(0.05, this.top - r);
    const b0 = clamp01(1 - (p.y - r) / span);
    const rel = this._tmp.copy(p).sub(this._lastPos).addScaledVector(this._lead, -b0);
    this._x = {
      from,
      t: 0,
      lat0: rel.dot(this._right),
      fwd0: rel.dot(this._fwd),
      y0: p.y,
      vy0: Math.max(-6, Math.min(3, this.ball.velocity.y)),
    };

    this.mode = MODES.CROSSOVER;
    this.isCrossingOver = true;
    this.crossoverDirection = -from;
    this.crossoverProgress = 0;
    this.crossoverWorldDir.copy(this._right).multiplyScalar(-from);
  }

  _updateCrossover(dt, mover) {
    const s = this.settings;
    const r = this.ball.radius;
    const x = this._x;
    x.t += dt;
    const u = Math.min(1, x.t / s.xDuration);
    this.crossoverProgress = u;
    this.crossoverWorldDir.copy(this._right).multiplyScalar(-x.from);

    const to = -x.from;
    const lat1 = s.side * to;
    const fwd1 = this._forward();
    const uc = s.xBounceAt;

    // Height: a hard push down to the floor, then a rebound into the other hand.
    // Cubic Hermite segments keep the motion continuous with whatever the ball
    // was doing when the move started.
    let y;
    if (u < uc) {
      const v = u / uc, T = s.xDuration * uc;
      y = hermite(x.y0, x.vy0 * T, r, -s.xImpactSpeed * T, v);
    } else {
      const v = (u - uc) / (1 - uc), T = s.xDuration * (1 - uc);
      y = hermite(r, s.xReboundSpeed * T, this.top, 0, v);
    }
    y = Math.max(r, y);

    // Horizontal: one smooth sweep across the front, bulging forward so the
    // ball bounces well in front of the feet. The bulge peaks at the bounce.
    const e = smootherstep(u);
    const lat = lerp(x.lat0, lat1, e);
    const w = u < uc ? 0.5 * u / uc : 0.5 + 0.5 * (u - uc) / (1 - uc);
    const bounceFwd = s.xBounceForward + 0.1 * this._runAmt;
    const fwd = lerp(x.fwd0, fwd1, e) + Math.max(0, bounceFwd - lerp(x.fwd0, fwd1, 0.5)) * Math.sin(Math.PI * w);
    const floorness = clamp01(1 - (y - r) / Math.max(0.05, this.top - r));
    this._toWorld(mover, lat, fwd, y, floorness, this._ballPos);
    this.ball.place(this._ballPos, dt);

    // Passing hand pushes the ball down and across, then lets go.
    const handLow = this._handLow();
    const fromHand = this._hand(x.from);
    fromHand.target.copy(this._ballPos);
    fromHand.target.y = Math.max(handLow, y + r + s.handAbove);
    fromHand.weight = 1 - smoothstep(0.18, 0.5, u);

    // Receiving hand reaches out to the far side, waits above the catch spot,
    // then rides the ball up.
    const toHand = this._hand(to);
    const catchPt = this._toWorld(mover, lat1, fwd1, 0, 0, this._tmp);
    toHand.target.lerpVectors(this._ballPos, catchPt, u < uc ? 1 : floorness);
    toHand.target.y = Math.max(handLow, y + r + s.handAbove);
    toHand.weight = smoothstep(0.12, 0.45, u);

    // Upper body: dip lower, shoulders follow the ball, weight shifts toward
    // the receiving side.
    const arc = Math.sin(Math.PI * u);
    this.body.crouch = arc;
    this.body.twist = lerp(0.06 * x.from, 0.06 * to, e) + 0.12 * to * arc;
    this.body.roll = 0.1 * to * arc;

    if (u >= 1) this._finishCrossover();
  }

  _finishCrossover() {
    this.hand = this.hand === 'right' ? 'left' : 'right';
    this.mode = MODES.DRIBBLE;
    this.phase = 0;               // ball is in the new hand at the top of the dribble
    this.isCrossingOver = false;
    this.crossoverProgress = 1;
    this.crossoverCompleted = true;
    this.crossoverCount++;
    this.cooldown = this.settings.xCooldown;
    this._x = null;
  }

  // ---- shared helpers ---------------------------------------------------------

  // Body frame from a facing that turns at a limited rate.
  _updateFrame(dt, mover) {
    if (this._frameYaw === null || dt === 0) {
      this._frameYaw = mover.facing;
    } else {
      let diff = Math.atan2(Math.sin(mover.facing - this._frameYaw), Math.cos(mover.facing - this._frameYaw));
      const maxStep = this.settings.maxSwing * dt;
      diff *= 1 - Math.exp(-16 * dt);
      this._frameYaw += Math.max(-maxStep, Math.min(maxStep, diff));
    }
    const f = this._frameYaw;
    // The model faces +z locally, so its right side is -x local.
    this._fwd.set(Math.sin(f), 0, Math.cos(f));
    this._right.set(-Math.cos(f), 0, Math.sin(f));
    this._lastPos = mover.position;
  }

  _forward() {
    const s = this.settings;
    return lerp(s.forwardStill, s.forwardSprint, this._sprintAmt) + 0.05 * this._runAmt;
  }

  _handLow() {
    return lerp(this.settings.handLowStill, this.settings.handLowRun, this._runAmt);
  }

  // Body-frame (lateral, forward, height) to world, adding velocity lead
  // scaled by how close to the floor the ball is.
  _toWorld(mover, lat, fwd, y, leadAmt, out) {
    return out.copy(mover.position)
      .addScaledVector(this._right, lat)
      .addScaledVector(this._fwd, fwd)
      .addScaledVector(this._lead, leadAmt)
      .setY(y);
  }

  _hand(side) {
    return side > 0 ? this.hands[0] : this.hands[1];
  }

  // Pose request for PlayerModel.
  getPose() {
    if (!this.active) return null;
    return { hands: this.hands, body: this.body };
  }
};

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(a, b, v) { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
function smootherstep(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
// Cubic Hermite: p0 -> p1 with end tangents m0, m1 (already scaled by duration).
function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
})();
