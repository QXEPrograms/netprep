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
    this._handleMoves();
    this.locomotion.update(dt, this._dir, this.input.isSprinting());
    this._updateBallHandling(dt);
  }

  // Ball-handling moves. Presses are consumed every frame so a press during a
  // move or its cooldown is dropped rather than queued.
  _handleMoves() {
    if (!this.dribble) return;
    if (this.input.consumePress('crossover')) this.dribble.requestCrossover();
    // A crossover costs a little speed; Locomotion's speedScale hook keeps the
    // movement physics themselves unchanged.
    this.locomotion.speedScale = this.dribble.isCrossingOver ? this.dribble.settings.xSpeedScale : 1;
  }

  // Order matters: the dribble places the ball from the body's new position,
  // then the model poses its arm onto the ball.
  _updateBallHandling(dt) {
    const state = this._modelState();
    let pose = {};
    if (this.dribble && this.ball.holder === this) {
      this.dribble.update(dt, state);
      pose = { dribble: this.dribble.getPose() };
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
