// PlayerController: turns input into movement for the user's player.
// Movement is camera-relative: "up" on the keyboard moves the player up the
// screen, whatever angle the camera is at.
ISO.PlayerController = class {
  constructor({ input, camera, startPosition, startFacing = Math.PI }) {
    this.input = input;
    this.camera = camera;

    this.locomotion = new ISO.Locomotion();
    this.locomotion.position.copy(startPosition);
    this.locomotion.facing = startFacing;

    this.model = new ISO.PlayerModel();
    this.model.update(0, this._modelState());

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  get position() { return this.locomotion.position; }
  get object() { return this.model.root; }

  update(dt) {
    const axes = this.input.getMoveAxes();
    this._screenToWorld(axes, this._dir);
    this.locomotion.update(dt, this._dir, this.input.isSprinting());
    this.model.update(dt, this._modelState());
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
      speed: l.speed,
      runSpeed: l.settings.runSpeed,
      sprinting: l.sprinting,
      turnSpeed: l.turnSpeed,
    };
  }
};
