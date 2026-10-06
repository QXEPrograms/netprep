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
    this._shotWanted = false;    // Space pressed but the shot couldn't start yet
    if (ball) ball.holder = this;
    this._updateBallHandling(0);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._dir = new THREE.Vector3();
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

  // Ball-handling moves. E/Q presses are consumed every frame so a press during
  // a move or its cooldown is dropped rather than queued. Moves never overlap:
  // E is ignored during a step-back, Q during a crossover, and both during a
  // shot. Space during a crossover (or a step-back's push) starts the shot as
  // soon as that move allows it, if Space is still held.
  _handleMoves(dt) {
    const crossPressed = this.input.consumePress('crossover');
    const stepPressed = this.input.consumePress('stepBack');
    const shootPressed = this.input.consumePress('shoot');
    const shootHeld = this.input.isDown('shoot');
    if (!this.dribble) return;
    const sb = this.stepBack, dr = this.dribble, sh = this.shooting;

    if (shootPressed && !sh.isShooting) this._shotWanted = true;
    if (!shootHeld && !shootPressed) this._shotWanted = false;
    const shotAllowed = this.hasBall && dr.active && !dr.isCrossingOver &&
      (!sb.isSteppingBack || sb.stepBackPhase === 'land');
    if (this._shotWanted && shotAllowed) {
      this._shotWanted = false;
      if (sb.isSteppingBack) sb.endEarly(); // flow straight from the landing into the shot
      dr.stop();
      sh.start(this.locomotion, (side, out) => this.model.getHandWorld(side, out));
    }

    if (!sh.isShooting && this.hasBall) {
      if (crossPressed && !sb.isSteppingBack) dr.requestCrossover();
      if (stepPressed && !dr.isCrossingOver) sb.request(this.locomotion);
    }

    // Moves steer the body through Locomotion's drive hook (step-back, shot) or
    // speedScale (crossover). Movement physics themselves are unchanged.
    const sbDrive = sb.update(dt, this.locomotion);
    const shotDrive = sh.update(dt, this.locomotion, shootHeld);
    this.locomotion.drive = shotDrive || sbDrive;
    this.locomotion.speedScale = dr.isCrossingOver ? dr.settings.xSpeedScale : 1;
    dr.leadScale = sb.isSteppingBack ? 0 : 1;

    // No rebounds yet: once the shot is over and the ball has settled (or had
    // plenty of time), hand it back so play can continue.
    const ball = this.ball;
    if (!sh.isShooting && ball.mode === ISO.Basketball.MODES.FREE && (ball.settled || ball.freeTime > 4)) {
      ball.setControlled();
      ball.holder = this;
      dr.resume('right');
    }
  }

  // Order matters: ball systems place the ball from the body's new position,
  // then the model poses its arms onto the ball.
  _updateBallHandling(dt) {
    const state = this._modelState();
    let pose = {};
    if (this.shooting && this.shooting.isShooting) {
      this.shooting.place(dt, this.locomotion);
      pose = { dribble: this.shooting.getPose(), shot: this.shooting.getShotPose() };
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
