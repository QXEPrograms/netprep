// Dribble moves beyond the crossover: spin, hesitation, in-and-out and
// behind-the-back. Each is a small class run by the DribbleController while it
// is in MOVE mode. A move:
//   - starts from wherever the ball actually is (position and velocity), so
//     it can begin mid-dribble or chain out of another move without a jump
//   - places the ball each frame in the body frame (lateral, forward, height)
//   - asks for hand targets/weights and body pose extras (crouch, twist,
//     roll, sway, jab, stride, forward)
//   - may steer the body (speedScale, or a full Locomotion drive for the spin)
//   - ends with the ball at the top of a dribble in `exitHand`
//
// All moves are written for the current ball side `s` (+1 right, -1 left), so
// left/right versions are exact mirrors of the same code.
(function () {
const CFG = () => ISO.OFFENSE.moves;

class DribbleMove {
  constructor(name) {
    this.name = name;
    this.active = false;
    this.progress = 0;
    this.completed = false;   // true only on the frame the move ends
    this.count = 0;
    this.exactFrame = false;  // body frame follows facing exactly (fast rotations)
    this.t = 0;
  }

  start(dr, mover, opts, execScale) {
    this.active = true;
    this.t = 0;
    this.progress = 0;
    this.completed = false;
    this.duration = CFG()[this.name].duration * execScale;
    this.side = dr.sideSign;
    this.s0 = dr.captureBall();
  }

  // Advance; returns true when finished. Subclasses place the ball.
  step(dt) {
    this.t += dt;
    this.progress = Math.min(1, this.t / this.duration);
    return this.progress;
  }

  finish() {
    this.active = false;
    this.completed = true;
    this.count++;
  }

  get exitHand() { return this.side > 0 ? 'right' : 'left'; }
  get exitBurst() { return 1; }
  speedScale() { return 1; }
  drive() { return null; }

  // The hand that controls the ball if the move is cut short now.
  currentHand() { return this.exitHand; }
}

// ---------------------------------------------------------------------------
// HESITATION: rise up, slow down, let the ball hang in the hand, then explode.
class HesitationMove extends DribbleMove {
  constructor() {
    super('hesitation');
    this.isHesitating = false;
    this.hesitationProgress = 0;
    this.hesitationPhase = null;   // 'rise' | 'hang' | 'explode'
    this.hesitationCount = 0;
  }

  start(dr, mover, opts, execScale) {
    super.start(dr, mover, opts, execScale);
    this.isHesitating = true;
  }

  update(dt, dr) {
    const u = this.step(dt), s = this.side, r = dr.radius, a = this.s0;
    this.hesitationProgress = u;
    this.hesitationPhase = u < 0.3 ? 'rise' : u < 0.55 ? 'hang' : 'explode';
    const hangY = dr.top + 0.06;
    const lat1 = s * 0.34, fwd1 = dr.forward() - 0.03;
    const D = this.duration;
    let lat, fwd, y;
    if (u < 0.3) {
      // Bring the ball up into the hand and hold it a beat longer than usual.
      const v = u / 0.3, T = 0.3 * D;
      lat = hermite(a.lat, a.vlat * T, lat1, 0, v);
      fwd = hermite(a.fwd, a.vfwd * T, fwd1, 0, v);
      y = hermite(a.y, a.vy * T, hangY, 0, v);
    } else if (u < 0.55) {
      lat = lat1; fwd = fwd1;
      y = hangY + 0.015 * Math.sin(Math.PI * (u - 0.3) / 0.25);
    } else if (u < 0.78) {
      // Explode: a hard push down...
      const v = (u - 0.55) / 0.23, T = 0.23 * D;
      lat = lat1 + 0.03 * s * v;
      fwd = fwd1 + 0.05 * v;
      y = hermite(hangY, 0, r, -4.6 * T, v);
    } else {
      // ...and back up into the hand at the top of a normal dribble.
      const v = (u - 0.78) / 0.22, T = 0.22 * D;
      lat = lat1 + 0.03 * s * (1 - v);
      fwd = lerp(fwd1 + 0.05, dr.forward(), v);
      y = hermite(r, 4.0 * T, dr.top, 0, v);
    }
    y = Math.max(r, y);
    const low = dr.place(lat, fwd, y, dt);
    dr.handFollow(s, lat1, fwd1, low, 1);
    dr.handOff(-s);

    // Body: rise (less knee bend, chest up) to sell a stop or a shot.
    const b = dr.body;
    b.crouch = -0.9 * bell(u, 0, 0.72);
    b.twist = 0.06 * s; b.roll = 0; b.sway = 0; b.jab = 0; b.stride = 1; b.forward = 0;
    return u >= 1;
  }

  // Movement slows during the rise/hang, then is released for the explode.
  speedScale() {
    return 1 - (1 - CFG().hesitation.slowdown) * bell(this.progress, 0.02, 0.72);
  }

  finish() {
    super.finish();
    this.isHesitating = false;
    this.hesitationPhase = null;
    this.hesitationCount++;
  }
}

// ---------------------------------------------------------------------------
// IN-AND-OUT: ball and body fake toward the other side, ball stays in the
// same hand, then it's pushed back out and the player goes that way.
class InAndOutMove extends DribbleMove {
  constructor() {
    super('inAndOut');
    this.isInAndOut = false;
    this.inAndOutProgress = 0;
    this.inAndOutFakeDirection = 0;   // +1 = fake toward the character's right
    this.inAndOutExitDirection = 0;
    this.fakeWorldDir = new THREE.Vector3();
    this.exitWorldDir = new THREE.Vector3();
    this.inAndOutCount = 0;
  }

  start(dr, mover, opts, execScale) {
    super.start(dr, mover, opts, execScale);
    this.isInAndOut = true;
    this.inAndOutFakeDirection = -this.side;
    this.inAndOutExitDirection = this.side;
  }

  update(dt, dr) {
    const u = this.step(dt), s = this.side, r = dr.radius, a = this.s0, D = this.duration;
    this.inAndOutProgress = u;
    this.fakeWorldDir.copy(dr.right).multiplyScalar(-s);
    this.exitWorldDir.copy(dr.right).multiplyScalar(s);
    // In: the hand carries the ball toward the middle (high, in front of the
    // thighs so it never crosses the legs). Out: push it back wide and down.
    const inLat = s * 0.07, inFwd = 0.44, inY = 0.8;
    const outLat = s * 0.44, outFwd = 0.38;
    let lat, fwd, y;
    if (u < 0.45) {
      const v = u / 0.45, T = 0.45 * D;
      lat = hermite(a.lat, a.vlat * T, inLat, 0, v);
      fwd = hermite(a.fwd, a.vfwd * T, inFwd, 0, v);
      y = hermite(a.y, a.vy * T, inY, 0, v);
    } else if (u < 0.72) {
      const v = (u - 0.45) / 0.27, T = 0.27 * D;
      lat = hermite(inLat, 0, outLat, s * 0.8 * T, v);
      fwd = lerp(inFwd, outFwd, v);
      y = hermite(inY, 0, r, -4.8 * T, v);
    } else {
      const v = (u - 0.72) / 0.28, T = 0.28 * D;
      lat = lerp(outLat, s * 0.34, smooth(v));
      fwd = lerp(outFwd, dr.forward(), v);
      y = hermite(r, 4.2 * T, dr.top, 0, v);
    }
    y = Math.max(r, y);
    const low = dr.place(lat, fwd, y, dt);
    // The hand rides the outside of the ball going in, then pushes it out.
    dr.handFollow(s, s * 0.34, dr.forward(), low, 1, s * 0.05);
    dr.handOff(-s);

    // Body sells the fake: shoulders, lean, hips and the lead foot go toward
    // the fake side, then everything returns to the ball side.
    const fake = bell(u, 0, 0.55), back = bell(u, 0.45, 1);
    const b = dr.body;
    b.crouch = 0.8 * Math.sin(Math.PI * u);
    b.twist = 0.06 * s - 0.24 * s * fake + 0.1 * s * back;
    b.roll = -0.12 * s * fake + 0.08 * s * back;
    b.sway = -0.08 * s * fake + 0.07 * s * back;
    b.jab = -s * bell(u, 0.02, 0.48);
    b.stride = 1; b.forward = 0;
    return u >= 1;
  }

  speedScale() { return this.progress < 0.5 ? 0.85 : 1; }
  get exitBurst() { return 0.9; }

  finish() {
    super.finish();
    this.isInAndOut = false;
    this.inAndOutCount++;
  }
}

// ---------------------------------------------------------------------------
// BEHIND-THE-BACK: ball goes from one hand, behind the hips (bouncing once
// behind the player), to the other hand. Hips shift forward and the stride
// shortens so the ball has room behind the legs.
class BehindBackMove extends DribbleMove {
  constructor() {
    super('behindBack');
    this.isBehindBack = false;
    this.behindBackProgress = 0;
    this.behindBackDirection = 0;     // +1 = ball moving to the character's right
    this.behindBackWorldDir = new THREE.Vector3();
    this.behindBackCount = 0;
  }

  start(dr, mover, opts, execScale) {
    super.start(dr, mover, opts, execScale);
    this.isBehindBack = true;
    this.behindBackDirection = -this.side;
  }

  get exitHand() { return this.side > 0 ? 'left' : 'right'; }
  currentHand() { return this.progress > 0.5 ? this.exitHand : (this.side > 0 ? 'right' : 'left'); }
  get exitBurst() { return 0.6; }

  update(dt, dr) {
    const u = this.step(dt), s = this.side, to = -s, r = dr.radius, a = this.s0, D = this.duration;
    this.behindBackProgress = u;
    this.behindBackWorldDir.copy(dr.right).multiplyScalar(to);

    // Around the back on an arc: angle measured from straight ahead toward the
    // character's right. Starts at the ball side, passes directly behind,
    // ends on the other side in front.
    const a0 = 0.9;
    const e = smoothstep(0.05, 0.9, u);
    const theta = s * (a0 + (2 * Math.PI - 2 * a0) * e);
    const R = 0.45 + 0.08 * Math.sin(Math.PI * e);
    let lat = R * Math.sin(theta), fwd = R * Math.cos(theta);
    // Blend in from where the ball actually started, and out into the dribble.
    const w0 = 1 - smoothstep(0, 0.22, u);
    lat = lerp(lat, a.lat, w0); fwd = lerp(fwd, a.fwd, w0);
    const w1 = smoothstep(0.82, 1, u);
    lat = lerp(lat, to * 0.34, w1); fwd = lerp(fwd, dr.forward(), w1);

    // Height: pushed down to bounce once behind, then up into the new hand.
    const ub = 0.5;
    let y;
    if (u < ub) { const v = u / ub, T = ub * D; y = hermite(a.y, a.vy * T, r, -5 * T, v); }
    else { const v = (u - ub) / (1 - ub), T = (1 - ub) * D; y = hermite(r, 4.4 * T, dr.top, 0, v); }
    y = Math.max(r, y);
    const low = dr.place(lat, fwd, y, dt, 0.4);

    // Passing hand pushes the ball back past the hip and lets go; receiving
    // hand reaches back on its side and rides the ball up.
    dr.handFollow(s, s * 0.3, -0.05, low, 1 - smoothstep(0.25, 0.5, u), 0, -0.12);
    dr.handFollow(to, to * 0.38, 0.0, low, smoothstep(0.3, 0.62, u), 0, -0.1);

    const b = dr.body;
    b.crouch = 1.0 * Math.sin(Math.PI * u);
    b.forward = 0.08 * bell(u, 0.05, 0.85);           // hips forward: room behind
    b.stride = 1 - 0.65 * bell(u, 0.02, 0.95);        // short steps while the ball is behind
    b.twist = lerp(0.06 * s, 0.06 * to, smoothstep(0.3, 0.8, u)) + 0.12 * to * bell(u, 0.4, 1);
    b.roll = 0.1 * to * bell(u, 0.4, 1);
    b.sway = 0.06 * to * bell(u, 0.4, 1);
    b.jab = 0;
    return u >= 1;
  }

  speedScale() { return 0.95; }

  finish() {
    super.finish();
    this.isBehindBack = false;
    this.behindBackCount++;
  }
}

// ---------------------------------------------------------------------------
// SPIN: plant, protect the ball at the hip, turn your back and rotate away,
// exit in a new direction. The body turns away from the exit side (to spin
// left you rotate right ~290°), carrying the ball around on the outside so it
// stays protected. Moving spins curve around an imaginary defender ahead.
class SpinMove extends DribbleMove {
  constructor() {
    super('spin');
    this.exactFrame = true;
    this.isSpinning = false;
    this.spinDirection = 0;            // +1 = exits to the left (Z), -1 = right (X)
    this.spinProgress = 0;
    this.spinPhase = null;             // 'plant' | 'rotate' | 'exit'
    this.spinWorldDirection = new THREE.Vector3();  // travel direction going in
    this.spinExitDirection = new THREE.Vector3();   // travel direction coming out
    this.spinCount = 0;
    this._drive = { velocity: new THREE.Vector3(), weight: 0, facing: 0, exactFacing: true };
  }

  // opts: { dir: +1 left / -1 right, basket: Vector3 }
  start(dr, mover, opts, execScale) {
    super.start(dr, mover, opts, execScale);
    const cfg = CFG().spin;
    this.isSpinning = true;
    this.spinDirection = opts.dir;
    // The ball comes out in the exit-side hand (body between ball and defender);
    // if it went in with the other hand it wraps across the front on the way out.
    this.exitSide = opts.dir > 0 ? -1 : 1;
    const v = mover.velocity;
    this.speed0 = Math.hypot(v.x, v.z);
    const entry = this.spinWorldDirection;
    if (this.speed0 > 1.5) entry.set(v.x, 0, v.z).normalize();
    else entry.set(opts.basket.x - mover.position.x, 0, opts.basket.z - mover.position.z).normalize();
    // Exit: rotate the entry direction toward the chosen side.
    const ang = opts.dir * (this.speed0 > 1.5 ? cfg.exitAngle : 0.8);
    const c = Math.cos(ang), sn = Math.sin(ang);
    this.spinExitDirection.set(entry.x * c + entry.z * sn, 0, -entry.x * sn + entry.z * c);
    this.exitSpeed = this.speed0 > 1.5 ? Math.max(3.2, Math.min(5.4, this.speed0 * 0.9)) : 2.6;
    this.speedIn = this.speed0;

    // Body rotation: away from the exit side, more than half a turn.
    this.startYaw = mover.facing;
    const exitYaw = Math.atan2(this.spinExitDirection.x, this.spinExitDirection.z);
    let rot = Math.atan2(Math.sin(exitYaw - this.startYaw), Math.cos(exitYaw - this.startYaw));
    while (-opts.dir * rot < Math.PI * 0.9) rot += -opts.dir * 2 * Math.PI;
    this.rotation = rot;
  }

  facingAt(u) {
    return this.startYaw + this.rotation * smootherstep(clamp01((u - 0.12) / 0.66));
  }

  // Steers velocity and facing (called before Locomotion updates).
  drive() {
    const u = this.progress, d = this._drive, en = this.spinWorldDirection, ex = this.spinExitDirection;
    const plant = smoothstep(0, 0.22, u);
    const speedPlant = lerp(this.speedIn, 1.2, plant);
    const turn = smoothstep(0.22, 0.88, u);
    d.velocity.set(en.x * speedPlant, 0, en.z * speedPlant).multiplyScalar(1 - turn)
      .addScaledVector(ex, this.exitSpeed * turn);
    d.weight = u < 0.9 ? 0.85 : 0.4;
    d.facing = this.facingAt(Math.min(1, u + 0.02));
    return d;
  }

  update(dt, dr) {
    const u = this.step(dt), s = this.side, r = dr.radius, a = this.s0, D = this.duration;
    this.spinProgress = u;
    const e = this.exitSide, wrap = e !== s;
    const exitAt = wrap ? 0.68 : 0.78;
    this.spinPhase = u < 0.2 ? 'plant' : u < exitAt ? 'rotate' : 'exit';
    // Ball: pulled to the hip on the outside and held there while the body
    // turns (so it rides around with the body), then put back into the dribble
    // in the exit-side hand.
    const hip = [s * 0.42, 0.04, 0.92];
    let lat, fwd, y, v = 0;
    if (u < 0.2) {
      const v = u / 0.2, T = 0.2 * D;
      lat = hermite(a.lat, a.vlat * T, hip[0], 0, v);
      fwd = hermite(a.fwd, a.vfwd * T, hip[1], 0, v);
      y = hermite(a.y, a.vy * T, hip[2], 0, v);
    } else if (u < exitAt) {
      const w = Math.sin(Math.PI * (u - 0.2) / (exitAt - 0.2));
      lat = hip[0] + s * 0.03 * w; fwd = hip[1]; y = hip[2] + 0.02 * w;
    } else {
      v = (u - exitAt) / (1 - exitAt);
      const T = (1 - exitAt) * D;
      if (wrap) {
        // Wrap: out in front first (clear of the torso), then across.
        lat = hip[0] + (e * 0.34 - hip[0]) * smoothstep(0.15, 1, v);
        fwd = lerp(hip[1], dr.forward(), v) + 0.3 * Math.sin(Math.PI * Math.min(1, v * 1.15));
      } else {
        lat = hermite(hip[0], 0, s * 0.34, 0, v);
        fwd = hermite(hip[1], 0, dr.forward(), 0.6 * T, v);
      }
      y = hermite(hip[2], 0, dr.top, -0.8 * T, v);
    }
    y = Math.max(r, y);
    const low = dr.place(lat, fwd, y, dt, 0);
    // The hand meets the ball as it comes up, then cups it from the outside;
    // the other arm stays out as a bar.
    const cup = smoothstep(0.1, 0.24, u);
    if (cup < 1) {
      dr.handFollow(s, s * 0.36, 0.1, low, 1);
      this._follow = (this._follow || new THREE.Vector3()).copy(dr.hands[s > 0 ? 0 : 1].target);
    }
    const handOver = wrap ? smoothstep(0.3, 0.65, v) : 0;
    dr.handCup(s, 0.09, 0.05, 1 - handOver);
    if (cup < 1) dr.hands[s > 0 ? 0 : 1].target.lerp(this._follow, 1 - cup);
    if (wrap && v > 0) dr.handFollow(e, e * 0.34, dr.forward(), low, handOver);
    else dr.handOff(-s);

    const turnSign = Math.sign(this.rotation);   // + = turning left (yaw increasing)
    const b = dr.body;
    b.crouch = 1.15 * bell(u, 0, 1);
    b.roll = -s * 0.1 * bell(u, 0.1, 0.85);                    // lean away from the ball
    b.turnRoll = 1 - bell(u, 0, 1);                            // no lean into the fast pivot
    b.twist = 0.06 * s - turnSign * 0.3 * bell(u, 0.08, 0.8);   // shoulders lead the turn
    b.sway = 0; b.jab = 0; b.forward = 0;
    b.stride = 1 - 0.75 * bell(u, 0.04, 0.92);                // pivot, not running steps
    return u >= 1;
  }

  speedScale() { return 1; }
  get exitHand() { return this.exitSide > 0 ? 'right' : 'left'; }
  currentHand() {
    const handOver = this.exitSide === this.side ? 0 : 0.68 + 0.32 * 0.45;
    return this.progress >= handOver && handOver ? this.exitHand : (this.side > 0 ? 'right' : 'left');
  }

  finish() {
    super.finish();
    this.isSpinning = false;
    this.spinPhase = null;
    this.spinCount++;
  }
}

ISO.DribbleMoves = { SpinMove, HesitationMove, InAndOutMove, BehindBackMove };

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
function smoothstep(a, b, v) { return smooth((v - a) / (b - a)); }
function smootherstep(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function bell(v, a, b) { const t = clamp01((v - a) / (b - a)); return Math.sin(Math.PI * t) ** 2; }
function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
})();
