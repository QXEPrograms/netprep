// DefenderAI: the CPU defender's brain. It only *decides*; DefensiveLocomotion
// executes. Each frame it returns an intention { velocity, faceTarget, allowRun }
// plus what the arms/body should do (handsUp, jump).
//
// Perception: the AI never reads the user's keys. Every frame the visible
// state of the ball handler (position, velocity, facing, dribble hand, move
// states, shot states, ball) is recorded; the AI acts on the snapshot from
// `reactionDelay` seconds ago (100-250 ms, varying with the situation plus a
// little seeded jitter), extrapolated a short way along the perceived velocity.
//
// Positioning: ball handler -> defender -> basket, used as a target (not a
// rail). The gap depends on distance to the rim and on whether the ball
// handler is driving; the spot shades toward the ball hand and, near the rim,
// sinks toward the basket.
//
// States: guarding, shading, reacting (biting on a move / respecting a fake),
// beaten, recovering, closeout, contest.
//
// Move reactions are chances that depend on context (how the defender is
// moving, how close, how balanced, what it has seen recently) — never fixed
// "this move always works".
(function () {
const H = ISO.CONFIG.hoop;

ISO.DefenderAI = class {
  constructor(defender) {
    this.defender = defender;
    this.cfg = ISO.DEFENSE;
    this.rim = new THREE.Vector3(0, 0, H.centerZ);
    this.rng = mulberry32(this.cfg.reaction.seed);

    this.state = 'guarding';
    this.stateTime = 0;
    this.reactionDelay = this.cfg.reaction.base;
    this._delayTarget = this.cfg.reaction.base;
    this._jitter = 0;
    this.time = 0;
    this._buf = [];
    this._perceivedT = 0;
    this.perceived = null;        // the snapshot being acted on
    this.prevPerceived = null;

    // Outputs
    this.intent = { velocity: new THREE.Vector3(), faceTarget: new THREE.Vector3(), allowRun: false };
    this.guardSpot = new THREE.Vector3();
    this.reactionTarget = new THREE.Vector3();   // where the AI thinks the ball handler is
    this.handsUp = 0;             // 0 active hands .. 0.5 ball-side hand up .. 1 contest
    this.wantJump = false;
    this.freeze = 0;              // seconds of reduced movement left (biting on a hesi/fake)

    // Reaction bookkeeping
    this.bite = null;             // { move, dir (world), until (perceived progress), shift }
    this.lastReaction = '';       // human-readable, for debug/tests
    this.reactionLog = [];
    this._lastCrossoverSeen = -99;
    this._recentCrossovers = [];
    this._recentFakes = [];
    this._spinBlind = null;
    this._carry = 0;
    this._carryVel = new THREE.Vector3();
    this.biteCount = 0;
    this._lastShotSeen = -99;
    this._jumpDecision = null;
    this.beatenCount = 0;

    this._u = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._A = new THREE.Vector3();
  }

  // Restart the reaction randomness (reproducible tests).
  reseed(seed) { this.rng = mulberry32(seed >>> 0); }

  // ---- perception ------------------------------------------------------------

  // Record what can be seen this frame (called before anyone moves).
  observe(dt) {
    this.time += dt;
    const P = this.defender.opponent;
    const L = P.locomotion, dr = P.dribble, sh = P.shooting, fi = P.finishing, sb = P.stepBack, ball = P.ball;
    const mv = dr && dr.active ? dr.currentMove : null;
    const m = dr ? dr.moves : {};
    const snap = {
      t: this.time,
      x: L.position.x, z: L.position.z, vx: L.velocity.x, vz: L.velocity.z, facing: L.facing,
      hasBall: P.hasBall, hand: dr ? dr.hand : 'right',
      move: mv, moveProgress: mv ? dr.moveProgress : 0,
      xFake: dr ? dr.crossoverFakeDirection : 0,
      ioFake: m.inAndOut ? m.inAndOut.inAndOutFakeDirection : 0,
      spinExitX: m.spin ? m.spin.spinExitDirection.x : 0, spinExitZ: m.spin ? m.spin.spinExitDirection.z : 0,
      hesiPhase: m.hesitation && m.hesitation.isHesitating ? m.hesitation.hesitationPhase : null,
      stepBack: sb.isSteppingBack,
      pumpFake: sh.isPumpFaking,
      shooting: sh.isShooting && sh.shotCommitted && !sh.ballReleased,
      shotType: sh.shotType,
      shotJump: sh.isShooting ? sh.jumpHeight(sh.shotTime) : 0,
      shotPhase: sh.isShooting ? sh.shotPhase : null,
      finishing: fi.busy && !fi.ballReleased,
      finishType: fi.busy ? fi.finishType : null,
      finishJump: fi.busy ? fi.jumpHeight(fi.t) : 0,
      released: (sh.isShooting && sh.ballReleased) || (fi.busy && fi.ballReleased),
      ballX: ball.position.x, ballY: ball.position.y, ballZ: ball.position.z,
    };
    this._buf.push(snap);
    while (this._buf.length > 2 && this._buf[1].t < this.time - 0.6) this._buf.shift();
  }

  _perceive(dt) {
    const R = this.cfg.reaction;
    // Situation-dependent delay, drifting smoothly (never jumping).
    const D = this.defender.locomotion;
    const opp = this.defender.opponent.locomotion;
    const dist = Math.hypot(opp.position.x - D.position.x, opp.position.z - D.position.z);
    let target = R.base + this._jitter;
    if (dist < 1.6 && D.speed < 1.5) target += R.closeBonus;
    if (D.speed > 3 || this.state === 'beaten' || this.state === 'recovering') target += R.offBalance;
    if (this.bite || this.freeze > 0) target += R.afterFake;
    this._delayTarget = Math.max(R.min, Math.min(R.max, target));
    const k = Math.min(1, R.drift * dt);
    this.reactionDelay += (this._delayTarget - this.reactionDelay) * k;
    // Perceived time only moves forward.
    this._perceivedT = Math.max(this._perceivedT, this.time - this.reactionDelay);
    let snap = this._buf[0];
    for (const s of this._buf) { if (s.t <= this._perceivedT + 1e-9) snap = s; else break; }
    this.prevPerceived = this.perceived;
    this.perceived = snap;
  }

  _newJitter() {
    this._jitter = (this.rng() * 2 - 1) * this.cfg.reaction.jitter;
  }

  // ---- main ------------------------------------------------------------------

  update(dt) {
    this._perceive(dt);
    const S = this.perceived;
    const out = this.intent;
    out.velocity.set(0, 0, 0);
    out.allowRun = false;
    this.wantJump = false;
    if (!S) return out;
    this.stateTime += dt;
    this.freeze = Math.max(0, this.freeze - dt);
    this._carry = Math.max(0, this._carry - dt);

    this._detectEvents(S, this.prevPerceived);

    const cfg = this.cfg, Pc = cfg.positioning, D = this.defender.locomotion;
    // Where the AI believes the ball handler is (perceived + short extrapolation),
    // or, during a spin it can't read yet, where they were heading.
    const A = this._A.set(S.x + S.vx * Pc.anticipation, 0, S.z + S.vz * Pc.anticipation);
    if (this._spinBlind && this.time < this._spinBlind.until) {
      const e = this.time - this._spinBlind.t0;
      A.set(this._spinBlind.x + this._spinBlind.vx * e * 0.6, 0, this._spinBlind.z + this._spinBlind.vz * e * 0.6);
    } else this._spinBlind = null;
    this.reactionTarget.copy(A);
    out.faceTarget.set(S.x, 0, S.z);

    // Lane: attacker -> rim.
    const u = this._u.set(this.rim.x - A.x, 0, this.rim.z - A.z);
    const distA = u.length();
    if (distA > 1e-3) u.divideScalar(distA); else u.set(0, 0, -1);
    const approach = S.vx * u.x + S.vz * u.z;              // + = toward the rim
    const gap = this._gapFor(distA, approach);

    // Guard spot.
    const spot = this.guardSpot;
    if (distA <= gap + 0.25) {
      spot.copy(this.rim).addScaledVector(u, -0.35);       // under the rim: protect it
    } else {
      spot.copy(A).addScaledVector(u, gap);
      // shade toward the ball hand (make them go the other way)
      const rx = -Math.cos(S.facing), rz = Math.sin(S.facing), hs = S.hand === 'right' ? 1 : -1;
      const lat = rx * hs * Pc.shade, latz = rz * hs * Pc.shade;
      const side = lat * -u.z + latz * u.x;                // component across the lane only
      spot.x += -u.z * side; spot.z += u.x * side;
      if (distA < Pc.nearRimDist) spot.lerp(this.rim, Pc.rimProtect * (1 - distA / Pc.nearRimDist));
    }

    // ---- state ----
    const rel = this._p.set(D.position.x - S.x, 0, D.position.z - S.z);
    const depth = rel.x * u.x + rel.z * u.z;               // + = defender between ball and rim
    const lateral = Math.abs(rel.x * -u.z + rel.z * u.x);
    const St = cfg.states;
    const shotLive = S.shooting || S.finishing;
    const beatenNow = S.hasBall && distA < 10 && (depth < -St.beatenDepth || (lateral > St.beatenLateral && depth < 0.45));

    let state = this.state;
    if (shotLive) {
      const dS = Math.hypot(rel.x, rel.z);
      state = state === 'closeout' || (dS > St.closeoutGap && !S.finishing) ? 'closeout' : 'contest';
      if (state === 'closeout' && dS < St.contestDist + 0.35) state = 'contest';
    } else if (S.released || (state === 'contest' && this.time - this._lastShotSeen < St.contestHold)) {
      state = 'contest';                                   // hold the contest briefly after the release
    } else if (beatenNow) {
      state = 'beaten';
    } else if (state === 'beaten') {
      state = 'recovering';
    } else if (state === 'recovering') {
      if (spot.distanceTo(D.position) < St.recoveredError && D.isDefensiveLocked) state = 'guarding';
    } else if (spot.distanceTo(D.position) > St.lostPosition && S.hasBall) {
      state = 'recovering';                                // out of position (not beaten yet): hustle back
    } else if (this.bite || this.freeze > 0 || this._carry > 0) {
      state = 'reacting';
    } else {
      state = Math.hypot(S.vx, S.vz) > 1.5 ? 'shading' : 'guarding';
    }
    if (shotLive || S.released) this._lastShotSeen = this.time;
    else if (this.time - this._lastShotSeen > 0.5) this._jumpDecision = null;
    this._setState(state);

    // ---- intention ----
    const v = out.velocity;
    if (state === 'beaten') {
      // Turn the hips and chase to a point ahead of the ball handler on the lane.
      const ahead = Math.min(1.4, distA * 0.5);
      const tgt = this._p.copy(A).addScaledVector(u, ahead);
      v.set(tgt.x - D.position.x, 0, tgt.z - D.position.z);
      const len = v.length();
      if (len > 1e-3) v.multiplyScalar(D.settings.runSpeed / len);
      out.allowRun = true;
    } else if (state === 'closeout' || state === 'contest') {
      // Run at the shooter, slow down near them, stop at contest distance in front.
      const sx = S.x, sz = S.z;
      const tgt = this._p.set(sx + u.x * St.contestDist, 0, sz + u.z * St.contestDist);
      v.set(tgt.x - D.position.x, 0, tgt.z - D.position.z);
      const len = v.length();
      const arrive = Math.sqrt(2 * D.settings.decel * 0.8 * Math.max(0, len - 0.05));
      const sp = Math.min(state === 'closeout' ? D.settings.runSpeed : D.settings.forwardSpeed, arrive, len * 6);
      if (len > 1e-3) v.multiplyScalar(sp / len);
      out.allowRun = state === 'closeout' && len > 2.0;
      this.handsUp = 1;
      // Decide to jump with the shooter, from what it can see (and as late as
      // its reaction delay makes it). It only *asks* for a jump: whether the
      // hand ever meets the ball is up to the physics.
      const dS = Math.hypot(D.position.x - S.x, D.position.z - S.z);
      const rising = S.shotPhase === 'rise' || S.shotPhase === 'release' || S.shotJump > 0.03 || S.finishJump > 0.05;
      if (rising && dS < 1.9 && this._jumpDecision === null) {
        // one decision per shot: jump, or stay down with a hand up
        this._jumpDecision = this.rng() < (dS < 1.1 ? St.contestJumpChanceClose : St.contestJumpChance);
      }
      if (rising && dS < 1.9 && this._jumpDecision && !this.defender.isJumping) this.wantJump = true;
    } else {
      // Guard: match the perceived movement and close on the spot.
      v.set(S.vx * Pc.matchVelocity, 0, S.vz * Pc.matchVelocity);
      v.x += (spot.x - D.position.x) * Pc.gain;
      v.z += (spot.z - D.position.z) * Pc.gain;
      if (this.bite) {
        // Biting: committed toward the fake for now.
        const b = this.bite;
        v.addScaledVector(b.dir, b.shift * D.settings.slideSpeed);
      }
      if (this._carry > 0) v.copy(this._carryVel);
      out.allowRun = state === 'recovering' && spot.distanceTo(D.position) > St.runToRecover;
      // hands: ball-side hand up while guarding; both up while respecting a fake
      this.handsUp = this.freeze > 0 ? 0.9 : 0.35;
    }
    if (state !== 'contest' && state !== 'closeout' && this.freeze <= 0) this.handsUp = Math.min(this.handsUp, 0.5);
    this.defender.locomotion.speedScale = this.freeze > 0 ? 0.25 : 1;
    return out;
  }

  _gapFor(distA, approach) {
    const P = this.cfg.positioning;
    const tbl = [[0, P.gapNearRim], [P.nearRimDist, P.gapNearRim], [(P.nearRimDist + P.perimeterDist) / 2, P.gapMid],
      [P.perimeterDist, P.gapPerimeter], [P.farDist, P.gapFar]];
    let g = tbl[tbl.length - 1][1];
    for (let i = 1; i < tbl.length; i++) {
      if (distA <= tbl[i][0]) { const [d0, g0] = tbl[i - 1], [d1, g1] = tbl[i]; g = g0 + (g1 - g0) * (distA - d0) / (d1 - d0); break; }
    }
    if (approach > 0) g = g + (Math.min(g, P.gapDrive) - g) * Math.min(1, approach / P.driveSpeed);
    return Math.max(P.minGap, g);
  }

  _setState(s) {
    if (s === this.state) return;
    if (s === 'beaten') this.beatenCount++;
    this.state = s;
    this.stateTime = 0;
    this._newJitter();
  }

  // ---- reactions to what was just seen ------------------------------------------

  _detectEvents(S, prev) {
    if (!prev) return;
    const M = this.cfg.moves, D = this.defender.locomotion;
    const rx = -Math.cos(S.facing), rz = Math.sin(S.facing);     // ball handler's right
    const toward = (wx, wz) => D.velocity.x * wx + D.velocity.z * wz; // defender speed along a direction
    const dist = Math.hypot(D.position.x - S.x, D.position.z - S.z);
    const now = this.time;
    this._recentCrossovers = this._recentCrossovers.filter((t) => now - t < 3);
    this._recentFakes = this._recentFakes.filter((t) => now - t < 4);

    // Bites end once the real direction becomes visible.
    if (this.bite && (S.move !== this.bite.move || S.moveProgress >= this.bite.until)) this.bite = null;

    const started = S.move && S.move !== prev.move ? S.move : null;
    if (started === 'crossover') {
      const fx = rx * S.xFake, fz = rz * S.xFake;
      const c = M.crossover;
      let p = c.bite + c.movingBonus * clamp01(toward(fx, fz) / 2.5) + (dist < 1.15 ? c.closeBonus : 0)
        - (D.speed < 0.8 && dist >= 1.2 ? c.balancedPenalty : 0) - c.repeatPenalty * this._recentCrossovers.length;
      this._recentCrossovers.push(now);
      this._lastCrossoverSeen = now;
      this._react('crossover', p, () => { this.bite = { move: 'crossover', dir: new THREE.Vector3(fx, 0, fz), until: 0.45, shift: c.shift }; });
    } else if (started === 'inAndOut') {
      const fx = rx * S.ioFake, fz = rz * S.ioFake, c = M.inAndOut;
      const anticipating = now - this._lastCrossoverSeen < M.anticipateWindow;
      const p = c.bite + (anticipating ? c.anticipateBonus : 0) + c.movingBonus * clamp01(toward(fx, fz) / 2.5);
      this._react('inAndOut', p, () => { this.bite = { move: 'inAndOut', dir: new THREE.Vector3(fx, 0, fz), until: 0.62, shift: c.shift }; });
    } else if (started === 'hesitation') {
      const c = M.hesitation;
      const closing = toward(S.x - D.position.x, S.z - D.position.z) / Math.max(0.3, dist);
      const p = c.bite + c.closingBonus * clamp01(closing / 3);
      this._react('hesitation', p, () => { this.freeze = c.freeze; });
    } else if (started === 'spin') {
      const c = M.spin;
      // Beside the ball handler (not square) = easier to spin past.
      const ux = this.rim.x - S.x, uz = this.rim.z - S.z, ul = Math.hypot(ux, uz) || 1;
      const lat = Math.abs(((D.position.x - S.x) * -uz + (D.position.z - S.z) * ux) / ul);
      const blind = ISO.OFFENSE.moves.spin.duration * c.blind * (1 + c.besideBonus * clamp01((lat - 0.2) / 0.6));
      this._spinBlind = { t0: now, until: now + blind, x: S.x, z: S.z, vx: prev.vx, vz: prev.vz };
      this._log('spin', true);
    } else if (started === 'behindBack') {
      this._jitter += M.behindBack.delay;
      this._log('behindBack', true);
    }

    // Step-back: forward momentum carries on for a moment.
    if (S.stepBack && !prev.stepBack) {
      const c = M.stepBack;
      const fwd = toward(S.x - D.position.x, S.z - D.position.z) / Math.max(0.3, dist);
      if (fwd > 0.8) {
        this._carry = c.carry + c.forwardBonus * clamp01((fwd - 0.8) / 2);
        this._carryVel.copy(D.velocity);
      }
      this._log('stepBack', fwd > 0.8);
    }

    // Pump fake: only bite when close enough to care and the shot is a threat.
    if (S.pumpFake && !prev.pumpFake) {
      const c = M.pumpFake;
      const rimDist = Math.hypot(this.rim.x - S.x, this.rim.z - S.z);
      if (dist < c.closeRange && rimDist < 9.5) {
        const p = c.bite + (D.isDefensiveLocked ? 0.1 : -0.1) - c.repeatPenalty * this._recentFakes.length;
        this._recentFakes.push(now);
        this._react('pumpFake', p, () => {
          this.freeze = c.freeze;
          this.handsUp = 1;
          if (this.rng() < c.jumpChance) this.wantJump = true;
        });
      } else this._log('pumpFake (ignored: too far)', false);
    }
  }

  _react(name, p, onBite) {
    p = Math.max(0.05, Math.min(0.9, p));
    const bit = this.rng() < p;
    if (bit) { onBite(); this.biteCount++; }
    this._newJitter();
    this._log(name + ' p=' + p.toFixed(2), bit);
  }

  _log(what, bit) {
    this.lastReaction = what + (bit ? ' -> BIT' : ' -> read it');
    this.reactionLog.push([+this.time.toFixed(2), what, bit]);
    if (this.reactionLog.length > 20) this.reactionLog.shift();
  }
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
})();
