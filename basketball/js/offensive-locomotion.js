// Offensive basketball locomotion. Three cooperating pieces, all tuned in
// ISO.MOVEMENT (movement-config.js):
//
//   OffensiveLocomotion  velocity, acceleration, momentum, the continuous
//                        size-up -> drive -> sprint commitment, plants/cuts
//   OffenseOrientation   where the hips and chest face: squared to the
//                        matchup/rim while sizing up, opening into a drive,
//                        back to square when the drive stops
//   OffenseBodyPose      lean / hip shift / knee load from the real velocity
//                        and acceleration (a damped spring = weight)
//
// Movement direction, hip facing, chest facing and lean are separate and are
// allowed to differ. Input stays camera relative (the controller maps keys to
// a world direction); only the body's orientation adapts to basketball context.
//
// Same public surface as ISO.Locomotion (position, velocity, facing,
// turnSpeed, sprinting, speedScale, accelScale, drive, settings), so every
// move, shot and finish keeps working through the drive hook.
//
// State for debug/other systems: attack (0..1 commitment), level
// ('controlled' | 'attack' | 'sprint'), plantState ('none' | 'cut' |
// 'reversal' | 'push'), acceleration, inputDir, orientation.*, pose.*
(function () {
const H = ISO.CONFIG.hoop;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

ISO.OffensiveLocomotion = class extends ISO.Locomotion {
  constructor(options = {}) {
    super(options);
    this.M = ISO.MOVEMENT;
    this.attack = 0;                 // 0 size-up .. ~0.5 drive .. 1 sprint
    this.level = 'controlled';
    this.acceleration = new THREE.Vector3();
    this.inputDir = new THREE.Vector3();
    this.plantState = 'none';
    this.plantSide = 0;              // +1 planting on the right foot, -1 left (character frame)
    this.plantCount = 0;
    this.matchup = null;             // { position } — the player's primary matchup (any number of players later)
    this.orientation = new ISO.OffenseOrientation(this);
    this._plantT = 0;
    this._pushT = 0;
    this._holdT = 0;
    this._holdDir = new THREE.Vector3();
    this._prevV = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._des = new THREE.Vector3();
  }

  get maxSpeed() { return (this.sprinting ? this.settings.sprintSpeed : this.settings.runSpeed) * this.speedScale; }

  // Possession reset: back to a squared, controlled stance with no momentum,
  // commitment, plant or push left over.
  resetMotion(position, facing) {
    super.resetMotion(position, facing);
    this.attack = 0;
    this.level = 'controlled';
    this.acceleration.set(0, 0, 0);
    this.inputDir.set(0, 0, 0);
    this.plantState = 'none';
    this.plantSide = 0;
    this._plantT = 0;
    this._pushT = 0;
    this._holdT = 0;
    this._holdDir.set(0, 0, 0);
    this._prevV.set(0, 0, 0);
    this.orientation.reset(facing);
  }

  update(dt, dir, sprint) {
    const S = this.settings, M = this.M, C = M.commitment, A = M.accel, P = M.plant;
    const inMag = Math.min(1, Math.hypot(dir.x, dir.z));
    const hasInput = inMag > 0.01;
    const u = this._u.set(dir.x, 0, dir.z);
    if (hasInput) u.divideScalar(Math.hypot(dir.x, dir.z));
    this.inputDir.copy(u).multiplyScalar(hasInput ? inMag : 0);
    this.sprinting = sprint && hasInput;
    const O = this.orientation;
    O.context();
    const v = this.velocity, speed = this.speed;

    // ---- commitment (continuous) ----
    if (hasInput && this._holdDir.lengthSq() > 0 && u.dot(this._holdDir) > Math.cos(C.holdAngle)) this._holdT += dt;
    else { this._holdT = 0; this._holdDir.copy(hasInput ? u : this._holdDir.set(0, 0, 0)); }
    let target = 0;
    if (this.sprinting) target = 1;
    else if (hasInput) {
      const toward = clamp01((u.dot(O.toRim) - C.driveAngle) / (1 - C.driveAngle));
      target = C.driveLevel * toward * clamp01(this._holdT / C.driveCommitTime) * clamp01(speed / (C.driveSpeed * S.runSpeed));
      if (O.beaten) target = Math.min(1, target + C.beatenBonus * clamp01(speed / 2));
    }
    if (this.drive) target = Math.max(target, this.attack * 0.9);     // a move doesn't erase the commitment
    const rate = target > this.attack ? C.rise : C.fall;
    this.attack += Math.sign(target - this.attack) * Math.min(Math.abs(target - this.attack), rate * dt);
    this.level = this.attack < 0.25 ? 'controlled' : this.attack < 0.75 ? 'attack' : 'sprint';
    const runBlend = clamp01(this.attack / 0.5);

    // ---- wanted velocity: speed depends on direction vs the squared stance ----
    let cap = S.runSpeed;
    if (hasInput) {
      const ey = O.engageYaw;
      const f = Math.sin(ey) * u.x + Math.cos(ey) * u.z, l = -Math.cos(ey) * u.x + Math.sin(ey) * u.z;
      const a = f / (f >= 0 ? M.speed.forward : M.speed.back), b = l / M.speed.lateral;
      const ctrl = 1 / Math.sqrt(a * a + b * b + 1e-9);
      cap = this.attack <= 0.5 ? lerp(ctrl, Math.max(ctrl, S.runSpeed), runBlend)
        : this.sprinting ? lerp(S.runSpeed, S.sprintSpeed, clamp01((this.attack - 0.5) / 0.5)) : S.runSpeed;
    }
    const des = this._des.copy(u).multiplyScalar(hasInput ? cap * inMag * this.speedScale : 0);

    // ---- plants: cuts and reversals at speed brake hard first ----
    if (hasInput && speed > 0.5 && (this.plantState === 'none' || this.plantState === 'push')) {
      const ang = Math.acos(Math.max(-1, Math.min(1, (v.x * u.x + v.z * u.z) / speed)));
      let kind = null;
      if (ang > P.reversalAngle && speed > P.reversalMinSpeed) kind = 'reversal';
      else if (ang > P.cutAngle && speed > P.cutMinSpeed) kind = 'cut';
      if (kind && !this.drive) {
        this.plantState = kind;
        const brake = lerp(P.brake, P.brakeSprint, clamp01((speed - S.runSpeed) / (S.sprintSpeed - S.runSpeed)));
        const absorb = (kind === 'reversal' ? P.reversalAbsorb : P.cutAbsorb) * speed / brake;
        this._plantT = Math.max((kind === 'reversal' ? P.reversalTime : P.cutTime) + (speed > S.runSpeed ? P.sprintExtra : 0), absorb);
        // the foot that plants is the one on the side we were moving toward
        const rx = -Math.cos(this.facing), rz = Math.sin(this.facing);
        this.plantSide = (v.x * rx + v.z * rz) >= 0 ? 1 : -1;
        this.plantCount++;
      }
    }

    // ---- integrate velocity ----
    if (this.plantState === 'cut' || this.plantState === 'reversal') {
      this._plantT -= dt;
      const sp = this.speed;
      const brake = lerp(P.brake, P.brakeSprint, clamp01((sp - S.runSpeed) / (S.sprintSpeed - S.runSpeed)));
      if (sp > 0) v.multiplyScalar(Math.max(0, sp - brake * dt) / sp);
      const push = A.controlled * P.sideAccel * dt;
      v.x += u.x * push; v.z += u.z * push;
      if (this._plantT <= 0) { this.plantState = 'push'; this._pushT = P.pushTime; }
    } else {
      if (this.plantState === 'push') { this._pushT -= dt; if (this._pushT <= 0) this.plantState = 'none'; }
      const dvx = des.x - v.x, dvz = des.z - v.z, dv = Math.hypot(dvx, dvz);
      if (dv > 1e-6) {
        let r;
        if (!hasInput) {
          r = lerp(A.stopControlled, A.stopFast, clamp01((speed - 2) / (S.runSpeed - 2)));
        } else if (des.lengthSq() + 1e-6 < v.x * des.x + v.z * des.z) {
          r = A.stopControlled;                           // asked to slow down (e.g. a hesitation)
        } else {
          const lat = Math.abs(-Math.cos(this.facing) * u.x + Math.sin(this.facing) * u.z);
          r = speed > S.runSpeed ? A.sprint : lerp(lerp(A.controlled, A.lateral, lat), A.drive, runBlend);
          if (speed > 1 && (v.x * u.x + v.z * u.z) / speed < 0.95) r = Math.max(r, A.turn);
        }
        if (this.plantState === 'push') r *= P.pushBoost;
        r *= this.accelScale;
        const step = Math.min(dv, r * dt);
        v.x += dvx / dv * step; v.z += dvz / dv * step;
      }
    }

    // ---- moves steer through the drive hook (unchanged contract) ----
    const drive = this.drive;
    if (drive && drive.weight > 0) {
      const k = drive.weight >= 1 ? 1 : 1 - Math.pow(1 - drive.weight, dt * 60);
      v.x += (drive.velocity.x - v.x) * k;
      v.z += (drive.velocity.z - v.z) * k;
      if (this.plantState !== 'none') this.plantState = 'none';
    }
    this.position.x += v.x * dt;
    this.position.z += v.z * dt;
    this._applyBounds();

    // ---- facing (hips) ----
    const prev = this.facing;
    if (drive && drive.exactFacing) {
      this.facing = wrap(drive.facing);
    } else {
      const goal = drive ? drive.facing : O.hipTarget(dt);
      const diff = wrap(goal - this.facing);
      const maxRate = drive ? 30 : lerp(M.orientation.hipTurnRate, M.orientation.hipTurnRateSprint, clamp01((this.attack - 0.5) * 2));
      let step = diff * (1 - Math.exp(-(drive ? S.turnRate : M.orientation.turnSmoothing) * dt));
      step = Math.max(-maxRate * dt, Math.min(maxRate * dt, step));
      this.facing = wrap(this.facing + step);
    }
    this.turnSpeed = dt > 0 ? wrap(this.facing - prev) / dt : 0;
    O.upperBody(dt, !!drive);

    // ---- acceleration (smoothed) for the lean ----
    if (dt > 0) {
      const ax = (v.x - this._prevV.x) / dt, az = (v.z - this._prevV.z) / dt;
      const k = 1 - Math.exp(-25 * dt);
      this.acceleration.x += (ax - this.acceleration.x) * k;
      this.acceleration.z += (az - this.acceleration.z) * k;
    }
    this._prevV.copy(v);
  }
};

// ---------------------------------------------------------------------------
// Where the body faces. The "engage" direction is the useful basketball
// target: the rim, pulled toward the primary matchup when one is in front and
// close. Hips: squared to it while sizing up (opening a little toward travel),
// opening fully into committed drives; retreating keeps them square. Chest:
// counter-rotates to stay more engaged than the hips. Head: a bit further.
// ---------------------------------------------------------------------------
ISO.OffenseOrientation = class {
  constructor(loco) {
    this.loco = loco;
    this.rim = new THREE.Vector3(0, 0, H.centerZ);
    this.toRim = new THREE.Vector3(0, 0, -1);
    this.engagePoint = new THREE.Vector3();
    this.engageYaw = Math.PI;
    this.hipYaw = Math.PI;
    this.chestYaw = Math.PI;
    this.twist = 0;                  // chest relative to hips (rad, + = chest turned left)
    this.headYaw = 0;                // head relative to chest
    this.open = 0;                   // 0 squared .. 1 hips fully open to travel
    this.beaten = false;
    this.matchupState = 'none';      // squared | attackingLeft | attackingRight | shoulderToShoulder | beaten | separation | none
    this.matchupDepth = 0;
    this.matchupLateral = 0;
  }

  reset(facing) {
    this.engageYaw = this.hipYaw = this.chestYaw = facing;
    this.twist = 0;
    this.headYaw = 0;
    this.open = 0;
    this.beaten = false;
    this.matchupState = 'none';
    this.matchupDepth = 0;
    this.matchupLateral = 0;
    this.context();
  }

  context() {
    const L = this.loco, A = L.position, cfg = ISO.MOVEMENT.orientation;
    const rx = this.rim.x - A.x, rz = this.rim.z - A.z, rl = Math.hypot(rx, rz) || 1;
    this.toRim.set(rx / rl, 0, rz / rl);
    const m = L.matchup && L.matchup.position;
    this.engagePoint.copy(this.rim);
    if (m) {
      const dx = m.x - A.x, dz = m.z - A.z, dist = Math.hypot(dx, dz);
      const depth = dx * this.toRim.x + dz * this.toRim.z;
      const lat = dx * -this.toRim.z + dz * this.toRim.x;          // + = on the ball handler's right
      this.matchupDepth = depth; this.matchupLateral = lat;
      const nowBeaten = depth < -cfg.beatenDepth || (Math.abs(lat) > cfg.beatenLateral && depth < 0.4);
      this.beaten = this.beaten ? !(depth > 0.3 && Math.abs(lat) < 0.7) : nowBeaten;
      if (!this.beaten && dist < cfg.engageRange && depth > -0.1) {
        const w = cfg.engageDefenderWeight * clamp01((cfg.engageRange - dist) / 2);
        this.engagePoint.lerp(m, w);
      }
      const vl = L.velocity.x * -this.toRim.z + L.velocity.z * this.toRim.x;
      this.matchupState = this.beaten ? 'beaten' : dist > 3.2 ? 'separation'
        : Math.abs(lat) > 0.45 && depth < 0.6 ? 'shoulderToShoulder'
        : vl > 1 ? 'attackingRight' : vl < -1 ? 'attackingLeft' : 'squared';
    } else {
      this.beaten = false;
      this.matchupState = 'none';
    }
    this.engageYaw = Math.atan2(this.engagePoint.x - A.x, this.engagePoint.z - A.z);
  }

  // Target yaw for the hips this frame. Every ingredient blends continuously
  // (speed, retreat angle, beaten): a target that jumps makes the hips whip
  // at their turn-rate limit for a frame (Step 16.5 continuity fix; the
  // squared / open / retreat behaviour itself is unchanged).
  hipTarget(dt = 0) {
    const L = this.loco, cfg = ISO.MOVEMENT.orientation, v = L.velocity, speed = L.speed;
    const travel = speed > 0.05 ? Math.atan2(v.x, v.z) : this.engageYaw;
    const diff = wrap(travel - this.engageYaw);
    const runBlend = clamp01(L.attack / 0.5);
    let open = lerp(cfg.openControlled * clamp01(speed / cfg.openSpeed), 1, runBlend * clamp01(speed / 2));
    const k = dt > 0 ? 1 - Math.exp(-10 * dt) : 1;
    this._beatenW = (this._beatenW ?? 0) + ((this.beaten ? 1 : 0) - (this._beatenW ?? 0)) * k;
    open = lerp(open, Math.max(open, 0.85), this._beatenW * smoothstep(1.6, 2.4, speed));
    // retreat (travel well behind the target): square, unless sprinting away
    const back = smoothstep(cfg.backAngle - 0.15, cfg.backAngle + 0.15, Math.abs(diff));
    open = lerp(open, L.sprinting ? clamp01(L.attack) : 0, back);
    open *= smoothstep(0.1, 0.5, speed);          // standing still: square to the target
    this.open = open;
    this.hipYaw = this.engageYaw + diff * open;
    return this.hipYaw;
  }

  // Chest and head after the hips have turned. During a move/shot (driven),
  // the upper body follows the hips (the move owns the body).
  upperBody(dt, driven) {
    const L = this.loco, cfg = ISO.MOVEMENT.orientation;
    const follow = lerp(cfg.chestFollowControlled, cfg.chestFollowDrive, clamp01(L.attack / 0.6));
    const wantChest = this.engageYaw + wrap(L.facing - this.engageYaw) * follow;
    let twist = driven ? 0 : Math.max(-cfg.maxTwist, Math.min(cfg.maxTwist, wrap(wantChest - L.facing)));
    const k = dt > 0 ? 1 - Math.exp(-12 * dt) : 1;
    this.twist += (twist - this.twist) * k;
    this.chestYaw = L.facing + this.twist;
    const head = driven ? 0 : Math.max(-cfg.maxHead, Math.min(cfg.maxHead, wrap(this.engageYaw - this.chestYaw)));
    this.headYaw += (head - this.headYaw) * k;
  }
};

// ---------------------------------------------------------------------------
// Lean / weight from the real motion. The lean target is a horizontal vector
// from velocity (steady lean) plus acceleration (into starts and cuts, back
// against braking). A damped spring follows it, so the torso lags and slightly
// overshoots — that reads as weight. Converted to the hip frame it becomes
// roll (sideways lean), pitch (forward/back), hip shift and knee load.
// ---------------------------------------------------------------------------
ISO.OffenseBodyPose = class {
  constructor(loco) {
    this.loco = loco;
    this.lean = new THREE.Vector2();       // world x/z lean (rad)
    this.leanVel = new THREE.Vector2();
    this.target = new THREE.Vector2();
    this.out = { roll: 0, pitch: 0, sway: 0, crouch: 0, twist: 0, head: 0, stride: 1.25, weight: 1 };
    // debug values
    this.movementLean = 0; this.accelerationLean = 0; this.lateralLean = 0; this.forwardLean = 0;
    this.plantLean = 0; this.currentBodyLean = 0; this.targetBodyLean = 0;
  }

  // Upright and still (possession reset).
  reset() {
    this.lean.set(0, 0);
    this.leanVel.set(0, 0);
    this.target.set(0, 0);
    Object.assign(this.out, { roll: 0, pitch: 0, sway: 0, crouch: 0, twist: 0, head: 0, handShift: 0, weight: 1 });
    this.movementLean = this.accelerationLean = this.lateralLean = this.forwardLean = 0;
    this.plantLean = this.currentBodyLean = this.targetBodyLean = 0;
  }

  // weight: 1 while dribbling, less while a shot/finish owns the body.
  update(dt, weight = 1) {
    const L = this.loco, c = ISO.MOVEMENT.lean, F = ISO.MOVEMENT.feet, S = L.settings;
    const v = L.velocity, a = L.acceleration, speed = L.speed;
    const max = lerp(c.max, c.maxSprint, clamp01((speed - S.runSpeed) / (S.sprintSpeed - S.runSpeed)));
    const t = this.target.set(v.x * c.fromVelocity + a.x * c.fromAccel, v.z * c.fromVelocity + a.z * c.fromAccel);
    this.movementLean = speed * c.fromVelocity;
    this.accelerationLean = Math.hypot(a.x, a.z) * c.fromAccel;
    if (t.length() > max) t.multiplyScalar(max / t.length());
    // damped spring (sub-stepped for stability at low frame rates)
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n, k = c.stiffness, d = 2 * Math.sqrt(k) * c.damping;
    for (let i = 0; i < n; i++) {
      this.leanVel.x += (k * (t.x - this.lean.x) - d * this.leanVel.x) * h;
      this.leanVel.y += (k * (t.y - this.lean.y) - d * this.leanVel.y) * h;
      this.lean.x += this.leanVel.x * h;
      this.lean.y += this.leanVel.y * h;
    }
    const f = L.facing;
    let fwd = this.lean.x * Math.sin(f) + this.lean.y * Math.cos(f);
    const lat = this.lean.x * -Math.cos(f) + this.lean.y * Math.sin(f);
    if (fwd < 0) fwd *= c.backLeanScale;
    const planting = L.plantState === 'cut' || L.plantState === 'reversal';
    this.lateralLean = lat; this.forwardLean = fwd;
    this.plantLean = planting ? this.lean.length() : 0;
    this.currentBodyLean = this.lean.length(); this.targetBodyLean = t.length();
    const o = this.out, w = weight;
    o.roll = lat * w;
    o.pitch = fwd * w;
    o.sway = lat * c.hipShift * w;
    o.crouch = Math.min(c.kneeMax, Math.hypot(a.x, a.z) * c.kneeFromAccel + (planting ? c.kneePlant : 0)) * w;
    o.twist = L.orientation.twist * w;
    o.head = L.orientation.headYaw * w;
    o.stride = lerp(F.strideControlled, F.strideDrive, clamp01(L.attack / 0.5));
    o.pivot = c.pivot;
    // how far the dribbling hand moves sideways with the lean (+ = character right)
    o.handShift = o.sway + (0.85 - c.pivot) * Math.sin(o.roll);
    o.weight = w;
    return o;
  }
};
})();
