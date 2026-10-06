// ShootingSystem: Space handling for jump shots and pump fakes, plus the meter.
//
// Pressing Space starts a gather. What happens next depends on how long Space
// is held:
//   released before `fakeThreshold`  -> PUMP FAKE: the ball goes up to sell the
//                                       shot, feet stay down, ball never leaves
//                                       the hands, then it goes back to the dribble.
//   still held at `fakeThreshold`    -> COMMITTED jump shot (below).
//
// Jump-shot timeline (seconds since Space was pressed):
//   gather   0 .. gatherTime        ball comes from the dribble to the shooting pocket
//   set      .. takeoff             knees bend; the ball starts rising from the chest
//   rise     takeoff ..             jump; ball reaches the set point above the forehead
//   release  (extendTime)           shooting arm extends, ball leaves the hand
//   follow   .. land                follow-through held in the air
//   land     land .. end            absorb the landing, arms relax
// The animation always runs at the same pace. Letting go of Space decides
// *when* the arm extends; it can't be earlier than `setReached` (the ball must
// be up), and holding too long auto-releases at `autoRelease`.
//
// Timing & accuracy are continuous: the release is measured against one ideal
// moment (`idealRelease`, which puts the ball out of the hand at the top of the
// jump). Within ±greenHalfWindow it's GREEN (no aim error inside normal range).
// Outside it, the aim spread grows smoothly with how far outside green the
// release was, and with distance. A seeded random error within that spread
// moves the aim point; the hoop physics decides make or miss.
//
// State for other systems:
//   shots:  isShooting, shotCommitted, shotPhase, shotProgress, shotMeter,
//           releaseTiming, releaseOffset (s, + = late), releaseQuality,
//           releasePosition, releaseFeet, aimOffset, shotDistance, shotCount,
//           shotReleased (frame flag), timingZones
//   fakes:  isPumpFaking, pumpFakeProgress, pumpFakeCompleted (frame flag),
//           pumpFakeCount
(function () {
const TIMINGS = ['VERY EARLY', 'EARLY', 'PERFECT', 'LATE', 'VERY LATE'];

ISO.ShootingSystem = class {
  constructor(ball, options = {}) {
    const H = ISO.CONFIG.hoop;
    this.ball = ball;
    this.settings = Object.assign({
      fakeThreshold: 0.14,    // release Space before this = pump fake
      gatherTime: 0.2,
      takeoff: 0.36,
      airTime: 0.56,          // jump length (≈ 0.38 m high)
      raiseStart: 0.24,       // ball starts rising from the pocket
      setReached: 0.5,        // ball is up at the set point; earliest the arm can extend
      extendTime: 0.07,       // arm extension before the ball leaves the hand
      autoRelease: 0.8,       // holding longer than this releases automatically

      idealRelease: 0.58,     // perfect moment to let go (ball leaves at the jump's peak)
      greenHalfWindow: 0.02,  // ±20 ms = GREEN
      nearWindow: 0.07,       // up to 70 ms outside green = EARLY / LATE, beyond = VERY

      target: new THREE.Vector3(0, H.rimHeight, H.centerZ),
      backspin: 16,           // rad/s (~2.5 revolutions per second)
      // Ball positions in the body frame: [lateral (+ = shooter's right), forward, height]
      pocket: [0.1, 0.41, 1.05],
      setPoint: [0.16, 0.32, 1.85],
      releasePoint: [0.18, 0.3, 2.1],

      // Pump fake (seconds since the fake began)
      fakeTopPoint: [0.12, 0.34, 1.62], // ball at the chin: sells the shot
      fakeRise: 0.17,
      fakeHold: 0.07,
      fakeReturn: 0.22,

      // Accuracy (aim error at the rim, meters). See shotSpread().
      accuracy: {
        greenRange: 7.8,        // green releases are dead-on up to this distance
        deepGreenSpread: 0.06,  // ...then gain this much spread per meter beyond it
        minGreenDist: 0.9,      // closer than this the ball rises into the rim from below
        impossibleSpread: 0.06,
        // Off-green spread (at mid-range) = base + linear*off + quad*off^2,
        // where off = seconds outside the green window.
        base: 0.08, linear: 1.5, quad: 17,
        // Spread multiplier by shot distance (meters from the release to the
        // rim), interpolated: forgiving close, much harder from three and deep.
        distanceTable: [[0, 0.75], [1.7, 0.8], [4.2, 1.0], [6.9, 1.7], [9.0, 3.1], [12, 5]],
        depthScale: 1.25,       // misses are mostly short/long...
        lateralScale: 0.8,      // ...less often left/right
        timingBias: 0.25,       // early drifts short, late drifts long (in spreads)
      },
    }, options);
    const s = this.settings;
    s.land = s.takeoff + s.airTime;
    s.end = s.land + 0.35;
    s.fakeEnd = s.fakeRise + s.fakeHold + s.fakeReturn;

    // Public state: shots
    this.isShooting = false;         // gather started (until a fake is decided) or committed shot
    this.shotCommitted = false;      // Space held past the fake threshold
    this.shotPhase = null;           // 'gather' | 'set' | 'rise' | 'release' | 'follow' | 'land'
    this.shotProgress = 0;           // 0..1 over the whole move
    this.shotMeter = 0;              // 0..1 meter fill
    this.releaseTiming = null;       // one of TIMINGS once Space is released
    this.releaseOffset = 0;          // seconds from the ideal release (+ = late)
    this.releaseQuality = 0;         // 0..1, 1 = dead-center
    this.releasePosition = new THREE.Vector3();
    this.releaseVelocity = new THREE.Vector3();
    this.releaseFeet = new THREE.Vector3();   // player's floor position at release (for 2 vs 3)
    this.aimOffset = { depth: 0, lateral: 0, spread: 0 }; // this shot's aim error
    this.shotDistance = 0;           // horizontal distance from release to the rim center
    this.shotCount = 0;
    this.shotReleased = false;       // true only on the frame the ball leaves the hand
    this.ballReleased = false;
    // Public state: pump fakes
    this.isPumpFaking = false;
    this.pumpFakeProgress = 0;
    this.pumpFakeCompleted = false;  // true only on the frame a fake finishes
    this.pumpFakeCount = 0;

    // Meter zones as fractions of the meter (for UI).
    const f = (t) => t / s.autoRelease;
    const g0 = s.idealRelease - s.greenHalfWindow, g1 = s.idealRelease + s.greenHalfWindow;
    this.timingZones = {
      nearStart: f(g0 - s.nearWindow), greenStart: f(g0), ideal: f(s.idealRelease),
      greenEnd: f(g1), nearEnd: f(g1 + s.nearWindow),
    };

    this.rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    this.t = 0;
    this.inputReleaseTime = null;    // when Space was let go (seconds since press)
    this.extendStart = null;         // when the arm starts extending
    this.handBack = 'right';         // dribble hand to return to after a fake
    this.drive = { velocity: new THREE.Vector3(), weight: 0, facing: 0 };
    this.hands = [
      { side: 1, target: new THREE.Vector3(), weight: 0 },   // shooting hand (right)
      { side: -1, target: new THREE.Vector3(), weight: 0 },  // guide hand (left)
    ];
    this.body = { crouch: 0, twist: 0, roll: 0, sway: 0 };

    this._start = null;
    this._fake = null;
    this._aim = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._ball = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._takeoffVel = new THREE.Vector3();
  }

  static get TIMINGS() { return TIMINGS; }

  get busy() { return this.isShooting || this.isPumpFaking; }

  // Begin a gather (becomes a shot or a pump fake). handWorld(side, out) gives
  // a hand's world position so the gather starts exactly where the hands are.
  // dribbleHand is where the ball goes back to after a fake.
  // opts: { variant: 'sidestep', sideDir: Vector3 (world hop direction),
  //         balance: 0..1 (1 = set and square; lower widens the aim spread) }
  start(loco, handWorld, dribbleHand = 'right', opts = {}) {
    this.isShooting = true;
    this.shotCommitted = false;
    this.variant = opts.variant || null;
    this.shotType = this.variant === 'sidestep' ? 'sidestep' : 'jumpshot';
    this.balance = opts.balance ?? 1;
    // A side-step hops sideways first; the jump-shot timeline starts on landing.
    this.pre = this.variant === 'sidestep' ? ISO.OFFENSE.sideStep.hopTime : 0;
    this.sideDir = opts.sideDir ? opts.sideDir.clone() : null;
    this.isPumpFaking = false;
    this.t = 0;
    this.shotPhase = 'gather';
    this.shotProgress = 0;
    this.shotMeter = 0;
    this.releaseTiming = null;
    this.releaseOffset = 0;
    this.releaseQuality = 0;
    this.inputReleaseTime = null;
    this.extendStart = null;
    this.ballReleased = false;
    this.shotReleased = false;
    this.handBack = dribbleHand;

    this._frame(loco.facing);
    const b = this.ball;
    this._start = {
      ball: this._toLocal(loco, b.position),
      vel: this._localVel(loco, b.velocity),
      hands: this.hands.map((h) => this._toLocal(loco, handWorld(h.side, new THREE.Vector3()))),
    };
    this._tookOff = false;
    // (a side-step decides fake vs. shot after the hop, like a normal gather:
    //  let go during the hop = side-step pump fake, keep holding = jumper)
  }

  // Advance the timeline. `held` = Space is down; `releaseAge` = how long ago
  // (seconds, within this frame) Space was let go, for sub-frame timing.
  // Returns a Locomotion drive.
  update(dt, loco, held, releaseAge = 0) {
    this.shotReleased = false;
    this.pumpFakeCompleted = false;
    if (this.isPumpFaking) return this._updateFake(dt, loco);
    if (!this.isShooting) return null;
    const s = this.settings;
    this.t += dt;
    const t = this.shotTime;   // shot timeline (after any side-step hop)

    if (t < 0) return this._updateHop(loco);

    // Undecided gather: a quick tap turns into a pump fake.
    if (!this.shotCommitted) {
      if (!held && t - releaseAge < s.fakeThreshold) {
        this._beginFake(loco);
        return this._updateFake(0, loco);
      }
      if (t >= s.fakeThreshold) this.shotCommitted = true;
    }

    // Space released (or held too long) decides when the arm extends.
    if (this.shotCommitted && this.inputReleaseTime === null && (!held || t >= s.autoRelease)) {
      this.inputReleaseTime = held ? s.autoRelease : Math.min(s.autoRelease, Math.max(0, t - releaseAge));
      // (released during a side-step hop counts as a very early release)
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
      this.shotCommitted = false;
      this.shotPhase = null;
      return null;
    }
    return d;
  }

  // After the body has moved this frame: place the ball and hands, and launch
  // the ball when its release moment arrives.
  place(dt, loco) {
    this._frame(loco.facing);
    if (this.isPumpFaking) { this._placeFake(dt, loco); return; }
    if (!this.isShooting) return;
    const s = this.settings;
    const t = this.shotTime;
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

  // Time on the jump-shot timeline (negative during a side-step hop).
  get shotTime() { return this.t - (this.pre || 0); }

  // Side-step: plant and hop sideways (feet barely leave the floor), facing
  // the rim, then the jump shot starts on landing.
  _updateHop(loco) {
    const O = ISO.OFFENSE.sideStep;
    const u = Math.min(1, this.t / this.pre);
    this.shotPhase = 'sidestep';
    this.shotMeter = 0;
    const d = this.drive;
    d.facing = this._facingToBasket(loco);
    const speed = (O.hopDist / this.pre) * (Math.PI / 2) * Math.sin(Math.PI * u);
    d.velocity.copy(this.sideDir).multiplyScalar(speed);
    d.weight = 0.9;
    // Hop direction relative to the body, for the leg pose (+ = character right).
    this._frame(d.facing);
    this._hopSide = Math.sign(this.sideDir.dot(this._right)) || 1;
    return d;
  }

  // Body height added by the jump at time t (a real gravity arc).
  jumpHeight(t) {
    const s = this.settings;
    if (!this.shotCommitted || t <= s.takeoff || t >= s.land) return 0;
    const g = ISO.Basketball.GRAVITY;
    const tt = t - s.takeoff;
    const v0 = (g * s.airTime) / 2;
    return v0 * tt - 0.5 * g * tt * tt;
  }

  // Pose info for PlayerModel.
  getPose() {
    if (this.isPumpFaking) return { hands: this.hands, body: this.body, stance: 1 };
    if (!this.isShooting) return null;
    // Keep the athletic stance until landing, then let it relax.
    return { hands: this.hands, body: this.body, stance: this.shotTime < this.settings.land ? 1 : 0 };
  }

  getShotPose() {
    const s = this.settings;
    if (this.isPumpFaking) {
      return { fake: true, u: this._fake.t / s.fakeEnd, rise: s.fakeRise / s.fakeEnd, hold: (s.fakeRise + s.fakeHold) / s.fakeEnd };
    }
    if (!this.isShooting) return null;
    const t = this.shotTime;
    const pose = { t, gatherEnd: s.gatherTime, takeoff: s.takeoff, land: s.land, end: s.end, jumpY: this.jumpHeight(t) };
    if (this.pre > 0 && t < 0.12) pose.hop = { u: Math.min(1, this.t / this.pre), side: this._hopSide };
    return pose;
  }

  // ---- accuracy ----------------------------------------------------------------

  // Seconds outside the green window for a release offset (0 = green).
  // (A tiny tolerance keeps the label and the accuracy in agreement at the edge.)
  offGreen(offset) {
    const off = Math.abs(offset) - this.settings.greenHalfWindow;
    return off <= 1e-6 ? 0 : off;
  }

  // Aim spread (meters, 1 standard deviation) for a release that was `off`
  // seconds outside green, from `dist` meters. 0 = dead center.
  shotSpread(off, dist, releasePos) {
    const a = this.settings.accuracy;
    if (off <= 0) {
      // Green: on the money inside normal range, unless the spot itself makes
      // the shot impossible (under the rim, behind the board).
      const impossible = dist < a.minGreenDist || (releasePos && this._boardInPath(releasePos));
      if (impossible) return a.impossibleSpread;
      return Math.max(0, dist - a.greenRange) * a.deepGreenSpread;
    }
    return (a.base + a.linear * off + a.quad * off * off) * this.distanceFactor(dist);
  }

  // Close shots are forgiving, threes less so, very deep shots much harder.
  distanceFactor(d) {
    const tbl = this.settings.accuracy.distanceTable;
    if (d <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (d <= tbl[i][0]) {
        const [d0, f0] = tbl[i - 1], [d1, f1] = tbl[i];
        return f0 + (f1 - f0) * (d - d0) / (d1 - d0);
      }
    }
    return tbl[tbl.length - 1][1];
  }

  // Aim error for a release, in the shot's own frame: depth (+ = long, - = short)
  // and lateral (+ = to the shooter's right). Early releases tend short, late
  // ones long. Randomness comes from the seeded rng.
  aimError(offset, dist, releasePos) {
    const a = this.settings.accuracy;
    let spread = this.shotSpread(this.offGreen(offset), dist, releasePos);
    // Balance: a moving, hopping or tired shooter is less accurate. Off-green
    // spread grows; even a green release picks up a little spread when the
    // shooter is clearly off balance (green window itself is unchanged).
    const bal = this.balance ?? 1;
    if (spread > 0) spread *= 1 + (1 - bal) * 1.5;
    else spread = Math.max(0, 0.9 - bal) * 0.12;
    if (spread <= 0) return { depth: 0, lateral: 0, spread: 0 };
    const bias = Math.sign(offset) * a.timingBias;
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

  // ---- internals -------------------------------------------------------------

  _judge(tr) {
    const s = this.settings;
    const offset = tr - s.idealRelease;
    const off = this.offGreen(offset);
    this.releaseOffset = offset;
    let i;
    if (off === 0) i = 2;
    else if (off <= s.nearWindow) i = offset < 0 ? 1 : 3;
    else i = offset < 0 ? 0 : 4;
    this.releaseTiming = TIMINGS[i];
    this.releaseQuality = off === 0
      ? 1 - 0.1 * Math.abs(offset) / s.greenHalfWindow
      : 0.85 * Math.max(0, 1 - off / 0.2);
  }

  // Ball position along the shot path (world space).
  _ballLocal(t, jumpY, out, loco) {
    const s = this.settings;
    let p;
    if (this.pre > 0 && t < s.gatherTime) {
      // Side-step: the ball is gathered during the hop and waits in the pocket.
      if (t < 0) {
        const u = (t + this.pre) / this.pre, T = this.pre;
        p = [0, 1, 2].map((i) => hermite(this._start.ball[i], this._start.vel[i] * T, s.pocket[i], 0, u));
      } else p = s.pocket.slice();
      p[2] = Math.max(this.ball.radius, p[2]);
    } else if (t < s.gatherTime) {
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
      this._twoHands(b);
      // Blend in from where the hands actually were so nothing snaps.
      const g = smoothstep(0, 0.16, this.t);
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

  // Shooting hand under/behind the ball, guide hand on its side.
  _twoHands(b) {
    this._offset(b, 0.01, -0.075, -0.09, this.hands[0].target);
    this._offset(b, -0.13, -0.01, -0.01, this.hands[1].target);
  }

  // ---- pump fake ---------------------------------------------------------------

  _beginFake(loco) {
    this.isShooting = false;
    this.shotCommitted = false;
    this.shotPhase = null;
    this.isPumpFaking = true;
    this.pumpFakeProgress = 0;
    this._fake = {
      t: 0,
      ball: this._toLocal(loco, this.ball.position),
      vel: this._localVel(loco, this.ball.velocity),
      handsStartT: this.t,     // gather time already spent (hands may still be blending in)
    };
  }

  _updateFake(dt, loco) {
    const s = this.settings;
    const f = this._fake;
    f.t += dt;
    this.pumpFakeProgress = Math.min(1, f.t / s.fakeEnd);

    // Feet stay planted: movement strongly damped, facing the basket.
    const d = this.drive;
    d.facing = this._facingToBasket(loco);
    d.velocity.set(0, 0, 0);
    d.weight = f.t < s.fakeEnd - 0.08 ? 0.75 : 0.3;

    if (f.t >= s.fakeEnd) {
      this.isPumpFaking = false;
      this.pumpFakeCompleted = true;
      this.pumpFakeCount++;
      return null;
    }
    return d;
  }

  _placeFake(dt, loco) {
    const s = this.settings;
    const f = this._fake;
    const t = f.t, r = this.ball.radius;
    const side = this.handBack === 'right' ? 1 : -1;
    // Where the dribble picks the ball back up (top of its bounce, in the hand).
    const back = [0.34 * side, 0.32, 0.8];

    let p;
    if (t < s.fakeRise) {
      // Up to the chin, continuing smoothly from the gather.
      const u = t / s.fakeRise, T = s.fakeRise;
      p = [0, 1, 2].map((i) => hermite(f.ball[i], f.vel[i] * T, s.fakeTopPoint[i], 0, u));
    } else if (t < s.fakeRise + s.fakeHold) {
      p = s.fakeTopPoint.slice();
    } else {
      // Back down into the dribble, arriving with the dribble's push-down speed.
      const u = Math.min(1, (t - s.fakeRise - s.fakeHold) / s.fakeReturn), T = s.fakeReturn;
      p = [0, 1, 2].map((i) => hermite(s.fakeTopPoint[i], 0, back[i], i === 2 ? -1.2 * T : 0, u));
    }
    p[2] = Math.max(r, p[2]);
    this._toWorld(loco, p[0], p[1], p[2], this._ball);
    this.ball.place(this._ball, dt);

    // Both hands on the ball, then the dribble hand rides it down while the
    // other hand lets go.
    const b = this.ball.position;
    this._twoHands(b);
    const g = smoothstep(0, 0.16, f.handsStartT + t);
    if (g < 1) {
      for (let i = 0; i < 2; i++) {
        const h = this._start.hands[i];
        const from = this._toWorld(loco, h[0], h[1], h[2], this._tmp);
        this.hands[i].target.lerpVectors(from, this.hands[i].target, g);
      }
    }
    const handOff = smoothstep(s.fakeRise + s.fakeHold, s.fakeEnd - 0.04, t);
    const dribbleHand = side > 0 ? this.hands[0] : this.hands[1];
    const otherHand = side > 0 ? this.hands[1] : this.hands[0];
    const onTop = this._tmp.copy(b).setY(b.y + r + 0.015);
    dribbleHand.target.lerp(onTop, handOff);
    dribbleHand.weight = 1;
    otherHand.weight = 1 - handOff;
  }

  // ---- launch ------------------------------------------------------------------

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

  // Detach the ball with a velocity that carries it toward the aim point (the
  // rim center plus this release's error) on a natural arc. Physics then
  // decides make or miss.
  _launch(pos, loco) {
    const s = this.settings;
    const g = ISO.Basketball.GRAVITY;
    const rim = s.target;
    const d0 = Math.hypot(rim.x - pos.x, rim.z - pos.z);

    const err = this.aimError(this.releaseOffset, d0, pos);
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
    // then solve the flight: up to the apex and down to the aim point.
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

  // ---- frame helpers -------------------------------------------------------------

  _frame(facing) {
    this._fwd.set(Math.sin(facing), 0, Math.cos(facing));
    this._right.set(-Math.cos(facing), 0, Math.sin(facing));
  }

  _toLocal(loco, w) {
    const rel = this._tmp.copy(w).sub(loco.position);
    return [rel.dot(this._right), rel.dot(this._fwd), w.y];
  }

  // Ball velocity relative to the body (capped: it only shapes the start of a
  // curve, so a glitchy reading must never fling the ball).
  _localVel(loco, vel) {
    const v = this._tmp.copy(vel).sub(loco.velocity).clampLength(0, 6);
    return [v.dot(this._right), v.dot(this._fwd), v.y];
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
