// HoopPhysics: everything a free ball can hit around the basket, plus made-
// basket detection. It is used by Basketball's fixed-step free-flight update.
//
// Colliders
//   Rim        an exact torus: the closest point on the rim's center circle is
//              found analytically, so contact is smooth all the way round (no
//              faceting from segments) and works from any direction.
//   Backboard  an axis-aligned box; sphere-vs-box via the closest point, so the
//              front face, edges and corners all collide correctly.
//   Hardware   bracket, pole, arm and padded base as boxes (so loose balls
//              can't pass through the stanchion).
//   Floor      a plane (handled here too so every contact uses one response).
//
// Contact response (per contact, ball treated as a hollow sphere):
//   normal:     bounce with restitution e (no bounce below a small speed so the
//               ball can roll and settle instead of buzzing)
//   tangential: Coulomb friction on the contact-point velocity, which includes
//               spin; friction both slows sliding and changes the spin.
//
// Basket detection (per flight)
//   A basket counts when the ball's center crosses the upper plane (rim height)
//   going DOWN inside the ring, then crosses the lower plane (15 cm below)
//   going down, still inside. Going back up through the upper plane cancels
//   the entry; any upward pass through the hoop voids the flight; only one
//   basket per flight.
(function () {
const H = ISO.CONFIG.hoop;

ISO.HoopPhysics = class {
  constructor() {
    this.rimCenter = new THREE.Vector3(0, H.rimHeight, H.centerZ);
    this.rimRingRadius = H.rimRadius + H.rimTube;   // center line of the rim tube
    this.rimTube = H.rimTube;
    this.upperPlaneY = H.rimHeight;
    this.lowerPlaneY = H.rimHeight - 0.15;
    this.detectRadius = H.rimRadius;                 // inside the ring

    // Material coefficients: restitution e, friction mu.
    // rest: normal speeds below this don't bounce (lets the ball roll on the
    // rim and stop bouncing on the floor instead of buzzing forever).
    this.materials = {
      rim: { e: 0.55, mu: 0.3, rest: 0.35 },
      board: { e: 0.62, mu: 0.25, rest: 0.35 },
      hardware: { e: 0.4, mu: 0.3, rest: 0.35 },
      floor: { e: 0.68, mu: 0.45, rest: 0.9 },
    };

    const backOfRim = H.centerZ - this.rimRingRadius;
    this.boxes = [
      // Backboard glass (front face at z = boardZ)
      { name: 'board', mat: 'board', min: new THREE.Vector3(-H.boardWidth / 2, H.boardBottom, H.boardZ - H.boardThickness), max: new THREE.Vector3(H.boardWidth / 2, H.boardBottom + H.boardHeight, H.boardZ) },
      // Rim bracket to the board
      { name: 'bracket', mat: 'hardware', min: new THREE.Vector3(-0.08, H.rimHeight - 0.03, H.boardZ), max: new THREE.Vector3(0.08, H.rimHeight + 0.005, backOfRim) },
      // Stanchion: arm, pole, padded base (matches hoop.js)
      { name: 'arm', mat: 'hardware', min: new THREE.Vector3(-0.08, 3.47, -1.55), max: new THREE.Vector3(0.08, 3.63, H.boardZ - H.boardThickness - 0.07) },
      { name: 'pole', mat: 'hardware', min: new THREE.Vector3(-0.17, 0, -1.72), max: new THREE.Vector3(0.17, 3.75, -1.38) },
      { name: 'base', mat: 'hardware', min: new THREE.Vector3(-0.65, 0, -2.95), max: new THREE.Vector3(0.65, 0.9, -1.45) },
    ];

    // Shot tracking (public)
    this.basketMade = false;           // this flight has produced a basket
    this.basketMadeThisFrame = false;  // a basket happened during the current frame
    this.shotTouchedRim = false;
    this.shotTouchedBackboard = false;
    this.shotWasSwish = false;
    this.rimContacts = 0;              // rim impacts this flight (a rattle is several)
    this.boardContacts = 0;            // backboard impacts this flight
    this.basketCount = 0;              // total baskets detected
    this.onBasket = null;              // optional callback({ swish })
    this.onRimHit = null;              // optional callback(strength, normal) when the ball first touches the rim

    this._entered = false;
    this._voided = false;
    this._tmp = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._q = new THREE.Vector3();
  }

  // A new free flight starts (shot released or ball otherwise loosed).
  beginFlight() {
    this.basketMade = false;
    this.shotTouchedRim = false;
    this.shotTouchedBackboard = false;
    this.shotWasSwish = false;
    this.rimContacts = 0;
    this.boardContacts = 0;
    this._entered = false;
    this._voided = false;
    this._rimTouching = false;
    this._boardTouching = false;
  }

  beginFrame() {
    this.basketMadeThisFrame = false;
  }

  // Resolve all contacts for a ball after one substep.
  collide(ball) {
    const p = ball.position, r = ball.radius;

    let rimNow = false, boardNow = false;

    // Rim (torus)
    const c = this.rimCenter;
    const qx = p.x - c.x, qz = p.z - c.z;
    const qh = Math.hypot(qx, qz);
    if (Math.abs(p.y - c.y) < r + this.rimTube + 0.01 && Math.abs(qh - this.rimRingRadius) < r + this.rimTube + 0.01) {
      const ux = qh > 1e-6 ? qx / qh : 1, uz = qh > 1e-6 ? qz / qh : 0;
      const cp = this._q.set(c.x + ux * this.rimRingRadius, c.y, c.z + uz * this.rimRingRadius);
      const d = this._n.copy(p).sub(cp);
      const dist = d.length();
      const minDist = r + this.rimTube;
      if (dist < minDist && dist > 1e-6) {
        d.divideScalar(dist);
        this._resolve(ball, d, minDist - dist, this.materials.rim);
        this.shotTouchedRim = true;
        if (!this._rimTouching) {
          this.rimContacts++;
          if (this.onRimHit) this.onRimHit(Math.abs(ball.velocity.dot(d)) + 1, d);
        }
        rimNow = true;
      }
    }
    this._rimTouching = rimNow;

    // Boxes (backboard, hardware)
    for (const b of this.boxes) {
      const cx = clamp(p.x, b.min.x, b.max.x), cy = clamp(p.y, b.min.y, b.max.y), cz = clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      let n, pen;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        n = this._n.set(dx / d, dy / d, dz / d);
        pen = r - d;
      } else {
        // Center inside the box (shouldn't happen with small substeps): push out
        // through the nearest face.
        const faces = [
          [p.x - b.min.x, -1, 0, 0], [b.max.x - p.x, 1, 0, 0],
          [p.y - b.min.y, 0, -1, 0], [b.max.y - p.y, 0, 1, 0],
          [p.z - b.min.z, 0, 0, -1], [b.max.z - p.z, 0, 0, 1],
        ].sort((a, z) => a[0] - z[0]);
        n = this._n.set(faces[0][1], faces[0][2], faces[0][3]);
        pen = faces[0][0] + r;
      }
      this._resolve(ball, n, pen, this.materials[b.mat]);
      if (b.name === 'board') {
        this.shotTouchedBackboard = true;
        if (!this._boardTouching) this.boardContacts++;
        boardNow = true;
      }
    }
    this._boardTouching = boardNow;

    // Floor
    if (p.y < r) this._resolve(ball, this._n.set(0, 1, 0), r - p.y, this.materials.floor);
  }

  // Track the ball through the detection planes. prevY is the center height
  // before this substep.
  track(ball, prevY) {
    const p = ball.position, c = this.rimCenter;
    const inside = Math.hypot(p.x - c.x, p.z - c.z) < this.detectRadius;
    const up = this.upperPlaneY, lo = this.lowerPlaneY;

    if (prevY >= up && p.y < up) {
      // Down through the rim plane: a valid entry only from inside the ring.
      this._entered = inside;
    } else if (prevY < up && p.y >= up) {
      // Back up through the rim plane: cancel the entry; from below the hoop
      // (straight up through it) the whole flight is void.
      if (inside && !this._entered) this._voided = true;
      this._entered = false;
    }
    if (this._entered && !inside && p.y < up && p.y > lo) {
      // Left the hoop cylinder sideways between the planes: not a basket.
      this._entered = false;
    }

    if (prevY >= lo && p.y < lo && this._entered && inside && !this._voided && !this.basketMade) {
      this.basketMade = true;
      this.basketMadeThisFrame = true;
      this.shotWasSwish = !this.shotTouchedRim && !this.shotTouchedBackboard;
      this.basketCount++;
      this._entered = false;
      if (this.onBasket) this.onBasket({ swish: this.shotWasSwish });
    }
  }

  // Inside the net the ball is slowed and funneled: the net narrows toward the
  // bottom, so a ball coming through is guided toward the middle and out the
  // bottom instead of through the side. This only acts below the lower
  // detection plane (after a basket has been decided), so it never changes a
  // make or a miss.
  netDrag(ball, h) {
    const p = ball.position, c = this.rimCenter, v = ball.velocity;
    if (p.y > c.y || p.y < c.y - 0.5) return;
    const qx = p.x - c.x, qz = p.z - c.z, q = Math.hypot(qx, qz);
    if (q > H.rimRadius + 0.02) return;           // outside the hoop: not in the net
    const fh = Math.exp(-6 * h), fv = Math.exp(-1.2 * h);
    v.x *= fh;
    v.z *= fh;
    if (v.y < 0) v.y *= fv;

    if (p.y > this.lowerPlaneY - 0.01 || v.y >= 0) return;   // only a ball coming down through
    const t = Math.min(1, (c.y - p.y) / 0.44);
    const netR = H.rimRadius + (H.rimRadius * 0.48 - H.rimRadius) * (1 - (1 - t) * (1 - t));
    const allowed = Math.max(0.03, netR + 0.06 - ball.radius);   // the mesh stretches a little
    if (q > allowed && q > 1e-6) {
      const ux = qx / q, uz = qz / q;
      p.x = c.x + ux * allowed;
      p.z = c.z + uz * allowed;
      const out = v.x * ux + v.z * uz;
      if (out > 0) { v.x -= ux * out * 1.15; v.z -= uz * out * 1.15; }
    }
  }

  // Impulse response for a contact with outward normal n and penetration pen.
  _resolve(ball, n, pen, mat) {
    const v = ball.velocity, w = ball.angularVelocity, r = ball.radius;
    ball.position.addScaledVector(n, pen);

    const vn = v.dot(n);
    if (vn >= 0) return; // already separating
    const e = -vn < mat.rest ? 0 : mat.e;
    const jn = -(1 + e) * vn;               // normal impulse per unit mass
    v.addScaledVector(n, jn);

    // Contact point velocity (includes spin): v + w x (-r n)
    const rc = this._tmp.copy(n).multiplyScalar(-r);
    const vc = new THREE.Vector3().crossVectors(w, rc).add(v);
    vc.addScaledVector(n, -vc.dot(n));      // tangential part
    const vct = vc.length();
    if (vct < 1e-6) return;
    // Hollow sphere: effective tangential mass factor 1 + r^2 m / I = 2.5
    const jt = Math.min(mat.mu * jn, vct / 2.5);
    const j = vc.multiplyScalar(-jt / vct);  // tangential impulse per unit mass
    v.add(j);
    w.addScaledVector(new THREE.Vector3().crossVectors(rc, j), 1.5 / (r * r));
    ball.contacts++;
  }

  // Optional debug visuals: rim collision tube, backboard/hardware boxes and
  // the two detection planes.
  buildDebug() {
    const g = new THREE.Group();
    g.name = 'hoop-physics-debug';
    const red = new THREE.MeshBasicMaterial({ color: 0xff2255, wireframe: true });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(this.rimRingRadius, this.rimTube, 6, 32), red);
    torus.rotation.x = Math.PI / 2;
    torus.position.copy(this.rimCenter);
    g.add(torus);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
      dot.position.set(this.rimCenter.x + Math.cos(a) * this.rimRingRadius, this.rimCenter.y, this.rimCenter.z + Math.sin(a) * this.rimRingRadius);
      g.add(dot);
    }
    for (const b of this.boxes) {
      const size = b.max.clone().sub(b.min);
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
        new THREE.LineBasicMaterial({ color: b.name === 'board' ? 0x00e5ff : 0xffaa00 })
      );
      box.position.copy(b.min).add(b.max).multiplyScalar(0.5);
      g.add(box);
    }
    [this.upperPlaneY, this.lowerPlaneY].forEach((y, i) => {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(this.detectRadius, 32),
        new THREE.MeshBasicMaterial({ color: i ? 0x22ff88 : 0x2288ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(this.rimCenter.x, y, this.rimCenter.z);
      g.add(disc);
    });
    return g;
  }
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
})();
