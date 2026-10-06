// Gather: reads the ball handler's situation when Space is pressed and decides
// what that press means. All the decision logic for Space lives here (and all
// its thresholds in OFFENSE.finishing), so finishing behavior is tuned in one
// place and is fully deterministic from the player's state.
//
//   const ctx = ISO.Gather.readContext(player);
//   const plan = ISO.Gather.determineScoringAction(ctx);
//   plan.action: 'jumpshot' | 'sidestep' | 'floater' | 'layup' | 'dunk'
//   (a 'jumpshot' press can still become a pump fake if Space is only tapped)
ISO.Gather = (function () {
  const H = ISO.CONFIG.hoop;
  const RIM = new THREE.Vector3(0, H.rimHeight, H.centerZ);

  // Everything the decision (and the finish animations) need to know.
  function readContext(player) {
    const loco = player.locomotion;
    const p = loco.position, v = loco.velocity;
    const dx = RIM.x - p.x, dz = RIM.z - p.z;
    const dist = Math.hypot(dx, dz);
    const toRim = dist > 1e-4 ? { x: dx / dist, z: dz / dist } : { x: 0, z: -1 };
    const speed = Math.hypot(v.x, v.z);
    const approachSpeed = v.x * toRim.x + v.z * toRim.z;           // + = moving toward the rim
    // Shooter's right when facing the rim is (-toRim.z, toRim.x).
    const lateralSpeed = -v.x * toRim.z + v.z * toRim.x;           // + = moving to the shooter's right
    const approachAngle = speed > 0.3 ? Math.acos(Math.max(-1, Math.min(1, approachSpeed / speed))) : Math.PI;
    // Which side of the basket the player attacks from, seen by a player
    // facing the backboard (looking down -z, so their right is +x): + = right.
    const sideOffset = p.x - RIM.x;
    const off = player.offense;
    const dr = player.dribble;
    return {
      position: p.clone(),
      velocity: v.clone(),
      facing: loco.facing,
      dist, toRim, speed, approachSpeed, lateralSpeed, approachAngle,
      sideOffset,
      courtSide: Math.sign(p.x - RIM.x) || 1,                   // world x side of the rim
      dribbleHand: dr.hand,
      sprinting: loco.sprinting,
      // Directly behind the backboard (not merely deep on the baseline: a
      // baseline drive from the side can still finish around the board).
      behindBoard: p.z < H.boardZ + ISO.OFFENSE.finishing.behindBoardMargin &&
        Math.abs(p.x - RIM.x) < ISO.OFFENSE.finishing.behindBoardHalfWidth,
      baseline: p.z < H.centerZ + 0.6 && Math.abs(p.x) > 1.2,
      fatigue: off ? off.offensiveFatigue : 0,
      fatigueEffect: off ? off.effect : 0,
      recentMove: off ? off.lastMove : null,
      timeSinceMove: off ? off.timeSinceLastMove : Infinity,
      currentMove: dr.currentMove,
      stepBackJustEnded: player.stepBack.timeSinceStepBack < 0.25,
    };
  }

  // Balance 0..1 (1 = set and square) used to scale jump-shot accuracy.
  function balanceFor(ctx, action) {
    const runFrac = Math.min(1, ctx.speed / 5);
    let b = 1 - 0.12 * runFrac - (ctx.sprinting ? 0.08 : 0);
    if (action === 'sidestep') b -= ISO.OFFENSE.sideStep.balance;
    b -= ISO.OFFENSE.fatigue.balanceLoss * ctx.fatigueEffect;
    return Math.max(0.4, Math.min(1, b));
  }

  // Choose the finishing hand: the side of the rim you attack from, else the
  // dribble hand when you come straight down the middle.
  function finishHand(ctx) {
    if (ctx.sideOffset > 0.35) return 'right';
    if (ctx.sideOffset < -0.35) return 'left';
    return ctx.dribbleHand;
  }

  // The one place that decides what Space does.
  function determineScoringAction(ctx) {
    const F = ISO.OFFENSE.finishing;
    const plan = { action: 'jumpshot', hand: finishHand(ctx), ctx, reason: '' };
    const towardRim = ctx.approachSpeed;

    if (ctx.behindBoard) {
      plan.reason = 'behind the backboard: no finishes';
    } else if (ctx.dist >= F.dunkMinDist && ctx.dist <= F.dunkMaxDist &&
               towardRim >= F.dunkMinApproach && ctx.approachAngle <= F.dunkMaxAngle) {
      plan.action = 'dunk';
      plan.reason = 'attacking the rim at speed';
    } else if (ctx.dist <= F.layupMaxDist && towardRim >= F.layupMinApproach && ctx.approachAngle <= F.layupMaxAngle) {
      plan.action = 'layup';
      plan.reason = 'driving into layup range';
    } else if (ctx.dist <= F.closeDist) {
      plan.action = 'layup';
      plan.protected = true;
      plan.reason = 'close and slow: protected layup';
    } else if (ctx.dist >= F.floaterMinDist && ctx.dist <= F.floaterMaxDist &&
               towardRim >= F.floaterMinApproach && ctx.approachAngle <= F.floaterMaxAngle) {
      plan.action = 'floater';
      plan.reason = 'driving through the floater zone';
    } else if (ctx.dist >= F.sideStepMinDist && Math.abs(ctx.lateralSpeed) >= F.sideStepMinLateral &&
               Math.abs(ctx.lateralSpeed) >= F.sideStepDominance * Math.max(0, towardRim)) {
      plan.action = 'sidestep';
      plan.sideDir = Math.sign(ctx.lateralSpeed);    // hop the way you're moving (+ = shooter's right)
      plan.reason = 'moving sideways on the perimeter';
    } else {
      plan.reason = 'perimeter jumper';
    }
    plan.balance = balanceFor(ctx, plan.action);
    return plan;
  }

  return { readContext, determineScoringAction, balanceFor, finishHand, RIM };
})();
