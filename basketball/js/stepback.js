// StepBackMove: a quick hop away from the basket to create space.
//
// Timeline (u = progress 0..1 over `duration`):
//   plant  0 .. plantEnd   kill momentum, sink into the stance
//   push   plantEnd .. pushEnd   drive backward (bell-shaped speed curve)
//   land   pushEnd .. 1   settle into a balanced stance, then control returns
//
// The move never sets positions directly: it hands Locomotion a temporary
// "drive" (target velocity + facing + how strongly to apply them), so court
// bounds and normal physics still apply. If there isn't room behind the
// player, the push distance is shortened up front instead of hitting the wall.
//
// State for other systems (shooting, defender AI):
//   isSteppingBack, stepBackProgress, stepBackPhase, stepBackCompleted,
//   stepBackDirection, stepBackCount, timeSinceStepBack
ISO.StepBackMove = class {
  constructor(options = {}) {
    const H = ISO.CONFIG.hoop;
    this.settings = Object.assign({
      duration: 0.5,
      plantEnd: 0.24,
      pushEnd: 0.76,
      distance: 1.35,        // meters of separation for a full step-back
      cooldown: 0.25,        // seconds after landing before another
      inputInfluence: 0.15,  // how much WASD can steer during the push (0..1)
      basket: new THREE.Vector3(0, 0, H.centerZ),
    }, options);

    this.isSteppingBack = false;
    this.stepBackProgress = 0;
    this.stepBackPhase = null;            // 'plant' | 'push' | 'land' | null
    this.stepBackCompleted = false;       // true only on the frame the move ends
    this.stepBackDirection = new THREE.Vector3(); // world direction of the push
    this.stepBackCount = 0;
    this.timeSinceStepBack = Infinity;    // seconds since the last one finished
    this.cooldown = 0;

    this.t = 0;
    this.pushDistance = 0;
    this.drive = { velocity: new THREE.Vector3(), weight: 0, facing: 0 };
  }

  get canStepBack() {
    return !this.isSteppingBack && this.cooldown <= 0;
  }

  // Start a step-back for a mover with { position, facing }. Returns true if started.
  request(loco) {
    if (!this.canStepBack) return false;
    const toBasket = this._toBasket(loco.position);
    if (toBasket.lengthSq() > 0.04) {
      this.stepBackDirection.copy(toBasket).negate().normalize();
    } else {
      // Right under the rim: step back opposite the way we face.
      this.stepBackDirection.set(-Math.sin(loco.facing), 0, -Math.cos(loco.facing));
    }
    this.isSteppingBack = true;
    this.stepBackProgress = 0;
    this.stepBackPhase = 'plant';
    this.t = 0;
    this.pushDistance = 0;
    return true;
  }

  // Advance the move. Returns the drive for Locomotion this frame, or null.
  update(dt, loco) {
    this.stepBackCompleted = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.timeSinceStepBack += dt;
    if (!this.isSteppingBack) return null;

    const s = this.settings;
    this.t += dt;
    const u = Math.min(1, this.t / s.duration);
    this.stepBackProgress = u;

    // Keep facing the basket so the push reads as stepping *back*, not turning around.
    const toBasket = this._toBasket(loco.position);
    if (toBasket.lengthSq() > 0.04) this.drive.facing = Math.atan2(toBasket.x, toBasket.z);
    else this.drive.facing = Math.atan2(-this.stepBackDirection.x, -this.stepBackDirection.z);

    const d = this.drive;
    if (u < s.plantEnd) {
      // Plant: bleed off momentum quickly.
      this.stepBackPhase = 'plant';
      d.velocity.set(0, 0, 0);
      d.weight = 0.45 + 0.5 * (u / s.plantEnd);
    } else if (u < s.pushEnd) {
      if (this.stepBackPhase !== 'push') {
        this.stepBackPhase = 'push';
        this.pushDistance = this._roomBehind(loco);
      }
      // Bell-shaped speed whose integral over the push equals pushDistance.
      const pushTime = (s.pushEnd - s.plantEnd) * s.duration;
      const tau = (u - s.plantEnd) / (s.pushEnd - s.plantEnd);
      const vmax = (this.pushDistance * Math.PI) / (2 * pushTime);
      d.velocity.copy(this.stepBackDirection).multiplyScalar(vmax * Math.sin(Math.PI * tau));
      d.weight = 1 - s.inputInfluence;
    } else {
      // Land: come to a balanced stop, handing control back gradually.
      this.stepBackPhase = 'land';
      d.velocity.set(0, 0, 0);
      d.weight = 0.85 * (1 - (u - s.pushEnd) / (1 - s.pushEnd));
    }

    if (u >= 1) {
      this.isSteppingBack = false;
      this.stepBackPhase = null;
      this.stepBackCompleted = true;
      this.stepBackCount++;
      this.timeSinceStepBack = 0;
      this.cooldown = s.cooldown;
      return null;
    }
    return d;
  }

  // End the move now (e.g. a shot starts during the landing). Counts as completed.
  endEarly() {
    if (!this.isSteppingBack) return;
    this.isSteppingBack = false;
    this.stepBackPhase = null;
    this.stepBackCompleted = true;
    this.stepBackCount++;
    this.timeSinceStepBack = 0;
    this.cooldown = this.settings.cooldown;
  }

  // Pose info for PlayerModel.
  getPose() {
    return this.isSteppingBack ? { u: this.stepBackProgress } : null;
  }

  _toBasket(pos) {
    return new THREE.Vector3(this.settings.basket.x - pos.x, 0, this.settings.basket.z - pos.z);
  }

  // How far we can push along stepBackDirection before the court bounds
  // (with a small margin), capped at the full distance.
  _roomBehind(loco) {
    const b = loco.settings.bounds, r = loco.settings.radius + 0.05;
    const p = loco.position, dir = this.stepBackDirection;
    let room = Infinity;
    if (dir.x > 1e-4) room = Math.min(room, (b.maxX - r - p.x) / dir.x);
    if (dir.x < -1e-4) room = Math.min(room, (b.minX + r - p.x) / dir.x);
    if (dir.z > 1e-4) room = Math.min(room, (b.maxZ - r - p.z) / dir.z);
    if (dir.z < -1e-4) room = Math.min(room, (b.minZ + r - p.z) / dir.z);
    return Math.max(0, Math.min(this.settings.distance, room));
  }
};
