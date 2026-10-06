// PassingSystem: passing the ball to a target (a future teammate, or a debug
// target). There are no teammates yet, so with no target a pass request is
// politely refused and the ball stays in the player's hands.
//
// Targets are plain objects registered with addTarget():
//   { position: Vector3 (where the ball should arrive, e.g. a chest),
//     isOpen?: () => boolean, onCatch?: (ball) => void, name?: string }
// A future teammate just needs to register itself (and move its position).
//
// Chest pass timeline (seconds):
//   gather  0 .. gatherTime    ball comes to the chest with both hands
//   extend  .. releaseTime     arms push out, ball leaves the hands
//   follow  .. end             arms stay extended briefly, then relax
//
// State for other systems: isPassing, passType, passTarget, passVelocity,
// passReleased (frame flag), passCompleted (frame flag: ball reached its
// target), passCount, passBlocked (frame flag: request refused, no target).
(function () {
ISO.PassingSystem = class {
  constructor(ball, options = {}) {
    this.ball = ball;
    this.settings = Object.assign({
      gatherTime: 0.12,
      releaseTime: 0.22,
      end: 0.44,
      speed: 10,              // horizontal ball speed for a chest pass (m/s)
      chest: [0, 0.3, 1.22],  // ball at the chest (body frame: lateral, forward, height)
      out: [0, 0.6, 1.28],    // ball at full extension
      catchRadius: 0.5,
    }, options);

    this.targets = [];
    this.isPassing = false;
    this.passType = null;            // 'chest'
    this.passTarget = null;          // the target object being passed to
    this.passVelocity = new THREE.Vector3();
    this.passReleased = false;
    this.passCompleted = false;
    this.passBlocked = false;
    this.passCount = 0;
    this.inFlight = null;            // target the released ball is heading to

    this.t = 0;
    this.drive = { velocity: new THREE.Vector3(), weight: 0, facing: 0 };
    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 0 },
      { side: -1, target: new THREE.Vector3(), weight: 0 },
    ];
    this.body = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0 };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  addTarget(target) {
    if (!this.targets.includes(target)) this.targets.push(target);
  }

  removeTarget(target) {
    this.targets = this.targets.filter((t) => t !== target);
  }

  // Best available target (for now: the first open one).
  findTarget() {
    return this.targets.find((t) => !t.isOpen || t.isOpen()) || null;
  }

  // Start a pass to `target` (or the best available one). Returns true if a
  // pass started; false (and passBlocked) when there's nobody to pass to.
  request(loco, handWorld, target = null, type = 'chest') {
    if (this.isPassing) return false;
    const tgt = target || this.findTarget();
    if (!tgt) { this.passBlocked = true; return false; }
    this.isPassing = true;
    this.passType = type;
    this.passTarget = tgt;
    this.t = 0;
    this._frame(this._facingTo(loco, tgt.position));
    const b = this.ball.position;
    this._start = {
      ball: this._local(loco, b),
      vel: [0, 0, Math.max(-4, Math.min(4, this.ball.velocity.y))],
      hands: this.hands.map((h) => this._local(loco, handWorld(h.side, new THREE.Vector3()))),
    };
    this._released = false;
    return true;
  }

  // Timeline. Returns a Locomotion drive (or null when idle).
  // Clear one-frame flags; call at the start of each frame before request().
  beginFrame() {
    this.passReleased = false;
    this.passCompleted = false;
    this.passBlocked = false;
  }

  update(dt, loco) {
    this._trackFlight();
    if (!this.isPassing) return null;
    const s = this.settings;
    this.t += dt;
    const d = this.drive;
    d.facing = this._facingTo(loco, this.passTarget.position);
    d.velocity.set(0, 0, 0);
    d.weight = this.t < s.releaseTime ? 0.6 : 0.6 * (1 - (this.t - s.releaseTime) / (s.end - s.releaseTime));
    if (this.t >= s.end) {
      this.isPassing = false;
      return null;
    }
    return d;
  }

  // After the body moved: place ball and hands; release at releaseTime.
  place(dt, loco) {
    if (!this.isPassing) return;
    const s = this.settings, t = this.t;
    this._frame(loco.facing);
    if (!this._released) {
      let p;
      if (t < s.gatherTime) {
        const u = t / s.gatherTime;
        p = [0, 1, 2].map((i) => hermite(this._start.ball[i], this._start.vel[i] * s.gatherTime, s.chest[i], 0, u));
      } else {
        const u = Math.min(1, (t - s.gatherTime) / (s.releaseTime - s.gatherTime));
        p = s.chest.map((v, i) => v + (s.out[i] - v) * u * u);
      }
      p[2] = Math.max(this.ball.radius, p[2]);
      this._world(loco, p, this._p);
      if (t >= s.releaseTime) this._release(this._p);
      else this.ball.place(this._p, dt);
    }

    // Hands: on both sides of the ball, then held out in the follow-through.
    const b = this._released ? this._world(loco, s.out, this._tmp) : this.ball.position;
    for (const h of this.hands) {
      h.target.copy(b).addScaledVector(this._right, h.side * 0.13).addScaledVector(this._fwd, -0.03);
      h.target.y = b.y - 0.02;
    }
    const g = Math.min(1, t / 0.12);
    if (g < 1) {
      for (let i = 0; i < 2; i++) {
        const from = this._world(loco, this._start.hands[i], this._p);
        this.hands[i].target.lerpVectors(from, this.hands[i].target, g * g * (3 - 2 * g));
      }
    }
    const relax = this._released ? Math.min(1, Math.max(0, (t - s.releaseTime - 0.1) / (s.end - s.releaseTime - 0.1))) : 0;
    for (const h of this.hands) h.weight = 1 - relax;
  }

  getPose() {
    return this.isPassing ? { hands: this.hands, body: this.body, stance: 1 } : null;
  }

  getPassPose() {
    return this.isPassing ? { u: Math.min(1, this.t / this.settings.end) } : null;
  }

  // ---- internals -----------------------------------------------------------

  // Throw from pos to the target on a flat arc at the pass speed.
  _release(pos) {
    const g = ISO.Basketball.GRAVITY;
    const tgt = this.passTarget.position;
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
    const d = Math.hypot(dx, dz);
    const T = Math.max(0.15, d / this.settings.speed);
    const vy = (tgt.y - pos.y + 0.5 * g * T * T) / T;
    this.passVelocity.set(dx / T, vy, dz / T);
    const spin = this._tmp.set(-dz, 0, dx).normalize().multiplyScalar(8); // light backspin
    this.ball.setFree(pos, this.passVelocity, spin, 'pass');
    this.ball.holder = null;
    this._released = true;
    this.passReleased = true;
    this.passCount++;
    this.inFlight = this.passTarget;
  }

  // Has the ball in flight reached its target?
  _trackFlight() {
    const tgt = this.inFlight;
    if (!tgt) return;
    if (this.ball.mode !== ISO.Basketball.MODES.FREE) { this.inFlight = null; return; }
    if (this.ball.position.distanceTo(tgt.position) < this.settings.catchRadius) {
      this.inFlight = null;
      this.passCompleted = true;
      if (tgt.onCatch) tgt.onCatch(this.ball);
    }
  }

  _frame(facing) {
    this._fwd.set(Math.sin(facing), 0, Math.cos(facing));
    this._right.set(-Math.cos(facing), 0, Math.sin(facing));
  }

  _local(loco, w) {
    const rel = this._tmp.copy(w).sub(loco.position);
    return [rel.dot(this._right), rel.dot(this._fwd), w.y];
  }

  _world(loco, p, out) {
    return out.copy(loco.position).addScaledVector(this._right, p[0]).addScaledVector(this._fwd, p[1]).setY(p[2]);
  }

  _facingTo(loco, pos) {
    const dx = pos.x - loco.position.x, dz = pos.z - loco.position.z;
    return dx * dx + dz * dz < 1e-4 ? loco.facing : Math.atan2(dx, dz);
  }
};

