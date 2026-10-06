// Basketball: the ball's visuals and kinematic state.
//
// The ball is always in exactly one mode. Only CONTROLLED exists for now: some
// other system (the DribbleController) decides where the ball is each frame and
// calls place(). Later modes (e.g. FREE for shots/loose balls driven by physics)
// plug in here without changing how dribbling works.
ISO.Basketball = class {
  static RADIUS = 0.12; // 24 cm diameter, regulation size

  static MODES = { CONTROLLED: 'controlled' };

  constructor() {
    this.radius = ISO.Basketball.RADIUS;
    this.mode = ISO.Basketball.MODES.CONTROLLED;
    this.holder = null;                       // who controls the ball (player controller)

    this.position = new THREE.Vector3(0, this.radius, 0);
    this.velocity = new THREE.Vector3();      // derived from movement in controlled mode
    this.spinAxis = new THREE.Vector3(1, 0, 0);

    this.object = new THREE.Group();          // positioned, not rotated
    this.object.name = 'basketball';
    this.spinner = this._buildBall();         // rotated for spin
    this.object.add(this.spinner);
    this.shadow = this._buildShadow();

    this._prev = this.position.clone();
    this._q = new THREE.Quaternion();
    this._tmp = new THREE.Vector3();
    this._hasPrev = false;
  }

  // Add the ball (and its floor contact shadow) to a scene.
  addTo(scene) {
    scene.add(this.object, this.shadow);
  }

  // Kinematic placement for controlled mode. Velocity is derived from the move.
  place(pos, dt) {
    if (this._hasPrev && dt > 0) {
      this.velocity.copy(pos).sub(this._prev).divideScalar(dt);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this.position.copy(pos);
    this._prev.copy(pos);
    this._hasPrev = true;
  }

  update(dt) {
    this._spin(dt);
    this.object.position.copy(this.position);

    // Contact shadow: tighter and darker as the ball nears the floor.
    const h = Math.max(0, this.position.y - this.radius);
    const s = 1 + h * 0.9;
    this.shadow.position.set(this.position.x, 0.006, this.position.z);
    this.shadow.scale.set(s, s, s);
    this.shadow.material.opacity = 0.35 / (1 + h * 2.5);
  }

  // Subtle, believable spin: roll with horizontal travel plus a little
  // rotation from the vertical dribble motion.
  _spin(dt) {
    const v = this.velocity;
    const hx = v.x, hz = v.z;
    const hSpeed = Math.hypot(hx, hz);
    let angle = 0;
    if (hSpeed > 0.05) {
      // axis = up x velocity (rolling direction)
      this.spinAxis.set(hz, 0, -hx).normalize();
      angle += (hSpeed / this.radius) * dt * 0.22;
    }
    angle += (Math.abs(v.y) / this.radius) * dt * 0.06;
    if (angle > 0) {
      this._q.setFromAxisAngle(this.spinAxis, angle);
      this.spinner.quaternion.premultiply(this._q);
    }
  }

  _buildBall() {
    const r = this.radius;
    const g = new THREE.Group();

    const leather = new THREE.MeshStandardMaterial({
      color: 0xd8641f,
      roughness: 0.78,
      bumpMap: this._pebbleTexture(),
      bumpScale: 0.6,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), leather);
    sphere.castShadow = true;
    g.add(sphere);

    // Seams: two perpendicular great circles + two curved "bowtie" seams.
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x1b120c, roughness: 0.9 });
    const tube = 0.0038;
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 64), seamMat);     // in the XY plane
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 64), seamMat);
    ringB.rotation.x = Math.PI / 2;                                                       // in the XZ plane
    g.add(ringA, ringB);

    // Curved seams circle the z axis (perpendicular to both great circles),
    // bulging toward the poles in the classic basketball pattern.
    [1, -1].forEach((sign) => {
      const pts = [];
      const n = 96;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const theta = 0.92 + 0.3 * Math.cos(2 * t); // angular distance from the z axis
        pts.push(new THREE.Vector3(
          Math.sin(theta) * Math.cos(t),
          Math.sin(theta) * Math.sin(t),
          sign * Math.cos(theta)
        ).multiplyScalar(r));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, tube, 5, true), seamMat));
    });

    return g;
  }

  // Tiny noise texture used as a bump map for the pebbled leather grip.
  _pebbleTexture() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 5000; i++) {
      const v = 100 + Math.random() * 100;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(Math.random() * cv.width, Math.random() * cv.height, 0.8 + Math.random() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  _buildShadow() {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius * 1.1, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }
};
