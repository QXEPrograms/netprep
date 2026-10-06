// DefensiveLocomotion: how a defender's body moves. Shared by the CPU defender
// and (later) a human-controlled defender: whoever is in control only supplies
// an *intention* each frame; this module executes it with defensive physics.
//
//   intent = {
//     velocity:  Vector3  wanted ground velocity (m/s, world)
//     faceTarget: Vector3 what the chest should track (normally the ball handler)
//     allowRun:  bool     may turn the hips and run (recovering, closing out)
//     jump:      bool     start a jump/contest this frame (ignored unless grounded)
//   }
//
// Jump (plant -> crouch -> takeoff -> air -> land): a real vertical
// velocity under gravity. Horizontal momentum at takeoff carries into the air
// with only a little steering, so jumping while sliding or running drifts.
// State: jumpState ('ground' | 'load' | 'air' | 'land'), jumpHeight (m, feet
// off the floor), verticalVelocity, jumpCount.
//
// Key differences from offensive Locomotion:
//   - Facing assist: the chest tracks faceTarget, NOT the travel direction, so
//     the defender slides, pressures and retreats while watching the ball.
//     Rotation is rate- and acceleration-limited, so fast cuts, crossovers and
//     spins can pull the defender out of alignment for a moment.
//   - Speed depends on direction relative to the chest (slide / forward /
//     back), and is lower than offensive top speed.
//   - Momentum: slower acceleration, and reversing from speed needs a plant.
//   - When running is allowed and the wanted direction is far from the chest
//     direction, the hips turn and the defender runs (facing travel) until
//     they can square up again.
//
// State for other systems (animation, AI, debug):
//   defensiveFacingTarget (Vector3), defensiveFacingAngle (target yaw),
//   defensiveFacingError (signed rad), isDefensiveLocked, defensiveTurnRate,
//   mode ('stance' | 'run'), isPlanting, lateralSpeed (+ = character right),
//   forwardSpeed (+ = toward the chest direction)
(function () {
ISO.DefensiveLocomotion = class {
  constructor(options = {}) {
    const C = ISO.CONFIG.court;
    this.settings = Object.assign({}, ISO.DEFENSE.locomotion, {
      bounds: { minX: -C.width / 2, maxX: C.width / 2, minZ: 0, maxZ: C.halfLength },
    }, options);
    this.facingCfg = ISO.DEFENSE.facing;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.turnSpeed = 0;          // rad/s (same name as Locomotion, for the model)
    this.sprinting = false;
    this.mode = 'stance';
    this.isPlanting = false;
    this.speedScale = 1;         // e.g. frozen after biting on a fake

    this.defensiveFacingTarget = new THREE.Vector3();
    this.defensiveFacingAngle = 0;
    this.defensiveFacingError = 0;
    this.isDefensiveLocked = false;
    this.defensiveTurnRate = 0;
    this.lateralSpeed = 0;
    this.forwardSpeed = 0;

    this._plantT = 0;
    this._want = new THREE.Vector3();

    this.jumpCfg = ISO.DEFENSE.jump;
    this.jumpState = 'ground';
    this.jumpHeight = 0;
    this.verticalVelocity = 0;
    this.jumpCount = 0;
    this.jumpTime = 0;            // seconds in the current jump state
    this.lastJumpPeak = 0;
    this._carryRun = false;
  }

  get airborne() { return this.jumpState === 'air'; }

  // Start a jump if standing on the floor (and not still absorbing a landing).
  requestJump() {
    if (this.jumpState !== 'ground') return false;
    this.jumpState = 'load';
    this.jumpTime = 0;
    this.jumpCount++;
    this.isPlanting = false;
    return true;
  }

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  // Top speed in a world direction (unit) given the current chest direction.
  maxSpeedToward(dx, dz) {
    const s = this.settings;
    if (this.mode === 'run') return s.runSpeed;
    const f = Math.sin(this.facing) * dx + Math.cos(this.facing) * dz;
    const l = -Math.cos(this.facing) * dx + Math.sin(this.facing) * dz;
    const a = f / (f >= 0 ? s.forwardSpeed : s.backSpeed), b = l / s.slideSpeed;
    return 1 / Math.sqrt(a * a + b * b + 1e-9);
  }

  update(dt, intent) {
    const s = this.settings, J = this.jumpCfg;
    if (intent.jump) this.requestJump();
    this.jumpTime += dt;
    const target0 = intent.faceTarget;
    const toT0 = target0 ? Math.atan2(target0.x - this.position.x, target0.z - this.position.z) : this.facing;

    // ---- jump phases own the body until the landing is absorbed ----
    if (this.jumpState === 'load') {
      // plant and sink: horizontal speed bleeds off into the floor
      this.velocity.multiplyScalar(Math.pow(J.loadBrake, dt / J.loadTime));
      this._integrate(dt);
      if (this.jumpTime >= J.loadTime) this._takeoff();
      this._face(dt, target0, toT0, 1);
      return;
    }
    if (this.jumpState === 'air') {
      this._updateAir(dt, intent);
      this._face(dt, target0, toT0, J.airTurnScale);
      return;
    }
    if (this.jumpState === 'land' && this.jumpTime >= J.landTime) this.jumpState = 'ground';
    const landing = this.jumpState === 'land';

    const want = this._want.set(intent.velocity.x, 0, intent.velocity.z);
    const wantSpeed = want.length();
    const target = intent.faceTarget;
    const toT = target ? Math.atan2(target.x - this.position.x, target.z - this.position.z) : this.facing;

    // ---- mode: stance (chest on the ball handler) or run (hips turned) ----
    const moveYaw = Math.atan2(want.x, want.z);
    const offAngle = Math.abs(wrap(moveYaw - toT));
    // the most the stance allows in the wanted direction
    const prevMode = this.mode;
    this.mode = 'stance';
    const stanceCap = wantSpeed > 1e-4 ? this.maxSpeedToward(want.x / wantSpeed, want.z / wantSpeed) : s.slideSpeed;
    this.mode = prevMode;
    if (this.mode === 'stance') {
      // turn and run: moving away from the ball handler, or needing more
      // speed than a slide/pressure step can give (outrun, closing out)
      if (intent.allowRun && wantSpeed > 1.5 &&
          (offAngle > s.runAngle || (wantSpeed > stanceCap * 1.15 && offAngle > s.runAngleFast) || wantSpeed > s.forwardSpeed * 1.25)) this.mode = 'run';
    } else if (!intent.allowRun || wantSpeed < 1.0 ||
               (offAngle < s.runExitAngle && wantSpeed < stanceCap * 1.05)) {
      // square back up once the movement points at the ball handler again and
      // no longer needs more than the stance can give
      this.mode = 'stance';
    }

    // ---- wanted velocity, capped by direction ----
    if (wantSpeed > 1e-4) {
      const cap = this.maxSpeedToward(want.x / wantSpeed, want.z / wantSpeed) * this.speedScale * (landing ? J.landSpeedScale : 1);
      if (wantSpeed > cap) want.multiplyScalar(cap / wantSpeed);
    }

    // ---- plant: reversing from speed means stopping first ----
    const v = this.velocity, speed = this.speed;
    if (!this.isPlanting && speed > s.plantFromSpeed && wantSpeed > 0.5 &&
        (v.x * want.x + v.z * want.z) / (speed * want.length()) < -0.2) {
      this.isPlanting = true;
      this._plantT = s.plantTime;
    }
    if (this.isPlanting) {
      this._plantT -= dt;
      want.set(0, 0, 0);
      if (this._plantT <= 0 && speed < 0.6) this.isPlanting = false;
    }

    // ---- accelerate toward the wanted velocity ----
    const dvx = want.x - v.x, dvz = want.z - v.z, dv = Math.hypot(dvx, dvz);
    if (dv > 0) {
      const slowing = want.lengthSq() < v.lengthSq() || (v.x * want.x + v.z * want.z) < 0;
      const rate = this.isPlanting ? s.plantDecel : slowing ? s.decel : this.mode === 'run' ? s.runAccel : s.accel;
      const step = Math.min(dv, rate * dt);
      v.x += (dvx / dv) * step;
      v.z += (dvz / dv) * step;
    }
    this._integrate(dt);
    this.sprinting = this.mode === 'run';
    this._face(dt, target, toT, 1);
  }

  _integrate(dt) {
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._applyBounds();
  }

  _takeoff() {
    const J = this.jumpCfg;
    const speed = this.speed;
    const h = J.height * (1 - J.movingLoss * Math.min(1, speed / 6));
    this.verticalVelocity = Math.sqrt(2 * J.gravity * h);
    this._carryRun = this.mode === 'run';
    this.velocity.multiplyScalar(this._carryRun ? J.carryRun : J.carry);
    this.jumpState = 'air';
    this.jumpTime = 0;
    this.lastJumpPeak = h;
    this.mode = 'stance';
  }

  // Airborne: gravity on the height, momentum on the floor plane with only a
  // little steering toward what the player/AI wants.
  _updateAir(dt, intent) {
    const J = this.jumpCfg, v = this.velocity;
    this.jumpHeight += this.verticalVelocity * dt - 0.5 * J.gravity * dt * dt;
    this.verticalVelocity -= J.gravity * dt;
    const ctl = this._carryRun ? J.airControlRun : J.airControl;
    const dvx = intent.velocity.x - v.x, dvz = intent.velocity.z - v.z, dv = Math.hypot(dvx, dvz);
    if (dv > 1e-4) { const st = Math.min(dv, ctl * dt); v.x += dvx / dv * st; v.z += dvz / dv * st; }
    this._integrate(dt);
    if (this.jumpHeight <= 0) {
      this.jumpHeight = 0;
      this.verticalVelocity = 0;
      this.jumpState = 'land';
      this.jumpTime = 0;
      v.multiplyScalar(0.6);       // feet stick: most momentum absorbed on landing
    }
  }

  // ---- facing assist ----
  _face(dt, target, toT, rateScale) {
    const F = this.facingCfg, v = this.velocity;
    let goal;
    if (this.mode === 'run' && this.speed > 0.8) goal = Math.atan2(v.x, v.z);   // hips turned: face travel
    else goal = toT;
    if (target) this.defensiveFacingTarget.copy(target);
    this.defensiveFacingAngle = goal;
    const err = wrap(goal - this.facing);
    const maxRate = rateScale * (this.mode === 'run' ? F.turnRateRun : F.turnRate) * (this.isPlanting ? F.plantTurnScale : 1);
    const wantRate = Math.max(-maxRate, Math.min(maxRate, err * F.gain));
    const dr = wantRate - this.turnSpeed;
    this.turnSpeed += Math.sign(dr) * Math.min(Math.abs(dr), F.turnAccel * dt);
    // never rotate past the goal within one step
    let step = this.turnSpeed * dt;
    if (Math.abs(step) > Math.abs(err) && Math.sign(step) === Math.sign(err)) { step = err; this.turnSpeed = dt > 0 ? err / dt : 0; }
    this.facing = wrap(this.facing + step);
    this.defensiveFacingError = wrap(toT - this.facing);
    this.isDefensiveLocked = this.mode === 'stance' && Math.abs(this.defensiveFacingError) < F.lockError;
    // (also locked while airborne/landing if square: the chest still tracks)
    this.defensiveTurnRate = this.turnSpeed;

    // body-frame velocity (for the slide/backpedal animation)
    this.forwardSpeed = Math.sin(this.facing) * v.x + Math.cos(this.facing) * v.z;
    this.lateralSpeed = -Math.cos(this.facing) * v.x + Math.sin(this.facing) * v.z;
  }

  _applyBounds() {
    const b = this.settings.bounds, r = this.settings.radius;
    if (this.position.x < b.minX + r) { this.position.x = b.minX + r; this.velocity.x = Math.max(0, this.velocity.x); }
    if (this.position.x > b.maxX - r) { this.position.x = b.maxX - r; this.velocity.x = Math.min(0, this.velocity.x); }
    if (this.position.z < b.minZ + r) { this.position.z = b.minZ + r; this.velocity.z = Math.max(0, this.velocity.z); }
    if (this.position.z > b.maxZ - r) { this.position.z = b.maxZ - r; this.velocity.z = Math.min(0, this.velocity.z); }
  }
};

// Turns raw movement input into a defensive intention (for a human defender).
// With the 'opponent' frame: up = pressure the ball handler, down = give ground
// toward the basket, left/right = slide around the ball handler at the same
// distance (left/right in screen terms). Facing is always the assist's job.
ISO.DefenseInputMapper = class {
  constructor() {
    this.holdDist = null;
    this._r = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._out = new THREE.Vector3();
    this._sr = new THREE.Vector3();
    this._sf = new THREE.Vector3();
  }

  // axes: {x: right, y: up} (-1..1). camera: for screen orientation.
  // Returns an intent for DefensiveLocomotion.
  map(axes, camera, loco, opponentPos, basket, sprint = false) {
    const D = ISO.DEFENSE, s = loco.settings;
    camera.getWorldDirection(this._sf); this._sf.y = 0; this._sf.normalize();
    this._sr.set(-this._sf.z, 0, this._sf.x);           // screen right on the ground
    const out = this._out.set(0, 0, 0);
    const intent = { velocity: out, faceTarget: opponentPos, allowRun: sprint };
    if (D.humanInputFrame === 'screen') {
      out.addScaledVector(this._sf, axes.y).addScaledVector(this._sr, axes.x);
      if (out.lengthSq() > 1) out.normalize();
      out.multiplyScalar(sprint ? s.runSpeed : s.slideSpeed);
      return intent;
    }
    const r = this._r.set(opponentPos.x - loco.position.x, 0, opponentPos.z - loco.position.z);
    const dist = r.length();
    if (dist < 1e-3) r.set(Math.sin(loco.facing), 0, Math.cos(loco.facing)); else r.divideScalar(dist);
    const t = this._t.set(-r.z, 0, r.x);
    if (t.dot(this._sr) < 0) t.negate();                  // +x input = screen right
    // lateral: slide around the ball handler, holding the distance it started at
    if (Math.abs(axes.x) > 0.1 && Math.abs(axes.y) < 0.1) {
      if (this.holdDist === null) this.holdDist = dist;
      out.addScaledVector(t, axes.x * s.slideSpeed);
      out.addScaledVector(r, Math.max(-2, Math.min(2, (dist - this.holdDist) * 3)));
    } else {
      this.holdDist = null;
      out.addScaledVector(t, axes.x * s.slideSpeed);
    }
    // pressure: ease off as the bodies meet (no running through the ball handler)
    if (axes.y > 0) out.addScaledVector(r, axes.y * s.forwardSpeed * Math.max(0, Math.min(1, (dist - 0.68) / 0.45)));
    else if (axes.y < 0) {
      const b = D.humanBackToBasket;
      const back = new THREE.Vector3(basket.x - loco.position.x, 0, basket.z - loco.position.z).normalize()
        .multiplyScalar(b).addScaledVector(r, -(1 - b)).normalize();
      out.addScaledVector(back, -axes.y * s.backSpeed);
    }
    return intent;
  }
};

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
})();
