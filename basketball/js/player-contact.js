// PlayerContact: soft body contact between two players (no fouls yet).
// Each body is a circle on the floor. When they overlap, both are pushed
// apart (the defender gives up a share, so it isn't a wall), and the attacker
// loses part of the speed it was carrying into the defender, some of which
// pushes the defender back. Corrections are partial per frame so contact
// feels soft, while still keeping the models from sinking into each other.
//
// State: touching (this frame), overlap (m), contactSpeed (closing m/s at the
// last contact), contacts (count of frames in contact).
ISO.PlayerContact = class {
  constructor() {
    this.cfg = ISO.DEFENSE.contact;
    this.touching = false;
    this.overlap = 0;
    this.contactSpeed = 0;
    this.contacts = 0;
    this.maxOverlap = 0;          // worst overlap seen (tests/debug)
  }

  // a = attacker locomotion, d = defender locomotion (both: position, velocity).
  // ball (optional): the attacker's dribbled ball, which counts as part of the
  // attacker's footprint so it can't be dribbled through the defender.
  // aAir / dAir: attacker / defender airborne. In the air corrections are
  // capped smaller (no sideways pops), but they still apply every frame, so a
  // jumper can't float through the other player's torso.
  resolve(a, d, dt, ball = null, aAir = false, dAir = false) {
    const c = this.cfg;
    this._maxFix = (aAir || dAir ? c.maxFixAir : c.maxFix) * Math.max(1, dt * 60);
    const body = this._pair(a, d, a.position.x, a.position.z, 2 * c.radius, dt);
    const withBall = ball ? this._pair(a, d, ball.x, ball.z, c.radius + c.ballRadius, dt) : false;
    this.touching = body || withBall;
    if (!this.touching) this.overlap = 0;
    return this.touching;
  }

  // One circle of the attacker (center ax, az) against the defender's body.
  _pair(a, d, ax, az, minD, dt) {
    const c = this.cfg;
    const dx = d.position.x - ax, dz = d.position.z - az;
    const dist = Math.hypot(dx, dz);
    const overlap = minD - dist;
    if (overlap <= 0) return false;
    this.overlap = Math.max(this.overlap || 0, overlap);
    this.contacts++;
    this.maxOverlap = Math.max(this.maxOverlap, overlap);
    const nx = dist > 1e-5 ? dx / dist : Math.sin(a.facing || 0), nz = dist > 1e-5 ? dz / dist : Math.cos(a.facing || 0);

    // Soft position correction, split between the two bodies: when the
    // attacker drives into the defender the defender gives a little ground;
    // when the defender is the one walking into the attacker, the defender
    // stops (it can't shove the ball handler around).
    const aIn = a.velocity.x * nx + a.velocity.z * nz;          // attacker moving into the defender
    const dIn = -(d.velocity.x * nx + d.velocity.z * nz);       // defender moving into the attacker
    const share = dIn > aIn ? c.defenderPushShare : c.defenderShare;
    const fix = Math.min(this._maxFix || Infinity, overlap * Math.min(1, c.softness * (dt * 60)));
    a.position.x -= nx * fix * (1 - share);
    a.position.z -= nz * fix * (1 - share);
    d.position.x += nx * fix * share;
    d.position.z += nz * fix * share;
    if (dIn > 0) { d.velocity.x += nx * dIn * 0.8; d.velocity.z += nz * dIn * 0.8; }

    // Closing speed along the contact normal: attacker loses momentum, the
    // defender absorbs some of it (gets pushed back a little).
    const closing = (a.velocity.x - d.velocity.x) * nx + (a.velocity.z - d.velocity.z) * nz;
    this.contactSpeed = Math.max(0, closing);
    if (closing > 0) {
      const lose = closing * c.momentumLoss;
      a.velocity.x -= nx * lose;
      a.velocity.z -= nz * lose;
      if (a.onContact) a.onContact(nx, nz, lose);
      d.velocity.x += nx * lose * c.pushTransfer;
      d.velocity.z += nz * lose * c.pushTransfer;
    }
    return true;
  }
};
