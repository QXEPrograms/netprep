// ShotClock (Step 17): the possession's authoritative shot clock.
//
// It belongs to the possession (PossessionSystem owns one), never to a player
// or to the UI. It counts simulation time only, and only while play is LIVE:
// the check / result / fade / reset states never burn time.
//
//   duration      seconds every new possession starts with (GAMEFLOW.shotClock)
//   remaining     seconds left (counts down to 0)
//   running       ticking right now
//   expired       reached 0 this possession (a violation, unless a shot left first)
//   possessionId  which possession this clock belongs to
//
// Timing rule (deterministic, frame-rate independent): the clock is ticked at
// the START of each simulation step, so after the tick `remaining` is the
// clock at the END of the step — the moment anything released during that
// step leaves the hand. A shot released in a step that ends with remaining > 0
// left BEFORE zero and is valid; remaining <= 0 means zero came first: a
// violation, and that late release counts for nothing.
(function () {
const EPS = 1e-9;

ISO.ShotClock = class {
  constructor(duration) {
    this.duration = duration;
    this.remaining = duration;
    this.running = false;
    this.expired = false;
    this.possessionId = 0;
    this.stoppedAt = null;      // remaining when it last stopped (shot release / end)
  }

  // A brand-new possession: a full clock, not running yet (input is still off).
  resetFor(possessionId, duration = this.duration) {
    this.duration = duration;
    this.remaining = duration;
    this.running = false;
    this.expired = false;
    this.possessionId = possessionId;
    this.stoppedAt = null;
  }

  // The same possession continues (e.g. the offense keeps a deflected ball):
  // keep the time that was left.
  carryTo(possessionId) {
    this.running = false;
    this.possessionId = possessionId;
    this.stoppedAt = null;
  }

  start() { if (!this.expired && this.remaining > EPS) this.running = true; }

  stop() {
    if (this.running) this.stoppedAt = this.remaining;
    this.running = false;
  }

  // Advance by dt. Returns true on the step the clock reaches zero.
  tick(dt) {
    if (!this.running || dt <= 0) return false;
    this.remaining -= dt;
    if (this.remaining <= EPS) {
      this.remaining = 0;
      this.running = false;
      this.expired = true;
      return true;
    }
    return false;
  }

  // Display text: whole seconds (rounded up, like a real clock) until the last
  // `tenthsBelow` seconds, then tenths.
  get display() {
    const r = Math.max(0, this.remaining), T = ISO.GAMEFLOW.shotClock.tenthsBelow;
    if (r < T) return (Math.floor(r * 10 + 1e-6) / 10).toFixed(1);
    return String(Math.ceil(r - 1e-6));
  }

  snapshot() {
    return { duration: this.duration, remaining: +this.remaining.toFixed(4), running: this.running, expired: this.expired, possessionId: this.possessionId };
  }
};
})();
