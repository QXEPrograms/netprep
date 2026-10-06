// Defense tuning: every number for defensive movement, facing assist, CPU
// positioning/reactions, player contact and contests lives here.
// Distances in meters, speeds in m/s, times in seconds, angles in radians.
ISO.DEFENSE = {
  // ?nodefense removes the defender (e.g. to practice offense alone).
  enabled: !/[?&]nodefense\b/.test(window.location.search),

  // ---- defensive locomotion (used by CPU and, later, human defenders) -----
  locomotion: {
    // Top speeds by direction relative to the chest (an ellipse between them).
    slideSpeed: 4.2,       // lateral slide
    forwardSpeed: 4.4,     // pressure step toward the ball handler
    backSpeed: 3.7,        // retreat / drop step
    runSpeed: 6.6,         // hips turned, running to recover (slower than an offensive sprint)
    accel: 15,             // m/s^2 in stance (offense: 20)
    runAccel: 13,
    decel: 20,
    // Direction changes: reversing from speed needs a plant before re-accelerating.
    plantFromSpeed: 2.0,   // only above this speed
    plantTime: 0.1,        // seconds of stopping before pushing back the other way
    plantDecel: 24,
    // Hips turn to run when the wanted direction is this far from the chest
    // direction (and running is allowed), or the wanted speed is beyond a slide.
    runAngle: 1.75,
    runAngleFast: 0.6,     // ...or this far when wanting more than slide speed (being outrun)
    runExitAngle: 1.2,     // back to stance once the movement is within this of the ball handler
    radius: 0.31,
  },

  // ---- facing assist --------------------------------------------------------
  facing: {
    turnRate: 7.0,         // max rad/s while in stance (locked onto the ball handler)
    turnRateRun: 10.0,     // max rad/s while running
    turnAccel: 38,         // rad/s^2: the body can't start/stop rotating instantly
    gain: 11,              // how strongly the turn rate follows the error
    plantTurnScale: 0.55,  // turning is slower while planting
    lockError: 0.35,       // |error| below this = locked
  },

  // ---- human control mapping (future) ---------------------------------------
  // 'opponent': up = pressure the ball handler, down = retreat toward the
  // basket, left/right = slide around the ball handler (screen sense).
  // 'screen': plain camera-relative movement (facing assist still applies).
  humanInputFrame: 'opponent',
  humanBackToBasket: 0.4,  // how much "back" blends toward the basket instead of straight away

  // ---- CPU positioning -------------------------------------------------------
  positioning: {
    gapPerimeter: 1.35,    // ball handler more than perimeterDist from the rim
    gapMid: 1.15,
    gapDrive: 0.95,        // ball handler attacking the rim
    gapNearRim: 0.85,
    gapFar: 1.9,           // way out (sag off, don't chase to half court)
    perimeterDist: 6.6,
    nearRimDist: 3.2,
    farDist: 9.5,
    driveSpeed: 2.2,       // approach speed toward the rim that counts as a drive
    shade: 0.18,           // lateral shade toward the ball-hand side (force the other hand)
    rimProtect: 0.35,      // near the rim, pull the spot this much toward the rim
    minGap: 0.72,          // never aim closer than this (contact radius sum + a bit)
    anticipation: 0.14,    // seconds of extrapolation from the perceived velocity
    matchVelocity: 0.85,   // feed-forward of the perceived ball-handler velocity
    gain: 3.6,             // 1/s: how hard the defender closes the gap to the spot
  },

  // ---- CPU reaction model -----------------------------------------------------
  reaction: {
    base: 0.17,            // seconds behind what actually happens
    min: 0.1,
    max: 0.25,
    jitter: 0.025,         // small per-reaction variation
    closeBonus: -0.03,     // quicker when close and set
    offBalance: 0.04,      // slower while moving hard / recovering
    afterFake: 0.03,       // slower right after biting on a fake
    drift: 2.0,            // 1/s: how fast the delay can change (perceived time never runs backward)
    seed: 1337,
  },

  // ---- reactions to offensive moves ------------------------------------------
  // bite: chance (0..1) before context; context adds/subtracts.
  moves: {
    crossover:  { bite: 0.4, movingBonus: 0.35, closeBonus: 0.12, balancedPenalty: 0.25, repeatPenalty: 0.12, shift: 0.75 },
    inAndOut:   { bite: 0.3, anticipateBonus: 0.45, movingBonus: 0.2, shift: 0.65 },
    hesitation: { bite: 0.3, closingBonus: 0.45, freeze: 0.32 },
    spin:       { besideBonus: 0.35, blind: 0.85 },   // blind: fraction of the spin the defender can't read it
    stepBack:   { carry: 0.12, forwardBonus: 0.1 },   // extra seconds of forward momentum
    behindBack: { delay: 0.05 },
    pumpFake:   { bite: 0.4, closeRange: 2.4, jumpChance: 0.3, repeatPenalty: 0.15, freeze: 0.38 },
    anticipateWindow: 4.0, // seconds a seen crossover keeps the defender "expecting" another
  },

  // ---- getting beaten / recovering / closeouts --------------------------------
  states: {
    beatenDepth: 0.15,     // ball handler this much closer to the rim (along the lane) than the defender
    beatenLateral: 0.95,   // or this far off the line while level with the defender
    recoveredError: 0.6,   // back within this of the guard spot = recovered
    lostPosition: 1.1,     // this far from the guard spot (e.g. outrun sideways) = recovering
    runToRecover: 0.9,     // while recovering, turn and run if still farther than this
    closeoutGap: 2.4,      // shot starting with the defender farther than this = closeout
    contestDist: 1.0,      // closeouts stop about here
    contestHold: 0.7,      // seconds the contest pose holds after the release
  },

  // ---- contact ------------------------------------------------------------------
  contact: {
    radius: 0.31,          // each player's body circle
    ballRadius: 0.14,      // the dribbled ball's circle (ball + a hand's clearance)
    defenderShare: 0.42,   // share of the overlap the defender gives up when the attacker drives into it
    defenderPushShare: 0.88, // ...and when the defender is the one walking into the attacker
    softness: 0.7,         // fraction of the overlap corrected per frame (soft, not a wall)
    momentumLoss: 0.55,    // fraction of the closing speed the attacker loses on contact
    pushTransfer: 0.3,     // fraction of it pushed into the defender
  },

  // ---- contest foundation (computed and exposed; NOT applied to accuracy yet) ---
  contest: {
    nearDist: 0.7,         // full distance factor at or inside this
    farDist: 2.6,          // zero beyond this
    base: 0.25,            // a body in front with hands down
    hand: 0.5,             // + a hand up in time
    jumpBonus: 0.25,       // + a well-timed jump
    jumpHeight: 0.32,      // contest jump
    jumpTime: 0.42,
    handRaiseTime: 0.18,   // seconds to get the hand fully up
  },
};
