// GameEvents: results of the simulation, as plain events (no game logic).
// Systems emit what happened; UI, scoring and (later) networking listen.
//   shotReleased  { shooter, shotType, position, velocity, contest }
//   blockOccurred { blockType, blockHand, blockContactPoint, blockContactTime,
//                   velocityBefore, blockDeflectionVelocity, contest }
//   basketMade    { points, swish, shotType }
// Payloads are plain data, so they can be serialized as-is.
ISO.GameEvents = class {
  constructor() {
    this._handlers = {};
    this.log = [];           // recent events (debug/tests)
    this.time = 0;
  }
  on(type, fn) { (this._handlers[type] || (this._handlers[type] = [])).push(fn); }
  emit(type, data = {}) {
    const ev = Object.assign({ type, t: +this.time.toFixed(3) }, data);
    this.log.push(ev);
    if (this.log.length > 40) this.log.shift();
    for (const fn of this._handlers[type] || []) fn(ev);
    return ev;
  }
  tick(dt) { this.time += dt; }
};
