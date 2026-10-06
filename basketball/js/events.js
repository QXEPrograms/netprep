// GameEvents: results of the simulation, as plain events (no game logic).
// Systems emit what happened; UI, possession and (later) networking listen.
// Every payload names players and teams by id.
//   shotReleased        { shotId, shooterPlayerId, shootingTeamId, shotType, isThree, value, position, velocity, contest }
//   blockOccurred       { blockType, blockHand, blockerPlayerId, blockerTeamId, blockContactPoint, blockContactTime,
//                         velocityBefore, blockDeflectionVelocity, contest }   (a block never decides the shot)
//   basketMade          { shotId, points, swish, shotType, blocked, shooterPlayerId, teamId }
//   shotResolved        { shotId, result: MAKE | MISS | BLOCKED_MAKE | BLOCKED_MISS, made, points, how,
//                         shooterPlayerId, shootingTeamId, wasBlocked, blockerPlayerId, blockerTeamId, blockHand, blockType }
//                         (exactly once per shotId)
//   possessionWillChange { previousTeamId, newTeamId, reason, possessionNumber }   (the fade starts)
//   possessionChanged    { previousTeamId, newTeamId, reason, possessionNumber }   (players reset, roles swapped)
//   possessionStarted    { possessionNumber, offenseTeamId, defenseTeamId, ballHandlerPlayerId, reason, previousTeamId }
//   possessionLive       { possessionNumber, offenseTeamId }                        (input live again)
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
