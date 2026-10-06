// PlayerController: turns input into movement for the user's player.
// Movement is camera-relative: "up" on the keyboard moves the player up the
// screen, whatever angle the camera is at.
ISO.PlayerController = class {
  constructor({ input, camera, ball, startPosition, startFacing = Math.PI }) {
    this.input = input;
    this.camera = camera;

    this.locomotion = new ISO.Locomotion();
    this.locomotion.position.copy(startPosition);
    this.locomotion.facing = startFacing;

    this.model = new ISO.PlayerModel();

    // Ball handling is its own system; the controller just runs it each frame.
    this.ball = ball;
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
    if (ball.returnPass) {
      const chest = this._tmp.set(loco.position.x + Math.sin(loco.facing) * 0.3, 1.2, loco.position.z + Math.cos(loco.facing) * 0.3);
      if (ball.position.distanceTo(chest) < 0.7) this._regainBall(dr.hand);
    }
    // No rebounds yet: once the ball has settled (or had plenty of time), hand
    // it back so play can continue.
    if (ball.mode === ISO.Basketball.MODES.FREE && (ball.settled || ball.freeTime > 4)) this._regainBall('right');
    // Dev reset after a block (no loose-ball rules yet): let the deflection
    // play out for a moment so it can be seen, then hand the ball back.
    else if (ball.mode === ISO.Basketball.MODES.FREE && ball.blockedAt !== null && ISO.DEFENSE &&
             ball.freeTime - ball.blockedAt > ISO.DEFENSE.hands.resetAfter) this._regainBall('right');
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
    if (this.finishing && this.finishing.busy) {
      this.finishing.place(dt, this.locomotion);
      pose = { dribble: this.finishing.getPose(), finish: this.finishing.getFinishPose() };
    } else if (this.shooting && this.shooting.busy) {
      this.shooting.place(dt, this.locomotion);
      pose = { dribble: this.shooting.getPose(), shot: this.shooting.getShotPose() };
    } else if (this.passing && this.passing.isPassing) {
      this.passing.place(dt, this.locomotion);
      pose = { dribble: this.passing.getPose(), pass: this.passing.getPassPose() };
    } else if (this.dribble && this.hasBall) {
      this.dribble.update(dt, state);
      const stepBack = this.stepBack.getPose();
      if (stepBack) stepBack.frontSide = this.dribble.sideSign; // plant the ball-side foot
      pose = { dribble: this.dribble.getPose(), stepBack };
    }
    this.model.update(dt, state, pose);
  }

  // Screen axes -> ground-plane direction using the camera's flattened forward/right.
  _screenToWorld(axes, out) {
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    this._fwd.normalize();
    this._right.set(-this._fwd.z, 0, this._fwd.x); // forward rotated 90deg clockwise
    out.set(0, 0, 0)
      .addScaledVector(this._fwd, axes.y)
      .addScaledVector(this._right, axes.x);
    const len = out.length();
    if (len > 1) out.divideScalar(len);
    return out;
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
    };
  }
};
