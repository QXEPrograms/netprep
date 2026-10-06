// Defender: a second player on defense.
//
//   brain (decides)            DefenderAI (CPU)  or  DefenseInputMapper (human, later)
//        | intent { velocity, faceTarget, allowRun }
//   DefensiveLocomotion        movement, momentum, facing assist
//        |
//   pose (stance, slides, hands, jump) -> PlayerModel (same model as the offense,
//                                         different colors, defensive poses)
//
// The brain is swappable: setControl('human') makes the same locomotion,
// facing assist and animations run from WASD-style input (see humanInput).
//
// Contest values are computed every frame (ContestTracker) and exposed here;
// they do NOT change shot accuracy yet.
(function () {
const H = ISO.CONFIG.hoop;

// ---------------------------------------------------------------------------
// ContestTracker: how well the defender is contesting the current shot.
//   isContesting, contestDistance (m), contestAngle (rad, 0 = straight in front
//   between shooter and rim), contestTiming (0..1 hand up at the release),
//   contestHandHeight (m), contestStrength (0 open .. 1 smothered),
//   atRelease: a copy of the values at the moment the ball left the hand.
// ---------------------------------------------------------------------------
ISO.ContestTracker = class {
  constructor(defender) {
    this.defender = defender;
    this.cfg = ISO.DEFENSE.contest;
    this.isContesting = false;
    this.contestDistance = 0;
    this.contestAngle = 0;
    this.contestTiming = 0;
    this.contestHandHeight = 0;
    this.contestStrength = 0;
    this.atRelease = null;
    this.releaseCount = 0;
    this._h = new THREE.Vector3();
  }

  update() {
    const d = this.defender, P = d.opponent, sh = P.shooting, fi = P.finishing;
    const shotLive = (sh.isShooting && sh.shotCommitted) || fi.busy;
    const released = (sh.shotReleased) || (fi.shotReleased);
    const D = d.locomotion.position, S = P.locomotion.position;
    const c = this.cfg;
    const dx = D.x - S.x, dz = D.z - S.z;
    const dist = Math.hypot(dx, dz);
    const rx = 0 - S.x, rz = H.centerZ - S.z, rl = Math.hypot(rx, rz) || 1;
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * rx + dz * rz) / (Math.max(1e-4, dist) * rl))));
    const facingErr = Math.abs(d.locomotion.defensiveFacingError);
    const hand = d.getContestHandWorld(this._h);

    // Factors (all 0..1)
    const distF = smoothstep(c.farDist, c.nearDist, dist);
    const posF = 0.08 + 0.92 * Math.pow((1 + Math.cos(angle)) / 2, 0.8);     // front 1, beside ~.55, behind ~.1
    const faceF = 0.55 + 0.45 * Math.max(0, Math.cos(facingErr));
    const ballY = P.ball.position.y;
    const handF = Math.max(0, Math.min(1, (hand.y - 1.6) / Math.max(0.3, ballY + 0.15 - 1.6)));
    const timing = d.handRaise;
    const jumpF = d.jumpY > 0.08 ? Math.min(1, d.jumpY / c.jumpHeight) : 0;
    let strength = distF * posF * faceF * (c.base + c.hand * handF * (0.4 + 0.6 * timing)) + c.jumpBonus * jumpF * distF * posF;
    strength = Math.max(0, Math.min(1, strength));

    this.isContesting = shotLive && d.handRaise > 0.3 && distF > 0;
    this.contestDistance = dist;
    this.contestAngle = angle;
    this.contestTiming = timing;
    this.contestHandHeight = hand.y;
    this.contestStrength = shotLive || released ? strength : 0;
    if (released) {
      this.releaseCount++;
      this.atRelease = {
        shotType: sh.shotReleased ? sh.shotType : fi.shotType,
        distance: +dist.toFixed(2), angle: +angle.toFixed(2), timing: +timing.toFixed(2),
        handHeight: +hand.y.toFixed(2), jumped: d.jumpY > 0.08, strength: +strength.toFixed(2),
      };
    }
  }
};

