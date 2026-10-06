// ScoringSystem: decides what each shot is worth, watches how it resolves, and
// keeps the player's score.
//
// 2 vs 3 uses the real court geometry from CONFIG (the same numbers the court
// markings are drawn from): in the corners the line is straight at
// |x| = threeCornerX up to where it meets the arc; elsewhere it's the arc of
// threeRadius around the rim. A release ON the line counts as a three.
// The spot used is the shooter's floor position at release.
//
// Resolution: a shot is MADE the moment the hoop detects the basket. It is
// MISSED when the ball reaches the floor without one (or is handed back, or
// times out). Each released shot resolves exactly once.
ISO.ScoringSystem = class {
  // shooters: every system that can release a scoring shot (ShootingSystem,
  // FinishSystem). Each exposes shotReleased (frame flag), releaseFeet,
  // releaseTiming and shotType.
  constructor({ shooting, shooters, hoop, ball }) {
    this.shooting = shooting;
    this.shooters = shooters || [shooting];
    this.shotId = 0;
    this.hoop = hoop;
    this.ball = ball;
    this.points = ISO.CONFIG.scoring;

    this.score = 0;
    this.attempts = 0;
    this.makes = 0;
    this.threeAttempts = 0;
    this.threeMakes = 0;

    this.pending = null;       // the shot in the air, waiting to resolve
    this.lastResult = null;    // { id, made, swish, points, isThree, timing }
    this.resolvedThisFrame = null;
  }

  // Is a floor spot (x, z) at or beyond the three-point line?
  static isThreePoint(x, z) {
    const C = ISO.CONFIG.court, H = ISO.CONFIG.hoop;
    const cornerZ = H.centerZ + Math.sqrt(C.threeRadius ** 2 - C.threeCornerX ** 2);
    if (z <= cornerZ) return Math.abs(x) >= C.threeCornerX;   // straight corner section
    return Math.hypot(x, z - H.centerZ) >= C.threeRadius;     // arc
  }

  pointsFor(x, z) {
    return ISO.ScoringSystem.isThreePoint(x, z) ? this.points.outside : this.points.inside;
  }

  // Call once per frame after the ball has updated.
  update(dt) {
    this.resolvedThisFrame = null;
    const sh = this.shooters.find((s) => s && s.shotReleased);

    if (sh) {
      // A new shot leaves the hand (an unresolved previous one counts as missed).
      if (this.pending) this._resolve(false, false);
      const f = sh.releaseFeet;
      const isThree = ISO.ScoringSystem.isThreePoint(f.x, f.z);
      this.pending = {
        id: ++this.shotId,
        shotType: sh.shotType || 'jumpshot',
        isThree,
        value: isThree ? this.points.outside : this.points.inside,
        timing: sh.releaseTiming,
        t: 0,
      };
      this.attempts++;
      if (isThree) this.threeAttempts++;
    }

    const p = this.pending;
    if (!p) return;
    p.t += dt;
    const ball = this.ball;
    const onFloor = ball.position.y <= ball.radius + 0.002;
    if (this.hoop.basketMadeThisFrame) {
      this._resolve(true, this.hoop.shotWasSwish);
    } else if (onFloor || ball.mode !== ISO.Basketball.MODES.FREE || p.t > 8) {
      this._resolve(false, false);
    }
  }

  _resolve(made, swish) {
    const p = this.pending;
    this.pending = null;
    const points = made ? p.value : 0;
    if (made) {
      this.score += points;
      this.makes++;
      if (p.isThree) this.threeMakes++;
    }
    this.lastResult = { id: p.id, made, swish, points, value: p.value, isThree: p.isThree, timing: p.timing, shotType: p.shotType };
    this.resolvedThisFrame = this.lastResult;
  }
};
