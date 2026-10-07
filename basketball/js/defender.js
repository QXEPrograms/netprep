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
// Physical defense: the jump lives in DefensiveLocomotion, the hands carry
// collision spheres (BlockSystem, blocking.js) and the contest is computed
// deterministically from player state (ContestTracker). The shooting systems
// read the contest at the release to widen their aim spread.
(function () {
const H = ISO.CONFIG.hoop;

// ---------------------------------------------------------------------------
// ContestTracker: how much the defender is bothering the current shot,
// computed deterministically from visible player state (no randomness):
//   - the ball's actual position (its early path toward the rim is the
//     "release lane"; before release, the ball in the shooter's hands)
//   - defender body distance to the ball and where it is (front/beside/behind)
//   - whether the chest faces the shooter
//   - how close a real hand is to that release lane (so release side, height
//     and reach all matter: a hand on the wrong side or behind is far from it)
//   - whether that hand is up on a jump
// Values: isContesting, contestDistance, contestAngle, contestTiming (arm
// raise 0..1), contestHandHeight, contestHandDistance, contestStrength (0..1),
// atRelease (a copy at the moment the ball left the hand).
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
    this.contestHandDistance = Infinity;
    this.contestStrength = 0;
    this.atRelease = null;
    this.releaseCount = 0;
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
  }

  // Contest strength right now (0..1), plus the parts, from player state only.
  evaluate() {
    const d = this.defender, P = d.opponent, c = this.cfg, L = d.locomotion;
    const ball = P.ball.position;
    // release lane: from the ball (a little above it while still in the hands)
    // toward the rim, rising
    const p0 = this._p0.copy(ball);
    if (P.ball.mode !== ISO.Basketball.MODES.FREE) p0.y += ISO.DEFENSE.arms.anticipate * 0.5;
    let ux = 0 - p0.x, uz = H.centerZ - p0.z;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const p1 = this._p1.set(p0.x + ux * c.pathLength, p0.y + c.pathRise, p0.z + uz * c.pathLength);
    const dx = L.position.x - p0.x, dz = L.position.z - p0.z;
    const dist = Math.hypot(dx, dz);
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * ux + dz * uz) / Math.max(1e-4, dist))));
    const distF = smoothstep(c.farDist, c.nearDist, dist);
    const posF = 0.08 + 0.92 * Math.pow((1 + Math.cos(angle)) / 2, 0.8);    // front 1, beside ~.55, behind ~.1
    const faceF = 0.5 + 0.5 * Math.max(0, Math.cos(L.defensiveFacingError));
    // nearest real hand to the release lane
    let handDist = Infinity, handY = 0;
    for (const h of d.blocks.hands) {
      const hd = segDist(h.cur, p0, p1) - h.radius;
      if (hd < handDist) { handDist = hd; handY = h.cur.y; }
    }
    const handF = smoothstep(c.handFar, c.handNear, handDist);
    const jumpF = Math.min(1, L.jumpHeight / 0.4);
    const strength = Math.max(0, Math.min(1,
      c.body * distF * posF * faceF + c.hand * handF * faceF + c.jumpBonus * handF * jumpF));
    return { strength, dist, angle, handDist, handY, handF, jumpF };
  }

  update() {
    const d = this.defender, P = this.defender.opponent, sh = P.shooting, fi = P.finishing;
    const shotLive = (sh.isShooting && sh.shotCommitted) || fi.busy;
    const released = sh.shotReleased || fi.shotReleased;
    const e = this.evaluate();
    this.contestDistance = e.dist;
    this.contestAngle = e.angle;
    this.contestTiming = d.handRaise;
    this.contestHandHeight = e.handY;
    this.contestHandDistance = e.handDist;
    this.contestStrength = shotLive || released ? e.strength : 0;
    this.isContesting = shotLive && e.strength > 0.1 && (e.handF > 0.2 || e.jumpF > 0.2);
  }

  // Called by the shooting/finishing systems at the release (the value they
  // use for accuracy) — also stored for the debug panel/tests.
  atReleaseValue(shotType) {
    const e = this.evaluate();
    this.releaseCount++;
    this.atRelease = {
      shotType, strength: +e.strength.toFixed(3), distance: +e.dist.toFixed(2), angle: +e.angle.toFixed(2),
      handDistance: +e.handDist.toFixed(2), handHeight: +e.handY.toFixed(2), timing: +this.defender.handRaise.toFixed(2),
      jumped: this.defender.locomotion.jumpHeight > 0.05, jumpHeight: +this.defender.locomotion.jumpHeight.toFixed(2),
    };
    return e.strength;
  }
};