// ---------------------------------------------------------------------------
ISO.DefenderController = class {
  constructor({ opponent, ball, camera, startPosition, startFacing = 0 }) {
    this.opponent = opponent;           // the ball handler's PlayerController
    this.ball = ball;
    this.camera = camera;
    this.locomotion = new ISO.DefensiveLocomotion();
    this.locomotion.position.copy(startPosition);
    this.locomotion.facing = startFacing;
    this.model = new ISO.PlayerModel({ jersey: 0x2f6fe0, trim: 0xf4f6fa, skin: 0x6b4428, shoes: 0x1b2333, number: '3' });
    this.ai = new ISO.DefenderAI(this);
    this.inputMapper = new ISO.DefenseInputMapper();
    this.contest = new ISO.ContestTracker(this);
    this.contact = new ISO.PlayerContact();

    this.control = 'cpu';               // 'cpu' | 'human'
    this.humanInput = { x: 0, y: 0, sprint: false };

    // Body extras
    this.jumpY = 0;
    this.isJumping = false;
    this._jumpT = 0;
    this.handRaise = 0;                 // 0..1 contest hand up
    this.handsUp = 0;
    this.jumpCount = 0;

    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 1 },
      { side: -1, target: new THREE.Vector3(), weight: 1 },
    ];
    this.body = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0, stride: 1, forward: 0, turnRoll: 0.4 };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._basket = new THREE.Vector3(0, 0, H.centerZ);
    this.update(0);
    this.updateVisual(0);
  }

  get position() { return this.locomotion.position; }
  get object() { return this.model.root; }
  get state() { return this.control === 'cpu' ? this.ai.state : 'human'; }

  setControl(mode) { this.control = mode; }

  // Put the defender somewhere (tests, future possession resets): standing,
  // facing the ball handler, with a fresh view of the play.
  reset(position) {
    const L = this.locomotion, O = this.opponent.locomotion.position;
    L.position.copy(position);
    L.velocity.set(0, 0, 0);
    L.facing = Math.atan2(O.x - position.x, O.z - position.z);
    L.turnSpeed = 0; L.mode = 'stance'; L.isPlanting = false; L.speedScale = 1;
    this.isJumping = false; this.jumpY = 0; this.handRaise = 0;
    const ai = this.ai;
    ai._buf.length = 0; ai.perceived = ai.prevPerceived = null; ai._perceivedT = ai.time;
    ai._recentFakes.length = 0; ai._recentCrossovers.length = 0; ai._lastCrossoverSeen = -99;
    ai.state = 'guarding'; ai.stateTime = 0; ai.bite = null; ai.freeze = 0; ai._carry = 0; ai._spinBlind = null;
    this.inputMapper.holdDist = null;
  }

  // Brain + movement. Call before the ball handler moves this frame.
  update(dt) {
    const L = this.locomotion;
    this.ai.observe(dt);
    let intent;
    if (this.control === 'human') {
      const opp = this.opponent.locomotion.position;
      intent = this.inputMapper.map(this.humanInput, this.camera, L, opp, this._basket, this.humanInput.sprint);
      this.handsUp = 0.35;
    } else {
      intent = this.ai.update(dt);
      this.handsUp = this.ai.handsUp;
      if (this.ai.wantJump && !this.isJumping) this._startJump();
    }
    // Airborne: no new movement (keep a little drift).
    if (this.isJumping) { intent.velocity.copy(L.velocity).multiplyScalar(0.9); intent.allowRun = false; }
    L.update(dt, intent);
    this._updateJump(dt);
    const k = dt > 0 ? Math.min(1, dt / ISO.DEFENSE.contest.handRaiseTime) : 1;
    const wantRaise = this.handsUp >= 0.85 ? 1 : 0;
    this.handRaise += (wantRaise - this.handRaise) * Math.min(1, k * 2.2);
  }

  // Soft body contact with the ball handler (call right after the ball
  // handler's movement, before their ball handling).
  resolveContact(dt) {
    this.contact.overlap = 0;
    const b = this.ball;
    const dribbled = this.opponent.hasBall && b.mode !== ISO.Basketball.MODES.FREE && b.position.y < 1.4 ? b.position : null;
    return this.contact.resolve(this.opponent.locomotion, this.locomotion, dt, dribbled);
  }

  // Contest values + pose. Call after the ball handler's update this frame.
  updateVisual(dt) {
    this.contest.update();
    const L = this.locomotion;
    this.model.update(dt, this._modelState(), this._pose());
  }

  _startJump() {
    this.isJumping = true;
    this._jumpT = 0;
    this.jumpCount++;
  }

  _updateJump(dt) {
    if (!this.isJumping) { this.jumpY = 0; return; }
    const c = ISO.DEFENSE.contest;
    this._jumpT += dt;
    const u = this._jumpT / c.jumpTime;
    this.jumpY = u < 1 ? c.jumpHeight * 4 * u * (1 - u) : 0;
    if (u >= 1) this.isJumping = false;
  }

  // World position of the contest hand (the one on the ball side).
  getContestHandWorld(out) {
    const side = this._ballSide();
    return this.model.getHandWorld(side, out);
  }

  // Which of the defender's hands is on the ball's side (+1 right, -1 left).
  _ballSide() {
    const L = this.locomotion, b = this.ball.position;
    const rx = -Math.cos(L.facing), rz = Math.sin(L.facing);
    return ((b.x - L.position.x) * rx + (b.z - L.position.z) * rz) >= 0 ? 1 : -1;
  }

  _modelState() {
    const L = this.locomotion;
    // The model's run cycle is only used while running; in stance the
    // defensive leg pose replaces it.
    return {
      position: L.position, facing: L.facing, velocity: L.velocity,
      speed: L.mode === 'run' ? L.speed : Math.min(L.speed, 1.2),
      runSpeed: 5, sprintSpeed: 7.2, sprinting: false,
      turnSpeed: L.turnSpeed,
    };
  }

  _pose() {
    const L = this.locomotion, b = this.body;
    const f = L.facing;
    const fwd = this._fwd.set(Math.sin(f), 0, Math.cos(f));
    const right = this._right.set(-Math.cos(f), 0, Math.sin(f));
    const run = L.mode === 'run';
    const P = L.position, jy = this.jumpY;
    const at = (lat, fw, y, out) => out.copy(P).addScaledVector(right, lat).addScaledVector(fwd, fw).setY(y + jy);
    const bs = this._ballSide();
    const raise = this.handRaise;
    const [hr, hl] = this.hands;
    // Active hands: wide and low, ball-side hand a little higher; contest:
    // ball-side hand straight up toward the shooter, the other up as a wall.
    for (const h of this.hands) {
      const ball = h.side === bs;
      const lat = h.side * lerp(0.48, ball ? 0.16 : 0.42, raise);
      const fw = lerp(0.28, ball ? 0.32 : 0.3, raise);
      const y = lerp(ball ? 1.22 + 0.15 * Math.min(1, this.handsUp * 2) : 1.02, ball ? 2.45 : 1.75, raise);
      at(lat, fw, y, h.target);
      h.weight = run ? 0 : 1;
    }
    // Keep the hands out of the ball handler's chest when they're right on top of us.
    const om = this.opponent.model;
    om.root.updateMatrixWorld(true);
    for (const h of this.hands) pushOutOfBox(h.target, om.torso, 0.26, 0.22 + 0.07, 0.25, 0.12 + 0.07, this._tmp);
    b.crouch = run ? 0.2 : 1.25 - 0.9 * raise;
    b.twist = 0; b.roll = 0; b.sway = 0; b.jab = 0; b.forward = 0; b.stride = 1;
    b.turnRoll = 0.4;
    return {
      dribble: { hands: this.hands, body: b, stance: run ? 0.3 : 1 },
      defense: {
        lateral: L.lateralSpeed, forward: L.forwardSpeed, run, jumpY: jy,
        contest: raise, planting: L.isPlanting,
      },
    };
  }
};

// If a world point is inside an object's box (center y cy, half sizes hx/hy/hz
// in the object's local frame), move it out through the nearest side face.
function pushOutOfBox(p, obj, cy, hx, hy, hz, tmp) {
  const q = obj.worldToLocal(tmp.copy(p));
  q.y -= cy;
  const ox = hx - Math.abs(q.x), oy = hy - Math.abs(q.y), oz = hz - Math.abs(q.z);
  if (ox <= 0 || oy <= 0 || oz <= 0) return;
  if (ox < oz) q.x = Math.sign(q.x || 1) * hx; else q.z = Math.sign(q.z || 1) * hz;
  q.y += cy;
  p.copy(obj.localToWorld(q));
}
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
})();
