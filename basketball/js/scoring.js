// ScoringSystem: the ONE place a shot attempt gets its result.
//
// Every release gets a shotId and is tied to the shooter's playerId and
// teamId. The physical ball then decides the outcome; this only watches it:
//
//   MAKE           the hoop detected a basket (ball down through the rim)
//   BLOCKED_MAKE   ...after a defender's hand touched the shot
//   MISS           the shot can no longer score: it reached the floor, or it
//                  is falling below the rim outside the hoop (nothing can
//                  carry it back up and in), or it timed out
//   BLOCKED_MISS   ...after a block
//
// A rim or backboard touch never resolves anything by itself. Each shotId
// resolves exactly once (`shotResolved`); later signals for it are ignored.
// What the result means for possession is decided elsewhere (possession.js).
//
// 2 vs 3 (or 1 vs 2) uses the real court geometry from CONFIG (the same
// numbers the court markings are drawn from): in the corners the line is
// straight at |x| = threeCornerX up to where it meets the arc; elsewhere it's
// the arc of threeRadius around the rim. A release ON the line counts as
// outside. The spot used is the shooter's floor position at release.
//
// Score is kept per TEAM (teamScore[teamId]); a few per-player counts ride
// along (points, made, missed, blocks). No rebounds: the game has none.
ISO.SHOT_RESULT = { MAKE: 'MAKE', MISS: 'MISS', BLOCKED_MAKE: 'BLOCKED_MAKE', BLOCKED_MISS: 'BLOCKED_MISS' };

