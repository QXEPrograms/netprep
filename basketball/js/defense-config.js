// Defense tuning: every number for defensive movement, facing assist, CPU
// positioning/reactions, player contact and contests lives here.
// Distances in meters, speeds in m/s, times in seconds, angles in radians.
ISO.DEFENSE = {
  // ?nodefense removes the defender (e.g. to practice offense alone).
  enabled: !/[?&]nodefense\b/.test(window.location.search),
  // ?defenseplayer: you control the defender (a dev bot runs the offense).
  playerControlsDefense: /[?&]defenseplayer\b/.test(window.location.search),

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

  // ---- human control ---------------------------------------------------------
  // Keys always mean SCREEN directions (ISO.ScreenInput, the same convention as
  // the offense). Shift = allowed to turn and run; facing is the assist's job.

  // ---- CPU positioning -------------------------------------------------------
  positioning: {
    gapPerimeter: 1.35,    // ball handler more than perimeterDist from the rim
    gapMid: 1.15,
    gapDrive: 0.95,        // ball handler attacking the rim
    gapNearRim: 0.85,
    gapFar: 1.7,           // way out (sag off, don't chase to half court)
    perimeterDist: 7.8,    // the 1v1 matchup stays compact out to the top of the arc / check spot
    nearRimDist: 3.2,
    farDist: 10.5,
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
    // biteUntil: a bite lasts until this much of the move is visible; biteCarry:
    // then this many seconds of the momentum it built (the weight to recover)
    crossover:  { bite: 0.4, movingBonus: 0.35, closeBonus: 0.12, balancedPenalty: 0.25, repeatPenalty: 0.12, shift: 0.75, biteUntil: 0.45, biteCarry: 0 },
    inAndOut:   { bite: 0.3, anticipateBonus: 0.45, movingBonus: 0.2, shift: 0.65, biteUntil: 0.62, biteCarry: 0 },
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
    runToRecover: 0.9,     // while recovering, turn and run if still farther than this...
    recoverRunApproach: 1.5, // ...and only if the ball handler is attacking the rim (m/s toward it)
    recoverRunDepth: 0.6,  // ...or the defender is less than this in front of them along the lane
    recoverRunSpeed: 5.4,  // ...or they are moving faster than a slide can follow (sprinting)
    closeoutGap: 2.4,      // shot starting with the defender farther than this = closeout
    contestDist: 1.3,      // closeouts stop about here
    contestJumpChance: 0.6, // CPU: jumps on this share of contests (hands up otherwise)
    contestJumpChanceClose: 0.8, // ...when already right on the shooter
    contestHold: 0.7,      // seconds the contest pose holds after the release
  },

  // ---- contact ------------------------------------------------------------------
  contact: {
    radius: 0.31,          // each player's body circle
    ballRadius: 0.17,      // the dribbled ball's circle (ball + clearance for the defender's knees)
    defenderShare: 0.42,   // share of the overlap the defender gives up when the attacker drives into it
    defenderPushShare: 0.88, // ...and when the defender is the one walking into the attacker
    softness: 0.7,         // fraction of the overlap corrected per frame (soft, not a wall)
    momentumLoss: 0.55,    // fraction of the closing speed the attacker loses on contact
    pushTransfer: 0.3,     // fraction of it pushed into the defender
    maxFix: 0.06,          // largest position correction per frame on the floor (m)
    maxFixAir: 0.03,       // ...and while either player is airborne
  },

  // ---- defensive jump (character simulation; same for CPU and humans) -----
  jump: {
    loadTime: 0.1,         // plant + crouch before leaving the floor
    loadBrake: 0.55,       // horizontal speed kept through the load
    height: 0.68,          // standing vertical (m): set and square = your best jump
    movingLoss: 0.15,      // fraction of height lost at full speed (less push into the floor)
    gravity: 9.81,
    carry: 0.85,           // horizontal velocity carried into the air
    carryRun: 1.0,         // ...when running (harder to control)
    airControl: 2.5,       // m/s^2 of steering in the air
    airControlRun: 1.0,
    landTime: 0.2,         // absorbing the landing: slow and can't jump again
    landSpeedScale: 0.3,
    airTurnScale: 0.5,     // facing assist turns slower in the air
  },

  // ---- arms ------------------------------------------------------------------
  arms: {
    raiseTime: 0.15,       // seconds to get a hand fully up (no instant arms)
    lowerTime: 0.25,
    aimUp: 2.2,            // contest arm: mostly straight up, leaning toward the ball in the hands...
    aimUpFree: 1.4,        // ...and still mostly up once it's in the air (no chasing the ball)
    handSpeed: 7,          // m/s the contest hand can swing to a new direction
    anticipate: 0.35,      // aim this far above a ball that is still in the shooter's hands
  },

  // ---- hand colliders & physical blocks ---------------------------------------
  hands: {
    radius: 0.085,         // collision sphere ~ the visible hand + spread fingers
    fingerOffset: 0.03,    // sphere center sits a little past the palm, along the forearm
    restitution: 0.45,     // hand-ball bounciness
    friction: 0.4,
    maxShotAge: 1.6,       // only shots in their first 1.6 s of flight can be blocked
    tipAngle: 0.21,        // < 12 degrees of direction change = fingertip
    popUpNormal: 0.55,     // contact from underneath (normal this much upward) = pop-up
    // (what happens after a block is the possession system's: GAMEFLOW.blockResetDelay)
  },

  // ---- steals: a real reach, physical hand/ball contact ---------------------------
  // The reach is visible (weight shift + an arm extended at the ball) and the
  // hand collider is swept against the dribbled ball. Contact through the ball
  // handler's body never counts. Whether a contact is a clean steal, a
  // deflection or nothing depends on how exposed the ball was (exposure).
  steal: {
    windup: 0.05,          // weight shifts, arm starts (no contact yet)
    active: 0.16,          // the hand can win the ball during this window
    recover: 0.24,         // arm comes back; locomotion still limited
    minInterval: 0.12,     // tiny technical gap after a recovery (no cooldown meter)
    reachSpeedScale: 0.62, // locomotion while reaching / recovering (committed)
    reachLean: 0.16,       // rad of weight shift toward the ball
    contactMargin: 0.035,  // m added to hand + ball radii for contact
    maxBallDist: 1.25,     // reach is pointless beyond this (defender center -> ball, m)
    occlusionRadius: 0.21, // the ball handler's torso/hips as a vertical cylinder (m)...
    occlusionMinY: 0.45, occlusionMaxY: 1.7,
    // exposure (0..1) -> outcome
    exposureNear: 0.36,    // ball this close to the ball handler's body center = protected (a set dribble)...
    exposureFar: 0.74,     // ...this far out = fully exposed (pushed ahead, crossing over)
    moveExposure: 0.3,     // + while the ball crosses between hands (crossover, behind-back, in-and-out)
    driveExposure: 0.15,   // + on a committed drive (ball pushed ahead)
    cleanExposure: 0.62,   // contact at or above this (and a balanced defender) = clean steal
    cleanBalance: 0.45,
    deflectExposure: 0.3,  // below this a touch is a harmless glance
    cleanBallSpeed: 3.2,   // m/s the ball pops into the stealer's hands
    deflectSpeed: 3.6,     // m/s the hand knocks the ball away
    deflectResolve: 0.38,  // s later the deflection is settled (no loose-ball game):
    regainRadius: 1.15,    // ball within this of the ball handler (and nearer him) = he keeps dribbling;
                           // nearer him but out of reach = a quick reset, his team's ball (DEFLECTION)
    stealResetDelay: 0.55, // s the steal reads before the possession transition
    failedDrain: 0.32,     // balance lost when a reach comes up empty
    failedCommit: 0.7,     // and the weight left committed toward the reach side
    // CPU: asks to reach only with a real chance, never spamming
    cpuReachDist: 1.0, cpuMinExposure: 0.45, cpuMinBalance: 0.65, cpuMinInterval: 1.4, cpuChance: 0.35,
  },

  // ---- balance: how stable the defender is right now (0 broken .. 1 set) ----
  balance: {
    commitVel: 0.11,       // commitment (0..1) per m/s of velocity...
    commitAccel: 0.022,    // ...and per m/s^2 of acceleration
    commitRise: 9,         // 1/s toward a bigger commitment (weight goes quickly)...
    commitFall: 2.6,       // ...and back (it takes a moment to get it back)
    drainSpeed: 0.09,      // per s for each m/s above freeSpeed
    freeSpeed: 2.2,
    drainRun: 0.2,         // per s while turned and running
    drainPlant: 0.9,       // per s while planting a reversal
    drainFacing: 0.35,     // per s while the chest is far off the ball handler...
    facingError: 0.7,      // ...(rad)
    drainAccel: 0.012,     // per s per m/s^2 of hard acceleration (sudden corrections)
    recoverSet: 0.95,      // per s when set: slow, square, not planting
    recoverMoving: 0.32,   // per s otherwise
    setSpeed: 1.6,
    // labels: BALANCED >= slight, SLIGHTLY COMMITTED >= heavy, HEAVILY COMMITTED >= broken, else BROKEN
    slight: 0.75, heavy: 0.5, broken: 0.25,
  },

  // ---- ankle breaks: an offensive counter against committed weight ----------
  // Evaluated when the ball handler counters (a dribble move ends, a hard cut
  // pushes off, a step-back lands): over `window` seconds it measures where they
  // actually went. Severity = how far the defender's weight/velocity points the
  // OTHER way x how unbalanced they were x how hard the offense exits x spacing.
  // No random numbers: the same situation gives the same result.
  ankleBreak: {
    window: 0.22,
    exitSpeed: 4.0,        // exit speed along the new direction that counts as full
    spacingNear: 0.55, spacingBest: 0.8, spacingFar: 2.2, spacingMax: 3.0,
    moveFactor: { crossover: 1.0, inAndOut: 1.0, behindBack: 0.95, hesitation: 0.9, spin: 0.85, stepBack: 0.8, cut: 0.8 },
    reachBonus: 0.18,      // countering away from a reach that is still recovering
    stumble: 0.3, stagger: 0.52, fall: 0.86,
    fallMaxBalance: 0.4,   // a fall also needs a stance already gone...
    fallMinWrongWay: 0.9,  // ...weight clearly the wrong way...
    fallMinExit: 0.85,     // ...and a hard exit
    duration: { 1: 0.3, 2: 0.66, 3: 1.05 },
    speedScale: { 1: 0.45, 2: 0.18, 3: 0 },   // locomotion during the reaction
    inputShare: { 1: 0.4, 2: 0.12, 3: 0 },    // how much the brain/player still steers
    carry: { 1: 0.55, 2: 0.8, 3: 0.6 },       // the committed momentum carried into it
    tilt: { 1: 0.2, 2: 0.42, 3: 1.32 },       // rad the body tips toward the lost-balance side
    recoveredBalance: 0.6,
  },

  // ---- block eligibility (the physical hand/ball contact decides the rest) ----
  // A released shot can be blocked early in its flight; once it is coming down
  // into the rim area it belongs to the rim (no late arcade swats).
  block: {
    protectRadius: 1.9,    // m from the rim center: a DESCENDING ball inside this is protected
    protectAboveRim: 0.25, // ...when it is no lower than this below the rim plane
    cylinderRadius: 0.5,   // over the rim: inside this horizontally and above the rim = protected
    cylinderHeight: 1.2,
    dunkLockRadius: 0.4,   // a ball being dunked this close over the rim can't be knocked loose...
    dunkSecureAbove: 0.3,  // ...and once free it is the rim's within this height above it
  },

  // ---- contest (deterministic from player state) --------------------------------
  contest: {
    nearDist: 0.7,         // full distance factor at or inside this (defender body -> ball)
    farDist: 2.6,          // zero beyond this
    body: 0.22,            // a body in front, hands down: pressure only
    hand: 0.5,             // + a hand in the ball's path (by actual hand-to-path distance)
    jumpBonus: 0.28,       // + that hand up there on a jump
    handNear: 0.22,        // hand within this of the ball's path = full hand factor
    handFar: 1.1,          // ...nothing beyond this
    pathLength: 1.3,       // the early ball path the hand is measured against (m)
    pathRise: 1.0,
    handRaiseTime: 0.15,   // (kept for the CPU's hand smoothing)
  },

  // ---- contest -> shot difficulty ------------------------------------------------
  // The ball still flies to a physical target; contest only widens the aim spread.
  contestEffect: {
    offGreen: 0.9,         // off-green spread x (1 + this x contest)
    greenFrom: 0.25,       // greens are untouched below this contest...
    greenSpread: 0.16,     // ...then spread (m, 1 sd) = (contest - greenFrom) x this
    layup: 0.8,            // finish spread x (1 + this x contest)
    floater: 0.8,
    dunk: 0.5,
  },
};
