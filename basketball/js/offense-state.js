// OffenseState: a light "how much has the ball handler been doing" tracker.
//
// Each dribble move adds a little fatigue; moves chained close together cost
// progressively more. Fatigue below `effectFrom` does nothing, so normal 2-3
// move combos stay fully effective; long spam chains (E Z R V E Z ...) slow
// the moves slightly, shrink the exit burst and cost some shot balance.
// It recovers quickly, fastest when standing.
//
// Also owns the exit burst: a short window of sharper acceleration after a
// move ends cleanly (acceleration only; top speed never changes).
//
// State for other systems (e.g. a future defender): offensiveFatigue,
// moveChainCount, timeSinceLastMove, lastMove, burst.
ISO.OffenseState = class {
  constructor() {
    this.cfg = ISO.OFFENSE;
    this.offensiveFatigue = 0;     // 0..1
    this.moveChainCount = 0;       // moves in the current chain
    this.timeSinceLastMove = Infinity;
    this.lastMove = null;
    this.moveLog = [];             // recent [name, time] for debugging/AI
    this.burst = 0;                // 0..1 sharp-acceleration window
    this._burstT = 0;
    this._burstStrength = 0;
    this._time = 0;
  }

  // 0..1 how much fatigue actually matters right now.
  get effect() {
    const f = this.cfg.fatigue;
    const t = Math.max(0, Math.min(1, (this.offensiveFatigue - f.effectFrom) / (1 - f.effectFrom)));
    return t * t * (3 - 2 * t);
  }

  // Multiply move durations by this (>= 1).
  get executionScale() { return 1 + this.cfg.fatigue.slowMoves * this.effect; }

  // Multiply burst strength by this (<= 1).
  get burstScale() { return 1 - this.cfg.fatigue.burstLoss * this.effect; }

  // 0..1 balance penalty for shots.
  get balancePenalty() { return this.cfg.fatigue.balanceLoss * this.effect; }

  // A move starts.
  registerMove(name) {
    const f = this.cfg.fatigue;
    this.moveChainCount = this.timeSinceLastMove < f.chainWindow ? this.moveChainCount + 1 : 1;
    const cost = (this.cfg.moves[name] ? this.cfg.moves[name].cost : 0.05) * (1 + f.chainGrowth * (this.moveChainCount - 1));
    this.offensiveFatigue = Math.min(1, this.offensiveFatigue + cost);
    this.lastMove = name;
    this.timeSinceLastMove = 0;
    this.moveLog.push([name, +this._time.toFixed(2)]);
    if (this.moveLog.length > 12) this.moveLog.shift();
  }

  // A move finished cleanly: open a burst window (weaker when tired).
  moveExit(strength = 1) {
    this._burstT = this.cfg.momentum.exitBurstTime;
    this._burstStrength = strength * this.burstScale;
  }

  update(dt, speed, runSpeed, sprinting) {
    const f = this.cfg.fatigue;
    this._time += dt;
    this.timeSinceLastMove += dt;
    if (this.timeSinceLastMove > f.chainWindow) this.moveChainCount = 0;
    if (this.timeSinceLastMove > f.recoverDelay) {
      const rate = sprinting ? f.recoverSprint : speed > runSpeed * 0.6 ? f.recoverMoving : f.recoverStill;
      this.offensiveFatigue = Math.max(0, this.offensiveFatigue - rate * dt);
    }
    this._burstT = Math.max(0, this._burstT - dt);
    this.burst = this._burstStrength * (this._burstT / this.cfg.momentum.exitBurstTime);
  }

  // accelScale bonus to apply to Locomotion this frame.
  get accelBonus() {
    return this.cfg.momentum.exitBurstAccel * this.burst;
  }
};