ISO.ScoringSystem = class {
  // shooters(): [{ system, playerId, teamId }] — every system that can
  // release a scoring shot (each player's ShootingSystem and FinishSystem).
  // Each exposes shotReleased (frame flag), releaseFeet, releaseTiming, shotType.
  constructor({ shooters, hoop, ball, events = null, teamIds = ['A', 'B'] }) {
    this.events = events;
    this.shooters = shooters;
    this.hoop = hoop;
    this.ball = ball;
    this.points = ISO.CONFIG.scoring;
    this.shotId = 0;

    this.teamScore = {};
    for (const t of teamIds) this.teamScore[t] = 0;
    this.playerStats = {};     // playerId -> { points, made, missed, blocks }
    this.attempts = 0;
    this.makes = 0;
    this.threeAttempts = 0;
    this.threeMakes = 0;

    this.pending = null;       // the shot in the air, waiting to resolve
    this.lastResult = null;
    this.releasedThisFrame = null;
    this.resolvedThisFrame = null;
    this.lastResolvedShotId = 0;
  }

  // All points scored (every team) — the single-team practice number.
  get score() { let s = 0; for (const t in this.teamScore) s += this.teamScore[t]; return s; }

  // Is a floor spot (x, z) at or beyond the three-point line?
  static isThreePoint(x, z) {
    const C = ISO.CONFIG.court, H = ISO.CONFIG.hoop;
    const cornerZ = H.centerZ + Math.sqrt(C.threeRadius ** 2 - C.threeCornerX ** 2);
    if (z <= cornerZ) return Math.abs(x) >= C.threeCornerX;   // straight corner section
    return Math.hypot(x, z - H.centerZ) >= C.threeRadius;     // arc
  }

  pointsFor(x, z) {
    return ISO.ScoringSystem.isThreePoint(x, z) ? this.points.outside : this.points.inside;
  }

  stats(playerId) {
    return this.playerStats[playerId] || (this.playerStats[playerId] = { points: 0, made: 0, missed: 0, blocks: 0 });
  }

  // A new game: team scores back to 0 (player stats are kept for the session).
  resetScores() {
    for (const t in this.teamScore) this.teamScore[t] = 0;
  }

  // Drop a shot without a result (dev resets only).
  cancelPending() { this.pending = null; }

  // Call once per frame after the ball has updated.
  update(dt) {
    this.resolvedThisFrame = null;
    this.releasedThisFrame = null;
    const list = typeof this.shooters === 'function' ? this.shooters() : this.shooters;
    const sh = list.find((s) => s.system && s.system.shotReleased);
    if (sh) this._release(sh);

    const p = this.pending;
    if (!p) return;
    p.t += dt;
    const ball = this.ball, FREE = ISO.Basketball.MODES.FREE;
    // Block attribution: the first hand on this flight (physics decides what
    // happens next; a block never ends the shot by itself).
    if (!p.wasBlocked && ball.blockedBy && ball.mode === FREE) {
      const b = ball.blockedBy;
      Object.assign(p, { wasBlocked: true, blockerPlayerId: b.playerId, blockerTeamId: b.teamId, blockHand: b.hand, blockType: b.type });
      if (b.playerId) this.stats(b.playerId).blocks++;
    }
    if (this.hoop.basketMadeThisFrame) { this._resolve(true, 'basket'); return; }
    if (ball.mode !== FREE) { this._resolve(false, 'dead'); return; }
    const G = ISO.GAMEFLOW, H = ISO.CONFIG.hoop, pos = ball.position;
    if (pos.y <= ball.radius + 0.002 || ball.bounces > 0) { this._resolve(false, 'floor'); return; }
    if (ball.freeTime > G.missMinFlight && ball.velocity.y < 0 && pos.y < H.rimHeight - G.missBelowRim) {
      const outside = Math.hypot(pos.x, pos.z - H.centerZ) > H.rimRadius + ball.radius;
      if (outside || pos.y < H.rimHeight - 0.9) { this._resolve(false, 'below-rim'); return; }
    }
    if (p.t > G.shotTimeout) this._resolve(false, 'timeout');
  }

  _release(sh) {
    // A new shot leaves the hand (an unresolved previous one counts as missed).
    if (this.pending) this._resolve(false, 'superseded');
    const s = sh.system, f = s.releaseFeet;
    const isThree = ISO.ScoringSystem.isThreePoint(f.x, f.z);
    this.pending = {
      shotId: ++this.shotId,
      id: this.shotId,
      shooterPlayerId: sh.playerId || null,
      shootingTeamId: sh.teamId || null,
      shotType: s.shotType || 'jumpshot',
      isThree,
      value: isThree ? this.points.outside : this.points.inside,
      timing: s.releaseTiming,
      contest: s.releaseContest || 0,
      t: 0,
      wasBlocked: false, blockerPlayerId: null, blockerTeamId: null, blockHand: null, blockType: null,
    };
    this.attempts++;
    if (isThree) this.threeAttempts++;
    this.releasedThisFrame = this.pending;
    if (this.events) {
      const p = s.releasePosition, v = s.releaseVelocity;
      this.events.emit('shotReleased', {
        shotId: this.pending.shotId, shooterPlayerId: this.pending.shooterPlayerId, shootingTeamId: this.pending.shootingTeamId,
        shotType: this.pending.shotType, isThree, value: this.pending.value,
        position: p ? [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] : null,
        velocity: v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null,
        contest: this.pending.contest,
      });
    }
  }

  _resolve(made, how) {
    const p = this.pending;
    this.pending = null;
    if (!p || p.shotId <= this.lastResolvedShotId) return;     // one result per shotId, ever
    this.lastResolvedShotId = p.shotId;
    const swish = made && this.hoop.shotWasSwish;
    const points = made ? p.value : 0;
    const R = ISO.SHOT_RESULT;
    const result = made ? (p.wasBlocked ? R.BLOCKED_MAKE : R.MAKE) : (p.wasBlocked ? R.BLOCKED_MISS : R.MISS);
    if (made) {
      if (p.shootingTeamId in this.teamScore) this.teamScore[p.shootingTeamId] += points;
      this.makes++;
      if (p.isThree) this.threeMakes++;
    }
    if (p.shooterPlayerId) {
      const st = this.stats(p.shooterPlayerId);
      if (made) { st.points += points; st.made++; } else st.missed++;
    }
    this.lastResult = {
      shotId: p.shotId, id: p.shotId, result, made, swish, points, value: p.value, isThree: p.isThree,
      timing: p.timing, shotType: p.shotType, blocked: p.wasBlocked, how,
      shooterPlayerId: p.shooterPlayerId, shootingTeamId: p.shootingTeamId,
      wasBlocked: p.wasBlocked, blockerPlayerId: p.blockerPlayerId, blockerTeamId: p.blockerTeamId,
      blockHand: p.blockHand, blockType: p.blockType, flightTime: +p.t.toFixed(3),
    };
    this.resolvedThisFrame = this.lastResult;
    if (this.events) {
      if (made) this.events.emit('basketMade', { shotId: p.shotId, points, swish, shotType: p.shotType, blocked: p.wasBlocked, shooterPlayerId: p.shooterPlayerId, teamId: p.shootingTeamId });
      this.events.emit('shotResolved', Object.assign({}, this.lastResult));
    }
  }
};
