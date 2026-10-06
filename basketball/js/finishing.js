// FinishSystem: contextual finishes at the rim — layups, dunks and floaters.
// (What Space means is decided in gather.js; this module performs the finish.)
//
// Timeline per finish (seconds since Space was pressed; see OFFENSE.<kind>):
//   gather   ball comes from the dribble into both hands, angled to the rim
//   steps    one-two steps (the body is steered to a good takeoff spot)
//   takeoff  jump; the ball rises with the finishing hand
//   release  the ball leaves the hand
//   land     absorb the landing; normal control returns
//
// The ball always physically leaves the hand: it gets a solved velocity aimed
// at the rim center plus an aim error. The error's spread comes from approach
// quality (angle, speed, takeoff distance, hand side, fatigue) — never a
// coin flip — and the hoop physics decides make or miss. A dunk lifts the ball
// over the rim and pushes it down through the hoop; a bad dunk approach can
// still clang off the rim.
//
// State for other systems: busy, finishType ('layup' | 'dunk' | 'floater'),
// finishPhase, finishProgress, finishHand, approachQuality, aimOffset,
// shotType, shotReleased (frame flag), releasePosition, releaseFeet,
// releaseTiming (null; finishes don't use the meter), shotCount.
(function () {
const H = ISO.CONFIG.hoop;

ISO.FinishSystem = class {
  constructor(ball) {
    this.ball = ball;
    this.rim = new THREE.Vector3(0, H.rimHeight, H.centerZ);
    this.busy = false;
    this.finishType = null;
    this.finishPhase = null;        // 'gather' | 'steps' | 'rise' | 'release' | 'air' | 'land'
    this.finishProgress = 0;
    this.finishHand = 'right';
    this.protected = false;
    this.approachQuality = 1;       // 0..1
    this.aimOffset = { depth: 0, lateral: 0, spread: 0 };
    this.shotType = null;
    this.shotReleased = false;
    this.ballReleased = false;
    this.releaseTiming = null;
    this.releasePosition = new THREE.Vector3();
    this.releaseVelocity = new THREE.Vector3();
    this.releaseFeet = new THREE.Vector3();
    this.shotCount = 0;
    this.rng = Math.random;

    this.t = 0;
    this.drive = { velocity: new THREE.Vector3(), weight: 0, facing: 0 };
    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 0 },
      { side: -1, target: new THREE.Vector3(), weight: 0 },
    ];
    this.body = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0, stride: 1, forward: 0 };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._air = new THREE.Vector3();
  }

  // Drop whatever is in progress (possession reset / role change).
  cancel() {
    this.busy = false;
    this.finishType = null;
    this.finishPhase = null;
    this.finishProgress = 0;
    this.shotReleased = false;
    this.ballReleased = false;
    this.t = 0;
    this._tookOff = false;
    this._air.set(0, 0, 0);
    this.drive.weight = 0;
    this.drive.velocity.set(0, 0, 0);
  }

  // Use a seeded generator (e.g. the ShootingSystem's) for reproducible tests.
  setRng(rng) { this.rng = rng; }

  // plan: from Gather.determineScoringAction ({ action, hand, protected, ctx }).
  start(plan, loco, handWorld) {
    const O = ISO.OFFENSE;
    const kind = plan.action;
    const cfg = O[kind];
    this.busy = true;
    this.finishType = kind;
    this.shotType = kind;
    this.protected = !!plan.protected;
    this.finishHand = plan.hand;
    this.ctx = plan.ctx;
    this.t = 0;
    this.ballReleased = false;
    this.shotReleased = false;
    this.releaseTiming = null;
    this._tookOff = false;

    // Timeline
    const tl = this.tl = {};
    tl.gather = cfg.gather;
    tl.takeoff = this.protected ? cfg.protectedTakeoff : cfg.takeoff;
    tl.jump = this.protected ? cfg.protectedJump : cfg.jump;
    tl.air = cfg.air;
    tl.release = tl.takeoff + cfg.releaseAfterTakeoff;
    tl.land = tl.takeoff + tl.air;
    tl.end = tl.land + O.finishRecover[kind];          // landing recovery (offense-config.js)

    this.approachQuality = this._approachQuality(kind);
    this._twoHanded = kind === 'dunk' && Math.abs(plan.ctx.sideOffset) < 0.35;

    // Capture where the ball and hands are in the body's current frame (the
    // same frame place() uses), so the gather starts exactly from there even
    // when the body isn't facing the rim yet (e.g. coming out of a spin).
    this._frame(loco.facing);
    this._start = {
      ball: this._local(loco, this.ball.position),
      vel: this._localVel(loco),
      hands: this.hands.map((h) => this._local(loco, handWorld(h.side, new THREE.Vector3()))),
    };
  }

  // ---- timeline & movement -------------------------------------------------

  update(dt, loco) {
    this.shotReleased = false;
    if (!this.busy) return null;
    const tl = this.tl, t = (this.t += dt), kind = this.finishType;
    this.finishProgress = Math.min(1, t / tl.end);
    this.finishPhase = t < tl.gather ? 'gather' : t < tl.takeoff ? 'steps' : !this.ballReleased && t < tl.release ? 'rise'
      : t < tl.land ? 'air' : 'land';

    const d = this.drive;
    d.facing = this._facingToRim(loco);
    const toRim = this._toRim(loco);
    const dist = toRim.dist;
    if (t < tl.takeoff) {
      // Steer to a good takeoff spot (the one-two steps).
      const O = ISO.OFFENSE;
      // Layups started right under the rim step back out to a usable spot.
      const stepOut = O.finishing.underRimStepOut;
      const takeoffDist = kind === 'dunk' ? O.dunk.releaseDist + 2.4 * O.dunk.releaseAfterTakeoff
        : kind === 'layup' ? (this.protected || dist < O.layup.takeoffDist ? Math.max(dist, stepOut) : O.layup.takeoffDist) : dist;
      const remain = Math.max(0.05, tl.takeoff - t);
      if (kind === 'floater') {
        const speed = Math.max(0, this.ctx.approachSpeed * 0.6);
        d.velocity.set(toRim.x * speed, 0, toRim.z * speed);
      } else {
        // Takeoff spot: takeoffDist from the rim on the player's side, swung
        // out in front of the backboard when coming along the baseline (so
        // the finish never goes up under the board).
        let ang = Math.atan2(loco.position.x - this.rim.x, loco.position.z - this.rim.z);
        if (dist < 0.15) ang = 0;
        const maxAng = O.finishing.maxTakeoffAngle;
        ang = Math.max(-maxAng, Math.min(maxAng, ang));
        const sx = this.rim.x + Math.sin(ang) * takeoffDist, sz = this.rim.z + Math.cos(ang) * takeoffDist;
        d.velocity.set(sx - loco.position.x, 0, sz - loco.position.z).divideScalar(remain)
          .clampLength(0, Math.max(4.5, this.ctx.speed));
      }
      d.weight = this.protected ? 0.8 : 0.75;
    } else if (t < tl.land) {
      if (!this._tookOff) {
        // Carry through the air toward the rim (fixed once airborne).
        this._tookOff = true;
        const O = ISO.OFFENSE;
        const relT = tl.release - tl.takeoff;
        let airSpeed;
        if (kind === 'dunk') airSpeed = (dist - O.dunk.releaseDist) / relT;
        else if (kind === 'layup') airSpeed = (dist - (this.protected ? dist : 1.0)) / relT;
        else airSpeed = 0.8;
        airSpeed = Math.max(0, Math.min(3.2, airSpeed));
        this._air.set(toRim.x * airSpeed, 0, toRim.z * airSpeed);
        this.releaseFeet.set(loco.position.x, 0, loco.position.z);
      }
      d.velocity.copy(this._air);
      // After the release the body keeps drifting a little, slowing to land.
      // A dunker stops under the rim's front instead of drifting under the
      // ball as it drops through the net.
      if (this.ballReleased) d.velocity.multiplyScalar(kind === 'dunk' ? 0.1 : 0.6);
      d.weight = 1;
    } else {
      d.velocity.set(0, 0, 0);
      d.weight = Math.max(0, 1 - (t - tl.land) / (tl.end - tl.land));
    }

    if (t >= tl.end) {
      this.busy = false;
      this.finishPhase = null;
      return null;
    }
    return d;
  }

  jumpHeight(t) {
    const tl = this.tl;
    if (!tl || t <= tl.takeoff || t >= tl.land) return 0;
    const tt = t - tl.takeoff, T = tl.air;
    // Up and down in `air` seconds reaching `jump` meters: a gravity-like arc
    // scaled to the planned height.
    return tl.jump * 4 * (tt / T) * (1 - tt / T);
  }

  // ---- ball & hands --------------------------------------------------------

  place(dt, loco) {
    if (!this.busy) return;
    const tl = this.tl, t = this.t, kind = this.finishType;
    this._frame(loco.facing);
    const jumpY = this.jumpHeight(t);
    const h = this.finishHand === 'right' ? 1 : -1;
    // Carry: chest height, out in front so it clears the chest even in the dip.
    const carry = kind === 'dunk' ? [h * 0.1, 0.37, 1.15] : kind === 'floater' ? [h * 0.12, 0.36, 1.25] : [h * 0.2, 0.35, 1.12];
    const release = kind === 'dunk' ? [h * 0.08, 0.3, 2.3] : kind === 'floater' ? [h * 0.12, 0.3, 2.15] : [h * 0.2, 0.38, 2.2];

    if (!this.ballReleased) {
      let p;
      if (t < tl.gather) {
        const u = t / tl.gather, T = tl.gather;
        p = [0, 1, 2].map((i) => hermite(this._start.ball[i], this._start.vel[i] * T, carry[i], 0, u));
        p[2] = Math.max(this.ball.radius, p[2]);
      } else if (t < tl.takeoff) {
        p = carry.slice();
        p[2] += 0.03 * Math.sin(Math.PI * (t - tl.gather) / Math.max(0.05, tl.takeoff - tl.gather));
      } else {
        const u = smoothstep(tl.takeoff - 0.04, tl.release, t);
        p = carry.map((v, i) => v + (release[i] - v) * u);
      }
      this._world(loco, p[0], p[1], p[2] + jumpY, this._p);
      if (t >= tl.release) this._launch(this._p, loco);
      else this.ball.place(this._p, dt);
    }

    // Hands: both on the ball through the gather and steps; the finishing hand
    // carries it up (two hands for a straight-on dunk), then follows through.
    const fin = h > 0 ? this.hands[0] : this.hands[1];
    const other = h > 0 ? this.hands[1] : this.hands[0];
    const b = this.ball.position;
    if (!this.ballReleased) {
      fin.target.copy(b).addScaledVector(this._right, h * 0.02).addScaledVector(this._fwd, -0.06);
      fin.target.y = b.y - 0.1;
      other.target.copy(b).addScaledVector(this._right, -h * 0.13);
      other.target.y = b.y;
      const g = smoothstep(0, 0.14, t);
      if (g < 1) {
        for (const [i, hd] of [[h > 0 ? 0 : 1, fin], [h > 0 ? 1 : 0, other]]) {
          const st = this._start.hands[i];
          hd.target.lerpVectors(this._world(loco, st[0], st[1], st[2], this._tmp), hd.target, g);
        }
      }
      // While the ball is still coming up from the dribble the hands wait at
      // waist height and meet it on the way up (never reach for the floor).
      if (t < tl.takeoff) for (const hd of this.hands) hd.target.y = Math.max(hd.target.y, 0.84);
      fin.weight = 1;
      if (this._twoHanded) {
        // Both hands behind the ball for a two-hand slam (keeps it in reach).
        other.target.copy(b).addScaledVector(this._right, -h * 0.1).addScaledVector(this._fwd, -0.06);
        other.target.y = b.y - 0.08;
        other.weight = 1;
      } else {
        other.weight = 1 - smoothstep(tl.takeoff, tl.takeoff + 0.12, t);
      }
    } else {
      // Follow-through: the finishing arm stays up toward the rim (a dunking
      // hand comes back off the rim instead of hanging inside it).
      const f = kind === 'dunk' ? 0.12 : release[1] + 0.06, up = kind === 'dunk' ? release[2] - 0.15 : release[2] - 0.12;
      this._world(loco, release[0], f, up + jumpY, fin.target);
      fin.weight = 1 - smoothstep(tl.land - 0.05, tl.end, t);
      if (this._twoHanded) {
        this._world(loco, -h * 0.12, f, up - 0.05 + jumpY, other.target);
        other.weight = 1 - smoothstep(tl.release, tl.release + 0.25, t);
      } else other.weight = 0;
    }

    // Body: lean into the drive, then rise tall into the finish.
    const bd = this.body;
    bd.crouch = t < tl.takeoff ? 0.6 * smoothstep(tl.gather, tl.takeoff, t) : 0;
    bd.twist = 0.08 * h * smoothstep(tl.takeoff, tl.release, t);
    bd.roll = 0; bd.sway = 0; bd.jab = 0; bd.stride = 1; bd.forward = 0;
  }

  getPose() {
    if (!this.busy) return null;
    return { hands: this.hands, body: this.body, stance: this.t < this.tl.land ? 1 : 0 };
  }

  getFinishPose() {
    if (!this.busy) return null;
    const tl = this.tl;
    return {
      kind: this.finishType, t: this.t, gather: tl.gather, takeoff: tl.takeoff, release: tl.release, land: tl.land, end: tl.end,
      jumpY: this.jumpHeight(this.t), lead: this.finishHand === 'right' ? 1 : -1, protected: this.protected,
    };
  }

  // Defense: the last moment before the release (the ball up at the rim on a
  // dunk, extended on a layup/floater). Only here can a defender's hand touch it.
  get inReleaseWindow() {
    return this.busy && !this.ballReleased && this.t >= this.tl.release - ISO.OFFENSE.finishReleaseWindow;
  }

  // A defender's hand got to the ball at the release: it comes loose now with
  // the motion it has (the contact itself is resolved by the ball physics).
  knockLoose(loco) {
    if (!this.inReleaseWindow) return false;
    const b = this.ball;
    this.releaseContest = this.contestProvider ? this.contestProvider(this.finishType) : 0;
    this.releaseVelocity.copy(b.velocity);
    b.setFree(this._p.copy(b.position), this.releaseVelocity, this._tmp.set(0, 0, 0), 'shot');
    b.holder = null;
    this.releasePosition.copy(b.position);
    if (!this._tookOff) this.releaseFeet.set(loco.position.x, 0, loco.position.z);
    this.ballReleased = true;
    this.shotReleased = true;
    this.shotCount++;
    return true;
  }

  // Bumped by the defender in the air: lose the drift going into them.
  absorbContact(nx, nz) {
    const v = this._air, vn = v.x * nx + v.z * nz;
    if (this._tookOff && vn > 0) { v.x -= nx * vn * 0.8; v.z -= nz * vn * 0.8; }
  }

  // ---- accuracy & launch ---------------------------------------------------

  // 0..1: how good the approach is for this finish (1 = ideal).
  _approachQuality(kind) {
    const c = this.ctx;
    let q = 1;
    q -= 0.35 * this._angleFactor();
    if (kind === 'dunk') q -= 0.3 * Math.max(0, (6 - c.approachSpeed) / 6);
    if (kind === 'floater') q -= 0.25 * Math.min(1, Math.abs(c.dist - ISO.OFFENSE.floater.idealDist) / 2);
    q -= 0.3 * c.fatigueEffect;
    return Math.max(0, Math.min(1, q));
  }

  // 0..1 how far off-line the approach is. Only matters when actually moving
  // (a standing player has no approach angle to be off by).
  _angleFactor() {
    const c = this.ctx;
    return Math.min(1, c.approachAngle / 1.3) * Math.min(1, c.speed / 2.5);
  }

  // Aim spread (meters, 1 std dev) from the approach.
  spreadFor(kind) {
    const c = this.ctx, O = ISO.OFFENSE;
    const angle = this._angleFactor();
    if (kind === 'dunk') {
      const s = O.dunk.spread, F = O.finishing;
      const a = Math.min(1, c.approachAngle / F.dunkMaxAngle);
      const off = Math.max(0, 1.5 - c.dist, c.dist - 2.3);
      return s.base + s.angle * a * a + s.speed * Math.max(0, (6.5 - c.approachSpeed) / 3) +
        s.takeoff * off + s.fatigue * c.fatigueEffect;
    }
    if (kind === 'floater') {
      const s = O.floater.spread;
      return s.base + s.distance * Math.abs(c.dist - O.floater.idealDist) + s.angle * angle +
        s.speed * Math.abs(c.approachSpeed - 3) + s.fatigue * c.fatigueEffect;
    }
    const s = O.layup.spread;
    const handSide = c.sideOffset > 0.35 ? 'right' : c.sideOffset < -0.35 ? 'left' : null;
    let sp = s.base + s.angle * angle + s.speed * Math.max(0, (c.approachSpeed - 5) / 3) +
      s.fatigue * c.fatigueEffect + (handSide && handSide !== this.finishHand ? s.wrongHand : 0);
    if (this.protected) sp += 0.02 + s.distance * Math.max(0, c.dist - 1.2);
    else sp += s.distance * Math.max(0, Math.abs(c.dist - O.layup.takeoffDist) - 0.6);
    return sp;
  }

  _launch(pos, loco) {
    const g = ISO.Basketball.GRAVITY, kind = this.finishType, rim = this.rim;
    // Defense: contest at the release widens the finish spread (0 alone).
    this.releaseContest = this.contestProvider ? this.contestProvider(kind) : 0;
    const E = ISO.DEFENSE && ISO.DEFENSE.contestEffect;
    const spread = this.spreadFor(kind) * (E ? 1 + (E[kind] || 0) * this.releaseContest : 1);
    const d0 = Math.hypot(rim.x - pos.x, rim.z - pos.z);
    const ux = d0 > 1e-4 ? (rim.x - pos.x) / d0 : 0, uz = d0 > 1e-4 ? (rim.z - pos.z) / d0 : -1;
    const depth = gauss(this.rng) * 1.1 * spread, lateral = gauss(this.rng) * 0.9 * spread;
    this.aimOffset = { depth, lateral, spread };
    const tx = rim.x + ux * depth - uz * lateral, tz = rim.z + uz * depth + ux * lateral, ty = rim.y;
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);

    const vel = this.releaseVelocity;
    if (kind === 'dunk' && pos.y > ty + 0.05) {
      // Push it down through the hoop from above.
      // Time to fall from the release height to the rim plane at vy0:
      // 0.5 g t^2 - vy0 t - drop = 0.
      const vy0 = -2.2, drop = pos.y - ty;
      const tt = Math.max(0.05, (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * drop)) / g);
      vel.set(dx / tt, vy0, dz / tt);
    } else {
      // Soft arc: apex a little above the rim (layup; higher when released
      // close so it clears the front of the rim) or high (floater).
      const above = kind === 'floater' ? ISO.OFFENSE.floater.arcAbove + 0.05 * d
        : ISO.OFFENSE.layup.arcAbove + 0.4 * Math.max(0, 1.1 - d);
      const apex = Math.max(pos.y, ty) + above;
      const vy = Math.sqrt(2 * g * (apex - pos.y));
      const T = vy / g + Math.sqrt((2 * (apex - ty)) / g);
      vel.set(dx / T, vy, dz / T);
    }
    const spin = this._tmp.set(-dz, 0, dx);
    if (spin.lengthSq() > 1e-8) spin.normalize().multiplyScalar(kind === 'dunk' ? 4 : 10);
    this.ball.setFree(pos, vel, spin, 'shot');
    this.ball.holder = null;
    this.releasePosition.copy(pos);
    if (!this._tookOff) this.releaseFeet.set(loco.position.x, 0, loco.position.z);
    this.ballReleased = true;
    this.shotReleased = true;
    this.shotCount++;
  }

  // ---- frame helpers ---------------------------------------------------------

  _toRim(loco) {
    const dx = this.rim.x - loco.position.x, dz = this.rim.z - loco.position.z;
    const dist = Math.hypot(dx, dz);
    return dist > 1e-4 ? { x: dx / dist, z: dz / dist, dist } : { x: 0, z: -1, dist };
  }

  _facingToRim(loco) {
    const r = this._toRim(loco);
    return r.dist < 0.2 ? loco.facing : Math.atan2(r.x, r.z);
  }

  _frame(facing) {
    this._fwd.set(Math.sin(facing), 0, Math.cos(facing));
    this._right.set(-Math.cos(facing), 0, Math.sin(facing));
  }

  _local(loco, w) {
    const rel = this._tmp.copy(w).sub(loco.position);
    return [rel.dot(this._right), rel.dot(this._fwd), w.y];
  }

  _localVel(loco) {
    const v = this._tmp.copy(this.ball.velocity).sub(loco.velocity).clampLength(0, 6);
    return [v.dot(this._right), v.dot(this._fwd), v.y];
  }

  _world(loco, lat, fwd, y, out) {
    return out.copy(loco.position).addScaledVector(this._right, lat).addScaledVector(this._fwd, fwd).setY(y);
  }
};

function smoothstep(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function gauss(rng) { const u = Math.max(1e-9, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
})();
