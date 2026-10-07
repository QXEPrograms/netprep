// PossessionSystem: the ONE authority on which team has the ball and on the
// flow from one possession to the next. Nothing else switches possession.
//
//   POSSESSION_START       players set, ball in the new handler's dribble,
//                          input off for a moment (the screen fades back in)
//   LIVE                   normal play
//   SHOT_IN_FLIGHT         a shot is released: the shooting team still has
//                          possession, the ball has no owner
//   SHOT_RESOLVING         the shot has its one result (scoring.js); the
//                          physical ball plays out (through the net, off the
//                          rim, the deflection) for make/miss/blockResetDelay,
//                          input off — nobody chases it, there are no rebounds
//   POSSESSION_TRANSITION  quick fade out
//   RESETTING              (one step, at black) roles assigned, players and
//                          ball reset, matchups and camera set -> START
//
// The rule: a MAKE (or BLOCKED_MAKE) keeps the ball with the shooting team
// (make-it-take-it); a MISS gives it to the other team; a BLOCKED_MISS gives
// it to the defending team. Reasons are kept general (MISS, BLOCK, STEAL,
// SHOT_CLOCK, OUT_OF_BOUNDS, VIOLATION) so every system ends possessions the
// same way through endPossession().
//
// Shot clock (Step 17, shot-clock.js): every NEW possession gets a fresh
// clock; it only runs while LIVE and stops the moment a shot leaves the hand.
// Zero before a release = SHOT_CLOCK violation: no score, the other team's
// ball. The offense keeping a deflected ball (DEFLECTION / DEAD_BALL resets)
// continues with the time it had.
//
// Team possession (offenseTeamId) is not ball ownership (ball.ownerPlayerId):
// during a shot the team has possession while nobody owns the ball.
(function () {
const S = ISO.POSSESSION = {
  START: 'POSSESSION_START',
  LIVE: 'LIVE',
  SHOT_IN_FLIGHT: 'SHOT_IN_FLIGHT',
  SHOT_RESOLVING: 'SHOT_RESOLVING',
  TRANSITION: 'POSSESSION_TRANSITION',
  RESETTING: 'RESETTING',
};
ISO.POSSESSION_REASON = {
  GAME_START: 'GAME_START',
  MAKE: 'MAKE',                 // retained (make-it-take-it)
  MISS: 'MISS',
  BLOCK: 'BLOCK',
  STEAL: 'STEAL',               // a clean steal or a deflection the defense came up with
  SHOT_CLOCK: 'SHOT_CLOCK',     // the shot clock reached zero before a release
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS', // (future)
  VIOLATION: 'VIOLATION',       // (future)
  DEFLECTION: 'DEFLECTION',     // a poked ball got away, but the offense was nearer: their ball again
  DEAD_BALL: 'DEAD_BALL',       // safety net: a free ball nobody accounts for
  DEV: 'DEV',                   // developer reset
};
const R = ISO.POSSESSION_REASON;

ISO.PossessionSystem = class {
  constructor({ roster, ball, hoop, scoring, events }) {
    this.roster = roster;
    this.ball = ball;
    this.hoop = hoop;
    this.scoring = scoring;
    this.events = events;
    this.cfg = ISO.GAMEFLOW;

    this.state = S.START;
    this.stateTime = 0;
    this.timer = 0;               // time left in the current timed state
    this.fade = 0;                // 0 clear .. 1 black (the UI draws it)
    this.possessionNumber = 0;
    this.offenseTeamId = null;
    this.defenseTeamId = null;
    this.ballHandlerPlayerId = null;
    this.lastPossessionTeamId = null;
    this.lastPossessionChangeReason = null;   // why the ball last went to the OTHER team (MISS, BLOCK, ...)
    this.possessionStartReason = null;        // why the current possession started (incl. MAKE = retained)
    this.lastShooterPlayerId = null;
    this.lastShotTeamId = null;
    this.lastShotId = null;
    this.lastShotResult = null;
    this.lastScoringPlayerId = null;
    this.lastBlockPlayerId = null;
    this.lastBlockTeamId = null;
    this.currentShot = null;      // { shotId, shooterPlayerId, shootingTeamId, ... } while in flight
    this.next = null;             // { teamId, reason } decided by the result
    this.history = [];            // recent possessions (debug/tests)
    // Dev/tests: results are still recorded but nothing transitions on its own.
    this.manual = false;
    this.onReset = null;          // game hook after every reset (input routing, camera, bots)
    this._deadT = 0;
    // The possession's shot clock (authoritative; the UI only shows it).
    this.shotClock = new ISO.ShotClock(this.cfg.shotClock.duration);
    // A release only counts while the clock hasn't run out first (scoring.js
    // asks): a ball let go after the buzzer flies, but scores nothing.
    scoring.acceptRelease = () => !this.shotClock.expired;

    events.on('shotReleased', (e) => this._onShotReleased(e));
    events.on('shotResolved', (e) => this._onShotResolved(e));
  }

  // Input is live only while play is live (or a shot is in the air).
  get inputEnabled() { return this.state === S.LIVE || this.state === S.SHOT_IN_FLIGHT; }
  get isLive() { return this.inputEnabled; }

  // The first possession of the game (no fade).
  begin(teamId = this.cfg.firstPossession) {
    if (!this.roster.playersOn(teamId).length) teamId = this.roster.players[0].teamId;
    this.next = { teamId, reason: R.GAME_START };
    this._reset();
  }

  // End the current possession from outside a shot (future: steals,
  // out of bounds, violations; today: dev). Goes through the same transition.
  endPossession(teamId, reason, delay = 0) {
    if (this.state === S.TRANSITION || this.state === S.RESETTING) return;
    this.next = { teamId, reason };
    this._enter(S.SHOT_RESOLVING, delay);
  }

  // Start of every simulation step (before anyone moves): the clock runs while
  // play is live. Reaching zero here means zero came before anything released
  // during this step (see shot-clock.js for the exact rule).
  tickClock(dt) {
    if (this.manual || this.state !== S.LIVE || this.cfg.shotClock.enabled === false) return;
    if (this.shotClock.tick(dt)) this._shotClockViolation();
  }

  _shotClockViolation() {
    const off = this.offenseTeamId;
    let to = this.roster.otherTeam(off);
    if (!to || !this.roster.playersOn(to).length) to = off;     // practice: nobody else
    this.lastViolationPossession = this.possessionNumber;
    if (this.events) this.events.emit('shotClockViolation', { offenseTeamId: off, newTeamId: to, possessionNumber: this.possessionNumber });
    this.endPossession(to, R.SHOT_CLOCK, this.cfg.shotClock.violationResetDelay);
  }

  update(dt) {
    this.stateTime += dt;
    if (this.manual) { this.fade = 0; return; }
    const c = this.cfg;
    switch (this.state) {
      case S.START:
        this.timer -= dt;
        this.fade = c.useFade ? Math.max(0, this.fade - dt / c.fadeIn) : 0;
        if (this.timer <= 0) this._enter(S.LIVE);
        break;
      case S.LIVE:
        this._watchDeadBall(dt);
        break;
      case S.SHOT_IN_FLIGHT:
        break;                    // scoring.js resolves the shot (shotResolved)
      case S.SHOT_RESOLVING:
        this.timer -= dt;
        if (this.timer <= 0) {
          if (c.useFade) this._enter(S.TRANSITION, c.fadeOut);
          else this._reset();
        }
        break;
      case S.TRANSITION:
        this.timer -= dt;
        this.fade = Math.min(1, 1 - this.timer / c.fadeOut);
        if (this.timer <= 0) { this.fade = 1; this._reset(); }
        break;
    }
  }

  // ---- shot lifecycle -------------------------------------------------------

  _onShotReleased(e) {
    this.currentShot = { shotId: e.shotId, shooterPlayerId: e.shooterPlayerId, shootingTeamId: e.shootingTeamId, shotType: e.shotType, wasBlocked: false, blockerPlayerId: null };
    this.lastShotId = e.shotId;
    this.lastShooterPlayerId = e.shooterPlayerId;
    this.lastShotTeamId = e.shootingTeamId;
    this.shotClock.stop();                     // the ball is out before zero: the clock is done
    this.lastReleaseClock = +this.shotClock.remaining.toFixed(4);
    if (this.state === S.LIVE || this.state === S.SHOT_IN_FLIGHT) this._enter(S.SHOT_IN_FLIGHT);
  }

  _onShotResolved(r) {
    if (this.currentShot && this.currentShot.shotId !== r.shotId) return;   // not this possession's shot
    this.currentShot = null;
    this.lastShotId = r.shotId;
    this.lastShotResult = r.result;
    if (r.made) this.lastScoringPlayerId = r.shooterPlayerId;
    if (r.wasBlocked) { this.lastBlockPlayerId = r.blockerPlayerId; this.lastBlockTeamId = r.blockerTeamId; }
    // Possession only follows a shot taken while play was live.
    if (this.state !== S.SHOT_IN_FLIGHT && this.state !== S.LIVE) return;
    const shooting = r.shootingTeamId || this.offenseTeamId;
    // First to 11: the game is over — a short beat, then a fresh game.
    const rules = this.cfg.rules, score = this.scoring.teamScore;
    if (r.made && rules && score[shooting] >= rules.targetScore) {
      const loser = this.roster.otherTeam(shooting);
      this.gameNumber = (this.gameNumber || 1);
      this.lastGameWinnerTeamId = shooting;
      const final = Object.assign({}, score);
      if (this.events) this.events.emit('gameWon', { winnerTeamId: shooting, score: final, gameNumber: this.gameNumber });
      const startTeam = rules.newGameBall === 'loser' && loser && this.roster.playersOn(loser).length ? loser : shooting;
      this.next = { teamId: startTeam, reason: R.GAME_START, result: r.result, shotId: r.shotId, newGame: true };
      this._enter(S.SHOT_RESOLVING, rules.gameOverDelay);
      return;
    }
    let teamId, reason, delay;
    if (r.made) { teamId = shooting; reason = R.MAKE; delay = this.cfg.makeResetDelay; }
    else {
      teamId = this.roster.otherTeam(shooting);
      reason = r.wasBlocked ? R.BLOCK : R.MISS;
      delay = r.wasBlocked ? this.cfg.blockResetDelay : this.cfg.missResetDelay;
    }
    // Practice (?nodefense): nobody on the other team — keep the ball.
    if (!teamId || !this.roster.playersOn(teamId).length) teamId = shooting;
    this.next = { teamId, reason, result: r.result, shotId: r.shotId };
    this._enter(S.SHOT_RESOLVING, delay);
  }

  // Safety net: the ball is free during live play but it is not a tracked
  // shot or a pass (nothing in the game produces this today).
  _watchDeadBall(dt) {
    const b = this.ball;
    const loose = b.mode === ISO.Basketball.MODES.FREE && !this.scoring.pending && !(b.flightKind === 'pass' && (b.returnPass || b.freeTime < 2)) &&
      !((b.flightKind === 'deflection' || b.flightKind === 'steal') && b.freeTime < 2);   // the steal system settles those
    this._deadT = loose ? this._deadT + dt : 0;
    if (this._deadT > this.cfg.deadBallTimeout) { this._deadT = 0; this.endPossession(this.offenseTeamId, R.DEAD_BALL); }
  }

  _enter(state, timer = 0) {
    this.state = state;
    this.stateTime = 0;
    this.timer = timer;
    if (state === S.LIVE) this.shotClock.start(); else this.shotClock.stop();
    if (state === S.LIVE) {
      for (const p of this.roster.players) p.input.flush();
      if (this.events) this.events.emit('possessionLive', { possessionNumber: this.possessionNumber, offenseTeamId: this.offenseTeamId });
    }
    if (state === S.TRANSITION && this.next && this.next.teamId !== this.offenseTeamId && this.events) {
      this.events.emit('possessionWillChange', { previousTeamId: this.offenseTeamId, newTeamId: this.next.teamId, reason: this.next.reason, possessionNumber: this.possessionNumber });
    }
  }

  // ---- the reset (RESETTING) ---------------------------------------------------

  _reset() {
    this.state = S.RESETTING;
    const next = this.next || { teamId: this.offenseTeamId, reason: R.DEV };
    this.next = null;
    if (next.newGame) {
      this.scoring.resetScores();
      this.gameNumber = (this.gameNumber || 1) + 1;
      if (this.events) this.events.emit('gameStarted', { gameNumber: this.gameNumber, firstTeamId: next.teamId });
    }
    const roster = this.roster, prevTeam = this.offenseTeamId;
    const off = next.teamId, def = roster.otherTeam(off);
    const changed = prevTeam !== null && prevTeam !== off;
    if (prevTeam !== null) this.lastPossessionTeamId = prevTeam;
    if (changed || prevTeam === null) this.lastPossessionChangeReason = next.reason;
    this.possessionStartReason = next.reason;
    this.offenseTeamId = off;
    this.defenseTeamId = def;
    this.possessionNumber++;
    // Shot clock: fresh for every new possession; the same team keeping a
    // deflected / dead ball continues with the time it had.
    const carry = !changed && prevTeam !== null && (next.reason === R.DEFLECTION || next.reason === R.DEAD_BALL) && !this.shotClock.expired;
    if (carry) this.shotClock.carryTo(this.possessionNumber);
    else this.shotClock.resetFor(this.possessionNumber, this.cfg.shotClock.duration);
    this.currentShot = null;
    this._deadT = 0;
    this.scoring.cancelPending();

    const offense = roster.playersOn(off), defense = def ? roster.playersOn(def) : [];
    // The ball goes to the team's first player (1v1: the only one). Later:
    // whoever the team designates to check the ball.
    const handler = offense[0];
    // 1. Roles: offense runs OffensiveLocomotion, defense DefensiveLocomotion.
    for (const p of offense) { p.setRole('offense'); p.hasPossession = true; p.assignmentId = null; }
    for (const p of defense) { p.setRole('defense'); p.hasPossession = false; p.matchupId = null; }
    // 2. Offense at the check spots (slot 0 = ball handler), facing the rim.
    const spots = this.cfg.reset.offense, H = ISO.CONFIG.hoop;
    offense.forEach((p, i) => {
      const s = spots[i % spots.length];
      const pos = new THREE.Vector3(s.x, 0, s.z);
      p.offense.resetForPossession({ position: pos, facing: Math.atan2(-pos.x, H.centerZ - pos.z), withBall: p === handler, hand: 'right' });
    });
    // 3. Assignments by player id (defender i guards offensive player i), then
    //    each defender between their man and the rim, `defenseGap` off him.
    defense.forEach((d, i) => {
      const o = offense[i % offense.length];
      roster.linkMatchup(o, d);
      const P = o.offense.position;
      const ux = -P.x, uz = H.centerZ - P.z, ul = Math.hypot(ux, uz) || 1, g = this.cfg.reset.defenseGap;
      d.defense.reset(new THREE.Vector3(P.x + ux / ul * g, 0, P.z + uz / ul * g));
      d.defense.frozen = true;
    });
    for (const o of offense) {
      if (!roster.defendersOf(o).length) o.offense.locomotion.matchup = null;
      roster.linkContact(o);
    }
    this.ballHandlerPlayerId = handler.id;
    // Ball: already attached to the handler's dribble by resetForPossession.
    this.hoop.beginFlight();

    const entry = { possessionNumber: this.possessionNumber, offenseTeamId: off, defenseTeamId: def, ballHandlerPlayerId: handler.id, reason: next.reason, previousTeamId: prevTeam };
    this.history.push(entry);
    if (this.history.length > 30) this.history.shift();
    if (changed && this.events) this.events.emit('possessionChanged', { previousTeamId: prevTeam, newTeamId: off, reason: next.reason, possessionNumber: this.possessionNumber });
    if (this.onReset) this.onReset(entry);
    if (this.events) this.events.emit('possessionStarted', entry);
    // 4. POSSESSION_START: settle with input off while the screen fades in.
    this._enter(S.START, this.cfg.startDelay);
    for (const d of defense) d.defense.frozen = true;
  }

  // Dev/tests: start a fresh possession for a team right now (no transition).
  devReset(teamId = this.offenseTeamId) {
    this.next = { teamId, reason: R.DEV };
    this._reset();
    this.fade = 0;
  }

  // Defenders stay set while input is off (START / RESOLVING / TRANSITION).
  applyFreeze() {
    const frozen = !this.inputEnabled && !this.manual;
    for (const p of this.roster.players) if (p.role === 'defense' && p.defense) p.defense.frozen = frozen;
    for (const p of this.roster.players) p.input.enabled = !frozen;
  }

  // Plain snapshot for debug/tests.
  snapshot() {
    const b = this.ball, cs = this.currentShot;
    const assignments = {};
    for (const p of this.roster.players) if (p.role === 'defense') assignments[p.id] = p.assignmentId;
    return {
      possessionState: this.state, possessionNumber: this.possessionNumber,
      offenseTeamId: this.offenseTeamId, defenseTeamId: this.defenseTeamId,
      ballOwnerPlayerId: b.ownerPlayerId, ballHandlerPlayerId: this.ballHandlerPlayerId, assignments,
      lastPossessionTeamId: this.lastPossessionTeamId, lastPossessionChangeReason: this.lastPossessionChangeReason,
      possessionStartReason: this.possessionStartReason,
      lastShotId: this.lastShotId, lastShotResult: this.lastShotResult, lastShooterPlayerId: this.lastShooterPlayerId,
      lastShotTeamId: this.lastShotTeamId, lastScoringPlayerId: this.lastScoringPlayerId,
      lastBlockPlayerId: this.lastBlockPlayerId, lastBlockTeamId: this.lastBlockTeamId,
      timer: +Math.max(0, this.timer).toFixed(2), fade: +this.fade.toFixed(2),
      shotClock: this.shotClock.snapshot(),
      shot: cs ? Object.assign({}, cs, this.scoring.pending ? { wasBlocked: this.scoring.pending.wasBlocked, blockerPlayerId: this.scoring.pending.blockerPlayerId } : {}) : null,
    };
  }
};
})();
