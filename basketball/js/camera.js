// CameraController: a possession camera, behind and above the offense,
// looking toward the basket.
//
// It frames one thing: BALL HANDLER + DEFENDER + BASKET. The focus is the
// ball handler pulled toward their defender and toward the rim; the camera
// sits `distance` behind that focus (on the side away from the basket) and
// `height` above it. It never follows the player's body rotation: its yaw
// only leans a little toward the line from the rim to the ball handler (so
// the attack direction stays "up the screen" from the wings), slowly and
// within a small limit, so WASD stays predictable. Every number lives in
// ISO.MOVEMENT.camera.
ISO.CameraController = class {
  constructor(aspect) {
    const H = ISO.CONFIG.hoop;
    this.cfg = ISO.MOVEMENT.camera;
    this.basket = new THREE.Vector3(0, 0, H.centerZ);
    this.camera = new THREE.PerspectiveCamera(this.cfg.fov, aspect, 0.1, 200);
    this.focus = new THREE.Vector3(0, 0, 6.5);  // where we want to look (unsmoothed)
    this.current = this.focus.clone();          // smoothed focus
    this.yaw = 0;                               // 0 = behind the basket line, looking toward the baseline
    this.yawTarget = 0;
    this.bias = this.cfg.basketBias;            // how far the focus is pulled toward the rim
    this._handler = new THREE.Vector3(0, 0, 9);
    this._tmp = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this.snap();
  }

  // Frame the possession: the ball handler pulled toward their matchup and
  // toward the rim (a bit more once the matchup is beaten on a drive).
  frame(handler, matchup, attack, beaten, dt) {
    const C = this.cfg;
    const f = this._f.copy(handler);
    if (matchup) f.lerp(matchup, C.defenderWeight);
    const want = beaten && attack > 0.3 ? C.driveBasketBias : C.basketBias;
    this.bias += (want - this.bias) * (dt > 0 ? 1 - Math.exp(-C.biasSmoothing * dt) : 1);
    this._handler.copy(handler);
    this.setFocus(f);
  }

  // Set the point of interest. Smoothed in update().
  setFocus(v) {
    this.focus.copy(v);
  }

  // Jump straight to the target with no easing (possession resets).
  snap() {
    this.yaw = this.yawTarget = this._wantYaw();
    this.current.copy(this._biasedFocus());
    this._apply();
  }

  update(dt) {
    const C = this.cfg;
    const k = 1 - Math.exp(-C.smoothing * dt);   // frame-rate independent easing
    this.current.lerp(this._biasedFocus(), k);
    // yaw: eased and rate-limited (restrained, never a whip)
    this.yawTarget = this._wantYaw();
    const err = this.yawTarget - this.yaw;
    const step = err * (1 - Math.exp(-C.yawSmoothing * dt));
    const max = C.yawRate * dt;
    this.yaw += Math.max(-max, Math.min(max, step));
    this._apply();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    // On narrow (portrait) screens pull the camera back so the matchup still fits.
    this.zoom = aspect < 1.2 ? Math.pow(1.2 / aspect, 0.75) : 1;
    this.camera.updateProjectionMatrix();
    this._apply();
  }

  // Leans toward the rim -> ball handler line, less near the rim (where that
  // line swings quickly) and never past maxYaw.
  _wantYaw() {
    const C = this.cfg, h = this._handler;
    const dx = h.x - this.basket.x, dz = Math.max(0.5, h.z - this.basket.z);
    const dist = Math.hypot(dx, h.z - this.basket.z);
    const fade = Math.max(0, Math.min(1, (dist - C.yawFadeNear) / C.yawFadeRange));
    const y = Math.atan2(dx, dz) * C.yawFollow * fade;
    return Math.max(-C.maxYaw, Math.min(C.maxYaw, y));
  }

  _biasedFocus() {
    return this._tmp.copy(this.focus).lerp(this.basket, this.bias);
  }

  _apply() {
    const C = this.cfg, z = this.zoom || 1;
    const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
    this.camera.fov = C.fov;
    this.camera.position.set(
      this.current.x + sx * C.distance * z,
      this.current.y + C.height * z,
      this.current.z + sz * C.distance * z);
    this._look.set(this.current.x - sx * C.lookAhead, this.current.y + C.lookHeight, this.current.z - sz * C.lookAhead);
    this.camera.lookAt(this._look);
    this.camera.updateProjectionMatrix();
  }
};
