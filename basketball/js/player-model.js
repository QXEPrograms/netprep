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
    this._qFree = new THREE.Quaternion();
    this._xfCur = [];
    this._xf = 0;
    this._ik = {
      d: new THREE.Vector3(), pole: new THREE.Vector3(), u: new THREE.Vector3(),
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
      // ikWeight: smoothed 0..1 blend from the free (guard/run) pose to the IK reach
      return { side, shoulder, elbow, hand, ikWeight: 0, ikTarget: new THREE.Vector3() };
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
  // pose (optional): { dribble: {
  //   hands: [{ side: +1 right / -1 left, target: world Vector3, weight: 0..1 }],
  //   body:  { crouch: 0..1 extra dip, twist: torso yaw (rad), roll: sideways lean (rad) } } }
  update(dt, state, pose = {}) {
    this.time += dt;
    this.root.position.copy(state.position);
    this.root.rotation.y = state.facing;

    const moveAmt = Math.min(1, state.speed / state.runSpeed);        // 0..1 at run speed
    const sprintAmt = Math.max(0, Math.min(1, (state.speed - state.runSpeed) / 2));
    const k = 1 - Math.exp(-10 * dt);
    this.stride += (moveAmt - this.stride) * k;
    // Dribbling stance: knees bent, chest over the ball.
    const stanceTarget = pose.dribble ? (pose.dribble.stance ?? 1) : 0;
    this.stance += (stanceTarget - this.stance) * k;

    // Advance the cycle by distance travelled so feet don't skate.
    const strideLen = 1.25 + 0.55 * sprintAmt; // meters per half-cycle
    this.phase += (state.speed / strideLen) * Math.PI * dt;

    const s = this.stride;
    const swing = (0.55 + 0.35 * sprintAmt) * s;
    const p = this.phase;

    // Leg flex (crouch) keeps the feet planted: thigh forward, shin back, foot level.
    const extra = pose.dribble ? pose.dribble.body : NO_BODY;
    const flex = 0.1 * (1 - s) + 0.3 * this.stance * (1 - 0.4 * s) + 0.14 * extra.crouch;

    // Hips can shift sideways (weight shift); the legs angle back so the feet
    // stay planted. sway > 0 = toward the character's right (local -x).
    const sway = extra.sway || 0;
    const legLean = sway / 0.85;
    const wide = 0.05 * Math.abs(extra.crouch || 0);   // wider base when dipping

    // Legs: opposite phase; knee bends most while the leg swings forward.
    this.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(ph);
      // Jab step: the leg on the jab side (character right = local -x) lifts and reaches.
      const jab = extra.jab ? Math.max(0, (leg.side < 0 ? 1 : -1) * extra.jab) : 0;
      // (the jab goes out to the side, not forward, so the knee stays clear of the ball)
      leg.hip.rotation.set(-sw * swing - flex - 0.15 * jab, 0, legLean + leg.side * wide + leg.side * 0.22 * jab);
      leg.knee.rotation.x = (Math.max(0, Math.cos(ph)) * 1.1 + 0.15) * s + 2 * flex + 0.4 * jab;
      leg.ankle.rotation.x = -0.25 * s * Math.max(0, -sw) - flex - 0.2 * jab;
    });
    this.body.position.x = -sway;

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

    const targetLean = 0.08 * s + 0.12 * sprintAmt + 0.16 * this.stance + 0.1 * extra.crouch;
    this.lean += (targetLean - this.lean) * k;
    const targetRoll = Math.max(-0.25, Math.min(0.25, -state.turnSpeed * 0.04 * s));
    this.roll += (targetRoll - this.roll) * k;
    this.torso.rotation.x = this.lean + 0.06 * (1 - s);
    this.body.rotation.z = this.roll + extra.roll;
    this.torso.rotation.y = Math.sin(p) * 0.12 * s * (1 - 0.5 * this.stance) // counter-rotate shoulders
      - extra.twist;                                                       // +twist turns toward the character's right
    this.head.rotation.y = -this.torso.rotation.y * 0.8;
    this.head.rotation.x = -this.lean * 0.6;

    if (pose.stepBack) this._poseStepBack(pose.stepBack);
    if (pose.shot) pose.shot.fake ? this._poseFake(pose.shot) : this._poseShot(pose.shot);
    if (pose.pass) this._posePass(pose.pass);
    this._crossfade(dt, pose.shot ? (pose.shot.fake ? 'fake' : 'shot') : pose.stepBack ? 'stepBack' : pose.pass ? 'pass' : 'base');
    this._poseArms(dt, pose.dribble);
  }

  // World position of a hand (side: +1 character right, -1 left).
  getHandWorld(side, out) {
    this.root.updateMatrixWorld(true);
    const arm = this.arms.find((a) => a.side === -side);
    return arm.elbow.localToWorld(out.set(0, -0.29, 0));
  }

  // Jump shot legs/body. Keys are placed on the shot's own timeline:
  // [time, hip, knee, torsoLean] for both legs (shooting-side foot slightly ahead).
  _poseShot({ t, gatherEnd, takeoff, land, end, jumpY }) {
    const keys = [
      [0,              -0.40, 0.80, 0.22],  // dribble stance
      [gatherEnd,      -0.45, 0.90, 0.18],  // gather
      [takeoff,        -0.62, 1.25, 0.20],  // dip
      [takeoff + 0.09, -0.06, 0.10, 0.02],  // legs extend: jump
      [land - 0.12,    -0.22, 0.40, 0.00],  // slight tuck in the air
      [land,           -0.15, 0.30, 0.02],  // reach for the floor
      [land + 0.08,    -0.55, 1.05, 0.15],  // absorb the landing
      [end,            -0.12, 0.25, 0.06],  // relaxed
    ];
    const k = sampleKeys(keys, t);
    const w = smoothstep(0, 0.1, t) * (1 - smoothstep(end - 0.12, end, t));
    if (w <= 0) return;
    const air = smoothstep(takeoff + 0.03, takeoff + 0.1, t) * (1 - smoothstep(land - 0.08, land, t));

    this.legs.forEach((leg) => {
      const stagger = leg.side < 0 ? -0.06 : 0.04; // character right (local -x) slightly forward
      const hip = k[1] + stagger, knee = k[2];
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, hip, w);
      leg.hip.rotation.z = lerp(leg.hip.rotation.z, leg.side * 0.04, w);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, knee, w);
      const flat = -(hip + knee) * 0.9;
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, lerp(flat, 0.45, air), w); // toes point down in the air
    });

    const reach = (h, kn) => 0.44 * Math.cos(h) + 0.41 * Math.cos(h + kn);
    const grounded = reach(k[1] - 0.06, k[2]) + 0.0675 - 0.92;
    this.body.position.y = lerp(this.body.position.y, grounded + jumpY, w);
    this.torso.rotation.x = lerp(this.torso.rotation.x, k[3], w);
    this.torso.rotation.y = lerp(this.torso.rotation.y, 0.1, w);    // square up, shooting (right) shoulder slightly forward
    this.body.rotation.z = lerp(this.body.rotation.z, 0, w);
  }

  // Pump fake: dip, then rise tall to sell the shot (feet stay down), then
  // settle back into the dribble stance. u = 0..1 over the fake.
  _poseFake({ u, rise, hold }) {
    const keys = [
      [0,           -0.42, 0.85, 0.20],
      [rise * 0.45, -0.55, 1.10, 0.24],   // quick dip
      [rise,        -0.20, 0.42, 0.02],   // up tall, chest up: looks like a shot
      [hold,        -0.22, 0.45, 0.02],
      [1,           -0.40, 0.80, 0.22],   // back to the dribble stance
    ];
    const k = sampleKeys(keys, u);
    const w = smoothstep(0, 0.1, u) * (1 - smoothstep(0.9, 1, u));
    if (w <= 0) return;
    this.legs.forEach((leg) => {
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, k[1], w);
      leg.hip.rotation.z = lerp(leg.hip.rotation.z, leg.side * 0.04, w);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, k[2], w);
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, -(k[1] + k[2]) * 0.9, w);
    });
    const reach = 0.44 * Math.cos(k[1]) + 0.41 * Math.cos(k[1] + k[2]);
    this.body.position.y = lerp(this.body.position.y, reach + 0.0675 - 0.92, w);
    this.torso.rotation.x = lerp(this.torso.rotation.x, k[3], w);
    this.torso.rotation.y = lerp(this.torso.rotation.y, 0.1, w);
    this.head.rotation.x = lerp(this.head.rotation.x, -0.15, w * bellCurve(u, rise * 0.5, hold + 0.1)); // eyes up at the rim
  }

  // Chest pass: a small step into the pass with the chest squared up.
  // u = 0..1 over the pass.
  _posePass({ u }) {
    const step = bellCurve(u, 0.15, 0.95);
    const w = smoothstep(0, 0.12, u) * (1 - smoothstep(0.85, 1, u));
    const front = this.legs[0];   // right foot steps toward the target
    front.hip.rotation.x = lerp(front.hip.rotation.x, -0.55, w * step);
    front.knee.rotation.x = lerp(front.knee.rotation.x, 0.7, w * step);
    this.torso.rotation.x = lerp(this.torso.rotation.x, 0.12 + 0.12 * step, w);
    this.torso.rotation.y = lerp(this.torso.rotation.y, 0, w);
  }

  // When the pose source changes (e.g. a shot starts during a step-back
  // landing), ease from last frame's legs/body over a short window instead of
  // snapping to the new source.
  _crossfade(dt, source) {
    const cur = this._poseValues(this._xfCur);
    if (this._xfSource !== undefined && source !== this._xfSource) {
      this._xfFrom = this._xfLast.slice();
      this._xf = 1;
    }
    this._xfSource = source;
    if (this._xf > 0) {
      const a = this._xf * this._xf * (3 - 2 * this._xf);
      for (let i = 0; i < cur.length; i++) cur[i] = lerp(cur[i], this._xfFrom[i], a);
      this._applyPoseValues(cur);
      this._xf = Math.max(0, this._xf - dt / 0.15);
    }
    this._xfLast = cur.slice();
  }

  _poseValues(out = []) {
    let i = 0;
    for (const leg of this.legs) {
      out[i++] = leg.hip.rotation.x; out[i++] = leg.hip.rotation.z;
      out[i++] = leg.knee.rotation.x; out[i++] = leg.ankle.rotation.x;
    }
    out[i++] = this.body.position.y;
    out[i++] = this.body.position.x;
    out[i++] = this.torso.rotation.x;
    out[i++] = this.torso.rotation.y;
    return out;
  }

  _applyPoseValues(v) {
    let i = 0;
    for (const leg of this.legs) {
      leg.hip.rotation.x = v[i++]; leg.hip.rotation.z = v[i++];
      leg.knee.rotation.x = v[i++]; leg.ankle.rotation.x = v[i++];
    }
    this.body.position.y = v[i++];
    this.body.position.x = v[i++];
    this.torso.rotation.x = v[i++];
    this.torso.rotation.y = v[i++];
  }

  // Step-back: keyed leg poses blended over the normal run/stance pose.
  // Each key: [u, frontHip, frontKnee, backHip, backKnee, torsoLean, hop]
  // (hip < 0 swings the thigh forward, knee > 0 bends the shin back,
  //  lean > 0 tips the chest forward, hop lifts the body).
  _poseStepBack({ u, frontSide }) {
    const k = sampleKeys(STEPBACK_KEYS, u);
    const w = smoothstep(0, 0.14, u) * (1 - smoothstep(0.86, 1, u));
    if (w <= 0) return;

    // Front leg = the ball side (character right = local -x = legs[0]).
    const front = frontSide > 0 ? this.legs[0] : this.legs[1];
    const back = front === this.legs[0] ? this.legs[1] : this.legs[0];
    const set = (leg, hip, knee) => {
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, hip, w);
      leg.hip.rotation.z = lerp(0, leg.side * 0.06, w);   // slightly wider base
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, knee, w);
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, -(hip + knee) * 0.9, w); // feet stay level
    };
    set(front, k[1], k[2]);
    set(back, k[3], k[4]);

    // Height: the longer (planted) leg touches the floor, plus any hop.
    const reach = (h, kn) => 0.44 * Math.cos(h) + 0.41 * Math.cos(h + kn);
    const grounded = Math.max(reach(k[1], k[2]), reach(k[3], k[4])) + 0.0675 - 0.92;
    this.body.position.y = lerp(this.body.position.y, grounded + k[6], w);
    this.torso.rotation.x = lerp(this.torso.rotation.x, k[5], w);
  }

  // Each arm blends from its free pose (run swing, or a guard in front while
  // dribbling) to an IK reach toward its requested hand target. Weights are
  // smoothed here so hand hand-offs (e.g. crossovers) never snap.
  _poseArms(dt, dribble) {
    const st = this.stance;
    const k = dt > 0 ? 1 - Math.exp(-24 * dt) : 1;
    for (const arm of this.arms) {
      // Character right (+1) is local -x, i.e. arm.side === -1.
      const req = dribble ? dribble.hands.find((h) => h.side === -arm.side) : null;
      const want = req ? req.weight : 0;
      arm.ikWeight += (want - arm.ikWeight) * k;
      if (req && want > 0) arm.ikTarget.copy(req.target);

      // Free pose: guard arm out in front, blended in with the dribble stance.
      arm.shoulder.rotation.x = lerp(arm.shoulder.rotation.x, -0.55, st);
      arm.shoulder.rotation.z = lerp(arm.shoulder.rotation.z, arm.side * 0.32, st);
      arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, -1.15, st);
      if (arm.ikWeight < 0.002) continue;

      const freeQ = this._qFree.copy(arm.shoulder.quaternion);
      const freeElbow = arm.elbow.rotation.x;
      this.solveArmIK(arm, arm.ikTarget);
      arm.shoulder.quaternion.copy(freeQ.slerp(arm.shoulder.quaternion, arm.ikWeight));
      arm.elbow.rotation.x = lerp(freeElbow, arm.elbow.rotation.x, arm.ikWeight);
    }
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

    // Upper arm leans from the target line toward the pole by alpha.
    const u = v.u.copy(d).multiplyScalar(Math.cos(alpha)).addScaledVector(pole, Math.sin(alpha));
    // Bend direction (perpendicular to the upper arm, away from the pole). Taken
    // from the elbow plane rather than the forearm, so it stays well defined —
    // and the arm never flips its twist — even when the arm is nearly straight.
    const n = v.n.copy(d).multiplyScalar(Math.sin(alpha)).addScaledVector(pole, -Math.cos(alpha));

    // Shoulder basis: local -y along the upper arm, local +z toward the bend.
    const y = v.y.copy(u).negate();
    const x = v.x.crossVectors(y, n);
    v.m.makeBasis(x, y, n);
    arm.shoulder.quaternion.setFromRotationMatrix(v.m);

    // Elbow hinge: rotating -bend about x swings the forearm toward +z.
    const interior = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    arm.elbow.rotation.set(-(Math.PI - interior), 0, 0);
  }
};

const NO_BODY = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0 };
//                 u     fHip   fKnee  bHip   bKnee  lean   hop
const STEPBACK_KEYS = [
  [0.00, -0.40, 0.80, -0.40, 0.80, 0.22, 0.00],  // dribble stance
  [0.22, -0.55, 1.00, -0.30, 0.95, 0.30, 0.00],  // plant: sink, front foot set
  [0.40, -0.30, 0.35,  0.35, 0.55, 0.02, 0.02],  // push off the front foot, back foot reaches
  [0.58, -0.45, 0.85,  0.20, 0.40,-0.14, 0.05],  // airborne, chest back
  [0.78, -0.30, 0.95,  0.05, 0.95, 0.12, 0.00],  // land low
  [1.00, -0.40, 0.80, -0.40, 0.80, 0.22, 0.00],  // balanced dribble stance
];
function sampleKeys(keys, u) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  const t = smoothstep(a[0], b[0], u);
  return a.map((v, j) => lerp(v, b[j], t));
}
function bellCurve(v, a, b) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return Math.sin(Math.PI * t) ** 2; }
function smoothstep(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
})();
