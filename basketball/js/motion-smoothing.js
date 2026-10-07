// Motion continuity helpers (Step 16.5). Visual only — gameplay values are
// never smoothed here.
//
//   ISO.Smooth.damp(x, v, target, omega, dt)  critically damped spring, exact
//       for any dt (frame-rate independent): returns [x, v]
//   ISO.VelocityInertia   absorbs one-frame VELOCITY jumps of an input that is
//       itself continuous (gameplay root position / facing changed direction
//       instantly): output = input + a small offset that keeps the output's
//       velocity continuous and springs back to zero within ~0.1 s.
//   ISO.PoseInertia       absorbs one-frame POSE jumps of procedural bones
//       (a pose source switched, a layer reset): the bone holds where it was
//       drawn last frame and eases into the new pose within ~0.1 s. Normal
//       motion (even fast) passes through untouched.
(function () {
ISO.Smooth = {
  // Critically damped spring toward `target`. Exact solution, so the result
  // is identical whether it runs at 30, 60 or 144 fps.
  damp(x, v, target, omega, dt) {
    if (dt <= 0) return [x, v];
    const e = Math.exp(-omega * dt), d = x - target;
    const t = (v + omega * d) * dt;
    return [target + (d + t) * e, (v - omega * t) * e];
  },
  // Exponential approach (first order), frame-rate independent.
  approach(x, target, rate, dt) { return dt > 0 ? x + (target - x) * (1 - Math.exp(-rate * dt)) : target; },
};

// Scalar (optionally an angle) or 3-vector.
ISO.VelocityInertia = class {
  // kick: velocity jump (units/s) in one frame treated as a discontinuity
  // maxOffset: the offset never grows past this; omega: return speed (1/s)
  constructor({ kick, maxOffset, omega = 24, angle = false, dims = 1 }) {
    this.kick = kick; this.maxOffset = maxOffset; this.omega = omega; this.angle = angle; this.dims = dims;
    this.off = new Float64Array(dims); this.offV = new Float64Array(dims);
    this.last = new Float64Array(dims); this.lastV = new Float64Array(dims);
    this.has = false;
    this.jumps = 0;            // discontinuities absorbed (debug)
  }

  reset() { this.has = false; this.off.fill(0); this.offV.fill(0); }

  // input: number or {x,y,z}; returns the offset to add (number or same array)
  update(input, dt) {
    const n = this.dims, inp = n === 1 ? [input] : [input.x, input.y, input.z];
    if (!this.has || dt <= 0) {
      for (let i = 0; i < n; i++) { this.last[i] = inp[i]; this.lastV[i] = 0; }
      this.has = true; this.off.fill(0); this.offV.fill(0);
      return this.off;
    }
    let dv2 = 0, teleport = false;
    const v = [];
    for (let i = 0; i < n; i++) {
      let d = inp[i] - this.last[i];
      if (this.angle) d = Math.atan2(Math.sin(d), Math.cos(d));
      v[i] = d / dt;
      dv2 += (v[i] - this.lastV[i]) ** 2;
      if (Math.abs(d) > this.maxOffset * 8) teleport = true;
    }
    if (teleport) { this.reset(); return this.update(input, dt); }
    if (Math.sqrt(dv2) > this.kick) {
      // keep the drawn velocity continuous: the offset takes the jump
      for (let i = 0; i < n; i++) this.offV[i] -= v[i] - this.lastV[i];
      this.jumps++;
    }
    let mag2 = 0;
    for (let i = 0; i < n; i++) {
      [this.off[i], this.offV[i]] = ISO.Smooth.damp(this.off[i], this.offV[i], 0, this.omega, dt);
      mag2 += this.off[i] ** 2;
      this.last[i] = inp[i]; this.lastV[i] = v[i];
    }
    const mag = Math.sqrt(mag2);
    if (mag > this.maxOffset) for (let i = 0; i < n; i++) { this.off[i] *= this.maxOffset / mag; this.offV[i] *= 0.5; }
    return this.off;
  }
};

// Per-bone pose inertialization (local rotations, plus one optional position).
ISO.PoseInertia = class {
  // bones: Object3D[]; posBone: bone whose local x/z position is also smoothed
  constructor(bones, { accel = 350, tau = 0.05, posBone = null, posAccel = 60 } = {}) {
    this.bones = bones;
    this.accel = accel;          // rad/s^2 of sudden angular-speed change = a pose jump
    this.tau = tau;              // how fast the held pose eases into the new one (s)
    this.posBone = posBone;
    this.posAccel = posAccel;
    this.s = bones.map(() => ({ prevIn: new THREE.Quaternion(), prevW: 0, out: new THREE.Quaternion(), off: new THREE.Quaternion(), active: false }));
    this.p = { prevIn: new THREE.Vector3(), prevV: new THREE.Vector3(), out: new THREE.Vector3(), off: new THREE.Vector3() };
    this.has = false;
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._I = new THREE.Quaternion();
    this.jumps = 0;
  }

  reset() { this.has = false; }

  // skip(i): optional per-bone gate — a skipped bone is drawn exactly as posed
  // this frame (its history still updates, so turning back on is seamless).
  apply(dt, skip = null) {
    if (dt <= 0 || !this.has) {
      this.bones.forEach((b, i) => { const s = this.s[i]; s.prevIn.copy(b.quaternion); s.prevW = 0; s.out.copy(b.quaternion); s.off.identity(); s.active = false; });
      if (this.posBone) { const p = this.p; p.prevIn.copy(this.posBone.position); p.prevV.set(0, 0, 0); p.out.copy(this.posBone.position); p.off.set(0, 0, 0); }
      this.has = dt > 0 || this.has;
      return;
    }
    const decay = 1 - Math.exp(-dt / this.tau), lim = this.accel * dt;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i], s = this.s[i], qin = b.quaternion;
      const w = qin.angleTo(s.prevIn) / dt;
      if (skip && skip(i)) { s.prevIn.copy(qin); s.prevW = w; s.off.identity(); s.active = false; s.out.copy(qin); continue; }
      if (w - s.prevW > lim) {
        // a jump: keep drawing last frame's pose and ease from there
        s.off.copy(s.out).multiply(this._q.copy(qin).invert());
        s.active = true; this.jumps++;
      }
      s.prevIn.copy(qin); s.prevW = w;
      if (s.active) {
        s.off.slerp(this._I, decay);
        if (s.off.angleTo(this._I) < 1e-4) { s.off.identity(); s.active = false; }
        b.quaternion.premultiply(s.off);
      }
      s.out.copy(b.quaternion);
    }
    if (this.posBone) {
      const p = this.p, pos = this.posBone.position;
      // only x/z: the height is decided by the floor pass afterwards
      const vx = (pos.x - p.prevIn.x) / dt, vz = (pos.z - p.prevIn.z) / dt;
      if (Math.hypot(vx - p.prevV.x, vz - p.prevV.z) > this.posAccel * dt) {
        p.off.set(p.out.x - pos.x, 0, p.out.z - pos.z);
        this.jumps++;
      }
      p.prevIn.copy(pos); p.prevV.set(vx, 0, vz);
      p.off.multiplyScalar(1 - decay);
      pos.x += p.off.x; pos.z += p.off.z;
      p.out.copy(pos);
    }
  }
};
})();