// ---------------------------------------------------------------------------
ISO.DefenderController = class {
  constructor({ opponent, ball, camera, startPosition, startFacing = 0, model = null, playerId = null }) {
    this.playerId = playerId;
    // The assignment: the offensive player (their PlayerController) this
    // defender guards. Set by player id through Roster.linkMatchup, so it
    // follows whoever has the ball after a possession change.
    this.opponent = opponent;
    this.ball = ball;
    this.camera = camera;
    this.locomotion = new ISO.DefensiveLocomotion();
    this.locomotion.position.copy(startPosition);
    this.locomotion.facing = startFacing;
    this.model = model || new ISO.PlayerModel({ jersey: 0x2f6fe0, trim: 0xf4f6fa, skin: 0x6b4428, shoes: 0x1b2333, number: '3' });
    if (ball) this.model.ball = ball;
    this.ai = new ISO.DefenderAI(this);
    this.inputMapper = new ISO.DefenseInputMapper();
    this.contest = new ISO.ContestTracker(this);
    this.contact = new ISO.PlayerContact();
    this.blocks = new ISO.BlockSystem({ ball, world: ball.world, events: null, defender: this });

    // Who supplies the intent: 'cpu' (DefenderAI) or 'human' (humanInput,
    // filled each frame by a keyboard source now, a network source later).
    this.control = 'cpu';
    // Plain, serializable input intent for a human/remote defender.
    this.humanInput = { x: 0, y: 0, sprint: false, jump: false, handsUp: false, steal: false };
    this.lastIntent = null;
    // Steals / balance / ankle breaks (defense-interactions.js)
    this.balance = new ISO.DefensiveBalance(this);
    this.reach = null;                  // { phase: windup|active|recover, t, side (+1 right hand), dir, contacted, won }
    this._reachIdle = 99;               // s since the last reach ended
    this.reachCount = 0;
    this.lastReachResult = '-';
    this.reactionLevel = 0;             // 0 none, 1 stumble, 2 stagger, 3 fall (while it lasts)
    this._wasReacting = false;
    this._reachT = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    // Possession transitions: no new intent (CPU or human) — the body just
    // settles in its stance, facing its man.
    this.frozen = false;
    this._still = { velocity: new THREE.Vector3(), faceTarget: new THREE.Vector3(), allowRun: false, jump: false };

    // Arms
    this.handRaise = 0;                 // 0..1 how far the contest arm is up (time-limited)
    this.handsUp = 0;

    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 1 },
      { side: -1, target: new THREE.Vector3(), weight: 1 },
    ];
    this.body = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0, stride: 1, forward: 0, turnRoll: 0.4 };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._sh = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._reach = new THREE.Vector3();
    this._basket = new THREE.Vector3(0, 0, H.centerZ);
    this.update(0);
    this.updateVisual(0);
  }

  get position() { return this.locomotion.position; }
  get object() { return this.model.root; }
  get state() { return this.control === 'cpu' ? this.ai.state : 'human'; }

  setControl(mode) { this.control = mode; }

  // Put the defender somewhere (possession resets, tests): standing in
  // stance, facing their man, feet on the floor, hands down and inactive,
  // with a fresh view of the play (nothing carried over from before).
  reset(position) {
    this.model.resetContinuity();       // no motion history across the reset
    const L = this.locomotion, O = this.opponent.locomotion.position;
    L.position.copy(position);
    L.velocity.set(0, 0, 0);
    L.facing = Math.atan2(O.x - position.x, O.z - position.z);
    L.turnSpeed = 0; L.mode = 'stance'; L.isPlanting = false; L.speedScale = 1; L._plantT = 0;
    L.sprinting = false; L.lateralSpeed = 0; L.forwardSpeed = 0;
    L.jumpState = 'ground'; L.jumpHeight = 0; L.verticalVelocity = 0; L.jumpTime = 0; L._carryRun = false;
    this.handRaise = 0; this.handsUp = 0; this._contestReach = null;
    if (this.hands) for (const h of this.hands) { h.contestReach = null; h.sideW = undefined; }
    const ai = this.ai;
    ai._buf.length = 0; ai.perceived = ai.prevPerceived = null; ai._perceivedT = ai.time;
    ai._recentFakes.length = 0; ai._recentCrossovers.length = 0; ai._lastCrossoverSeen = -99;
    ai.state = 'guarding'; ai.stateTime = 0; ai.bite = null; ai.freeze = 0; ai._carry = 0; ai._spinBlind = null;
    ai.wantJump = false; ai.handsUp = 0; ai._jumpDecision = null; ai._lastShotSeen = -99;
    ai.intent.velocity.set(0, 0, 0);
    Object.assign(this.humanInput, { x: 0, y: 0, sprint: false, jump: false, handsUp: false });
    const c = this.contest;
    c.isContesting = false; c.contestStrength = 0; c.contestTiming = 0; c.contestHandDistance = Infinity;
    this.blocks.clear();
    // steal reach, broken balance and the body tilt never carry over
    this.reach = null; this._reachIdle = 99; this.lastReachResult = '-';
    L.reaction = null; L.turnScale = 1; this.reactionLevel = 0; this._wasReacting = false;
    L.acceleration.set(0, 0, 0); L._prevV.set(0, 0, 0);
    this.balance.reset();
    this.model.root.rotation.x = 0; this.model.root.rotation.z = 0;
    ai.wantReach = false;
  }

  // Role change: this player stops defending (hands can never block again
  // until the next reset puts them back on defense).
  deactivate() {
    // standing, feet down, hands down, no contest/closeout/jump/AI read left over
    this.reset(this.locomotion.position.clone());
    this.frozen = false;
  }

  get jumpY() { return this.locomotion.jumpHeight; }
  get isJumping() { return this.locomotion.jumpState === 'load' || this.locomotion.jumpState === 'air'; }
  get jumpCount() { return this.locomotion.jumpCount; }

  // Brain -> intent -> character simulation. Call before the ball handler
  // moves this frame. Both brains produce the same kind of intent; the CPU
  // can only *ask* to jump or raise its hands, exactly like a human.
  update(dt) {
    const L = this.locomotion;
    let intent, handsUp;
    if (this.frozen) {
      intent = this._still;
      intent.velocity.set(0, 0, 0);
      intent.faceTarget.copy(this.opponent.locomotion.position);
      intent.jump = false;
      handsUp = false;
      this.humanInput.jump = false;
      this.humanInput.steal = false;
    } else if (this.control === 'human') {
      this.ai.observe(dt);
      const hi = this.humanInput, opp = this.opponent.locomotion.position;
      intent = this.inputMapper.map(hi, this.camera, L, opp, this._basket, hi.sprint);
      intent.jump = !!hi.jump;
      hi.jump = false;                                   // an edge: one jump per press
      handsUp = !!hi.handsUp;
      if (hi.steal) this.requestReach();                 // reach is an edge too
      hi.steal = false;
    } else {
      this.ai.observe(dt);
      intent = this.ai.update(dt);
      intent.jump = this.ai.wantJump;
      handsUp = this.ai.handsUp >= 0.85;
      if (this.ai.wantReach) this.requestReach();        // the CPU only ASKS to reach
    }
    // A reach commits the body: slower feet, slower turning, no jump.
    const S = ISO.DEFENSE.steal;
    if (this.control !== 'cpu' || this.frozen) L.speedScale = 1;   // (the CPU brain sets its own each frame)
    if (this.reach) { L.speedScale *= S.reachSpeedScale; L.turnScale = 0.6; intent.jump = false; } else L.turnScale = 1;
    if (L.reaction) handsUp = false;
    this.lastIntent = { moveX: +intent.velocity.x.toFixed(3), moveZ: +intent.velocity.z.toFixed(3), sprint: !!intent.allowRun, jump: !!intent.jump, handsUp };
    L.update(dt, intent);
    this._updateReach(dt);
    this.balance.update(dt);
    if (this._wasReacting && !L.reaction) { this.balance.afterReaction(); this.reactionLevel = 0; }
    this._wasReacting = !!L.reaction;
    // Arms go up on a jump (that's the contest) or when asked; they take time.
    const A = ISO.DEFENSE.arms;
    const want = handsUp || L.jumpState === 'load' || L.jumpState === 'air';
    this.handsUp = want ? 1 : 0;
    const rate = dt / (want ? A.raiseTime : A.lowerTime);
    this.handRaise = Math.max(0, Math.min(1, this.handRaise + (want ? rate : -rate)));
  }

  // ---- steal reach ------------------------------------------------------------

  // Start a reach at the ball (human key / CPU decision). The hand is picked
  // from where the ball is relative to the defender's chest.
  requestReach() {
    const S = ISO.DEFENSE.steal, L = this.locomotion;
    if (this.reach || this._reachIdle < S.minInterval || L.reaction || L.jumpState !== 'ground' || this.frozen) return false;
    const b = this.ball.position, f = L.facing;
    const rx = -Math.cos(f), rz = Math.sin(f);                  // character right
    let lat = (b.x - L.position.x) * rx + (b.z - L.position.z) * rz;
    if (Math.abs(lat) < 0.06) {
      // ball dead ahead: attack the ball handler's dribble hand (their right is my left, face to face)
      lat = this.opponent.dribble && this.opponent.dribble.hand === 'left' ? 1 : -1;
    }
    const side = lat >= 0 ? 1 : -1;
    const dir = new THREE.Vector3(b.x - L.position.x, 0, b.z - L.position.z);
    if (dir.lengthSq() < 1e-6) dir.set(Math.sin(f), 0, Math.cos(f));
    dir.normalize();
    this.reach = { phase: 'windup', t: 0, side, dir, contacted: false, won: false };
    this.reachCount++;
    if (this.blocks.events) this.blocks.events.emit('stealAttempt', { defenderPlayerId: this.playerId, hand: side > 0 ? 'right' : 'left' });
    return true;
  }

  _updateReach(dt) {
    const S = ISO.DEFENSE.steal, r = this.reach;
    if (!r) { this._reachIdle += dt; return; }
    r.t += dt;
    if (r.phase !== 'recover') {
      const b = this.ball.position, P = this.locomotion.position;
      const d = this._reachT.set(b.x - P.x, 0, b.z - P.z);
      if (d.lengthSq() > 1e-6) r.dir.lerp(d.normalize(), Math.min(1, 12 * dt)).normalize();
    }
    if (r.phase === 'windup' && r.t >= S.windup) { r.phase = 'active'; r.t = 0; }
    else if (r.phase === 'active' && r.t >= S.active) {
      if (!r.won) {
        // came up empty (or only touched a protected ball): the weight stays out there
        this.balance.failedReach(r.dir);
        if (!r.contacted) this.lastReachResult = 'miss';
        if (!r.contacted && this.blocks.events) this.blocks.events.emit('reachResult', { defenderPlayerId: this.playerId, result: 'miss' });
      }
      r.phase = 'recover'; r.t = 0;
    } else if (r.phase === 'recover' && r.t >= S.recover) { this.reach = null; this._reachIdle = 0; }
  }

  // 0..1 how far the reach arm is out (for the pose and the weight shift)
  get reachExtent() {
    const S = ISO.DEFENSE.steal, r = this.reach;
    if (!r) return 0;
    return r.phase === 'windup' ? 0.55 * r.t / S.windup : r.phase === 'active' ? 1 : Math.max(0, 1 - r.t / S.recover);
  }

  // ---- balance broken ------------------------------------------------------------

  // level 1 stumble, 2 stagger (ankle break), 3 fall; dir = where the weight was going
  applyReaction(level, dir) {
    const A = ISO.DEFENSE.ankleBreak, L = this.locomotion;
    L.reaction = { level, t: 0, duration: A.duration[level], dir: dir.clone().setY(0).normalize(),
      carrySpeed: Math.max(1.6, L.speed) * A.carry[level], inputShare: A.inputShare[level] };
    this.reach = null; this._reachIdle = 0;
    this.reactionLevel = level;
    this.balance.balance = Math.min(this.balance.balance, 0.2);
  }

  // Soft body contact with the ball handler (call right after the ball
  // handler's movement, before their ball handling).
  resolveContact(dt) {
    this.contact.overlap = 0;
    const b = this.ball;
    const dribbled = this.opponent.hasBall && b.mode !== ISO.Basketball.MODES.FREE && b.position.y < 1.4 ? b.position : null;
    return this.contact.resolve(this.opponent.locomotion, this.locomotion, dt, dribbled, this.opponent.airborne, this.locomotion.airborne);
  }

  // Pose, hand colliders, contest. Call after the ball handler's update and
  // before the ball's physics step this frame (so the hands are where they
  // are drawn when the ball moves).
  updateVisual(dt) {
    this.model.update(dt, this._modelState(), this._pose(dt));
    // Hand colliders are live only during a real defensive action: a jump or
    // raised hands. Lowered "active hands" never block.
    const L = this.locomotion;
    const live = (L.jumpState === 'air' || L.jumpState === 'load' || this.handRaise > 0.5) && L.mode !== 'run' && !L.reaction;
    this.blocks.sync(dt, [live, live]);
    this.blocks.checkHeld(this.opponent);
    this.contest.update();
  }

  // World position of the contest hand (the one on the ball side).
  getContestHandWorld(out) {
    if (this.blocks) return out.copy(this.blocks.hands[this._ballSide() > 0 ? 0 : 1].cur);
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

  _pose(dt = 0) {
    const L = this.locomotion, b = this.body;
    const f = L.facing;
    const fwd = this._fwd.set(Math.sin(f), 0, Math.cos(f));
    const right = this._right.set(-Math.cos(f), 0, Math.sin(f));
    const run = L.mode === 'run';
    const P = L.position, jy = this.jumpY;
    const at = (lat, fw, y, out) => out.copy(P).addScaledVector(right, lat).addScaledVector(fwd, fw).setY(y + jy);
    const bs = this._ballSide();
    const raise = this.handRaise;
    this._closeToOpponent = P.distanceTo(this.opponent.locomotion.position) < 1.1;
    const A = ISO.DEFENSE.arms;
    // Contest arm: reach from the shoulder toward the ball (above it while it's
    // still in the shooter's hands), leaning up. The target is deliberately
    // past arm's length: the arm IK stops at the real shoulder/elbow reach, so
    // the hand can never stretch to the ball — it only points at it.
    const ball = this.ball.position;
    const aim = this._aim.copy(ball);
    const free = this.ball.mode === ISO.Basketball.MODES.FREE;
    // a finish at the rim (in the hands, or just released): reach at the ball
    const fi = this.opponent && this.opponent.finishing;
    const finish = ISO.OFFENSE.finishBlockLegacy ? false : free ? (this.ball.flightKind === 'shot' && /^(layup|dunk|floater)$/.test(this.ball.shotKind) && this.ball.freeTime < 0.6)
      : !!(fi && fi.busy && !fi.ballReleased);
    if (!free) aim.y += finish ? A.anticipateFinish : A.anticipate;
    const aimUp = finish ? A.aimUpFinish : free ? A.aimUpFree : A.aimUp;
    // Which hand is on the ball side blends over ~60 ms instead of flipping
    // the instant the ball crosses the defender's nose (Step 16.5: the hands
    // used to jump 28 cm in one frame there).
    // (only the low guard hands blend: once hands can block, the switch is
    // instant, exactly as before — those hands are gameplay colliders)
    const handsLive = L.jumpState === 'air' || L.jumpState === 'load' || this.handRaise > 0.3;
    const kSide = dt > 0 && !handsLive ? 1 - Math.exp(-16 * dt) : 1;
    for (const h of this.hands) {
      const wantSide = h.side === bs ? 1 : 0;
      h.sideW = h.sideW === undefined || dt === 0 ? wantSide : h.sideW + (wantSide - h.sideW) * kSide;
      const sw = h.sideW;
      // low "active hands"
      at(h.side * 0.48, 0.28, 1.02 + 0.28 * sw, h.target);
      if (raise > 0) {
        const arm = this.model.arms.find((a) => a.side === -h.side);
        const sh = arm.shoulder.getWorldPosition(this._sh);
        // other arm: partly up, a wall
        const wall = at(h.side * 0.36, 0.3, 0, this._reach);
        wall.y = sh.y + 0.3;
        if (sw > 0.01) {
          const dir = this._dir.copy(aim).sub(sh).normalize();
          dir.y += aimUp; dir.normalize();
          // the arm swings toward that direction at a hand's speed, not instantly
          const want = this._tmp2.copy(sh).addScaledVector(dir, 0.95);
          if (!h.contestReach || raise < 0.05 || dt === 0) h.contestReach = want.clone();
          else {
            const step = this._tmp.copy(want).sub(h.contestReach), len = step.length(), max = A.handSpeed * dt;
            h.contestReach.addScaledVector(step, len > max ? max / len : 1);
          }
          wall.lerp(h.contestReach, sw);
        } else h.contestReach = null;
        h.target.lerp(wall, raise);
      }
      // running: arms swing free, except shoulder to shoulder with the ball
      // handler (then they stay on targets that keep them out of his chest)
      h.weight = run ? (this._closeToOpponent ? 1 : 0) : 1;
    }
    // Steal reach: the reach hand goes at the ball (a little through it); the
    // arm IK stops at real arm length, so far balls stay out of reach.
    if (this.reach) {
      const r = this.reach, h = this.hands.find((x) => x.side === r.side);
      h.target.lerp(this._reachT.copy(ball).addScaledVector(r.dir, 0.12), Math.min(1, this.reachExtent));
      h.weight = 1;
    }
    // Keep the hands out of the ball handler's chest when they're right on top of us.
    const om = this.opponent.model;
    om.root.updateMatrixWorld(true);
    for (const h of this.hands) pushOutOfBox(h.target, om.torso, 0.26, 0.22 + 0.11, 0.25 + 0.04, 0.12 + 0.11, this._tmp);
    // Crouch: deep stance; sink on the jump load, stretch tall in the air,
    // absorb the landing.
    const js = L.jumpState;
    b.crouch = run ? 0.2 : js === 'load' ? 1.9 : js === 'air' ? 0 : js === 'land' ? 1.7 : 1.25 - 0.6 * raise;
    b.twist = 0; b.roll = 0; b.sway = 0; b.jab = 0; b.forward = 0; b.stride = 1;
    b.turnRoll = 0.4;
    return {
      dribble: { hands: this.hands, body: b, stance: run ? 0.3 : 1 },
      defense: {
        lateral: L.lateralSpeed, forward: L.forwardSpeed, run, jumpY: jy,
        contest: raise, planting: L.isPlanting,
      },
      // reach and ankle-break reactions, posed through the skeleton
      balance: {
        reach: this.reach ? { side: this.reach.side, extent: this.reachExtent, dir: this.reach.dir } : null,
        reaction: L.reaction ? { level: L.reaction.level, t: L.reaction.t, duration: L.reaction.duration, dir: L.reaction.dir } : null,
        opponent: this.opponent ? this.opponent.position : null,
      },
      // hands that can block are gameplay colliders: the arms are drawn exactly
      handsLive: (L.jumpState === 'air' || L.jumpState === 'load' || this.handRaise > 0.3) && !L.reaction,
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
function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}
function smoothstep(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
})();
