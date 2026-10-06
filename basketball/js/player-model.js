// PlayerModel: drives the Player Model V2 character (character-rig.js: one
// skinned mesh on a humanoid THREE.Skeleton) from the gameplay state.
//
//   gameplay / locomotion pose  ->  this adapter  ->  rig bones
//
// The gameplay root (`root`) is placed by gameplay only; the skeleton under it
// is visual. The procedural pose layers below write local bone rotations
// relative to the rig's rest pose (facing +z, limbs hanging straight down):
//   body   (rig root)   bob / sway / roll / fall yaw
//   hips                pelvis
//   torso  (spineLower) lean + twist, spread up the spine to spineUpper/chest
//   head, arms (clavicle / shoulder=upper arm / elbow=forearm / hand),
//   legs (hip=thigh / knee=shin / ankle=foot)
// After the pose layers: the balance layer (steal reach, ankle-break
// reactions), the wrists, then a floor pass puts the lowest foot (or the seat,
// in a fall) exactly on the floor at the current jump height, then the arm IK.
(function () {
ISO.PlayerModel = class {
  constructor(options = {}) {
    // options: legacy colours ({ jersey, trim, skin, shoes, number }) and/or
    // { teamId, playerId, jerseyNumber, colors, appearance } (see character-rig.js)
    this.character = ISO.createBasketballPlayer(options);
    this.opts = this.character.appearance;
    this.rig = this.character.rig;
    this.root = this.character.root;
    this.phase = 0;     // run-cycle phase (radians)
    this.time = 0;
    this.lean = 0;      // smoothed forward lean
    this.roll = 0;      // smoothed sideways lean into turns
    this.stride = 0;    // smoothed 0..1 amount of running pose
    this.stance = 0;    // smoothed 0..1 dribbling stance
    this._qFree = new THREE.Quaternion();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._xfCur = [];
    this._xf = 0;
    this._airY = 0;            // how high the feet should be this frame (jumps)
    this._reachW = 0;          // smoothed steal-reach amount
    this._rx = { w: 0, level: 0 };   // ankle-break reaction pose state
    this._wrist = 0;           // shooting-hand follow-through flex
    this._ik = {
      d: new THREE.Vector3(), pole: new THREE.Vector3(), u: new THREE.Vector3(),
      n: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(),
      m: new THREE.Matrix4(),
    };
    this.L1 = this.rig.dims.upperArm;     // shoulder -> elbow
    this.L2 = this.rig.dims.forearm;      // elbow -> palm centre

    this._bindRig();
  }

  // Name the rig bones the way the pose layers think about them.
  _bindRig() {
    const r = this.rig;
    this.body = r.root;
    this.hips = r.hips;
    this.torso = r.spineLower;
    this.spineUpper = r.spineUpper;
    this.chest = r.chest;
    this.neck = r.neck;
    this.head = r.head;
    // side = local x sign: -1 = character right, +1 = character left
    this.arms = [-1, 1].map((side) => {
      const pre = side < 0 ? 'right' : 'left';
      const shoulder = r[pre + 'UpperArm'];
      return { side, clavicle: r[pre + 'Clavicle'], shoulder, elbow: r[pre + 'Forearm'], hand: r[pre + 'Hand'],
        // ikWeight: smoothed 0..1 blend from the free (guard/run) pose to the IK reach
        // shrug: smoothed shoulder lift when reaching high (dunks, layups)
        ikWeight: 0, ikTarget: new THREE.Vector3(), base: shoulder.position.clone(), shrug: 0 };
    });
    this.legs = [-1, 1].map((side) => {
      const pre = side < 0 ? 'right' : 'left';
      return { side, hip: r[pre + 'Thigh'], knee: r[pre + 'Shin'], ankle: r[pre + 'Foot'] };
    });
    this._restHips = this.hips.position.clone();

    // Soft contact shadow so the player reads well even outside the shadow-map light
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.005;
    this.root.add(blob);
  }

  // Colours / number at runtime (no rebuild).
  setAppearance(a) { this.character.setAppearance(a); this.opts = this.character.appearance; }

  // Sync the model to the locomotion state and animate limbs.
  // state: { position, facing, speed, runSpeed, sprinting, turnSpeed }
  // pose (optional): { dribble: {
  //   hands: [{ side: +1 right / -1 left, target: world Vector3, weight: 0..1 }],
  //   body:  { crouch: 0..1 extra dip, twist: torso yaw (rad), roll: sideways lean (rad) } } }
  update(dt, state, pose = {}) {
    this.time += dt;
    this.root.position.copy(state.position);
    this.root.rotation.set(0, state.facing, 0);
    // bones the layers below only add to start from rest every frame
    this.body.rotation.set(0, 0, 0);
    this.hips.position.copy(this._restHips); this.hips.rotation.set(0, 0, 0);
    this.head.rotation.z = 0;
    for (const a of this.arms) { a.clavicle.rotation.set(0, 0, 0); a.hand.rotation.set(0, 0, 0); }
    for (const l of this.legs) l.hip.rotation.y = 0;
    this._airY = 0;

    const moveAmt = Math.min(1, state.speed / state.runSpeed);        // 0..1 at run speed
    const sprintAmt = Math.max(0, Math.min(1, (state.speed - state.runSpeed) / 2));
    const k = 1 - Math.exp(-10 * dt);
    this.stride += (moveAmt - this.stride) * k;
    // Dribbling stance: knees bent, chest over the ball.
    const stanceTarget = pose.dribble ? (pose.dribble.stance ?? 1) : 0;
    this.stance += (stanceTarget - this.stance) * k;

    // Basketball locomotion (offense): lean/weight/twist from the movement
    // system. Absent for other characters -> the plain run cycle as before.
    const lp = pose.loco || null;
    // Direction of travel relative to the hips: sideways steps and backpedals
    // get their own footwork instead of a forward run cycle.
    const fv = Math.sin(state.facing) * state.velocity.x + Math.cos(state.facing) * state.velocity.z;
    const lv = -Math.cos(state.facing) * state.velocity.x + Math.sin(state.facing) * state.velocity.z;
    const den = Math.abs(fv) + Math.abs(lv) + 0.25;
    const kf = 1 - Math.exp(-12 * dt);
    this.latAmt = (this.latAmt ?? 0) + (Math.abs(lv) / den - (this.latAmt ?? 0)) * kf;
    this.backAmt = (this.backAmt ?? 0) + ((fv < 0 ? -fv / den : 0) - (this.backAmt ?? 0)) * kf;
    this.latSide = Math.abs(lv) > 0.3 ? Math.sign(lv) : (this.latSide || 1);

    // Advance the cycle by distance travelled so feet don't skate.
    const F = ISO.MOVEMENT ? ISO.MOVEMENT.feet : null;
    const baseStride = lp ? lp.stride : 1.25;
    const strideLen = lerp(baseStride + 0.55 * sprintAmt, F ? F.lateralStride : 0.55, lp ? this.latAmt : 0); // meters per half-cycle
    this.phase += (state.speed / strideLen) * Math.PI * dt;

    const s = this.stride;
    const p = this.phase;

    // Leg flex (crouch) keeps the feet planted: thigh forward, shin back, foot level.
    // (crouch < 0 = rising tall, e.g. the hesitation)
    const extra = pose.dribble ? pose.dribble.body : NO_BODY;
    const strideMul = extra.stride ?? 1;     // < 1 = short, choppy steps (spin, behind-the-back)
    const latA = lp ? this.latAmt : 0, backA = lp ? this.backAmt : 0;
    const swing = (0.55 + 0.35 * sprintAmt) * s * strideMul * (1 - latA);
    const flex = Math.max(0, 0.1 * (1 - s) + 0.3 * this.stance * (1 - 0.4 * s) + 0.14 * (extra.crouch + (lp ? lp.crouch : 0)));

    // Hips can shift sideways (weight shift); the legs angle back so the feet
    // stay planted. sway > 0 = toward the character's right (local -x).
    const sway = (extra.sway || 0) + (lp ? lp.sway : 0);
    const legLean = sway / 0.85;
    const wide = 0.05 * Math.abs(extra.crouch || 0);   // wider base when dipping

    // Legs: opposite phase; knee bends most while the leg swings forward.
    const spread = F ? F.lateralSpread : 0.22;
    const lead = this.latSide > 0 ? this.legs[0] : this.legs[1];       // legs[0] = character right
    this.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(ph) * (1 - 2 * backA);                          // backpedal: the swing runs in reverse
      // sideways: the lead foot steps out, the trail foot pushes then closes (never crosses)
      const isLead = leg === lead, sp = Math.sin(p);
      const out = latA * s * (isLead ? spread * Math.max(0, sp) : -0.5 * spread * Math.max(0, -sp));
      const lift = latA * s * (isLead ? 0.3 * Math.max(0, sp) : 0.15 * Math.max(0, -sp));
      // Jab step: the leg on the jab side (character right = local -x) lifts and reaches.
      const jab = extra.jab ? Math.max(0, (leg.side < 0 ? 1 : -1) * extra.jab) : 0;
      // (the jab goes out to the side, not forward, so the knee stays clear of the ball)
      leg.hip.rotation.set(-sw * swing - flex - 0.15 * jab - 0.5 * lift, 0, legLean + leg.side * wide + leg.side * 0.22 * jab + leg.side * out);
      leg.knee.rotation.x = (Math.max(0, Math.cos(ph)) * 1.1 * strideMul * (1 - latA) + 0.15) * s + 2 * flex + 0.4 * jab + lift;
      leg.ankle.rotation.x = -0.25 * s * Math.max(0, -sw) - flex - 0.2 * jab;
    });
    this.body.position.x = -sway;
    this.body.position.z = extra.forward || 0;   // hips slide forward (behind-the-back room)

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

    // With basketball locomotion the lean comes from the movement system
    // (velocity + acceleration); otherwise from speed as before.
    const targetLean = lp ? 0.16 * this.stance + 0.1 * extra.crouch
      : 0.08 * s + 0.12 * sprintAmt + 0.16 * this.stance + 0.1 * extra.crouch;
    this.lean += (targetLean - this.lean) * k;
    const targetRoll = Math.max(-0.25, Math.min(0.25, -state.turnSpeed * 0.04 * s)) * (extra.turnRoll ?? 1) * (lp ? 0.4 : 1);
    this.roll += (targetRoll - this.roll) * k;
    this.torso.rotation.x = this.lean + 0.06 * (1 - s) + (lp ? lp.pitch : 0);
    this.body.rotation.z = this.roll + extra.roll + (lp ? lp.roll : 0);
    // Movement lean pivots near the hips (not the feet): the feet push out to
    // the side and the torso stays over the physical body.
    if (lp && lp.pivot) this.body.position.x += lp.pivot * Math.sin(lp.roll);
    const runSway = Math.sin(p) * 0.12 * s * (1 - 0.5 * this.stance) * (1 - latA);  // shoulders counter the stride
    this.torso.rotation.y = runSway - extra.twist + (lp ? lp.twist : 0);   // +twist (extra) turns toward the character's right
    this.head.rotation.y = -runSway * 0.8 + (lp ? lp.head : 0);
    this.head.rotation.x = -this.lean * 0.6;

    if (pose.stepBack) this._poseStepBack(pose.stepBack);
    if (pose.shot) pose.shot.fake ? this._poseFake(pose.shot) : this._poseShot(pose.shot);
    if (pose.shot && pose.shot.hop) this._poseHop(pose.shot.hop);
    if (pose.pass) this._posePass(pose.pass);
    if (pose.finish) this._poseFinish(pose.finish);
    if (pose.defense) this._poseDefense(dt, pose.defense);
    this._crossfade(dt, pose.defense ? 'defense' : pose.finish ? 'finish' : pose.shot ? (pose.shot.fake ? 'fake' : 'shot') : pose.stepBack ? 'stepBack' : pose.pass ? 'pass' : 'base');
    this._spreadSpine();
    this._poseBalance(dt, pose.balance || null);
    this._poseWrists(dt, pose);
    this._ground();
    this._poseArms(dt, pose.dribble);
    this._poseBalanceArms();
  }

  // World position of a hand's palm centre (side: +1 character right, -1 left),
  // from the final hand bone: the hand colliders and the ball contact use this.
  getHandWorld(side, out) {
    this.root.updateMatrixWorld(true);
    const arm = this.arms.find((a) => a.side === -side);
    return arm.hand.localToWorld(out.copy(this.rig.handCenter));
  }

  // ---- adapter layers ---------------------------------------------------------------

  // The torso lean/twist the pose layers set on the lower spine is spread up
  // the spine (a curve instead of one hinge at the waist).
  _spreadSpine() {
    const t = this.torso.rotation, x = t.x, y = t.y, z = t.z;
    t.set(x * 0.5, y * 0.4, z * 0.5);
    this.spineUpper.rotation.set(x * 0.28, y * 0.3, z * 0.25);
    this.chest.rotation.set(x * 0.22, y * 0.3, z * 0.25);
  }

  // Floor contact: the lowest contact point (heel / ball of foot / toe of either
  // shoe, or the seat when sitting on the floor) goes exactly to the current
  // jump height. Poses only bend joints; this decides the body height, so
  // planted feet neither float nor sink.
  _ground() {
    this.root.updateMatrixWorld(true);
    const v = this._v;
    let low = Infinity, flat = Infinity;
    for (const leg of this.legs) {
      for (const p of SOLE_POINTS) low = Math.min(low, leg.ankle.localToWorld(v.set(p[0], p[1], p[2])).y);
      flat = Math.min(flat, leg.ankle.getWorldPosition(v).y + SOLE_POINTS[0][1]);
    }
    low = Math.min(low, this.hips.localToWorld(v.set(0, SEAT_Y, 0)).y);
    // In the air the jump height is measured flat-footed (pointed toes hang
    // below it), exactly like the gameplay jump arc.
    const air = smoothstep(0.005, 0.05, this._airY);
    let dy = this.root.position.y + this._airY - lerp(low, flat, air);
    if (low + dy < this.root.position.y) dy = this.root.position.y - low;   // never through the floor
    this.body.position.y += dy;
  }

  // ---- balance layer: steal reach + ankle-break reactions (defender) ----------------
  // b: { reach: { side (+1 right), extent 0..1, dir (world) } | null,
  //      reaction: { level 1..3, t, duration, dir (world, where the weight went) } | null,
  //      opponent: world position of the ball handler | null }
  // Everything is expressed through the skeleton: spine lean/twist, clavicles,
  // stepping legs, arms. Nothing tips the whole character as a rigid object.
  _poseBalance(dt, b) {
    const k = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    const reach = b && b.reach, rx = b && b.reaction;
    this._reachW += ((reach ? reach.extent : 0) - this._reachW) * k;
    this._armOv = null;
    if (rx) { this._rx.level = rx.level; this._rx.u = Math.min(1, rx.t / rx.duration); this._rx.dir = this._toLocal(rx.dir, this._rx.dirL || (this._rx.dirL = new THREE.Vector3())); }
    if (this._reachW < 0.003 && !rx) return;
    // room in front: never lean into the ball handler's body
    let room = 1, ox = 0, oz = 0;
    if (b && b.opponent) {
      const o = this._toLocal(this._w.set(b.opponent.x - this.root.position.x, 0, b.opponent.z - this.root.position.z), this._w);
      const gap = Math.hypot(o.x, o.z);
      if (gap > 1e-3) { ox = o.x / gap; oz = o.z / gap; room = clamp((gap - 0.82) / 0.5, 0, 1); }
    }
    const lean = { pitch: 0, roll: 0 };
    if (this._reachW > 0.003) this._poseReach(reach ? reach.side : this._reachSide || 1, this._reachW, lean, reach ? this._toLocal(reach.dir, this._reachDir || (this._reachDir = new THREE.Vector3())) : this._reachDir);
    if (rx) {
      if (rx.level === 1) this._poseStumble(this._rx.u, this._rx.dir, lean);
      else if (rx.level === 2) this._poseStagger(this._rx.u, this._rx.dir, lean);
      else this._poseFall(this._rx.u, this._rx.dir, lean);
    }
    // limit the part of the lean that goes toward the ball handler
    // (the top of the body moves along (-roll, pitch) in local x/z)
    const toward = lean.pitch * oz - lean.roll * ox;
    if (toward > 0 && room < 1) {
      const cut = toward * (1 - room);
      lean.pitch -= cut * oz; lean.roll += cut * ox;
    }
    this.torso.rotation.x += lean.pitch * 0.45; this.spineUpper.rotation.x += lean.pitch * 0.3; this.chest.rotation.x += lean.pitch * 0.25;
    this.torso.rotation.z += lean.roll * 0.45; this.spineUpper.rotation.z += lean.roll * 0.3; this.chest.rotation.z += lean.roll * 0.25;
  }

  _toLocal(w, out) {
    const f = this.root.rotation.y, c = Math.cos(f), s = Math.sin(f);
    return out.set(w.x * c - w.z * s, 0, w.x * s + w.z * c);
  }

  // Steal reach: shoulder, upper arm, forearm, hand (IK onto the ball, from the
  // defender), chest turning into it, clavicle reaching forward, weight down
  // onto the front foot.
  _poseReach(side, e, lean, dir) {
    this._reachSide = side;
    const armSide = -side;                                  // local x of the reaching arm
    const arm = this.arms.find((a) => a.side === armSide);
    this.spineUpper.rotation.y += side * 0.2 * e;
    this.chest.rotation.y += side * 0.2 * e;
    arm.clavicle.rotation.y += side * 0.32 * e;             // shoulder forward
    arm.clavicle.rotation.z += armSide * 0.1 * e;           // and a little up
    // lean toward the ball (forward and/or sideways), plus a little into the reaching side
    const dx = dir ? dir.x : 0, dz = dir ? dir.z : 1;
    lean.pitch += REACH.pitch * e * Math.max(0.3, dz);
    lean.roll += (-dx * REACH.pitch + side * REACH.roll) * e;
    const front = this.legs.find((l) => l.side === armSide), back = this.legs.find((l) => l.side !== armSide);
    // weight down and onto the front foot (the floor pass lowers the body as the knees bend)
    front.hip.rotation.x -= REACH.frontHip * e; front.knee.rotation.x += REACH.frontKnee * e; front.ankle.rotation.x -= 0.1 * e;
    back.hip.rotation.x += 0.05 * e; back.knee.rotation.x += REACH.backKnee * e;
    this.body.position.z += REACH.forward * e;
    this.body.position.x += -side * 0.04 * e;
  }

  // Shift the hips (local x/z) while the planted feet stay put: the legs angle
  // back under the pelvis.
  _shiftHips(dx, dz) {
    this.body.position.x += dx; this.body.position.z += dz;
    for (const l of this.legs) { l.hip.rotation.z -= dx / 0.85; l.hip.rotation.x += dz / 0.85; }
  }

  // Step a leg's foot toward local (dx, dz) (meters, roughly) and bend it.
  _stepLeg(leg, dx, dz, bend) {
    leg.hip.rotation.z += dx / 0.85;
    leg.hip.rotation.x -= dz / 0.85 + bend * 0.5;
    leg.knee.rotation.x += bend;
    leg.ankle.rotation.x -= bend * 0.5;
  }

  // LEVEL 1 stumble (~0.3 s): the weight gets away a little; one quick catch
  // step toward it, the far arm comes out, then back to stance.
  _poseStumble(u, d, lean) {
    const env = Math.sin(Math.PI * u);
    this._shiftHips(d.x * 0.08 * env, d.z * 0.08 * env);
    lean.pitch += d.z * 0.22 * env; lean.roll += -d.x * 0.22 * env;
    const lead = this._leadLeg(d);
    this._stepLeg(lead, d.x * 0.16 * env, d.z * 0.16 * env, 0.3 * env);
    for (const l of this.legs) l.knee.rotation.x += 0.12 * env;
    const far = this.arms.find((a) => a.side * d.x < 0) || this.arms[1];
    this._armOv = [{ arm: far, w: 0.75 * env, sx: -0.3, sz: far.side * 0.95, el: -0.5 }];
    this.head.rotation.z += d.x * 0.15 * env;
  }

  // LEVEL 2 major stagger (~0.66 s): the base is lost — hips carried the wrong
  // way, the trail foot crosses over, a wide catch step, arms out for balance,
  // then the stance comes back.
  _poseStagger(u, d, lean) {
    const env = smoothstep(0, 0.12, u) * (1 - smoothstep(0.7, 1, u));
    const carry = 0.17 * bellCurve(u, 0, 0.75);
    this._shiftHips(d.x * carry, d.z * carry);
    lean.pitch += d.z * (0.42 * bellCurve(u, 0, 0.5) - 0.14 * bellCurve(u, 0.4, 0.85));
    lean.roll += -d.x * (0.42 * bellCurve(u, 0, 0.5) - 0.14 * bellCurve(u, 0.4, 0.85));
    const lead = this._leadLeg(d), trail = lead === this.legs[0] ? this.legs[1] : this.legs[0];
    const cross = bellCurve(u, 0.04, 0.42), katch = bellCurve(u, 0.28, 0.78);
    // trail foot crosses in front toward the weight; then the lead foot catches wide
    this._stepLeg(trail, d.x * 0.3 * cross, d.z * 0.3 * cross + 0.12 * cross, 0.35 * cross);
    this._stepLeg(lead, d.x * 0.34 * katch, d.z * 0.34 * katch, 0.55 * katch);
    for (const l of this.legs) { l.knee.rotation.x += 0.3 * env; l.hip.rotation.x -= 0.15 * env; }
    this.hips.rotation.y += -d.x * 0.25 * env;
    // arms out, circling for balance
    const wob = Math.sin(u * 15) * 0.35;
    this._armOv = this.arms.map((a) => ({ arm: a, w: env, sx: -0.5 + wob * a.side, sz: a.side * (1.15 + 0.2 * Math.sin(u * 11 + a.side)), el: -0.45 }));
    this.head.rotation.z += d.x * 0.2 * env; this.head.rotation.x -= 0.15 * env;
  }

  // LEVEL 3 fall (~1.05 s): lose it, sit down hard toward where the weight was
  // going (the body turns its back to that side), a brief moment on the floor
  // with the hands down behind, then tuck the feet under, push up and stand
  // back into the stance. The floor pass keeps the seat/feet on the floor.
  _poseFall(u, d, lean) {
    const back = d.z <= 0.6;                    // sit back (the usual) or go forward onto the knees
    const yaw = back ? Math.atan2(-d.x, -d.z) : Math.atan2(d.x, d.z);
    const yw = smoothstep(0.04, 0.3, u) * (1 - smoothstep(0.84, 1, u));
    this.body.rotation.y += yaw * yw;
    const k = sampleKeys(back ? FALL_BACK_KEYS : FALL_FWD_KEYS, u);
    const w = smoothstep(0, 0.08, u) * (1 - smoothstep(0.93, 1, u));
    for (const l of this.legs) {
      const spread = l.side * k[4];
      l.hip.rotation.x = lerp(l.hip.rotation.x, k[1] + (l === this.legs[0] ? k[5] : -k[5]), w);
      l.hip.rotation.z = lerp(l.hip.rotation.z, spread, w);
      l.knee.rotation.x = lerp(l.knee.rotation.x, k[2], w);
      l.ankle.rotation.x = lerp(l.ankle.rotation.x, k[6], w);
    }
    // spine: pitch keyed in the turned frame (positive = over the feet)
    lean.pitch += k[3] * w;
    // hands: forward for balance, then down to the floor to catch the fall, then push
    const floorW = k[7] * w;
    if (floorW > 0.01) {
      this.root.updateMatrixWorld(true);
      const tgt = (a) => {
        const p = this.hips.localToWorld(this._v.set(a.side * 0.24, 0, back ? -0.3 : 0.38));
        p.y = this.root.position.y + 0.06;
        return p.clone();
      };
      this._armOv = this.arms.map((a) => ({ arm: a, w: floorW, target: tgt(a) }));
    } else if (k[8] > 0.01) {
      this._armOv = this.arms.map((a) => ({ arm: a, w: k[8] * w, sx: -1.0, sz: a.side * 0.5, el: -0.6 }));
    }
    this.head.rotation.x += -0.2 * w * (back ? 1 : -0.5);
  }

  // The leg on the side the weight went (or the right leg for straight forward/back).
  _leadLeg(d) {
    if (Math.abs(d.x) < 0.25) return this.legs[0];
    return this.legs.find((l) => l.side * d.x > 0);
  }

  // After the arm IK: reaction arms (balance, catching the fall) blend over it.
  _poseBalanceArms() {
    if (!this._armOv) return;
    for (const o of this._armOv) {
      if (o.w <= 0.001) continue;
      const a = o.arm;
      const q0 = this._qFree.copy(a.shoulder.quaternion), e0 = a.elbow.rotation.x;
      if (o.target) this.solveArmIK(a, o.target);
      else { a.shoulder.quaternion.setFromEuler(this._e.set(o.sx, 0, o.sz)); a.elbow.rotation.set(o.el, 0, 0); }
      a.shoulder.quaternion.copy(q0.slerp(a.shoulder.quaternion, Math.min(1, o.w)));
      a.elbow.rotation.x = lerp(e0, a.elbow.rotation.x, Math.min(1, o.w));
    }
  }

  // Shooting hand: the wrist snaps through after the release and holds the
  // follow-through until the landing; layups/dunks flick on the release too.
  _poseWrists(dt, pose) {
    let want = 0;
    const sh = pose.shot;
    if (sh && !sh.fake && sh.releasedAt !== null && sh.releasedAt !== undefined) {
      this._relClock = (this._relClock ?? 0) + dt;
      want = (1 - smoothstep(sh.land + 0.05, sh.end, sh.t)) * smoothstep(0, 0.08, this._relClock);
    } else this._relClock = 0;
    if (pose.finish && pose.finish.released) want = Math.max(want, 0.6 * (1 - smoothstep(pose.finish.land, pose.finish.end, pose.finish.t)));
    this._wrist += (want - this._wrist) * (dt > 0 ? 1 - Math.exp(-30 * dt) : 1);
    if (this._wrist < 0.002) return;
    const shooting = this.arms[0];        // character right
    shooting.hand.rotation.x = -0.95 * this._wrist;
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
    this._airY = lerp(this._airY, jumpY, w);
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

  // Layup / dunk / floater legs and body. One-foot takeoff for layups and
  // floaters (the finishing-hand knee drives up), two feet for dunks; the
  // height comes from the finish's own jump arc.
  _poseFinish(f) {
    const keys = FINISH_KEYS[f.kind].map((k) => [f[k[0]] + k[6], k[1], k[2], k[3], k[4], k[5]]);
    if (f.kind === 'layup' && f.protected) keys.forEach((k) => { k[1] *= 0.8; });
    const t = f.t;
    const w = smoothstep(f.takeoff - 0.2, f.takeoff - 0.08, t) * (1 - smoothstep(f.end - 0.12, f.end, t));
    if (w <= 0) return;
    const k = sampleKeys(keys, t);
    const drive = f.lead > 0 ? this.legs[0] : this.legs[1];
    const jump = drive === this.legs[0] ? this.legs[1] : this.legs[0];
    const air = smoothstep(f.takeoff, f.takeoff + 0.06, t) * (1 - smoothstep(f.land - 0.06, f.land, t));
    const set = (leg, hip, knee) => {
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, hip, w);
      leg.hip.rotation.z = lerp(leg.hip.rotation.z, leg.side * 0.04, w);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, knee, w);
      const flat = -(hip + knee) * 0.9;
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, lerp(flat, 0.5, air), w);   // toes down in the air
    };
    set(drive, k[1], k[2]);
    set(jump, k[3], k[4]);
    const reach = (h, kn) => 0.44 * Math.cos(h) + 0.41 * Math.cos(h + kn);
    const grounded = Math.max(reach(k[1], k[2]), reach(k[3], k[4])) + 0.0675 - 0.92;
    this.body.position.y = lerp(this.body.position.y, lerp(grounded, 0, air) + f.jumpY, w);
    this._airY = lerp(this._airY, f.jumpY, w);
    this.body.position.x = lerp(this.body.position.x, 0, w);
    this.torso.rotation.x = lerp(this.torso.rotation.x, k[5], w);
    this.torso.rotation.y = lerp(this.torso.rotation.y, 0.12 * f.lead * air, w);
    this.body.rotation.z = lerp(this.body.rotation.z, 0, w);
    this.head.rotation.x = lerp(this.head.rotation.x, -0.25, w * air);   // eyes on the rim
  }

  // Defensive legs. In stance: low, wide base; sliding sideways the lead foot
  // steps out and the trail foot pushes and closes (they never cross);
  // pressure steps and backpedals are short and choppy. When the defender
  // turns the hips to run, the normal run cycle takes over.
  // d: { lateral, forward (m/s, body frame, + = right / toward chest),
  //      run, jumpY, contest (0..1), planting }
  _poseDefense(dt, d) {
    const k = dt > 0 ? 1 - Math.exp(-10 * dt) : 1;
    this._defRun = (this._defRun ?? 0) + ((d.run ? 1 : 0) - (this._defRun ?? 0)) * k;
    const w = 1 - this._defRun;
    if (w <= 0.001) return;
    const lat = d.lateral, fw = d.forward;
    const spd = Math.hypot(lat, fw);
    const latAmt = spd > 0.05 ? Math.abs(lat) / spd : 0;
    const move = Math.min(1, spd / 2.6);
    this._defPhase = (this._defPhase || 0) + (Math.abs(lat) / 0.55 + Math.abs(fw) / 0.7) * Math.PI * dt;
    const ph = this._defPhase, sn = Math.sin(ph);
    const lead = lat >= 0 ? this.legs[0] : this.legs[1];   // legs[0] = character right
    const slide = latAmt * move, fb = (1 - latAmt) * move;
    const dir = fw >= 0 ? 1 : -1;
    const jf = Math.min(1, (d.jumpY || 0) / 0.08);
    const plant = d.planting ? 1 : 0;
    const reach = (h, kn, z) => (0.44 * Math.cos(h) + 0.41 * Math.cos(h + kn)) * Math.cos(z);
    let grounded = -1;
    for (const leg of this.legs) {
      let hip = -0.55 - 0.08 * plant, knee = 1.05 + 0.15 * plant, out = 0.13 + 0.05 * plant;
      if (leg === lead) {
        out += 0.2 * Math.max(0, sn) * slide;
        knee += 0.25 * Math.max(0, sn) * slide;
        hip -= 0.1 * Math.max(0, sn) * slide;
      } else {
        out -= 0.11 * Math.max(0, -sn) * slide;
        knee += 0.12 * Math.max(0, -sn) * slide;
      }
      const lp = ph + (leg === this.legs[0] ? 0 : Math.PI);
      hip += -dir * Math.sin(lp) * (dir > 0 ? 0.26 : 0.3) * fb;
      knee += Math.max(0, Math.cos(lp)) * 0.45 * fb;
      // contest jump: legs extend
      hip = lerp(hip, -0.08, jf); knee = lerp(knee, 0.18, jf); out = lerp(out, 0.05, jf);
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, hip, w);
      leg.hip.rotation.z = lerp(leg.hip.rotation.z, leg.side * out, w);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, knee, w);
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, lerp(-(hip + knee) * 0.9, 0.4, jf), w);
      grounded = Math.max(grounded, reach(hip, knee, out));
    }
    grounded += 0.0675 - 0.92;
    this.body.position.y = lerp(this.body.position.y, lerp(grounded, 0, jf) + (d.jumpY || 0), w);
    this._airY = lerp(this._airY, d.jumpY || 0, w);
    this.body.position.x = lerp(this.body.position.x, 0, w);
    const lean = lerp(fw < -0.5 ? 0.18 : 0.3, 0.06, d.contest || 0);
    this.torso.rotation.x = lerp(this.torso.rotation.x, lean, w);
    this.torso.rotation.y = lerp(this.torso.rotation.y, 0, w);
    this.head.rotation.x = lerp(this.head.rotation.x, -0.22 - 0.2 * (d.contest || 0), w);   // eyes up on the ball handler
  }

  // Side-step hop: the lead foot reaches out sideways, the body hops low and
  // lands on a wide base. u = 0..1 over the hop, side = +1 toward character right.
  _poseHop({ u, side }) {
    const w = smoothstep(0, 0.12, u) * (1 - smoothstep(0.85, 1, u));
    if (w <= 0) return;
    const lead = side > 0 ? this.legs[0] : this.legs[1];
    const reachOut = bellCurve(u, 0.05, 0.75);
    const land = smoothstep(0.6, 0.95, u);
    for (const leg of this.legs) {
      const isLead = leg === lead;
      const hip = isLead ? -0.35 - 0.1 * reachOut : -0.45 + 0.15 * reachOut;
      const knee = isLead ? 0.65 + 0.2 * reachOut : 0.95 - 0.5 * reachOut + 0.3 * land;
      const out = leg.side * (isLead ? 0.3 * reachOut + 0.08 * land : 0.06 + 0.06 * land);
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, hip, w);
      leg.hip.rotation.z = lerp(leg.hip.rotation.z, out, w);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, knee, w);
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, -(hip + knee) * 0.9, w);
    }
    const hop = ISO.OFFENSE.sideStep.hopHeight * Math.sin(Math.PI * Math.min(1, u * 1.1));
    this.body.position.y = lerp(this.body.position.y, -0.1 - 0.05 * land + hop, w);
    this._airY = lerp(this._airY, hop, w);
    this.body.rotation.z = lerp(this.body.rotation.z, side * 0.1 * reachOut, w);
    this.torso.rotation.x = lerp(this.torso.rotation.x, 0.2, w);
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
    this._airY = lerp(this._airY, k[6], w);
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
      // Shrug: when the target is out of reach above the shoulder, lift the
      // shoulder toward it a little (how real players reach for the rim).
      let shrugWant = 0;
      if (req && want > 0) {
        const d = arm.shoulder.parent.worldToLocal(this._ik.d.copy(arm.ikTarget)).sub(arm.base);
        const over = d.length() - (this.L1 + this.L2) * 0.97;
        if (over > 0 && d.y > 0) shrugWant = Math.min(MAX_SHRUG, over) * (d.y / d.length());
      }
      arm.shrug += (shrugWant * arm.ikWeight - arm.shrug) * k;
      arm.shoulder.position.set(arm.base.x, arm.base.y + arm.shrug, arm.base.z + 0.3 * arm.shrug);
      if (arm.ikWeight < 0.002) continue;

      const freeQ = this._qFree.copy(arm.shoulder.quaternion);
      const freeElbow = arm.elbow.rotation.x;
      this.solveArmIK(arm, arm.ikTarget);
      arm.shoulder.quaternion.copy(freeQ.slerp(arm.shoulder.quaternion, arm.ikWeight));
      arm.elbow.rotation.x = lerp(freeElbow, arm.elbow.rotation.x, arm.ikWeight);
    }
  }

  // Point the arm chain so the hand center lands on `target` (world space).
  // Exact two-bone solve in the shoulder's parent (clavicle) space: the elbow sits
  // in the plane of the target and a pole direction (back and out, like a real
  // elbow), then the shoulder's basis is built from that plane.
  solveArmIK(arm, target) {
    const L1 = this.L1, L2 = this.L2; // shoulder->elbow, elbow->palm centre
    const v = this._ik;
    this.root.updateMatrixWorld(true);

    const d = arm.shoulder.parent.worldToLocal(v.d.copy(target)).sub(arm.shoulder.position);
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

const MAX_SHRUG = 0.1;
// Steal reach through the body (tuned so the reach covers the same ground as
// the Step 15B reach did: same contact rates on the steal sweeps).
const REACH = { pitch: 0.4, roll: 0.1, frontHip: 0.4, frontKnee: 0.5, backKnee: 0.3, forward: 0.09 };
// Floor contact points: shoe sole (foot bone space: heel, ball, toe, both
// edges) and the seat (hips bone space).
const SOLE_POINTS = [[0, -0.0675, -0.085], [0.045, -0.0675, 0.1], [-0.045, -0.0675, 0.1], [0, -0.06, 0.2], [0.04, -0.0675, -0.05], [-0.04, -0.0675, -0.05]];
const SEAT_Y = -0.15;
const NO_BODY = { crouch: 0, twist: 0, roll: 0, sway: 0, jab: 0, stride: 1, forward: 0 };
// Finishes: [time key, driveHip, driveKnee, jumpHip, jumpKnee, torsoLean]
// (drive leg = finishing-hand side; it lifts on one-foot takeoffs). Time keys
// are names on the finish timeline plus an offset in seconds.
const FINISH_KEYS = {
  layup: [
    ['takeoff', -0.30, 0.55, -0.55, 1.05, 0.20, -0.08],  // plant the jump foot
    ['takeoff', -1.35, 1.70,  0.05, 0.12, 0.04,  0.10],  // knee drives up, jump leg extends
    ['release', -1.15, 1.50,  0.00, 0.25,-0.02,  0.00],  // extend to the rim
    ['land',    -0.35, 0.45, -0.20, 0.35, 0.02, -0.10],  // reach for the floor
    ['land',    -0.60, 1.10, -0.55, 1.05, 0.16,  0.08],  // absorb
    ['end',     -0.15, 0.30, -0.15, 0.30, 0.06,  0.00],
  ],
  dunk: [
    ['takeoff', -0.78, 1.50, -0.78, 1.50, 0.30, -0.08],  // two-foot gather, deep dip
    ['takeoff', -0.05, 0.08, -0.05, 0.08, 0.00,  0.08],  // explode
    ['release', -0.65, 1.30, -0.40, 1.00,-0.06, -0.10],  // knees tuck, reach over the rim
    ['release', -0.20, 0.50, -0.10, 0.30, 0.14,  0.06],  // throw it down
    ['land',    -0.30, 0.45, -0.30, 0.45, 0.05, -0.08],
    ['land',    -0.78, 1.45, -0.72, 1.40, 0.26,  0.10],  // deep landing absorb
    ['end',     -0.15, 0.30, -0.15, 0.30, 0.06,  0.00],
  ],
  floater: [
    ['takeoff', -0.40, 0.80, -0.50, 0.95, 0.16, -0.06],
    ['takeoff', -0.85, 1.20, -0.02, 0.10, 0.00,  0.08],  // short knee lift
    ['land',    -0.30, 0.40, -0.15, 0.30, 0.00, -0.08],
    ['land',    -0.50, 0.95, -0.50, 0.95, 0.12,  0.07],
    ['end',     -0.15, 0.30, -0.15, 0.30, 0.06,  0.00],
  ],
};
// Fall keys: [u, thigh, knee, spinePitch, legSpread, legScissor, foot, handsToFloor, armsForward]
// (in the frame the body turned to; the floor pass sets the height)
const FALL_BACK_KEYS = [
  [0.00, -0.55, 1.05,  0.25, 0.13, 0.0,  -0.45, 0.0, 0.0],   // stance
  [0.12, -0.30, 0.75,  0.45, 0.10, 0.18, -0.35, 0.0, 0.9],   // stumbling back, chest over the feet, arms forward
  [0.28, -1.20, 1.95,  0.30, 0.16, 0.08, -0.65, 0.6, 0.3],   // sinking fast, hands go back for the floor
  [0.42, -1.75, 0.45, -0.38, 0.2,  0.1,   0.25, 1.0, 0.0],   // seat hits the floor, legs out, leaning back on the hands
  [0.62, -1.70, 0.55, -0.30, 0.2,  0.06,  0.2,  1.0, 0.0],   // down
  [0.76, -1.90, 2.25,  0.55, 0.12, 0.0,  -0.4,  0.8, 0.0],   // feet tucked under, chest forward, push off the hands
  [0.90, -0.85, 1.55,  0.35, 0.13, 0.0,  -0.6,  0.0, 0.2],   // rising through a crouch
  [1.00, -0.55, 1.05,  0.25, 0.13, 0.0,  -0.45, 0.0, 0.0],   // defensive stance
];
const FALL_FWD_KEYS = [
  [0.00, -0.55, 1.05,  0.25, 0.13, 0.0,  -0.45, 0.0, 0.0],
  [0.14, -0.70, 1.05,  0.55, 0.12, 0.3,  -0.35, 0.0, 0.8],   // pitched forward, stepping to catch it
  [0.32, -0.25, 1.95,  0.75, 0.14, 0.05, -0.2,  0.8, 0.2],   // down onto the knees, hands reaching
  [0.48, -0.15, 2.05,  0.9,  0.14, 0.0,   0.5,  1.0, 0.0],   // knees and hands on the floor
  [0.64, -0.15, 2.05,  0.85, 0.14, 0.0,   0.5,  1.0, 0.0],
  [0.80, -1.20, 2.10,  0.6,  0.13, 0.25, -0.5,  0.5, 0.0],   // one foot up, push
  [0.92, -0.75, 1.45,  0.35, 0.13, 0.0,  -0.6,  0.0, 0.1],
  [1.00, -0.55, 1.05,  0.25, 0.13, 0.0,  -0.45, 0.0, 0.0],
];
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
