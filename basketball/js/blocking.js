// Physical blocking: the defender's real hands against the real ball.
//
// HandCollider: a small sphere that follows one animated hand (center a few cm
// past the palm along the forearm, radius ~ hand + spread fingers). It keeps
// last frame's and this frame's positions so the 240 Hz ball step can place
// the hand where it actually was at that moment of the frame (no tunneling
// through a fast-moving hand, no teleporting hand).
//
// BlockSystem: registered on the ball as a dynamic collider. It only acts on a
// released SHOT in its first moments of flight (never on a dribble, gather or
// pass — strips/steals are a separate, later system), and only on hands that
// are doing a legitimate defensive action (jumping or raised). A block is
// purely geometric: if the ball's sphere meets a hand's sphere, the contact is
// resolved with an impulse using the relative velocity (the hand's own motion
// counts), restitution, friction and spin. No chance rolls.
//
// Attribution: the ball carries blockedBy { playerId, teamId, hand, type };
// the block never decides the shot or the possession (the ball can still go in).
//
// Events/state: blockOccurred (frame flag), blockType ('fingertip' |
// 'deflection' | 'rejection' | 'pop-up'), blockHand ('left' | 'right'),
// blockContactPoint, blockContactTime (s after release), blockVelocityBefore,
// blockDeflectionVelocity, blocksCount; handBallDistance (closest hand
// surface to ball surface this frame), active (block collision live).
(function () {
const MODES = () => ISO.Basketball.MODES;

ISO.HandCollider = class {
  constructor(model, side) {
    this.model = model;
    this.side = side;                 // +1 = character right, -1 = left
    this.radius = ISO.DEFENSE.hands.radius;
    this.prev = new THREE.Vector3();
    this.cur = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.active = false;
    this._has = false;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this.at = new THREE.Vector3();    // position used by the latest ball step
  }

  // After the model has been posed this frame.
  sync(dt, active) {
    const arm = this.model.arms.find((a) => a.side === -this.side);
    this.model.root.updateMatrixWorld(true);
    const hand = arm.elbow.localToWorld(this._a.set(0, -0.32, 0));
    const elbow = arm.elbow.getWorldPosition(this._b);
    const dir = hand.clone().sub(elbow).normalize();
    const p = hand.addScaledVector(dir, ISO.DEFENSE.hands.fingerOffset);
    if (!this._has) { this.prev.copy(p); this._has = true; } else this.prev.copy(this.cur);
    this.cur.copy(p);
    this.velocity.copy(this.cur).sub(this.prev).divideScalar(dt > 0 ? dt : 1);
    this.active = active;
  }

  positionAt(alpha, out) { return out.lerpVectors(this.prev, this.cur, alpha); }

  // Off, with no memory of where it was: the next sync starts fresh (a hand
  // never sweeps from last possession's spot to this one's).
  clear() {
    this.active = false;
    this._has = false;
    this.velocity.set(0, 0, 0);
  }
};

ISO.BlockSystem = class {
  constructor({ ball, world, events, defender }) {
    this.ball = ball;
    this.world = world;
    this.events = events;
    this.defender = defender;
    this.cfg = ISO.DEFENSE.hands;
    this.hands = [new ISO.HandCollider(defender.model, 1), new ISO.HandCollider(defender.model, -1)];
    this.blockOccurred = false;
    this.blockType = null;
    this.blockHand = null;
    this.blockContactPoint = new THREE.Vector3();
    this.blockContactTime = 0;
    this.blockVelocityBefore = new THREE.Vector3();
    this.blockDeflectionVelocity = new THREE.Vector3();
    this.blocksCount = 0;
    this.lastBlock = null;            // plain-data copy of the last block
    this.active = false;
    this.handBallDistance = Infinity;
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._vr = new THREE.Vector3();
    this._vb = new THREE.Vector3();
    this._t = new THREE.Vector3();
    ball.dynamicColliders.push(this);
  }

  // Can the ball be blocked right now? A released shot early in its flight,
  // before it has touched the rim or backboard, and not yet in the protected
  // rim phase (see protectedPhase). The hand still has to physically meet it.
  blockable() {
    const b = this.ball, w = this.world;
    return b.mode === MODES().FREE && b.flightKind === 'shot' && b.freeTime < this.cfg.maxShotAge &&
      !(w && (w.shotTouchedRim || w.shotTouchedBackboard)) && !ISO.BlockSystem.protectedPhase(b);
  }

  // The shot belongs to the rim (no late swats): coming DOWN inside the rim
  // area, or already over the cylinder above the rim. Rising balls near the
  // shooter (and chase-downs before this phase) stay blockable. A dunk is
  // thrown down at the rim from the start, so it is only protected once it is
  // securely at / through the rim.
  static protectedPhase(b) {
    const K = ISO.DEFENSE.block, H = ISO.CONFIG.hoop, p = b.position;
    const dx = p.x, dz = p.z - H.centerZ, horiz = Math.hypot(dx, dz), dy = p.y - H.rimHeight;
    if (b.shotKind === 'dunk') return horiz < K.dunkLockRadius && dy < K.dunkSecureAbove;
    const dist = Math.hypot(horiz, dy);
    if (b.velocity.y < 0 && dist < K.protectRadius && dy > -K.protectAboveRim) return true;
    return horiz < K.cylinderRadius && dy >= 0 && dy < K.cylinderHeight;
  }

  // Role change / possession reset: no live hands, no block state.
  clear() {
    for (const h of this.hands) h.clear();
    this.active = false;
    this.blockOccurred = false;
    this.handBallDistance = Infinity;
  }

  // Who blocked (ids from the defender's player entity).
  _blocker(hand, type) {
    const e = this.defender.entity;
    return { playerId: e ? e.id : null, teamId: e ? e.teamId : null, hand, type };
  }

  // Once per frame, after the defender's pose: move the colliders to the hands.
  // handsActive: [right, left] legitimate defensive action per hand.
  sync(dt, handsActive) {
    this.blockOccurred = false;
    this.hands[0].sync(dt, handsActive[0]);
    this.hands[1].sync(dt, handsActive[1]);
    this.active = this.blockable() && (handsActive[0] || handsActive[1]);
    const b = this.ball.position, r = this.ball.radius;
    this.handBallDistance = Math.min(...this.hands.map((h) => h.cur.distanceTo(b) - h.radius - r));
  }

  // The release portion: the ball is still in the shooter's hands but is
  // leaving them (jump-shot arm extension / the last moment of a finish). A
  // hand that physically touches it here knocks it loose; the ball physics
  // then resolves the contact like any other. Never during the gather or
  // dribble (that would be a strip — not part of this system).
  checkHeld(shooter) {
    const b = this.ball;
    if (b.mode === MODES().FREE) return false;
    const sh = shooter.shooting, fi = shooter.finishing;
    const sys = sh.inReleaseWindow ? sh : fi.inReleaseWindow ? fi : null;
    if (!sys) return false;
    // a ball already being put down through the rim can't be knocked loose
    const H = ISO.CONFIG.hoop, K = ISO.DEFENSE.block;
    if (Math.hypot(b.position.x, b.position.z - H.centerZ) < K.dunkLockRadius && b.position.y > H.rimHeight - 0.1) return false;
    for (const h of this.hands) {
      if (!h.active) continue;
      if (h.cur.distanceTo(b.position) < b.radius + h.radius) {
        this.knockedLooseCount = (this.knockedLooseCount || 0) + 1;
        if (!sys.knockLoose(shooter.locomotion)) return false;
        // It is a block at the release: attribute it like one.
        b.blockedAt = 0;
        b.blockedBy = this._blocker(h.side > 0 ? 'right' : 'left', 'knock-loose');
        this.blocksCount++;
        this.lastBlock = { blockType: 'knock-loose', blockHand: b.blockedBy.hand, blockerPlayerId: b.blockedBy.playerId, blockerTeamId: b.blockedBy.teamId, blockContactTime: 0 };
        if (this.events) this.events.emit('blockOccurred', this.lastBlock);
        return true;
      }
    }
    return false;
  }

  // Called by the ball's fixed step (alpha = how far through the frame).
  collide(ball, alpha) {
    if (!this.blockable()) return;
    for (const h of this.hands) {
      if (!h.active) continue;
      const p = h.positionAt(alpha, this._p);
      h.at.copy(p);
      const n = this._n.copy(ball.position).sub(p);
      const d = n.length(), R = ball.radius + h.radius;
      if (d >= R) continue;
      if (d > 1e-6) n.divideScalar(d); else n.copy(ball.velocity).negate().normalize();
      this._resolve(ball, h, p, n, R - d);
    }
  }

  _resolve(ball, h, p, n, pen) {
    const c = this.cfg, v = ball.velocity, w = ball.angularVelocity, r = ball.radius;
    const before = this._vb.copy(v);
    ball.position.addScaledVector(n, pen);                    // out of the hand
    const vr = this._vr.copy(v).sub(h.velocity);              // ball relative to the hand
    const vn = vr.dot(n);
    if (vn >= 0) return;                                      // already separating
    const jn = -(1 + c.restitution) * vn;
    v.addScaledVector(n, jn);
    // friction at the contact (with spin), like the rim/backboard contacts
    const rc = this._t.copy(n).multiplyScalar(-r);
    const vc = new THREE.Vector3().crossVectors(w, rc).add(vr).addScaledVector(n, jn);
    vc.addScaledVector(n, -vc.dot(n));
    const vct = vc.length();
    if (vct > 1e-6) {
      const jt = Math.min(c.friction * jn, vct / 2.5);
      const j = vc.multiplyScalar(-jt / vct);
      v.add(j);
      w.addScaledVector(new THREE.Vector3().crossVectors(rc, j), 1.5 / (r * r));
    }
    ball.contacts++;
    if (ball.blockedAt !== null) return;                      // already blocked this flight: just physics
    // ---- first contact this flight = the block ----
    ball.blockedAt = ball.freeTime;
    const bh = Math.hypot(before.x, before.z), ah = Math.hypot(v.x, v.z);
    const turn = Math.acos(Math.max(-1, Math.min(1, before.dot(v) / Math.max(1e-6, before.length() * v.length()))));
    let type;
    if (turn < c.tipAngle) type = 'fingertip';
    else if (n.y > c.popUpNormal) type = 'pop-up';
    else if (bh > 0.5 && (before.x * v.x + before.z * v.z) / (bh * Math.max(ah, 1e-6)) < 0) type = 'rejection';
    else type = 'deflection';
    this.blockOccurred = true;
    this.blockType = type;
    this.blockHand = h.side > 0 ? 'right' : 'left';
    this.blockContactPoint.copy(ball.position).addScaledVector(n, -r);
    this.blockContactTime = ball.freeTime;
    this.blockVelocityBefore.copy(before);
    this.blockDeflectionVelocity.copy(v);
    this.blocksCount++;
    ball.blockedBy = this._blocker(this.blockHand, type);
    const f = (x) => +x.toFixed(3);
    this.lastBlock = {
      blockType: type, blockHand: this.blockHand,
      blockerPlayerId: ball.blockedBy.playerId, blockerTeamId: ball.blockedBy.teamId,
      blockContactPoint: [f(this.blockContactPoint.x), f(this.blockContactPoint.y), f(this.blockContactPoint.z)],
      blockContactTime: f(ball.freeTime),
      velocityBefore: [f(before.x), f(before.y), f(before.z)],
      blockDeflectionVelocity: [f(v.x), f(v.y), f(v.z)],
      handCenter: [f(p.x), f(p.y), f(p.z)],
      handBallGap: f(ball.position.distanceTo(p) - h.radius - r),
      contest: this.defender.contest.contestStrength,
    };
    if (this.events) this.events.emit('blockOccurred', this.lastBlock);
  }
};
})();
