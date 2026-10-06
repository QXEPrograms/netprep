// CameraController: an elevated three-quarter (isometric-style) view.
// The camera sits at `target + offset` and looks at `target + lookOffset`.
// Later steps only need to call setFocus(position) every frame (e.g. a point
// between the ball handler and the rim); the controller eases toward it.
ISO.CameraController = class {
  constructor(aspect, options = {}) {
    const H = ISO.CONFIG.hoop;
    this.settings = Object.assign({
      fov: 42,
      offset: new THREE.Vector3(5.5, 8.6, 10.2),   // where the camera sits relative to the focus
      lookOffset: new THREE.Vector3(0, 0.8, -1.2), // where it aims relative to the focus
      smoothing: 4,                                 // higher = snappier follow
      // Keep the basket in frame: the focus is pulled this far toward the rim.
      basketBias: 0.35,
      basket: new THREE.Vector3(0, 0, H.centerZ),
    }, options);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, aspect, 0.1, 200);
    this.focus = new THREE.Vector3(0, 0, 6.5);  // where we want to look (unsmoothed)
    this.current = this.focus.clone();          // smoothed focus
    this._tmp = new THREE.Vector3();
    this.snap();
  }

  // Set the point of interest (e.g. the player's position). Smoothed in update().
  setFocus(v) {
    this.focus.copy(v);
  }

  // Jump straight to the focus with no easing (use after resets).
  snap() {
    this.current.copy(this._biasedFocus());
    this._apply();
  }

  update(dt) {
    const k = 1 - Math.exp(-this.settings.smoothing * dt); // frame-rate independent easing
    this.current.lerp(this._biasedFocus(), k);
    this._apply();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    // On narrow (portrait) screens pull the camera back so the half court still fits.
    this.zoom = aspect < 1.2 ? Math.pow(1.2 / aspect, 0.75) : 1;
    this.camera.updateProjectionMatrix();
    this._apply();
  }

  _biasedFocus() {
    return this._tmp.copy(this.focus).lerp(this.settings.basket, this.settings.basketBias);
  }

  _apply() {
    const s = this.settings;
    this.camera.position.copy(this.current).addScaledVector(s.offset, this.zoom || 1);
    const look = this.current.clone().add(s.lookOffset);
    this.camera.lookAt(look);
  }
};
