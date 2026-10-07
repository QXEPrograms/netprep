// Defensive interactions: balance, physical steals, ankle breaks.
//
//   DefensiveBalance   per defender: how set they are (balance 0..1) and where
//                      their weight is committed (a world vector, 0..1 long),
//                      from their own velocity, acceleration, plants, running,
//                      facing error and reaches. Human and CPU defenders alike.
//   StealSystem        a reach's hand collider swept against the dribbled ball.
//                      Contact through the ball handler's body never counts;
//                      the ball's exposure decides clean steal / deflection /
//                      glance. Steals end the possession through the normal
//                      possession system (reason STEAL).
//   AnkleBreakSystem   when the ball handler counters (a move ends, a hard cut
//                      pushes off, a step-back lands) it measures where they
//                      really went against where the defender's weight was
//                      going. Deterministic: same situation, same result.
//
// Ball-contact ownership by phase: a controlled dribble / gather / pump fake
// belongs to the steal system; a shot's release window and its early flight
// belong to the block system (blocking.js); a protected late flight belongs to
// the rim. One contact never produces two results.
(function () {
const DC = () => ISO.DEFENSE;
const MODES = () => ISO.Basketball.MODES;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------
ISO.DefensiveBalance = class {
  constructor(defender) {
    this.d = defender;
    this.balance = 1;
    this.commit = new THREE.Vector3();     // world xz, length 0..1
    this.reachCommit = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  reset() { this.balance = 1; this.commit.set(0, 0, 0); this.reachCommit.set(0, 0, 0); }

  get commitment() { return this.commit.length(); }

  // BALANCED / SLIGHTLY_COMMITTED / HEAVILY_COMMITTED / BROKEN
  get level() {
    const c = DC().balance, b = this.balance;
    return b >= c.slight ? 'BALANCED' : b >= c.heavy ? 'SLIGHTLY_COMMITTED' : b >= c.broken ? 'HEAVILY_COMMITTED' : 'BROKEN';
  }

  // How exposed to a counter they are right now (0..1).
  get vulnerability() { return clamp01((1 - this.balance) * 0.65 + this.commitment * 0.35); }

  update(dt) {
    if (dt <= 0) return;
    const c = DC().balance, L = this.d.locomotion, v = L.velocity, a = L.acceleration;
    // where the weight is going: velocity + acceleration + what a reach left behind
    const t = this._t.set(v.x * c.commitVel + a.x * c.commitAccel, 0, v.z * c.commitVel + a.z * c.commitAccel).add(this.reachCommit);
    if (t.length() > 1) t.normalize();
    const rate = t.length() > this.commit.length() ? c.commitRise : c.commitFall;
    this.commit.lerp(t, 1 - Math.exp(-rate * dt));
    this.reachCommit.multiplyScalar(Math.exp(-3 * dt));
    if (L.reaction) { this.balance = Math.min(this.balance, 0.2); return; }
    const speed = L.speed, accel = Math.hypot(a.x, a.z);
    const drain = Math.max(0, speed - c.freeSpeed) * c.drainSpeed + (L.mode === 'run' ? c.drainRun : 0) +
      (L.isPlanting ? c.drainPlant : 0) + (Math.abs(L.defensiveFacingError) > c.facingError ? c.drainFacing : 0) +
      Math.max(0, accel - 8) * c.drainAccel;
    const set = speed < c.setSpeed && !L.isPlanting && L.isDefensiveLocked && !this.d.reach;
    this.balance = clamp01(this.balance + ((set ? c.recoverSet : c.recoverMoving) - drain) * dt);
  }

  failedReach(dir) {
    const s = DC().steal;
    this.balance = clamp01(this.balance - s.failedDrain);
    this.reachCommit.copy(dir).setY(0).normalize().multiplyScalar(s.failedCommit);
  }

  afterReaction() {
    this.balance = DC().ankleBreak.recoveredBalance;
    this.commit.set(0, 0, 0);
    this.reachCommit.set(0, 0, 0);
  }
};

// ---------------------------------------------------------------------------
ISO.StealSystem = class {
  constructor({ ball, roster, possession, scoring, events }) {
    this.ball = ball;
    this.roster = roster;
    this.possession = possession;
    this.scoring = scoring;
    this.events = events;
    this.prevBall = ball.position.clone();
    this.deflection = null;            // { t, handler, defender } while a poked ball settles
    this.last = { reach: '-', steal: '-' };
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3();
  }

  // 0..1: how exposed the dribbled ball is to this defender, from geometry.
  static exposure(handler, defender) {
    const s = DC().steal, b = handler.ball.position, H = handler.position, D = defender.position;
    const off = Math.hypot(b.x - H.x, b.z - H.z);
    const far = smooth(s.exposureNear, s.exposureFar, off);
    // on the defender's side of the ball handler (toward them) or away
    const tx = D.x - H.x, tz = D.z - H.z, tl = Math.hypot(tx, tz) || 1;
    const side = off > 1e-3 ? ((b.x - H.x) * tx + (b.z - H.z) * tz) / (off * tl) : 0;
    const dr = handler.dribble;
    const mv = dr && dr.currentMove;
    const crossing = mv === 'crossover' || mv === 'behindBack' || mv === 'inAndOut' ? s.moveExposure : 0;
    const drive = (handler.locomotion.attack || 0) > 0.4 ? s.driveExposure : 0;
    return clamp01(0.55 * far + 0.45 * (side + 1) / 2 * far + crossing + drive - (side < -0.2 ? 0.25 : 0));
  }

  // Is the ball handler's body between the reach and the ball? (top view
  // segment shoulder -> ball against a vertical cylinder at their body)
  occluded(defender, handler, contact) {
    const s = DC().steal, arm = defender.model.arms.find((a) => a.side === -defender.reach.side);
    const sh = arm.shoulder.getWorldPosition(this._c);
    const H = handler.position;
    const dx = contact.x - sh.x, dz = contact.z - sh.z, l2 = dx * dx + dz * dz;
    if (l2 < 1e-6) return false;
    const t = Math.max(0, Math.min(1, ((H.x - sh.x) * dx + (H.z - sh.z) * dz) / l2));
    if (t <= 0.02 || t >= 0.98) return false;
    const px = sh.x + dx * t - H.x, pz = sh.z + dz * t - H.z;
    const y = sh.y + (contact.y - sh.y) * t;
    return Math.hypot(px, pz) < s.occlusionRadius && y > s.occlusionMinY && y < s.occlusionMaxY;
  }

  // Which ball contact belongs to a reach right now: a controlled ball in the
  // ball handler's dribble / gather / fake — not a release (blocks own that)
  // and not a ball in the air.
  stealable(handler) {
    const b = this.ball;
    if (b.mode !== MODES().CONTROLLED || b.holder !== handler) return false;
    const sh = handler.shooting, fi = handler.finishing;
    if (sh.inReleaseWindow || fi.inBlockWindow || handler.airborne || (fi.busy && fi._tookOff)) return false;
    return true;
  }

  update(dt) {
    const P = this.possession, b = this.ball;
    if (this.deflection) this._settleDeflection(dt);
    for (const p of this.roster.players) {
      if (p.role !== 'defense' || !p.defense) continue;
      const d = p.defense, r = d.reach;
      if (!r || r.phase !== 'active' || r.contacted) continue;
      const handler = d.opponent;
      if (!P.isLive || !this.stealable(handler)) continue;
      if (Math.hypot(b.position.x - d.position.x, b.position.z - d.position.z) > DC().steal.maxBallDist) continue;
      const h = d.blocks.hands[r.side > 0 ? 0 : 1];
      const hit = this._sweep(h, b);
      if (!hit) continue;
      r.contacted = true;
      this._contact(p, d, handler, h);
    }
    this.prevBall.copy(b.position);
  }

  // closest approach of the hand sphere and the ball over this frame
  _sweep(h, b) {
    const s = DC().steal;
    const r0 = this._a.copy(h.prev).sub(this.prevBall);
    const dv = this._b.copy(h.cur).sub(h.prev).sub(this._c.copy(b.position).sub(this.prevBall));
    const vv = dv.lengthSq();
    const t = vv > 1e-9 ? Math.max(0, Math.min(1, -r0.dot(dv) / vv)) : 1;
    const dist = r0.addScaledVector(dv, t).length();
    return dist < h.radius + b.radius + s.contactMargin;
  }

  _contact(entity, d, handler, hand) {
    const s = DC().steal, b = this.ball;
    const contact = b.position.clone();
    const ev = { defenderPlayerId: entity.id, defenderTeamId: entity.teamId, offensivePlayerId: handler.playerId, hand: d.reach.side > 0 ? 'right' : 'left' };
    if (this.occluded(d, handler, contact)) {
      this.last.reach = 'occluded (through the body)';
      d.lastReachResult = 'occluded';
      this._emit('reachResult', Object.assign(ev, { result: 'occluded' }));
      return;
    }
    const exp = ISO.StealSystem.exposure(handler, d);
    ev.exposure = +exp.toFixed(2);
    if (exp >= s.cleanExposure && d.balance.balance >= s.cleanBalance) {
      // clean: the ball pops into the defender's hands; possession goes over
      const chest = this._c.set(d.position.x, 1.05, d.position.z);
      const v = chest.sub(b.position).normalize().multiplyScalar(s.cleanBallSpeed);
      this._free(handler, v, 'steal');
      d.lastReachResult = 'clean steal';
      d.reach.won = true;
      this.last.reach = 'contact';
      this.last.steal = `clean by ${entity.id} (exposure ${exp.toFixed(2)})`;
      this._award(entity, handler, 'clean', s.stealResetDelay, ev);
    } else if (exp >= s.deflectExposure) {
      // deflection: knocked away along the swipe, settles quickly
      const sw = this._a.copy(hand.cur).sub(hand.prev).setY(0);
      const away = this._b.set(b.position.x - d.position.x, 0, b.position.z - d.position.z).normalize();
      if (sw.lengthSq() < 1e-6) sw.copy(away);
      // mostly along the swipe (sideways off the dribble), a little away from the hand
      const v = sw.normalize().multiplyScalar(0.75).addScaledVector(away, 0.25).normalize().multiplyScalar(s.deflectSpeed);
      v.y = 1.4;
      v.x += handler.locomotion.velocity.x * 0.4; v.z += handler.locomotion.velocity.z * 0.4;
      this._free(handler, v, 'deflection');
      this.deflection = { t: 0, handler, defender: entity, ev };
      d.lastReachResult = 'deflection';
      d.reach.won = true;
      this.last.reach = 'contact';
      this.last.steal = `deflection by ${entity.id} (exposure ${exp.toFixed(2)})`;
      this._emit('reachResult', Object.assign({}, ev, { result: 'deflection' }));
    } else {
      d.lastReachResult = 'glance';
      this.last.reach = `glance (ball protected, exposure ${exp.toFixed(2)})`;
      this._emit('reachResult', Object.assign(ev, { result: 'glance' }));
    }
  }

  _free(handler, v, kind) {
    const b = this.ball;
    if (handler.dribble) handler.dribble.stop();
    b.setFree(b.position.clone(), v, new THREE.Vector3(v.z * 4, 0, -v.x * 4), kind);
    b.holder = null;
  }

  // A poked ball: after a short beat the nearer player has it — the ball
  // handler keeps dribbling if it stayed in reach, otherwise it's a steal.
  _settleDeflection(dt) {
    const f = this.deflection, s = DC().steal, b = this.ball, P = this.possession;
    if (!P.isLive || b.mode !== MODES().FREE || b.flightKind !== 'deflection') { this.deflection = null; return; }
    f.t += dt;
    if (f.t < s.deflectResolve) return;
    this.deflection = null;
    const H = f.handler.position, D = f.defender.defense.position;
    const dh = Math.hypot(b.position.x - H.x, b.position.z - H.z), dd = Math.hypot(b.position.x - D.x, b.position.z - D.z);
    if (dh <= dd && dh <= s.regainRadius) {
      f.handler._regainBall(f.handler.dribble.hand);
      this.last.steal = `deflection: ${f.handler.playerId} kept it`;
      this._emit('reachResult', Object.assign({}, f.ev, { result: 'deflection-kept' }));
    } else if (dh <= dd) {
      // still his ball, but it got away from him: a quick check-ball reset
      this.last.steal = `deflection: ${f.handler.playerId}'s ball (reset)`;
      this._emit('reachResult', Object.assign({}, f.ev, { result: 'deflection-reset' }));
      const team = f.handler.entity ? f.handler.entity.teamId : this.possession.offenseTeamId;
      this.possession.endPossession(team, ISO.POSSESSION_REASON.DEFLECTION, s.stealResetDelay * 0.6);
    } else {
      this.last.steal = `deflection: stolen by ${f.defender.id}`;
      this._award(f.defender, f.handler, 'deflection', s.stealResetDelay * 0.6, f.ev);
    }
  }

  _award(entity, handler, kind, delay, ev) {
    if (this.scoring) this.scoring.stats(entity.id).steals = (this.scoring.stats(entity.id).steals || 0) + 1;
    this._emit('steal', Object.assign({}, ev, { kind }));
    this.possession.endPossession(entity.teamId, ISO.POSSESSION_REASON.STEAL, delay);
  }

  _emit(type, data) { if (this.events) this.events.emit(type, data); }

  reset() { this.deflection = null; this.prevBall.copy(this.ball.position); }
};

// ---------------------------------------------------------------------------
ISO.AnkleBreakSystem = class {
  constructor({ roster, possession, events }) {
    this.roster = roster;
    this.possession = possession;
    this.events = events;
    this.windows = [];                 // counters being measured
    this.last = null;                  // last evaluation (debug/tests)
    this._prev = new Map();            // per ball handler: previous frame state
  }

  reset() { this.windows.length = 0; this._prev.clear(); }

  update(dt) {
    if (!this.possession.isLive) { this.windows.length = 0; return; }
    for (const o of this.roster.players) {
      if (o.role !== 'offense') continue;
      const h = o.offense;
      const prev = this._prev.get(o.id) || {};
      const dr = h.dribble, L = h.locomotion, sb = h.stepBack;
      const move = dr.currentMove;
      // counter moments: a move starts, a hard plant starts, a step-back starts
      let kind = null;
      if (move && move !== prev.move) kind = move;
      else if ((L.plantState === 'cut' || L.plantState === 'reversal') && prev.plant !== L.plantState && !move) kind = 'cut';
      else if (sb.isSteppingBack && !prev.sb) kind = 'stepBack';
      if (kind && h.hasBall) {
        for (const d of this.roster.defendersOf(o)) this._open(o, d, kind);
      }
      this._prev.set(o.id, { move, plant: L.plantState, sb: sb.isSteppingBack });
    }
    // advance the windows: sample the defender, close when the move is done + window
    for (const w of this.windows) {
      const h = w.o.offense, D = w.d.defense, L = D.locomotion;
      w.t += dt;
      w.minBalance = Math.min(w.minBalance, D.balance.balance);
      const busy = h.dribble.currentMove === w.kind || (w.kind === 'stepBack' && h.stepBack.isSteppingBack) ||
        (w.kind === 'cut' && (h.locomotion.plantState === 'cut' || h.locomotion.plantState === 'reversal'));
      // the counter's direction: a step-back is its own exit; any other move
      // is judged by where the ball handler goes once it is done
      w.samples.push({ v: L.velocity.clone(), c: D.balance.commit.clone(), reach: !!D.reach, hv: h.locomotion.velocity.clone(), exit: !busy || w.kind === 'stepBack' });
      if (busy) w.after = 0; else w.after += dt;
      if (w.after >= DC().ankleBreak.window || w.t > 1.6) w.done = true;
    }
    for (const w of this.windows) if (w.done) this._evaluate(w);
    this.windows = this.windows.filter((w) => !w.done);
  }

  _open(o, d, kind) {
    if (!d.defense || this.windows.some((w) => w.d === d)) return;
    const D = d.defense;
    this.windows.push({ o, d, kind, t: 0, after: 0, done: false, minBalance: D.balance.balance,
      dist0: o.offense.position.distanceTo(D.position), samples: [] });
  }

  _evaluate(w) {
    const A = DC().ankleBreak, h = w.o.offense, D = w.d.defense, L = D.locomotion;
    if (!h.hasBall || L.reaction || L.jumpState !== 'ground' || !this.possession.isLive) return;
    let v = h.locomotion.velocity, speed = Math.hypot(v.x, v.z);
    for (const s of w.samples) {
      const sp = Math.hypot(s.hv.x, s.hv.z);
      if (s.exit && sp > speed) { v = s.hv; speed = sp; }
    }
    if (speed < 0.5) { this.last = { moveType: w.kind, severity: 0, level: 0, wrongWay: 0, balance: +w.minBalance.toFixed(2), exit: 0, spacing: 0, reach: false, defender: w.d.id, note: 'no exit' }; return; }
    const ex = v.x / speed, ez = v.z / speed;                        // where the offense actually went
    const slide = L.settings.slideSpeed;
    let wrong = 0, reachDuring = false, cmx = 0, cmz = 0;
    for (const s of w.samples) {
      const vOpp = Math.max(0, -(s.v.x * ex + s.v.z * ez)) / slide;  // moving the other way
      const cOpp = Math.max(0, -(s.c.x * ex + s.c.z * ez));          // weight committed the other way
      const ww = Math.max(vOpp, cOpp);
      if (ww > wrong) { wrong = ww; cmx = s.c.x + s.v.x * 0.1; cmz = s.c.z + s.v.z * 0.1; }
      if (s.reach) reachDuring = true;
    }
    wrong = clamp01(wrong);
    const exit = clamp01(speed / A.exitSpeed);
    const dist = w.dist0;
    const spacing = dist < A.spacingNear ? 0.5 : dist <= A.spacingFar ? smooth(A.spacingNear, A.spacingBest, dist) * 0.5 + 0.5 : 1 - smooth(A.spacingFar, A.spacingMax, dist);
    const vuln = 1 - w.minBalance;
    const mf = A.moveFactor[w.kind] || 0.8;
    let sev = Math.pow(wrong, 0.8) * (0.35 + 0.65 * vuln) * exit * spacing * mf;
    if (reachDuring && wrong > 0.2) sev += A.reachBonus * exit;
    let level = sev >= A.stagger ? 2 : sev >= A.stumble ? 1 : 0;
    if (sev >= A.fall && w.minBalance <= A.fallMaxBalance && wrong >= A.fallMinWrongWay && exit >= A.fallMinExit) level = 3;
    this.last = { moveType: w.kind, severity: +sev.toFixed(3), level, wrongWay: +wrong.toFixed(2), balance: +w.minBalance.toFixed(2), exit: +exit.toFixed(2), spacing: +spacing.toFixed(2), dist: +dist.toFixed(2), reach: reachDuring, defender: w.d.id };
    if (level === 0) return;
    // lose balance toward where the weight was going (the wrong way)
    let dl = Math.hypot(cmx, cmz);
    if (dl < 1e-3) { cmx = -ex; cmz = -ez; dl = 1; }
    w.d.defense.applyReaction(level, new THREE.Vector3(cmx / dl, 0, cmz / dl));
    if (this.events) this.events.emit('ankleBreak', {
      offensivePlayerId: w.o.id, defenderPlayerId: w.d.id, moveType: w.kind, reactionLevel: level, severity: +sev.toFixed(3),
      defenderCommitment: +wrong.toFixed(2), defenderBalance: +w.minBalance.toFixed(2), counterDirection: [+ex.toFixed(2), +ez.toFixed(2)],
      timestamp: this.events.time,
    });
  }
};
})();
