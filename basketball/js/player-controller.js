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
    this._shotWanted = false;    // Space pressed but the shot couldn't start yet
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
    this._updateBallHandling(dt);
  }

  get hasBall() {
    return !!this.ball && this.ball.holder === this;
  }

  // True while a move owns the ball and body (gather/shot, pump fake, pass).
  get busy() {
    return this.shooting.busy || this.passing.isPassing;
  }

  // Ball-handling moves. Presses are consumed every frame, so a press that
  // can't act right now is dropped rather than queued to fire later. Rules:
  //   - nothing else starts during a shot gather/jump, a pump fake or a pass
  //   - E is ignored during a step-back, Q during a crossover
  //   - Space during a crossover (or a step-back's push) starts the gather as
  //     soon as that move allows it, but only if Space is still held
  //   - F needs a pass target; with none, possession is kept
  _handleMoves(dt) {
    const crossPressed = this.input.consumePress('crossover');
    const stepPressed = this.input.consumePress('stepBack');
    const passPressed = this.input.consumePress('pass');
    const shootPressed = this.input.consumePress('shoot');
    const shootHeld = this.input.isDown('shoot');
    if (!this.dribble) return;
    const sb = this.stepBack, dr = this.dribble, sh = this.shooting, pa = this.passing;
    const loco = this.locomotion;
    pa.beginFrame();
    const handWorld = (side, out) => this.model.getHandWorld(side, out);
    const canAct = () => this.hasBall && dr.active && !this.busy;

    // Space: tap = pump fake, hold = jump shot (ShootingSystem decides).
    if (shootPressed && !this.busy) this._shotWanted = true;
    if (!shootHeld && !shootPressed) this._shotWanted = false;
    if (this._shotWanted && canAct() && !dr.isCrossingOver && (!sb.isSteppingBack || sb.stepBackPhase === 'land')) {
      this._shotWanted = false;
      if (sb.isSteppingBack) sb.endEarly(); // flow straight from the landing into the shot
      sh.start(loco, handWorld, dr.hand);
      dr.stop();
    }

    if (canAct()) {
      if (crossPressed && !sb.isSteppingBack) dr.requestCrossover();
      if (stepPressed && !dr.isCrossingOver) sb.request(loco);
      if (passPressed && !dr.isCrossingOver && !sb.isSteppingBack && pa.request(loco, handWorld)) dr.stop();
    }

    // Moves steer the body through Locomotion's drive hook (step-back, shot,
    // fake, pass), speedScale (crossover push) and accelScale (the sharp
    // burst right after a crossover). Movement physics themselves are unchanged.
    const sbDrive = sb.update(dt, loco);
    const shotDrive = sh.update(dt, loco, shootHeld, this.input.releaseAge('shoot', dt));
    const passDrive = pa.update(dt, loco);
    loco.drive = shotDrive || passDrive || sbDrive;
    loco.speedScale = dr.isCrossingOver && dr.crossoverProgress < dr.settings.xBounceAt ? dr.settings.xSpeedScale : 1;
    loco.accelScale = 1 + 0.7 * dr.crossoverBurst;
    dr.leadScale = sb.isSteppingBack ? 0 : 1;

    // A pump fake hands the ball straight back to the dribble.
    if (sh.pumpFakeCompleted) dr.resume(sh.handBack);

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
    if (this.shooting && this.shooting.busy) {
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
