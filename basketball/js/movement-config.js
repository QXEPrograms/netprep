// Offensive movement feel: every number for the ball handler's locomotion,
// orientation, body lean/weight, footwork, dribble rhythm and the camera.
// Speeds m/s, accelerations m/s^2, times s, angles rad.
//
// Guiding rule: LOW SPEED = HIGH CONTROL, HIGH SPEED = MORE COMMITMENT.
ISO.MOVEMENT = {
  // ---- commitment: size-up (0) -> attack/drive (~0.5) -> sprint (1) ---------
  // A continuous blend, never a mode switch.
  commitment: {
    driveCommitTime: 0.3,   // holding a drive direction this long = full drive commitment
    driveAngle: 0.35,       // input must point within ~70 deg of the rim to count as a drive (cos)
    driveSpeed: 0.75,       // ...and be moving at this fraction of run speed
    driveLevel: 0.55,       // commitment a committed (non-sprint) drive reaches
    beatenBonus: 0.25,      // extra commitment once the defender is beaten
    rise: 3.2,              // per second (how fast it builds)
    fall: 4.5,              // per second (how fast it drops when you stop committing)
    holdAngle: 0.8,         // input turning more than this resets the drive hold timer
  },

  // ---- speeds -------------------------------------------------------------------
  speed: {
    // controlled / size-up: depends on direction relative to the squared stance
    forward: 4.8,
    lateral: 4.4,           // sideways around the perimeter
    back: 3.7,              // retreat
    // attack (drive) and sprint are directional: hips are open
    // (run 5.0 and sprint 7.2 come from Locomotion settings: shot/finish
    //  thresholds depend on them, so they are unchanged)
  },

  // ---- acceleration / braking (the responsiveness) ---------------------------------
  accel: {
    controlled: 30,         // starting/steering at size-up speed: snappy
    lateral: 28,
    drive: 22,
    sprint: 15,             // above run speed: committed
    stopControlled: 36,     // releasing the keys at low speed: settle fast
    stopFast: 22,           // releasing during a hard drive/sprint: a braking step
    turn: 26,               // bending the path (small corrections never plant)
  },

  // ---- plants (direction changes with visible weight transfer) ---------------------
  plant: {
    cutAngle: 0.9,          // > ~52 deg change of direction = a cut
    reversalAngle: 2.3,     // > ~130 deg = a reversal
    cutMinSpeed: 3.0,       // below these speeds no plant at all (just turn)
    reversalMinSpeed: 2.2,
    cutTime: 0.06,          // seconds of braking before the push (kept short: responsive)
    reversalTime: 0.09,
    sprintExtra: 0.04,      // added above run speed (harder to stop a sprint)
    reversalAbsorb: 0.75,   // a reversal plant lasts long enough to take out this much of the speed...
    cutAbsorb: 0.45,        // ...a cut this much (so faster = longer plant = more commitment)
    brake: 42,              // deceleration while planted
    brakeSprint: 24,        // ...from a full sprint (heavier: a sprint is a commitment)
    sideAccel: 0.5,         // fraction of normal accel toward the new way while planted
    pushTime: 0.12,         // after the plant: a push-off window...
    pushBoost: 1.35,        // ...with this much extra acceleration
  },

  // ---- orientation (hips/chest) ----------------------------------------------------
  orientation: {
    engageRange: 5.0,       // matchup closer than this shapes where you square up
    engageDefenderWeight: 0.55, // squared toward a point this far from the rim toward the defender
    openControlled: 0.22,   // size-up: hips open this fraction toward travel (rest stays squared)
    openSpeed: 2.5,         // ...scaled in by speed up to here
    backAngle: 1.75,        // travel more than ~100 deg from your target = retreating (hips stay square)
    chestFollowControlled: 0.35, // chest follows the hips this much at size-up (counter-rotation)
    chestFollowDrive: 0.95,
    maxTwist: 0.6,          // max chest-vs-hips twist
    maxHead: 0.5,           // head can turn this much further toward the target
    hipTurnRate: 11,        // rad/s max hip rotation (controlled)
    hipTurnRateSprint: 14,
    turnSmoothing: 14,      // exponential approach rate toward the target yaw
    beatenDepth: 0.15,      // defender this much behind you along your path to the rim = beaten
    beatenLateral: 0.95,    // ...or this far off to the side while level with you
  },

  // ---- body lean / weight ------------------------------------------------------------
  lean: {
    fromVelocity: 0.028,    // rad per m/s (steady lean while moving)
    fromAccel: 0.016,       // rad per m/s^2 (leaning into acceleration / braking)
    max: 0.24,              // controlled (rad, ~14 deg)
    maxSprint: 0.34,        // full sprint
    pivot: 0.62,            // sideways lean pivots this high (m): the feet push out, the
                            // torso leans but stays over the body's collision circle
    stiffness: 320,         // lean spring (how quickly the body follows)
    damping: 0.7,           // < 1 = the torso overshoots a little (weight)
    hipShift: 0.32,         // m of hip translation per rad of sideways lean
    kneeFromAccel: 0.022,   // knee load per m/s^2 of acceleration
    kneePlant: 0.55,        // extra knee load while planted
    kneeMax: 0.8,
    backLeanScale: 0.6,     // backward leans are smaller (controlled retreat)
  },

  // ---- footwork --------------------------------------------------------------------------
  feet: {
    strideControlled: 0.72, // m per half-cycle at size-up (short athletic steps)
    strideDrive: 1.25,      // drive (the original run stride)
    strideSprintExtra: 0.55,
    lateralStride: 0.55,    // sideways steps
    lateralSpread: 0.22,    // how far the lead foot steps out sideways (rad)
  },

  // ---- dribble rhythm by movement context ---------------------------------------------
  dribble: {
    freqControlled: 2.0,    // bounces/s while moving at size-up
    freqDrive: 1.9,         // push dribble: a longer rhythm
    freqSprint: 1.8,
    leadControlled: 0.055,  // s of velocity lead at the floor
    leadDrive: 0.08,
    forwardDrive: 0.4,      // ball out in front on a drive (m)
    retreatPull: 0.06,      // ball pulled in when retreating (m)
    lateralForward: 0.12,   // sliding sideways: ball carried this far in front of the hip (clears the trail leg)
    pressureRange: 1.25,    // matchup right in front, closer than this: protect the dribble...
    pressurePull: 0,        // ...pull the ball in this much (m) (0: tested, it let bodies get closer)
    pressureLead: 0.4,      // ...and cut the forward push/lead by this fraction
  },

  // ---- camera ---------------------------------------------------------------------------
  camera: {
    defenderWeight: 0.3,    // frame the matchup, not just the ball handler
    basketBias: 0.35,       // pull toward the rim (unchanged base)
    driveBasketBias: 0.5,   // ...more when you've beaten your man and are attacking
    biasSmoothing: 2.5,
  },
};
