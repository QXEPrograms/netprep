// Locomotion: ground movement physics for any character (player now, defender later).
// It owns position, velocity and facing. Callers give it a desired direction each
// frame; it handles acceleration, braking, speed caps, turning and court bounds.
ISO.Locomotion = class {
  constructor(options = {}) {
    const C = ISO.CONFIG.court;
    this.settings = Object.assign({
      runSpeed: 5.0,         // m/s
      sprintSpeed: 7.2,      // m/s
      accel: 20,             // m/s^2 when pushing in a direction
      decel: 26,             // m/s^2 when releasing input
      turnRate: 12,          // how fast the body rotates toward travel (higher = snappier)
      radius: 0.35,          // body radius used for bounds
      // Playable area: inside the sidelines, baseline and half-court line.
      bounds: { minX: -C.width / 2, maxX: C.width / 2, minZ: 0, maxZ: C.halfLength },
    }, options);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0;         // yaw in radians; 0 faces +z
    this.turnSpeed = 0;      // signed rad/s, used for leaning into turns
    this.sprinting = false;
    // Multiplier hook so later systems (dribbling, shooting) can slow the player down.
    this.speedScale = 1;
    // Multiplier on acceleration/braking (e.g. a sharp burst right after a crossover).
    this.accelScale = 1;
    // Optional temporary control by a move (e.g. a step-back):
    //   { velocity: Vector3, weight: 0..1, facing: yaw, exactFacing?: bool }
    // weight blends the normal velocity toward drive.velocity (1 = fully driven);
    // facing replaces the usual turn-toward-travel. null = normal control.
    this.drive = null;

    this._desired = new THREE.Vector3();
    this._facingDir = new THREE.Vector3();
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  // Stand still at a spot (possession reset): no momentum, no move steering.
  resetMotion(position, facing) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.turnSpeed = 0;
    this.sprinting = false;
    this.speedScale = 1;
    this.accelScale = 1;
    this.drive = null;
  }

  get maxSpeed() {
    return (this.sprinting ? this.settings.sprintSpeed : this.settings.runSpeed) * this.speedScale;
  }

  // dir: world-space direction on the ground (length 0..1). sprint: boolean.
  update(dt, dir, sprint) {
    const s = this.settings;
    const hasInput = dir.lengthSq() > 1e-4;
    this.sprinting = sprint && hasInput;

    // Desired velocity, then move the current velocity toward it at a limited rate.
    this._desired.set(dir.x, 0, dir.z).multiplyScalar(this.maxSpeed);
    const dvx = this._desired.x - this.velocity.x;
    const dvz = this._desired.z - this.velocity.z;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen > 0) {
      // Braking (desired opposes current motion) uses the stronger decel rate.
      const opposing = this.velocity.x * this._desired.x + this.velocity.z * this._desired.z < 0;
      let rate = ((hasInput && !opposing) ? s.accel : s.decel) * this.accelScale;
      const speed = this.speed;
      const m = ISO.OFFENSE && ISO.OFFENSE.momentum;
      if (m && hasInput && speed > 0.5) {
        // Momentum: reversing hard at speed needs a plant (softer braking the
        // faster you're going); sprinting turns arc a little wider.
        const cos = (this.velocity.x * dir.x + this.velocity.z * dir.z) / (speed * Math.hypot(dir.x, dir.z));
        if (opposing && speed > m.plantFromSpeed) {
          const f = Math.min(1, (speed - m.plantFromSpeed) / (s.sprintSpeed - m.plantFromSpeed));
          rate *= 1 - (1 - m.plantBrake) * f;
        } else if (this.sprinting && cos < 0.75) {
          rate *= m.sprintTurnAccel;
        }
      }
      const step = Math.min(dvLen, rate * dt);
      this.velocity.x += (dvx / dvLen) * step;
      this.velocity.z += (dvz / dvLen) * step;
    }

    const drive = this.drive;
    if (drive && drive.weight > 0) {
      // weight is per 1/60 s; convert so the blend is frame-rate independent
      const k = drive.weight >= 1 ? 1 : 1 - Math.pow(1 - drive.weight, dt * 60);
      this.velocity.x += (drive.velocity.x - this.velocity.x) * k;
      this.velocity.z += (drive.velocity.z - this.velocity.z) * k;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._applyBounds();
    if (drive && drive.exactFacing) {
      // A move (e.g. a spin) sets the facing directly, including full turns.
      const d = Math.atan2(Math.sin(drive.facing - this.facing), Math.cos(drive.facing - this.facing));
      this.turnSpeed = dt > 0 ? d / dt : 0;
      this.facing = Math.atan2(Math.sin(drive.facing), Math.cos(drive.facing));
      return;
    }
    if (drive) this._facingDir.set(Math.sin(drive.facing), 0, Math.cos(drive.facing));
    this._updateFacing(dt, drive ? this._facingDir : hasInput ? this._desired : this.velocity);
  }

  _applyBounds() {
    const b = this.settings.bounds, r = this.settings.radius;
    if (this.position.x < b.minX + r) { this.position.x = b.minX + r; this.velocity.x = Math.max(0, this.velocity.x); }
    if (this.position.x > b.maxX - r) { this.position.x = b.maxX - r; this.velocity.x = Math.min(0, this.velocity.x); }
    if (this.position.z < b.minZ + r) { this.position.z = b.minZ + r; this.velocity.z = Math.max(0, this.velocity.z); }
    if (this.position.z > b.maxZ - r) { this.position.z = b.maxZ - r; this.velocity.z = Math.min(0, this.velocity.z); }
  }

  // Rotate toward the direction of travel along the shortest arc.
  _updateFacing(dt, towards) {
    const prev = this.facing;
    if (Math.hypot(towards.x, towards.z) > 0.3) {
      const target = Math.atan2(towards.x, towards.z);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * (1 - Math.exp(-this.settings.turnRate * dt));
      this.facing = Math.atan2(Math.sin(this.facing), Math.cos(this.facing));
    }
    let d = this.facing - prev;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.turnSpeed = dt > 0 ? d / dt : 0;
  }
};
