// Net: a procedural diamond-mesh net that reacts to the real ball.
//
// Each knot has a spring back to its rest position plus links to the knots
// above and below it, so pulls travel down the net like rope. The basketball
// is treated as a solid obstacle: any knot it touches is pushed out to its
// surface and dragged along with its velocity. That one rule produces the whole
// swish: the top opens as the ball enters, the lower net wraps around it and
// stretches down with it, and when the ball drops out the springs snap the net
// back with some residual sway. Off-center or sideways balls (rim-ins,
// rattles) touch one side first, so their reaction is naturally lopsided.
// Rim hits add a small shake through kick().
//
// Strands are drawn as thin instanced tubes (one draw call).
ISO.Net = class {
  constructor(options = {}) {
    const H = ISO.CONFIG.hoop;
    this.settings = Object.assign({
      strands: 16,
      rows: 8,
      topRadius: H.rimRadius,
      bottomRadius: H.rimRadius * 0.48,   // narrower than the ball, so it has to stretch around it
      depth: 0.44,
      thickness: 0.0042,
      stiffness: 150,     // spring back to rest
      link: 140,          // pull from neighbors above/below
      damping: 5.5,       // low enough to leave a little sway
      grip: 0.35,         // how strongly touched knots follow the ball
    }, options);
    const s = this.settings;
    this.center = new THREE.Vector3(0, H.rimHeight - 0.012, H.centerZ);

    // Knots: rest offsets (from the rim center), displacement, velocity.
    this.rest = [];
    for (let r = 0; r <= s.rows; r++) {
      const t = r / s.rows;
      const radius = s.topRadius + (s.bottomRadius - s.topRadius) * (1 - (1 - t) * (1 - t)); // taper fast near the top
      const y = -t * s.depth;
      const offset = (r % 2) * (Math.PI / s.strands);
      const ring = [];
      for (let k = 0; k < s.strands; k++) {
        const a = (k / s.strands) * Math.PI * 2 + offset;
        ring.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
      }
      this.rest.push(ring);
    }
    this.disp = this.rest.map((ring) => ring.map(() => new THREE.Vector3()));
    this.vel = this.rest.map((ring) => ring.map(() => new THREE.Vector3()));

    // Diamond pattern: each knot connects to the two nearest knots in the next row.
    this.segments = [];
    for (let r = 0; r < s.rows; r++) {
      const odd = r % 2 === 1;
      for (let k = 0; k < s.strands; k++) {
        this.segments.push([r, k, r + 1, k]);
        this.segments.push([r, k, r + 1, odd ? (k + 1) % s.strands : (k - 1 + s.strands) % s.strands]);
      }
    }
    for (let k = 0; k < s.strands; k++) this.segments.push([s.rows, k, s.rows, (k + 1) % s.strands]);
    this._restLen = this.segments.map(([r0, k0, r1, k1]) => this.rest[r0][k0].distanceTo(this.rest[r1][k1]));

    const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    geo.translate(0, 0.5, 0); // unit tube from y=0 to y=1
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.85, emissive: 0x222222 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.segments.length);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'net';
    this.object = this.mesh;

    this.time = 0;
    this.touching = false;   // ball currently in contact with the net
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._x = new THREE.Vector3();
    this._kick = new THREE.Vector3();
    this._draw();
  }

  // Shake the net (e.g. the ball hit the rim). strength in m/s of knot speed.
  kick(strength, dir) {
    const s = this.settings;
    for (let r = 1; r <= Math.min(3, s.rows); r++) {
      const fall = 1 - (r - 1) / 3;
      for (let k = 0; k < s.strands; k++) {
        const v = this.vel[r][k];
        const j = Math.sin(k * 2.3 + this.time * 37) * 0.5 + 0.5;
        v.y -= strength * 0.25 * fall * (0.5 + j);
        if (dir) { v.x += dir.x * strength * 0.3 * fall; v.z += dir.z * strength * 0.3 * fall; }
      }
    }
  }

  // Advance the net. ball: the Basketball (or null).
  update(dt, ball) {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n; i++) this._step(dt / n, ball);
    this._draw();
  }

  _step(h, ball) {
    const s = this.settings, c = this.center;
    this.time += h;
    const touchR = ball ? ball.radius + s.thickness + 0.004 : 0;
    const bx = ball ? ball.position.x - c.x : 0, by = ball ? ball.position.y - c.y : 0, bz = ball ? ball.position.z - c.z : 0;
    const near = ball && by < 0.2 && by > -s.depth - 0.35 && Math.hypot(bx, bz) < s.topRadius + touchR + 0.05;
    let touching = false;

    for (let r = 1; r <= s.rows; r++) {
      for (let k = 0; k < s.strands; k++) {
        const d = this.disp[r][k], v = this.vel[r][k], p = this.rest[r][k];
        // Spring to rest + links to the knots above and below (rope-like).
        const up = this.disp[r - 1][k];
        const down = r < s.rows ? this.disp[r + 1][k] : d;
        const ax = -s.stiffness * d.x + s.link * ((up.x + down.x) * 0.5 - d.x) - s.damping * v.x;
        const ay = -s.stiffness * d.y + s.link * ((up.y + down.y) * 0.5 - d.y) - s.damping * v.y;
        const az = -s.stiffness * d.z + s.link * ((up.z + down.z) * 0.5 - d.z) - s.damping * v.z;
        v.x += ax * h; v.y += ay * h; v.z += az * h;
        d.x += v.x * h; d.y += v.y * h; d.z += v.z * h;

        if (!near) continue;
        // The ball is solid: push the knot out to its surface and let it be
        // dragged along with the ball.
        const x = p.x + d.x - bx, y = p.y + d.y - by, z = p.z + d.z - bz;
        const dist = Math.hypot(x, y, z);
        if (dist < touchR && dist > 1e-6) {
          touching = true;
          const push = (touchR - dist) / dist;
          d.x += x * push; d.y += y * push; d.z += z * push;
          const bv = ball.velocity;
          v.x += (bv.x - v.x) * s.grip; v.y += (bv.y - v.y) * s.grip; v.z += (bv.z - v.z) * s.grip;
        }
      }
    }
    this.touching = touching;
    this._constrain(h);
  }

  // Strands can stretch a little, not like rubber: pull any over-stretched
  // segment back to its limit (the top row stays hooked to the rim). The
  // bottom ring may open wider so the ball can pass through.
  _constrain(h) {
    const s = this.settings;
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.segments.length; i++) {
        const [r0, k0, r1, k1] = this.segments[i];
        const ring = r0 === r1;
        const maxLen = this._restLen[i] * (ring ? 1.75 : 1.25);
        const a = this._a.copy(this.rest[r0][k0]).add(this.disp[r0][k0]);
        const b = this._b.copy(this.rest[r1][k1]).add(this.disp[r1][k1]);
        const dir = this._d.copy(b).sub(a);
        const len = dir.length();
        if (len <= maxLen || len < 1e-6) continue;
        const excess = (len - maxLen) / len;
        const wa = r0 === 0 ? 0 : 0.5, wb = r0 === 0 ? 1 : 0.5;
        if (wa) { this.disp[r0][k0].addScaledVector(dir, excess * wa); this.vel[r0][k0].multiplyScalar(0.9); }
        this.disp[r1][k1].addScaledVector(dir, -excess * wb);
        this.vel[r1][k1].multiplyScalar(0.9);
      }
    }
  }

  _draw() {
    const c = this.center;
    let i = 0;
    for (const [r0, k0, r1, k1] of this.segments) {
      const a = this._a.copy(this.rest[r0][k0]).add(this.disp[r0][k0]).add(c);
      const b = this._b.copy(this.rest[r1][k1]).add(this.disp[r1][k1]).add(c);
      const dir = this._d.copy(b).sub(a);
      const len = dir.length();
      this._q.setFromUnitVectors(this._up, dir.divideScalar(len || 1));
      this._s.set(this.settings.thickness, len, this.settings.thickness);
      this._m.compose(a, this._q, this._s);
      this.mesh.setMatrixAt(i++, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Older API: a made basket used to pulse the net. The ball now drives the
  // net directly; keep a gentle extra shake for compatibility.
  pulse(strength) {
    this.kick(strength * 0.6);
  }
};
