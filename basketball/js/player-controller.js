// PlayerController: a player's OFFENSIVE role — turns their input into
// basketball movement and ball handling. Each player entity (teams.js) owns
// one, and runs it whenever that player's team has the ball.
// Movement is camera-relative: "up" on the keyboard moves the player up the
// screen, whatever angle the camera is at.
ISO.PlayerController = class {
  constructor({ input, camera, ball, startPosition, startFacing = Math.PI, model = null, playerId = null }) {
    this.input = input;
    this.camera = camera;
    this.playerId = playerId;     // identity (the ball's ownerPlayerId reads this)

    // Basketball locomotion: commitment blend, plants, squared/open
    // orientation and lean (offensive-locomotion.js, tuned in movement-config.js).
    this.locomotion = new ISO.OffensiveLocomotion();
    this.bodyPose = new ISO.OffenseBodyPose(this.locomotion);
    this.locomotion.position.copy(startPosition);
    this.locomotion.facing = startFacing;

    this.model = model || new ISO.PlayerModel();

    // Ball handling is its own system; the controller just runs it each frame.
    this.ball = ball;
    if (ball) this.model.ball = ball;     // read-only: keeps the arm IK exact while a hand is on the ball
    this.dribble = ball ? new ISO.DribbleController(ball) : null;
    this.stepBack = new ISO.StepBackMove();
    this.shooting = ball ? new ISO.ShootingSystem(ball) : null;
    this.passing = ball ? new ISO.PassingSystem(ball) : null;
    this.finishing = ball ? new ISO.FinishSystem(ball) : null;
    if (this.finishing) this.finishing.setRng(() => this.shooting.rng());
    // Input -> moves, chaining, fatigue and contextual Space (offense-controller.js).
    this.offenseController = ball ? new ISO.OffenseController(this) : null;
    // Body contact (only happens with a defender on the floor): airborne
    // shots/finishes lose the drift that runs into the defender.
    this.locomotion.onContact = (nx, nz) => {
      if (this.shooting) this.shooting.absorbContact(nx, nz);
      if (this.finishing) this.finishing.absorbContact(nx, nz);
    };
    if (ball) ball.holder = this;
    this._updateBallHandling(0);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  get position() { return this.locomotion.position; }
  get object() { return this.model.root; }

  update(dt) {
    const axes = this.input.getMoveAxes();
    this._screenToWorld(axes, this._dir);
    this._handleMoves(dt);
    this.locomotion.update(dt, this._dir, this.input.isSprinting());
    // Hook for systems that adjust the body after it moves (player contact),
    // before the ball is placed from the body's position.
    if (this.afterMove) this.afterMove(dt);
    this._updateBallHandling(dt);
  }

  get hasBall() {
    return !!this.ball && this.ball.holder === this;
  }

  // Fatigue / chain tracking (OffenseState), for Gather and future systems.
  get offense() { return this.offenseController ? this.offenseController.offense : null; }

  // Feet off the floor (jump shot or finish in the air).
  get airborne() {
    const sh = this.shooting, fi = this.finishing;
    return !!((sh && sh.isShooting && sh.jumpHeight(sh.shotTime) > 0.02) || (fi && fi.busy && fi.jumpHeight(fi.t) > 0.02));
  }

  // True while a move owns the ball and body (gather/shot, pump fake, finish, pass).
  get busy() {
    return this.shooting.busy || this.finishing.busy || this.passing.isPassing;
  }

  // Ball-handling moves are run by the OffenseController (see its header for
  // the rules). Here: catching a returned pass and getting the ball back.
  _handleMoves(dt) {
    if (!this.dribble) return;
    this.offenseController.update(dt);
    const loco = this.locomotion, dr = this.dribble;

    const ball = this.ball;
    if (ball.mode !== ISO.Basketball.MODES.FREE || this.busy) return;
    // A pass coming back (debug target): catch it when it reaches the hands.
    // That is the only free ball a player ever picks up: shots are never
    // chased or rebounded — the possession system ends the possession and
    // hands the ball out again (possession.js).
    if (ball.returnPass) {
      const chest = this._tmp.set(loco.position.x + Math.sin(loco.facing) * 0.3, 1.2, loco.position.z + Math.cos(loco.facing) * 0.3);
      if (ball.position.distanceTo(chest) < 0.7) this._regainBall(dr.hand);
    }
  }

  // ---- role changes / possession resets ------------------------------------

  // This player stops playing offense: drop every action in progress (and the
  // ball, if it is still in the hands).
  deactivate() {
    this._cancelAll();
    if (this.ball && this.ball.holder === this) this.ball.holder = null;
    this.afterMove = null;
  }

  // Start a possession standing at `position`, facing `facing`, with no
  // momentum, lean, move, shot, fatigue or buffered press left over. With the
  // ball: it is attached to the dribble hand before anything moves.
  resetForPossession({ position, facing, withBall = false, hand = 'right' }) {
    this._cancelAll();
    this.locomotion.resetMotion(position, facing);
    if (this.bodyPose) this.bodyPose.reset();
    this.model.resetContinuity();         // no motion history across the reset
    if (withBall && this.ball) {
      this.ball.resetForPossession(this);
      this.dribble.resetFor(hand);
    } else if (this.ball && this.ball.holder === this) this.ball.holder = null;
    this._updateBallHandling(0);          // ball placed in the hand, pose settled
  }

  _cancelAll() {
    if (this.offenseController) this.offenseController.reset();
    if (this.shooting) this.shooting.cancel();
    if (this.finishing) this.finishing.cancel();
    if (this.passing) this.passing.cancel();
    if (this.stepBack) this.stepBack.cancel();
    if (this.dribble) this.dribble.resetFor(this.dribble.hand);
    this.locomotion.drive = null;
  }

  _regainBall(hand) {
    this.ball.setControlled();
    this.ball.holder = this;
    this.ball.returnPass = false;
    this.dribble.resume(hand);
  }

  // Order matters: ball systems place the ball from the body's new position,
  // then the model poses its arms onto the ball.
  _updateBallHandling(dt) {
    const state = this._modelState();
    let pose = {};
    // How much of the movement lean the body takes: all of it while dribbling,
    // a little while a shot/finish/pass owns the body, none in the air.
    const sh = this.shooting, fi = this.finishing;
    const leanW = this.airborne ? 0 : (sh && sh.busy) ? 0.25 : (fi && fi.busy) ? 0.45 : (this.passing && this.passing.isPassing) ? 0.5
      : this.stepBack.isSteppingBack ? 0.6
      : this.dribble && this.dribble.currentMove === 'spin' ? 0.3 : 1;   // the spin turns the body under the lean
    const loco = this.bodyPose.update(dt, leanW);
    if (this.finishing && this.finishing.busy) {
      this.finishing.place(dt, this.locomotion);
      pose = { dribble: this.finishing.getPose(), finish: this.finishing.getFinishPose(), loco };
    } else if (this.shooting && this.shooting.busy) {
      this.shooting.place(dt, this.locomotion);
      pose = { dribble: this.shooting.getPose(), shot: this.shooting.getShotPose(), loco };
    } else if (this.passing && this.passing.isPassing) {
      this.passing.place(dt, this.locomotion);
      pose = { dribble: this.passing.getPose(), pass: this.passing.getPassPose(), loco };
    } else if (this.dribble && this.hasBall) {
      this.dribble.update(dt, state);
      const stepBack = this.stepBack.getPose();
      if (stepBack) stepBack.frontSide = this.dribble.sideSign; // plant the ball-side foot
      pose = { dribble: this.dribble.getPose(), stepBack, loco };
    }
    if (!pose.loco) pose.loco = loco;
    this.model.update(dt, state, pose);
  }

  // Screen axes -> ground-plane travel direction (the shared convention, input.js).
  _screenToWorld(axes, out) {
    return ISO.ScreenInput.toWorld(axes, this.camera, out);
  }

  // 0..1: the matchup is right in front of the ball (protect the dribble).
  _pressure() {
    const l = this.locomotion, o = l.orientation, MD = ISO.MOVEMENT && ISO.MOVEMENT.dribble;
    if (!o || !l.matchup || !MD || o.matchupDepth <= 0) return 0;
    const dist = Math.hypot(o.matchupDepth, o.matchupLateral);
    return Math.max(0, Math.min(1, (MD.pressureRange - dist) / 0.5)) * Math.max(0, 1 - Math.abs(o.matchupLateral) / 0.8);
  }

  _modelState() {
    const l = this.locomotion;
    return {
      position: l.position,
      facing: l.facing,
      velocity: l.velocity,
      speed: l.speed,
      runSpeed: l.settings.runSpeed,
      sprintSpeed: l.settings.sprintSpeed,
      sprinting: l.sprinting,
      turnSpeed: l.turnSpeed,
      // movement context for the dribble rhythm
      attack: l.attack || 0,
      forwardSpeed: Math.sin(l.facing) * l.velocity.x + Math.cos(l.facing) * l.velocity.z,
      planting: l.plantState === 'cut' || l.plantState === 'reversal',
      handShift: this.bodyPose ? this.bodyPose.out.handShift || 0 : 0,
      lateralSpeed: -Math.cos(l.facing) * l.velocity.x + Math.sin(l.facing) * l.velocity.z,
      pressure: this._pressure(),
      opponent: l.matchup ? l.matchup.position : null,     // (visual: contact posture)
    };
  }
};
