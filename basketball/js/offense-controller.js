// OffenseController: the ball handler's whole offensive package. Turns key
// presses into dribble moves, step-backs, passes and contextual Space actions,
// enforces which moves can chain into which, and decides which system steers
// the body each frame. The moves themselves live in their own modules
// (dribble.js / dribble-moves.js, stepback.js, shooting.js, finishing.js,
// passing.js); this is only the traffic controller.
//
// Rules:
//   - nothing starts during a shot, side-step, finish, pump fake or pass
//   - during a dribble move, the next action waits for that move's cancel
//     window and must be in its chain list (OFFENSE.chain); anything else is
//     ignored. A press slightly early is buffered for OFFENSE.inputBuffer
//     seconds, never longer.
//   - dribble moves are ignored during a step-back; Space during a step-back
//     waits for its landing (then flows straight into the shot)
//   - F needs a pass target and a plain dribble
//   - Space asks Gather what it means right now (jumper / pump fake,
//     side-step, floater, layup, dunk)
//
// State for other systems: gather { context, plan, action, reason, count },
// offense (OffenseState: fatigue, chain count, time since last move).
ISO.OffenseController = class {
  constructor(player) {
    this.player = player;
    this.offense = new ISO.OffenseState();
    this.buffered = null;         // { action, opts, t } a press waiting for its window
    this.shotWanted = 0;          // seconds a Space press stays valid while waiting
    this.gather = { context: null, plan: null, action: null, reason: '', count: 0 };
    this.lastAction = null;       // last action that actually started (for tests/HUD)
  }

  // Possession reset: fatigue, chains, burst and buffered presses start fresh
  // (nothing from the last possession punishes or helps this one).
  reset() {
    this.offense = new ISO.OffenseState();
    this.buffered = null;
    this.shotWanted = 0;
    Object.assign(this.gather, { context: null, plan: null, action: null, reason: '' });
    this.lastAction = null;
  }

  // Dribble moves bound to keys: input action -> [move name, opts].
  static get MOVE_KEYS() {
    return [
      ['crossover', 'crossover', {}],
      ['spinLeft', 'spin', { dir: 1 }],
      ['spinRight', 'spin', { dir: -1 }],
      ['hesitation', 'hesitation', {}],
      ['behindBack', 'behindBack', {}],
      ['inAndOut', 'inAndOut', {}],
    ];
  }

  // Called once per frame before Locomotion moves the body.
  update(dt) {
    const P = this.player, input = P.input;
    const dr = P.dribble, sb = P.stepBack, sh = P.shooting, fi = P.finishing, pa = P.passing;
    const loco = P.locomotion, O = ISO.OFFENSE;

    // Read every press each frame so nothing lingers to fire later.
    const presses = [];
    for (const [key, name, opts] of ISO.OffenseController.MOVE_KEYS) {
      if (input.consumePress(key)) presses.push({ action: name, opts });
    }
    if (input.consumePress('stepBack')) presses.push({ action: 'stepBack', opts: {} });
    const passPressed = input.consumePress('pass');
    const shootPressed = input.consumePress('shoot');
    const shootHeld = input.isDown('shoot');

    pa.beginFrame();
    const handWorld = (side, out) => P.model.getHandWorld(side, out);

    // Fatigue / burst bookkeeping (a clean move exit from last frame opens the burst).
    if (dr.moveExited) this.offense.moveExit(dr.moveExited.strength);
    this.offense.update(dt, loco.speed, loco.settings.runSpeed, loco.sprinting);
    dr.execScale = this.offense.executionScale;

    const canAct = () => P.hasBall && dr.active && !P.busy;

    // ---- Space -------------------------------------------------------------
    if (shootPressed && !P.busy) this.shotWanted = O.inputBuffer;
    else if (shootHeld && this.shotWanted > 0) this.shotWanted = Math.max(this.shotWanted, dt);
    else this.shotWanted = Math.max(0, this.shotWanted - dt);
    if (this.shotWanted > 0 && canAct() && this._shotAllowed()) {
      this.shotWanted = 0;
      this.buffered = null;
      this._startScoringAction(handWorld);
    }

    // ---- dribble moves & step-back ------------------------------------------
    if (canAct()) {
      for (const p of presses) this._tryOrBuffer(p);
      if (presses.length === 0 && this.buffered) {
        this.buffered.t -= dt;
        if (this.buffered.t <= 0) this.buffered = null;
        else if (this._tryStart(this.buffered)) this.buffered = null;
      }
      if (passPressed && !dr.currentMove && !sb.isSteppingBack && pa.request(loco, handWorld)) {
        dr.stop();
        this.lastAction = 'pass';
      }
    } else {
      this.buffered = null;
    }

    // ---- who steers the body ------------------------------------------------
    // Moves steer through Locomotion's drive hook; speedScale shapes the top
    // speed during a move (hesitation slow-down, crossover push) and
    // accelScale gives the short burst after a clean exit (never more top speed).
    const sbDrive = sb.update(dt, loco);
    const shotDrive = sh.update(dt, loco, shootHeld, input.releaseAge('shoot', dt));
    const finishDrive = fi.update(dt, loco);
    const passDrive = pa.update(dt, loco);
    const moveDrive = dr.active ? dr.getDrive(loco) : null;
    loco.drive = shotDrive || finishDrive || passDrive || moveDrive || sbDrive;
    loco.speedScale = dr.active ? dr.getSpeedScale() : 1;
    const xBurst = 0.7 * dr.crossoverBurst * this.offense.burstScale;
    loco.accelScale = 1 + Math.max(xBurst, this.offense.accelBonus);
    dr.leadScale = sb.isSteppingBack ? 0 : 1;

    // A pump fake hands the ball straight back to the dribble.
    if (sh.pumpFakeCompleted) dr.resume(sh.handBack);
  }

  // Space may start now: plain dribble, or a move whose window allows a shot;
  // a step-back only from its landing.
  _shotAllowed() {
    const dr = this.player.dribble, sb = this.player.stepBack;
    if (sb.isSteppingBack && sb.stepBackPhase !== 'land') return false;
    return !dr.currentMove || dr.canChain('shot');
  }

  _startScoringAction(handWorld) {
    const P = this.player, dr = P.dribble, sb = P.stepBack, loco = P.locomotion;
    const ctx = ISO.Gather.readContext(P);
    const plan = ISO.Gather.determineScoringAction(ctx);
    const g = this.gather;
    g.context = ctx; g.plan = plan; g.action = plan.action; g.reason = plan.reason; g.count++;

    if (sb.isSteppingBack) sb.endEarly();    // flow straight from the landing into the shot
    if (dr.currentMove) dr.cancelMove();
    if (plan.action === 'jumpshot' || plan.action === 'sidestep') {
      const opts = { balance: plan.balance };
      if (plan.action === 'sidestep') {
        opts.variant = 'sidestep';
        opts.sideDir = new THREE.Vector3(-ctx.toRim.z, 0, ctx.toRim.x).multiplyScalar(plan.sideDir);
      }
      P.shooting.start(loco, handWorld, dr.hand, opts);
    } else {
      P.finishing.start(plan, loco, handWorld);
    }
    dr.stop();
    this.lastAction = plan.action;
  }

  _tryOrBuffer(p) {
    if (this._tryStart(p)) { this.buffered = null; return; }
    // Too early in a move's window (but a legal follow-up): hold it briefly.
    const dr = this.player.dribble, cur = dr.currentMove;
    const legal = cur && (ISO.OFFENSE.chain[cur] || []).includes(p.action);
    this.buffered = legal ? { action: p.action, opts: p.opts, t: ISO.OFFENSE.inputBuffer } : null;
  }

  _tryStart(p) {
    const P = this.player, dr = P.dribble, sb = P.stepBack, loco = P.locomotion;
    if (p.action === 'stepBack') {
      if (sb.isSteppingBack || !sb.canStepBack || !dr.canChain('stepBack')) return false;
      if (dr.currentMove) dr.cancelMove();
      if (!sb.request(loco)) return false;
      this.offense.registerMove('stepBack');
      this.lastAction = 'stepBack';
      return true;
    }
    if (sb.isSteppingBack) return false;     // no dribble moves during a step-back
    const opts = p.action === 'spin' ? Object.assign({ basket: ISO.Gather.RIM }, p.opts) : p.opts;
    if (!dr.startMove(p.action, loco, opts)) return false;
    this.offense.registerMove(p.action);
    this.lastAction = p.action;
    return true;
  }
};
