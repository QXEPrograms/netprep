// ShootingSystem: the jump shot, from gather to landing, plus the shot meter.
//
// Timeline (seconds since Space was pressed; see `settings`):
//   gather   0 .. gatherTime        ball comes from the dribble to the shooting pocket
//   set      .. takeoff             knees bend; the ball starts rising from the chest
//   rise     takeoff ..             jump; ball reaches the set point above the forehead
//   release  (extendTime)           shooting arm extends, ball leaves the hand
//   follow   .. land                follow-through held in the air
//   land     land .. end            absorb the landing, arms relax
//
// The animation always runs at the same pace. Letting go of Space decides
// *when* the arm extends; it can't be earlier than `setReached` (the ball must
// be up), and holding too long auto-releases at `autoRelease`. Timing is
// judged from the moment Space is released.
//
// The meter: shotMeter goes 0 -> 1 from the press to autoRelease. The ideal
// window is centered so the ball leaves the hand at the top of the jump.
//
// Accuracy: the release timing (and distance) sets a spread; a seeded random
// error within that spread moves the aim point off the rim center, and the
// hoop physics decides make or miss. A green release inside normal range has
// no error, so it flies through the center of the rim.
//
// State for other systems: isShooting, shotPhase, shotProgress, shotMeter,
// releaseTiming, releaseQuality, releasePosition, releaseFeet, aimOffset,
// shotDistance, shotCount, shotReleased (true on the frame the ball leaves the
// hand), timingZones.
(function () {
const TIMINGS = ['VERY EARLY', 'EARLY', 'PERFECT', 'LATE', 'VERY LATE'];

ISO.ShootingSystem = class {
  constructor(ball, options = {}) {
    const H = ISO.CONFIG.hoop;
    this.ball = ball;
    this.settings = Object.assign({
      gatherTime: 0.2,
      takeoff: 0.36,
      airTime: 0.56,          // jump length (≈ 0.38 m high)
      raiseStart: 0.24,       // ball starts rising from the pocket
      setReached: 0.5,        // ball is up at the set point; earliest the arm can extend
      extendTime: 0.07,       // arm extension before the ball leaves the hand
      autoRelease: 0.8,       // holding longer than this releases automatically
      // Release-time thresholds (seconds after the press).
      zones: { early: 0.38, perfect: 0.53, late: 0.63, veryLate: 0.74 },
      target: new THREE.Vector3(0, H.rimHeight, H.centerZ),
      backspin: 16,           // rad/s (~2.5 revolutions per second)
      // Ball positions in the body frame: [lateral (+ = shooter's right), forward, height]
      pocket: [0.1, 0.3, 1.05],
      setPoint: [0.16, 0.22, 1.85],
      releasePoint: [0.18, 0.3, 2.1],

      // Accuracy (aim error at the rim, meters). See shotSpread().
      accuracy: {
        greenRange: 8.5,        // green releases are dead-on up to this distance
        deepGreenSpread: 0.05,  // ...then gain this much spread per meter beyond it
        minGreenDist: 0.9,      // closer than this the ball rises into the rim from below
        impossibleSpread: 0.06,
        offBase: 0.07, offSlope: 0.12,    // EARLY / LATE
        veryBase: 0.18, verySlope: 0.15,  // VERY EARLY / VERY LATE
        minDistFactor: 0.6,
        deepFrom: 8, deepSlope: 0.25,     // extra difficulty for very deep shots
        depthScale: 1.25,       // misses are mostly short/long...
        lateralScale: 0.8,      // ...less often left/right
        timingBias: 0.25,       // early drifts short, late drifts long (in spreads)
      },
    }, options);
    const s = this.settings;
    s.land = s.takeoff + s.airTime;
    s.end = s.land + 0.35;

    // Public state
    this.isShooting = false;
    this.shotPhase = null;           // 'gather' | 'set' | 'rise' | 'release' | 'follow' | 'land'
    this.shotProgress = 0;           // 0..1 over the whole move
    this.shotMeter = 0;              // 0..1 meter fill
    this.releaseTiming = null;       // one of TIMINGS once Space is released
    this.releaseQuality = 0;         // 0..1, 1 = dead-center of the ideal window
    this.releasePosition = new THREE.Vector3();
    this.releaseVelocity = new THREE.Vector3();
    this.releaseFeet = new THREE.Vector3();   // player's floor position at release (for 2 vs 3)
    this.aimOffset = { depth: 0, lateral: 0, spread: 0 }; // this shot's aim error
    this.rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    this._aim = new THREE.Vector3();
    this.shotDistance = 0;           // horizontal distance from release to the rim center
    this.shotCount = 0;
    this.shotReleased = false;       // true only on the frame the ball leaves the hand
    this.ballReleased = false;
    // Meter zones as fractions of the meter (for UI).
    this.timingZones = {
      early: s.zones.early / s.autoRelease,
      perfect: s.zones.perfect / s.autoRelease,
      late: s.zones.late / s.autoRelease,
      veryLate: s.zones.veryLate / s.autoRelease,
    };

    this.t = 0;
    this.inputReleaseTime = null;    // when Space was let go
    this.extendStart = null;         // when the arm starts extending
    this.drive = { velocity: new THREE.Vector3(), weight: 0, facing: 0 };
    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 0 },   // shooting hand (right)
      { side: -1, target: new THREE.Vector3(), weight: 0 },  // guide hand (left)
    ];
    this.body = { crouch: 0, twist: 0, roll: 0 };

    this._start = null;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._ball = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._takeoffVel = new THREE.Vector3();
  }

  static get TIMINGS() { return TIMINGS; }

  // Begin a shot. handWorld(side, out) gives the current world position of a
  // hand so the gather can start exactly where the hands are.
  start(loco, handWorld) {
    this.isShooting = true;
    this.t = 0;
    this.shotPhase = 'gather';
    this.shotProgress = 0;
    this.shotMeter = 0;
    this.releaseTiming = null;
    this.releaseQuality = 0;
    this.inputReleaseTime = null;
    this.extendStart = null;
    this.ballReleased = false;
    this.shotReleased = false;

    this._frame(loco.facing);
    const toLocal = (w) => {
      const rel = this._tmp.copy(w).sub(loco.position);
      return [rel.dot(this._right), rel.dot(this._fwd), w.y];
    };
    const b = this.ball;
    // Ball velocity relative to the body (capped: it only shapes the start of
    // the gather curve, so a glitchy reading must never fling the ball).
    const v = this._tmp.copy(b.velocity).sub(loco.velocity).clampLength(0, 6);
    const vel = [v.dot(this._right), v.dot(this._fwd), v.y];
    this._start = {
      ball: toLocal(b.position),
      vel,
      hands: this.hands.map((h) => toLocal(handWorld(h.side, new THREE.Vector3()))),
    };
    this._tookOff = false;
  }

  // Advance the timeline. `held` = Space is down. Returns a Locomotion drive.
  update(dt, loco, held) {
    this.shotReleased = false;
    if (!this.isShooting) return null;
    const s = this.settings;
    this.t += dt;
    const t = this.t;

    // Space released (or held too long) decides when the arm extends.
    if (this.inputReleaseTime === null && (!held || t >= s.autoRelease)) {
      this.inputReleaseTime = Math.min(t, s.autoRelease);
      this._judge(this.inputReleaseTime);
    }
    if (this.inputReleaseTime !== null && this.extendStart === null) {
      this.extendStart = Math.max(this.inputReleaseTime, s.setReached);
    }
    this.shotMeter = Math.min(1, (this.inputReleaseTime ?? t) / s.autoRelease);
    this.shotProgress = Math.min(1, t / s.end);

    // Phase name
    if (t < s.gatherTime) this.shotPhase = 'gather';
    else if (t < s.takeoff) this.shotPhase = 'set';
    else if (t >= s.land) this.shotPhase = 'land';
    else if (this.ballReleased) this.shotPhase = 'follow';
    else if (this.extendStart !== null && t >= this.extendStart) this.shotPhase = 'release';
    else this.shotPhase = 'rise';

    // Movement: momentum bleeds off through the gather; in the air the player
    // keeps a little of their takeoff drift; on landing they settle, then
    // normal control returns.
    const d = this.drive;
    d.facing = this._facingToBasket(loco);
    if (t < s.gatherTime) {
      d.velocity.set(0, 0, 0);
      d.weight = 0.2 + 0.5 * (t / s.gatherTime);
    } else if (t < s.takeoff) {
      d.velocity.set(0, 0, 0);
      d.weight = 0.8;
    } else if (t < s.land) {
      if (!this._tookOff) {
        this._tookOff = true;
        this._takeoffVel.copy(loco.velocity).multiplyScalar(0.5);
      }
      d.velocity.copy(this._takeoffVel);
      d.weight = 1;
    } else {
      d.velocity.set(0, 0, 0);
      d.weight = Math.max(0, 1 - (t - s.land) / (s.end - s.land));
    }

    if (t >= s.end) {
      this.isShooting = false;
      this.shotPhase = null;
      return null;
    }
    return d;
  }

  // After the body has moved this frame: place the ball and hands, and launch
  // the ball when its release moment arrives.
  place(dt, loco) {
    if (!this.isShooting) return;
    const s = this.settings;
    const t = this.t;
    this._frame(loco.facing);
    const jumpY = this.jumpHeight(t);

    if (!this.ballReleased) {
      this._ballLocal(t, jumpY, this._ball, loco);
      const releaseAt = this.extendStart !== null ? this.extendStart + s.extendTime : Infinity;
      if (t >= releaseAt) {
        this._launch(this._ball, loco);
      } else {
        this.ball.place(this._ball, dt);
      }
    }

    this._placeHands(t, jumpY, loco);
  }

  // Body height added by the jump at time t (a real gravity arc).
  jumpHeight(t) {
    const s = this.settings;
    if (t <= s.takeoff || t >= s.land) return 0;
    const g = ISO.Basketball.GRAVITY;
    const tt = t - s.takeoff;
    const v0 = (g * s.airTime) / 2;
    return v0 * tt - 0.5 * g * tt * tt;
  }

  // Pose info for PlayerModel.
  getPose() {
    if (!this.isShooting) return null;
    // Keep the athletic stance until landing, then let it relax.
    return { hands: this.hands, body: this.body, stance: this.t < this.settings.land ? 1 : 0 };
  }

  getShotPose() {
    if (!this.isShooting) return null;
    const s = this.settings;
    return { t: this.t, gatherEnd: s.gatherTime, takeoff: s.takeoff, land: s.land, end: s.end, jumpY: this.jumpHeight(this.t) };
  }

  // ---- internals -------------------------------------------------------------

  _judge(tr) {
    const z = this.settings.zones;
    let i;
    if (tr < z.early) i = 0;
    else if (tr < z.perfect) i = 1;
    else if (tr <= z.late) i = 2;
    else if (tr <= z.veryLate) i = 3;
    else i = 4;
    this.releaseTiming = TIMINGS[i];
    const center = (z.perfect + z.late) / 2;
    this.releaseQuality = Math.max(0, 1 - Math.abs(tr - center) / 0.3);
  }

  // Ball position along the shot path (world space).
  _ballLocal(t, jumpY, out, loco) {
    const s = this.settings;
    let p;
    if (t < s.gatherTime) {
      // Hermite from wherever the ball was (with its velocity) into the pocket.
      const u = t / s.gatherTime, T = s.gatherTime;
      const a = this._start.ball, v = this._start.vel, b = s.pocket;
      p = [0, 1, 2].map((i) => hermite(a[i], v[i] * T, b[i], 0, u));
      p[2] = Math.max(this.ball.radius, p[2]);
    } else {
      // Rise smoothly from the pocket to the set point through the dip and jump.
      p = lerp3(s.pocket, s.setPoint, smoothstep(s.raiseStart, s.setReached, t));
      if (this.extendStart !== null && t > this.extendStart) {
        const u = Math.min(1, (t - this.extendStart) / s.extendTime);
        p = lerp3(p, s.releasePoint, u * u); // accelerating extension
      }
    }
    return this._toWorld(loco, p[0], p[1], p[2] + jumpY, out);
  }

  _placeHands(t, jumpY, loco) {
    const s = this.settings;
    const shoot = this.hands[0], guide = this.hands[1];
    const b = this.ball.position;

    if (!this.ballReleased) {
      // Shooting hand under/behind the ball, guide hand on its side.
      this._offset(b, 0.01, -0.075, -0.09, shoot.target);
      this._offset(b, -0.13, -0.01, -0.01, guide.target);
      // Blend in from where the hands actually were so nothing snaps.
      const g = smoothstep(0, 0.16, t);
      if (g < 1) {
        for (let i = 0; i < 2; i++) {
          const h = this._start.hands[i];
          const from = this._toWorld(loco, h[0], h[1], h[2], this._tmp);
          this.hands[i].target.lerpVectors(from, this.hands[i].target, g);
        }
      }
      shoot.weight = 1;
      guide.weight = 1;
    } else {
      // Follow-through: shooting arm stays up and out toward the rim, then relaxes
      // after landing. Guide hand comes off the ball.
      const rp = s.releasePoint;
      this._toWorld(loco, rp[0] - 0.01, rp[1] + 0.06, rp[2] - 0.11 + jumpY, shoot.target);
      shoot.weight = 1 - smoothstep(s.land + 0.08, s.end, t);
      guide.weight = 1 - smoothstep(this._releaseT, this._releaseT + 0.2, t);
    }
  }

  // How far off the aim point can be (meters, 1 standard deviation) for this
  // release. 0 = dead center. Timing sets the base spread; distance scales it.
  shotSpread(timing, quality, dist, releasePos) {
    const a = this.settings.accuracy;
    if (timing === 'PERFECT') {
      // Green: on the money inside normal range, unless the spot itself makes
      // the shot impossible (under the rim, behind the board).
      const impossible = dist < a.minGreenDist || this._boardInPath(releasePos);
      if (impossible) return a.impossibleSpread;
      return Math.max(0, dist - a.greenRange) * a.deepGreenSpread;
    }
    const q = Math.max(0, Math.min(1, quality));
    const base = (timing === 'EARLY' || timing === 'LATE')
      ? a.offBase + a.offSlope * (1 - q)
      : a.veryBase + a.verySlope * (1 - q);
    return base * this.distanceFactor(dist);
  }

  // From behind or beside the backboard, would the ball's path to the rim
  // run into the board? (Corner threes are beside the board and clear it.)
  _boardInPath(pos) {
    const H = ISO.CONFIG.hoop, rim = this.settings.target, r = this.ball.radius;
    const faceZ = H.boardZ + r, halfW = H.boardWidth / 2 + r;
    if (pos.z >= faceZ) return false;                 // in front of the board
    if (Math.abs(pos.x) <= halfW) return true;        // directly behind it
    const edgeX = Math.sign(pos.x) * halfW;
    const t = (pos.x - edgeX) / (pos.x - rim.x);      // where the path reaches the board's edge
    return pos.z + (rim.z - pos.z) * t < faceZ;
  }

  // Close shots are forgiving, threes less so, very deep shots much harder.
  distanceFactor(d) {
    const a = this.settings.accuracy;
    return Math.max(a.minDistFactor, 0.55 + 0.1 * d) + Math.max(0, d - a.deepFrom) * a.deepSlope;
  }

  // Aim error for a release, in the shot's own frame: depth (+ = long, - = short)
  // and lateral (+ = to the shooter's right). Early releases tend short, late
  // ones long. Randomness comes from the seeded rng.
  aimError(timing, quality, dist, releasePos) {
    const a = this.settings.accuracy;
    const spread = this.shotSpread(timing, quality, dist, releasePos);
    if (spread <= 0) return { depth: 0, lateral: 0, spread: 0 };
    const bias = timing.includes('EARLY') ? -a.timingBias : timing.includes('LATE') ? a.timingBias : 0;
    return {
      depth: (gauss(this.rng) * a.depthScale + bias) * spread,
      lateral: gauss(this.rng) * a.lateralScale * spread,
      spread,
    };
  }

  // Seed the shot randomness (for reproducible tests).
  setSeed(seed) {
    this.rng = mulberry32(seed >>> 0);
  }

  // Detach the ball with a velocity that carries it toward the aim point (the
  // rim center plus this release's error) on a natural arc. Physics then
  // decides make or miss.
  _launch(pos, loco) {
    const s = this.settings;
    const g = ISO.Basketball.GRAVITY;
    const rim = s.target;
    const d0 = Math.hypot(rim.x - pos.x, rim.z - pos.z);

    const err = this.aimError(this.releaseTiming, this.releaseQuality, d0, pos);
    this.aimOffset = err;
    const ux = d0 > 1e-4 ? (rim.x - pos.x) / d0 : 0, uz = d0 > 1e-4 ? (rim.z - pos.z) / d0 : 1;
    // Shooter's right, looking at the rim, is (-uz, ux).
    const tgt = this._aim.set(
      rim.x + ux * err.depth - uz * err.lateral,
      rim.y,
      rim.z + uz * err.depth + ux * err.lateral
    );
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
    const d = Math.hypot(dx, dz);

    // Pick the apex height from the distance (higher arc for longer shots),
    // then solve the flight: up to the apex and down to the rim.
    const arc = Math.min(2.1, Math.max(0.6, 0.55 + 0.17 * d));
    const apex = Math.max(pos.y, tgt.y) + arc;
    const vy = Math.sqrt(2 * g * (apex - pos.y));
    const T = vy / g + Math.sqrt((2 * (apex - tgt.y)) / g);
    const vel = this.releaseVelocity.set(d > 1e-4 ? (dx / d) * (d / T) : 0, vy, d > 1e-4 ? (dz / d) * (d / T) : 0);

    // Backspin: the top of the ball turns back toward the shooter.
    const spin = this._tmp.set(0, 0, 0);
    if (d > 1e-4) spin.set(-dz / d, 0, dx / d).multiplyScalar(s.backspin);

    this.ball.setFree(pos, vel, spin);
    this.ball.holder = null;
    this.releasePosition.copy(pos);
    if (loco) this.releaseFeet.set(loco.position.x, 0, loco.position.z);
    this.shotDistance = d0;
    this.ballReleased = true;
    this.shotReleased = true;
    this.shotCount++;
    this._releaseT = this.t;
  }

  _frame(facing) {
    this._fwd.set(Math.sin(facing), 0, Math.cos(facing));
    this._right.set(-Math.cos(facing), 0, Math.sin(facing));
  }

  _toWorld(loco, lat, fwd, y, out) {
    return out.copy(loco.position)
      .addScaledVector(this._right, lat)
      .addScaledVector(this._fwd, fwd)
      .setY(y);
  }

  _offset(from, lat, fwd, up, out) {
    return out.copy(from)
      .addScaledVector(this._right, lat)
      .addScaledVector(this._fwd, fwd)
      .setY(from.y + up);
  }

  _facingToBasket(loco) {
    const tgt = this.settings.target;
    const dx = tgt.x - loco.position.x, dz = tgt.z - loco.position.z;
    if (dx * dx + dz * dz < 0.04) return loco.facing;
    return Math.atan2(dx, dz);
  }
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Standard normal sample (Box-Muller).
function gauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function smoothstep(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
})();
