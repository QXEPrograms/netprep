// PlayerModel: an original low-poly humanoid built from primitives, with a
// procedural run cycle. It only handles visuals; movement lives in Locomotion.
// The model faces +z in its local space; limbs rotate around pivot groups.
(function () {
ISO.PlayerModel = class {
  constructor(options = {}) {
    this.opts = Object.assign({
      jersey: 0xf26b1d,
      trim: 0x1d3a5f,
      skin: 0x8d5a3b,
      shoes: 0xf4f4f4,
      number: '7',
    }, options);

    this.root = new THREE.Group();
    this.root.name = 'player';
    this.phase = 0;     // run-cycle phase (radians)
    this.time = 0;
    this.lean = 0;      // smoothed forward lean
    this.roll = 0;      // smoothed sideways lean into turns
    this.stride = 0;    // smoothed 0..1 amount of running pose
    this.stance = 0;    // smoothed 0..1 dribbling stance
    this._ik = {
      d: new THREE.Vector3(), pole: new THREE.Vector3(), elbow: new THREE.Vector3(),
      hand: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(),
      n: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(),
      m: new THREE.Matrix4(),
    };

    this._build();
  }

  _build() {
    const o = this.opts;
    const mat = (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const skin = mat(o.skin, 0.6);
    const jersey = mat(o.jersey, 0.75);
    const trim = mat(o.trim, 0.75);
    const shoe = mat(o.shoes, 0.5);
    const sole = mat(0x222222, 0.9);

    const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      me.castShadow = true;
      parent.add(me);
      return me;
    };
    const pivot = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    // Body bob/lean happens on `body`, which holds everything above the feet.
    this.body = pivot(this.root, 0, 0, 0);

    // Hips / shorts
    this.hips = pivot(this.body, 0, 1.0, 0);
    mesh(new THREE.BoxGeometry(0.4, 0.26, 0.24), jersey, this.hips, 0, -0.04, 0);
    mesh(new THREE.BoxGeometry(0.41, 0.05, 0.25), trim, this.hips, 0, 0.08, 0); // waistband

    // Torso (pivots at the waist so it can lean independently)
    this.torso = pivot(this.hips, 0, 0.1, 0);
    const chest = mesh(new THREE.BoxGeometry(0.44, 0.5, 0.24), [
      jersey, jersey, jersey, jersey,
      new THREE.MeshStandardMaterial({ map: this._numberTexture(o.number), roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ map: this._numberTexture(o.number), roughness: 0.75 }),
    ], this.torso, 0, 0.26, 0);
    chest.castShadow = true;
    mesh(new THREE.BoxGeometry(0.46, 0.04, 0.26), trim, this.torso, 0, 0.5, 0);   // collar trim
    mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), skin, this.torso, 0, 0.56, 0); // neck

    // Head
    this.head = pivot(this.torso, 0, 0.7, 0);
    mesh(new THREE.SphereGeometry(0.115, 16, 12), skin, this.head, 0, 0, 0);
    const hair = mesh(new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(0x1a120c, 0.9), this.head, 0, 0.012, -0.004);
    hair.castShadow = false;
    mesh(new THREE.TorusGeometry(0.113, 0.014, 6, 20), mat(0xffffff, 0.6), this.head, 0, 0.04, 0).rotation.x = Math.PI / 2; // headband
    mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), skin, this.head, 0, -0.01, 0.115); // nose (shows facing)

    // Arms: shoulder -> elbow -> hand
    this.arms = [-1, 1].map((side) => {
      const shoulder = pivot(this.torso, side * 0.27, 0.44, 0);
      mesh(new THREE.SphereGeometry(0.075, 10, 8), jersey, shoulder, 0, 0, 0);
      mesh(new THREE.CapsuleGeometry(0.052, 0.22, 4, 8), skin, shoulder, 0, -0.16, 0);
      const elbow = pivot(shoulder, 0, -0.31, 0);
      mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), skin, elbow, 0, -0.13, 0);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), mat(0xffffff, 0.6), elbow, 0, -0.2, 0); // wristband
      const hand = mesh(new THREE.SphereGeometry(0.055, 10, 8), skin, elbow, 0, -0.29, 0);
      return { side, shoulder, elbow, hand };
    });

    // Legs: hip -> knee -> foot
    this.legs = [-1, 1].map((side) => {
      const hip = pivot(this.hips, side * 0.11, -0.08, 0);
      mesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 8), jersey, hip, 0, -0.14, 0); // shorts leg
      mesh(new THREE.CapsuleGeometry(0.068, 0.2, 4, 8), skin, hip, 0, -0.3, 0);
      const knee = pivot(hip, 0, -0.44, 0);
      mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), skin, knee, 0, -0.2, 0);
      mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.12, 10), mat(0xffffff, 0.7), knee, 0, -0.34, 0); // sock
      const ankle = pivot(knee, 0, -0.41, 0);
      mesh(new THREE.BoxGeometry(0.12, 0.09, 0.27), shoe, ankle, 0, -0.01, 0.05);
      mesh(new THREE.BoxGeometry(0.125, 0.025, 0.28), sole, ankle, 0, -0.055, 0.05);
      return { side, hip, knee, ankle };
    });

    // Soft contact shadow so the player reads well even outside the shadow-map light
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.005;
    this.root.add(blob);
  }

  _numberTexture(num) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#' + this.opts.jersey.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#' + this.opts.trim.toString(16).padStart(6, '0');
    ctx.font = '800 76px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(num, 64, 70);
    ctx.fillText(num, 64, 70);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Sync the model to the locomotion state and animate limbs.
  // state: { position, facing, speed, runSpeed, sprinting, turnSpeed }
  // pose (optional): { dribble: { side: +1 right / -1 left, target: world Vector3 } }
  update(dt, state, pose = {}) {
    this.time += dt;
    this.root.position.copy(state.position);
    this.root.rotation.y = state.facing;

    const moveAmt = Math.min(1, state.speed / state.runSpeed);        // 0..1 at run speed
    const sprintAmt = Math.max(0, Math.min(1, (state.speed - state.runSpeed) / 2));
    const k = 1 - Math.exp(-10 * dt);
    this.stride += (moveAmt - this.stride) * k;
    // Dribbling stance: knees bent, chest over the ball.
    this.stance += ((pose.dribble ? 1 : 0) - this.stance) * k;

    // Advance the cycle by distance travelled so feet don't skate.
    const strideLen = 1.25 + 0.55 * sprintAmt; // meters per half-cycle
    this.phase += (state.speed / strideLen) * Math.PI * dt;

    const s = this.stride;
    const swing = (0.55 + 0.35 * sprintAmt) * s;
    const p = this.phase;

    // Leg flex (crouch) keeps the feet planted: thigh forward, shin back, foot level.
    const flex = 0.1 * (1 - s) + 0.3 * this.stance * (1 - 0.4 * s);

    // Legs: opposite phase; knee bends most while the leg swings forward.
    this.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(ph);
      leg.hip.rotation.x = -sw * swing - flex;
      leg.knee.rotation.x = (Math.max(0, Math.cos(ph)) * 1.1 + 0.15) * s + 2 * flex;
      leg.ankle.rotation.x = -0.25 * s * Math.max(0, -sw) - flex;
    });

    // Arms swing opposite to the legs; elbows stay bent like a runner.
    this.arms.forEach((arm, i) => {
      const ph = p + (i === 0 ? Math.PI : 0);
      const sw = Math.sin(ph);
      const idleSway = Math.sin(this.time * 1.6 + i) * 0.03;
      arm.shoulder.rotation.set(-sw * swing * 0.9 + idleSway, 0, arm.side * (0.12 + 0.05 * (1 - s)));
      arm.elbow.rotation.set(-(0.35 + 0.75 * s + 0.2 * sprintAmt) - 0.15 * Math.max(0, sw) * s, 0, 0);
    });

    // Whole-body motion: crouch, bob while running, lean forward with speed
    // and into turns.
    const bob = Math.abs(Math.sin(p)) * 0.06 * s;
    this.body.position.y = bob - 0.85 * (1 - Math.cos(flex));

    const targetLean = 0.08 * s + 0.12 * sprintAmt + 0.16 * this.stance;
    this.lean += (targetLean - this.lean) * k;
    const targetRoll = Math.max(-0.25, Math.min(0.25, -state.turnSpeed * 0.04 * s));
    this.roll += (targetRoll - this.roll) * k;
    this.torso.rotation.x = this.lean + 0.06 * (1 - s);
    this.body.rotation.z = this.roll;
    this.torso.rotation.y = Math.sin(p) * 0.12 * s * (1 - 0.5 * this.stance); // counter-rotate shoulders
    this.head.rotation.y = -this.torso.rotation.y * 0.8;
    this.head.rotation.x = -this.lean * 0.6;

    if (pose.dribble) this._poseDribble(pose.dribble);
  }

  // Dribbling hand reaches for the ball (2-bone IK); the off hand guards.
  _poseDribble({ side, target }) {
    // Character right (+1) is local -x, which is arms[0].
    const ballArm = this.arms.find((a) => a.side === -side);
    const offArm = this.arms.find((a) => a.side === side);
    const st = this.stance;

    // Off arm: forearm out in front as a guard, blended in with the stance.
    offArm.shoulder.rotation.x = lerp(offArm.shoulder.rotation.x, -0.55, st);
    offArm.shoulder.rotation.z = lerp(offArm.shoulder.rotation.z, offArm.side * 0.32, st);
    offArm.elbow.rotation.x = lerp(offArm.elbow.rotation.x, -1.15, st);

    this.solveArmIK(ballArm, target);
  }

  // Point the arm chain so the hand center lands on `target` (world space).
  // Exact two-bone solve in the shoulder's parent (torso) space: the elbow sits
  // in the plane of the target and a pole direction (back and out, like a real
  // elbow), then the shoulder's basis is built from that plane.
  solveArmIK(arm, target) {
    const L1 = 0.31, L2 = 0.29; // shoulder->elbow, elbow->hand
    const v = this._ik;
    this.root.updateMatrixWorld(true);

    const d = this.torso.worldToLocal(v.d.copy(target)).sub(arm.shoulder.position);
    const D = Math.min(Math.max(d.length(), 0.1), L1 + L2 - 0.002);
    d.normalize();

    // Angle between the upper arm and the shoulder->target line.
    const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));

    // Pole: elbows point backward and slightly outward/down.
    const pole = v.pole.set(arm.side * 0.5, -0.2, -1);
    pole.addScaledVector(d, -pole.dot(d));
    if (pole.lengthSq() < 1e-6) pole.set(arm.side, 0, 0).addScaledVector(d, -d.x * arm.side);
    pole.normalize();

    // Elbow and hand positions (relative to the shoulder).
    const elbow = v.elbow.copy(d).multiplyScalar(Math.cos(alpha) * L1).addScaledVector(pole, Math.sin(alpha) * L1);
    const hand = v.hand.copy(d).multiplyScalar(D);
    const u = v.u.copy(elbow).normalize();                    // upper-arm direction
    const w = v.w.copy(hand).sub(elbow).normalize();          // forearm direction

    // Shoulder basis: local -y along the upper arm, local +z toward the bend.
    const n = v.n.copy(w).addScaledVector(u, -w.dot(u));
    if (n.lengthSq() < 1e-6) n.copy(pole).multiplyScalar(-1).addScaledVector(u, pole.dot(u));
    n.normalize();
    const y = v.y.copy(u).negate();
    const x = v.x.crossVectors(y, n);
    v.m.makeBasis(x, y, n);
    arm.shoulder.quaternion.setFromRotationMatrix(v.m);

    // Elbow hinge: rotating -bend about x swings the forearm toward +z.
    const bend = Math.acos(clamp(u.dot(w), -1, 1));
    arm.elbow.rotation.set(-bend, 0, 0);
  }
};

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
})();