// Debug-only pass target: a visible marker that catches the ball, holds it a
// moment and throws it back to the player. Enabled with ?debug in the URL.
ISO.DebugPassTarget = class {
  constructor({ position, getReceiver }) {
    this.name = 'debug target';
    this.position = position.clone();          // chest height catch point
    this.getReceiver = getReceiver;            // () => world point to throw back to
    this.holding = 0;
    this.ball = null;
    this.object = this._build();
  }

  onCatch(ball) {
    this.ball = ball;
    ball.setControlled();
    ball.holder = this;
    this.holding = 0.6;
  }

  update(dt) {
    this.object.children[2].rotation.z += dt * 2;
    if (!this.ball || this.ball.holder !== this) return;
    this.ball.place(this.position, dt);
    this.holding -= dt;
    if (this.holding > 0) return;
    // Throw it back on a flat arc.
    const to = this.getReceiver(), from = this.position, g = ISO.Basketball.GRAVITY;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
    const T = Math.max(0.2, d / 9);
    const v = new THREE.Vector3(dx / T, (to.y - from.y + 0.5 * g * T * T) / T, dz / T);
    this.ball.setFree(from, v, new THREE.Vector3(), 'pass');
    this.ball.holder = null;
    this.ball.returnPass = true;
    this.ball = null;
  }

  _build() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x35d0ff, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 32), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.position.x, 0.01, this.position.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, this.position.y, 8), mat);
    pole.position.set(this.position.x, this.position.y / 2, this.position.z);
    const target = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24), mat);
    target.position.copy(this.position);
    g.add(ring, pole, target);
    g.name = 'debug-pass-target';
    return g;
  }
};

function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
})();
