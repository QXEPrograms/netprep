// DribbleController: decides where a controlled ball is and where the hands
// should be. It reads the ball handler's movement (position, facing, velocity)
// but never changes it, so locomotion stays independent of ball handling.
//
// Modes:
//   DRIBBLE    normal one-hand dribble with the current `hand`.
//   CROSSOVER  ball is pushed low across the front of the body to the other
//              hand, which takes over control when it arrives.
//   MOVE       another dribble move (spin, hesitation, in-and-out,
//              behind-the-back; see dribble-moves.js) owns the ball.
//
// Moves can chain: once a move's cancel window opens (OFFENSE.chain), the
// next one starts from wherever the ball really is. Body pose extras are
// smoothed so switching moves never snaps the body.
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
//   crossoverCompleted, crossoverCount, crossoverWorldDir,
//   crossoverFakeDirection / crossoverFakeWorldDir (the body fake goes this way
//   first), crossoverBurst (sharp-acceleration window after the ball crosses)
(function () {
const MODES = { DRIBBLE: 'dribble', CROSSOVER: 'crossover', MOVE: 'move' };

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
      xDuration: 0.3,                   // seconds from push to catch
      xBounceAt: 0.38,                  // fraction of the move when the ball hits the floor
      xBounceForward: 0.56,             // how far in front of the body it bounces (clears the legs)
      xImpactSpeed: 6.0,                // m/s downward at the bounce (a hard, low push)
      xReboundSpeed: 4.5,               // m/s upward leaving the floor
      xOvershoot: 0.13,                 // catch carries this far (fraction) past the hand spot
      xCooldown: 0.12,                  // seconds after a crossover before another can start
      xSpeedScale: 0.92,                // top-speed multiplier during the push
      xBurstTime: 0.3,                  // after the ball crosses: sharper acceleration (not more speed)
    };

    // Public crossover state (read-only for other systems).
    this.isCrossingOver = false;
    this.crossoverDirection = 0;        // +1 ball moving to the character's right, -1 to the left
    this.crossoverProgress = 0;         // 0..1 while crossing over
    this.crossoverCompleted = false;    // true only on the frame a crossover finishes
    this.crossoverCount = 0;
    this.crossoverWorldDir = new THREE.Vector3();
    // The body sells the opposite way first: +1 = fakes toward the right.
    this.crossoverFakeDirection = 0;
    this.crossoverFakeWorldDir = new THREE.Vector3();
    this.crossoverBurst = 0;            // 1..0 sharp-acceleration window right after the ball crosses
    this.cooldown = 0;
    // Scales the velocity lead. Moves that travel backward (step-back) set this
    // to 0 so the ball stays in front instead of trailing behind the body.
    this.leadScale = 1;

    // Hand requests for the model (character side: +1 right, -1 left).
    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 1 },
      { side: -1, target: new THREE.Vector3(), weight: 0 },
    ];
    this.body = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0, stride: 1, forward: 0, turnRoll: 1 };
    this.bodyOut = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0, stride: 1, forward: 0, turnRoll: 1 };

    // Other dribble moves (persistent instances so their state is readable).
    const M = ISO.DribbleMoves;
    this.moves = {
      spin: new M.SpinMove(),
      hesitation: new M.HesitationMove(),
      inAndOut: new M.InAndOutMove(),
      behindBack: new M.BehindBackMove(),
    };
    this.move = null;                   // the move running in MOVE mode
    this.moveExited = null;             // { name, strength } on the frame a move ends cleanly
    this.execScale = 1;                 // fatigue: >1 makes moves a little slower

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

  // ---- move management ------------------------------------------------------

  // Name of the move in progress ('crossover', 'spin', ...) or null.
  get currentMove() {
    if (this.mode === MODES.CROSSOVER) return 'crossover';
    if (this.mode === MODES.MOVE && this.move) return this.move.name;
    return null;
  }

  get moveProgress() {
    if (this.mode === MODES.CROSSOVER) return this.crossoverProgress;
    if (this.mode === MODES.MOVE && this.move) return this.move.progress;
    return 1;
  }

  // Can `next` ('crossover', 'spin', 'stepBack', 'shot', ...) start right now?
  // From a plain dribble: yes (dribble moves also respect the short cooldown).
  // During a move: only once its cancel window is open and the chain allows it.
  canChain(next) {
    if (!this.active) return false;
    const cur = this.currentMove;
    if (!cur) return next === 'shot' || next === 'stepBack' || this.cooldown <= 0;
    const cfg = ISO.OFFENSE;
    return (cfg.chain[cur] || []).includes(next) && this.moveProgress >= cfg.moves[cur].cancelAt;
  }

  // Start a dribble move by name. opts are passed to the move (e.g. spin dir).
  startMove(name, mover, opts = {}) {
    if (!this.canChain(name) || !this._lastPos) return false;
    if (this.currentMove) this.cancelMove();
    if (name === 'crossover') { this._startCrossover(); return true; }
    const move = this.moves[name];
    move.start(this, mover, opts, this.execScale);
    this.move = move;
    this.mode = MODES.MOVE;
    return true;
  }

  // Cut the current move short (to chain into something else). The ball keeps
  // going from where it is; the hand that has it keeps it.
  cancelMove() {
    if (this.mode === MODES.CROSSOVER) {
      if (this.crossoverProgress >= this.settings.xBounceAt) this.hand = this.hand === 'right' ? 'left' : 'right';
      this.isCrossingOver = false;
      this._x = null;
    } else if (this.mode === MODES.MOVE && this.move) {
      this.hand = this.move.currentHand();
      this.move.active = false;
      for (const k of ['isSpinning', 'isHesitating', 'isInAndOut', 'isBehindBack']) if (k in this.move) this.move[k] = false;
      this.move = null;
    }
    this.mode = MODES.DRIBBLE;
    this.phase = this._phaseForBall();
  }

  // Dribble phase that matches the ball's current height and direction, so a
  // cancelled move flows straight back into the normal dribble.
  _phaseForBall() {
    const r = this.ball.radius, span = Math.max(0.05, this.top - r);
    const x = clamp01((this.ball.position.y - r) / span);
    if (this.ball.velocity.y > 0) return 0.5 + 0.5 * (1 - Math.pow(1 - x, 1 / 1.7));
    const d = 1 - x; // pushed-down fraction: 0.55u + 0.45u^2 = d
    return 0.5 * ((-0.55 + Math.sqrt(0.3025 + 1.8 * d)) / 0.9);
  }

  // Locomotion influence of the current move.
  getSpeedScale() {
    if (this.mode === MODES.CROSSOVER) return this.crossoverProgress < this.settings.xBounceAt ? this.settings.xSpeedScale : 1;
    if (this.mode === MODES.MOVE && this.move) return this.move.speedScale();
    return 1;
  }

  getDrive(mover) {
    return this.mode === MODES.MOVE && this.move ? this.move.drive(mover, this) : null;
  }

  // ---- helpers used by dribble moves ----------------------------------------

  get radius() { return this.ball.radius; }
  get right() { return this._right; }
  get fwd() { return this._fwd; }
  forward() { return this._forward(); }
  handLow() { return this._handLow(); }

  // Ball state in the body frame (lead removed), velocity relative to the body.
  captureBall() {
    const r = this.ball.radius, p = this.ball.position;
    const span = Math.max(0.05, this.top - r);
    const b0 = clamp01(1 - (p.y - r) / span);
    const rel = this._tmp.copy(p).sub(this._lastPos).addScaledVector(this._lead, -b0);
    const out = { lat: rel.dot(this._right), fwd: rel.dot(this._fwd), y: p.y };
    const v = this._tmp.copy(this.ball.velocity).sub(this._lastVel || this._tmp.set(0, 0, 0)).clampLength(0, 7);
    out.vlat = v.dot(this._right); out.vfwd = v.dot(this._fwd); out.vy = Math.max(-7, Math.min(5, this.ball.velocity.y));
    return out;
  }

  // Place the ball at a body-frame spot; returns how low it is (0 top .. 1 floor).
  place(lat, fwd, y, dt, leadScale = 1) {
    const r = this.ball.radius;
    const low = clamp01(1 - (y - r) / Math.max(0.05, this.top - r));
    this._toWorld(this._mover, lat, fwd, y, low * leadScale, this._ballPos);
    this.ball.place(this._ballPos, dt);
    return low;
  }

  // Hand rides the top of the ball; when the ball goes low it waits at hand
  // height above (waitLat, waitFwd). outward pushes the palm to the ball's outside.
  handFollow(side, waitLat, waitFwd, low, weight, outward = 0, lowOffset = 0) {
    const h = this._hand(side), r = this.ball.radius;
    const wait = this._toWorld(this._mover, waitLat, waitFwd, 0, 0, this._tmp);
    h.target.lerpVectors(this._ballPos, wait, low);
    if (outward) h.target.addScaledVector(this._right, side * outward * (1 - low));
    h.target.y = Math.max(this._handLow() + lowOffset, this._ballPos.y + r + this.settings.handAbove);
    h.weight = weight;
  }

  // Hand cups the ball from the outside (e.g. protecting it during a spin).
  handCup(side, outward, up, weight) {
    const h = this._hand(side);
    h.target.copy(this._ballPos).addScaledVector(this._right, side * outward);
    h.target.y += up;
    h.weight = weight;
  }

  handOff(side) { this._hand(side).weight = 0; }

  // Stop dribbling (e.g. the ball is gathered for a shot).
  stop() {
    if (this.currentMove) this.cancelMove();
    this.active = false;
  }

  // Start dribbling again with the ball in `hand`, at the top of the bounce.
  resume(hand = 'right') {
    this.active = true;
    this.hand = hand;
    this.mode = MODES.DRIBBLE;
    this.phase = 0;
    this.isCrossingOver = false;
    this.crossoverProgress = 0;
    this.cooldown = 0;
    this._x = null;
    this.move = null;
    this._frameYaw = null;
    this._lead.set(0, 0, 0);
    this._leadTarget.set(0, 0, 0);
  }

  // mover: { position, facing, velocity, speed, runSpeed, sprintSpeed }
  update(dt, mover) {
    this.crossoverCompleted = false;
    this.moveExited = null;
    for (const k in this.moves) this.moves[k].completed = false;
    if (!this.active) return;
    const s = this.settings;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this._burstT = Math.max(0, (this._burstT || 0) - dt);
    if (this.isCrossingOver && this.crossoverProgress >= this.settings.xBounceAt && !this._x.burst) {
      this._x.burst = true;
      this._burstT = this.settings.xBurstTime;
    }
    this.crossoverBurst = this._burstT / this.settings.xBurstTime;

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
    this._leadTarget.copy(mover.velocity).multiplyScalar(s.lead * this.leadScale).clampLength(0, s.maxLead);
    this._lead.lerp(this._leadTarget, dt === 0 ? 1 : 1 - Math.exp(-12 * dt));

    this._mover = mover;
    this.body.turnRoll = 1;     // only the spin turns this down
    if (this.mode === MODES.CROSSOVER) this._updateCrossover(dt, mover);
    else if (this.mode === MODES.MOVE) {
      if (this.move.update(dt, this, mover)) this._finishMove();
    } else this._updateDribble(dt, mover);
    this._smoothBody(dt);
  }

  _finishMove() {
    const m = this.move;
    this.hand = m.exitHand;
    m.finish();
    this.move = null;
    this.mode = MODES.DRIBBLE;
    this.phase = 0;           // ball is in the hand at the top of the dribble
    this.cooldown = ISO.OFFENSE.moves[m.name].cooldown || 0.1;
    this.moveExited = { name: m.name, strength: m.exitBurst };
  }

  // Body pose extras ease toward the requested values so switching between
  // moves (or back to the dribble) never snaps the body.
  _smoothBody(dt) {
    const k = dt > 0 ? 1 - Math.exp(-22 * dt) : 1;
    for (const key in this.body) this.bodyOut[key] += (this.body[key] - this.bodyOut[key]) * k;
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
    this.body.sway = 0;
    this.body.jab = 0;
    this.body.stride = 1;
    this.body.forward = 0;
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
      dur: this.settings.xDuration * this.execScale,
    };

    this.mode = MODES.CROSSOVER;
    this.isCrossingOver = true;
    this.crossoverDirection = -from;
    this.crossoverFakeDirection = from;
    this.crossoverProgress = 0;
    this.crossoverWorldDir.copy(this._right).multiplyScalar(-from);
  }

  _updateCrossover(dt, mover) {
    const s = this.settings;
    const r = this.ball.radius;
    const x = this._x;
    x.t += dt;
    const u = Math.min(1, x.t / x.dur);
    this.crossoverProgress = u;
    this.crossoverWorldDir.copy(this._right).multiplyScalar(-x.from);
    this.crossoverFakeWorldDir.copy(this._right).multiplyScalar(x.from);

    const to = -x.from;
    const lat1 = s.side * to;
    const fwd1 = this._forward();
    const uc = s.xBounceAt;

    // Height: a hard, fast push down to the floor, then a rebound into the
    // other hand. Cubic Hermite segments keep the motion continuous with
    // whatever the ball was doing when the move started.
    let y;
    if (u < uc) {
      const v = u / uc, T = x.dur * uc;
      y = hermite(x.y0, x.vy0 * T, r, -s.xImpactSpeed * T, v);
    } else {
      const v = (u - uc) / (1 - uc), T = x.dur * (1 - uc);
      y = hermite(r, s.xReboundSpeed * T, this.top, 0, v);
    }
    y = Math.max(r, y);

    // Sideways: the ball crosses mostly while it's low (around the bounce),
    // carries a little past the receiving hand, then settles into it.
    const e = smoothstep(uc - 0.3, uc + 0.28, u);
    const after = clamp01((u - uc) / (1 - uc));
    const lat = lerp(x.lat0, lat1, e) + lat1 * s.xOvershoot * Math.sin(Math.PI * after);
    // Forward: bulges out so the ball bounces well in front of the feet.
    const w = u < uc ? 0.5 * u / uc : 0.5 + 0.5 * after;
    const bounceFwd = s.xBounceForward + 0.1 * this._runAmt;
    const fwd = lerp(x.fwd0, fwd1, e) + Math.max(0, bounceFwd - lerp(x.fwd0, fwd1, 0.5)) * Math.sin(Math.PI * w);
    const floorness = clamp01(1 - (y - r) / Math.max(0.05, this.top - r));
    this._toWorld(mover, lat, fwd, y, floorness, this._ballPos);
    this.ball.place(this._ballPos, dt);

    // Passing hand slaps the ball down and across, then lets go early.
    const handLow = this._handLow();
    const fromHand = this._hand(x.from);
    fromHand.target.copy(this._ballPos);
    fromHand.target.y = Math.max(handLow, y + r + s.handAbove);
    fromHand.weight = 1 - smoothstep(0.15, 0.42, u);

    // Receiving hand is already out wide waiting over the catch spot, then
    // rides the ball up into the dribble.
    const toHand = this._hand(to);
    const catchPt = this._toWorld(mover, lat1 * (1 + s.xOvershoot * 0.6), fwd1, 0, 0, this._tmp);
    toHand.target.lerpVectors(this._ballPos, catchPt, u < uc ? 1 : floorness);
    toHand.target.y = Math.max(handLow, y + r + s.handAbove);
    toHand.weight = smoothstep(0.05, 0.32, u);

    // Body: sell the fake toward the ball side (shoulder, lean, hips and a
    // jab step), then whip the weight over to the receiving side. Every curve
    // returns to the normal dribble values at the end so nothing snaps.
    const fake = bell(u, 0, 0.36);          // early: toward the ball side
    const shift = bell(u, 0.25, 1.0);       // later: toward the new side
    this.body.crouch = 1.3 * Math.sin(Math.PI * u);
    this.body.twist = lerp(0.06 * x.from, 0.06 * to, e) + 0.2 * x.from * fake + 0.18 * to * shift;
    this.body.roll = 0.12 * x.from * fake + 0.14 * to * shift;
    this.body.sway = 0.07 * x.from * fake + 0.1 * to * shift;   // hips, meters (+ = character right)
    this.body.jab = x.from * bell(u, 0.02, 0.4);                // ball-side foot jabs out
    this.body.stride = 1;
    this.body.forward = 0;

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
    this.moveExited = { name: 'crossover', strength: 1 };
  }

  // ---- shared helpers ---------------------------------------------------------

  // Body frame from a facing that turns at a limited rate.
  _updateFrame(dt, mover) {
    if (this._frameYaw === null || dt === 0 || (this.mode === MODES.MOVE && this.move && this.move.exactFrame)) {
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
    this._lastVel = mover.velocity;
    this._mover = mover;
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
    return { hands: this.hands, body: this.bodyOut };
  }
};

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(a, b, v) { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
// 0 -> 1 -> 0 hump between a and b.
function bell(v, a, b) { const t = clamp01((v - a) / (b - a)); return Math.sin(Math.PI * t) ** 2; }
// Cubic Hermite: p0 -> p1 with end tangents m0, m1 (already scaled by duration).
function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
})();
