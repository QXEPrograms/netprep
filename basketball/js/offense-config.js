// Offense tuning: every threshold and timing for dribble moves, chaining,
// fatigue, momentum and contextual finishing lives here so it can be tuned in
// one place. Distances are meters from the rim center (horizontal), speeds m/s.
ISO.OFFENSE = {
  // ---- dribble moves ------------------------------------------------------
  // duration: seconds at full freshness (fatigue slows execution a little)
  // cost: fatigue added per use (grows when moves are chained quickly)
  // cancelAt: progress after which the next action in `chain` may start
  moves: {
    crossover:  { cost: 0.08, cancelAt: 0.72 },
    stepBack:   { cost: 0.10 },
    spin:       { duration: 0.56, cost: 0.12, cancelAt: 0.8, exitAngle: 1.15, cooldown: 0.12 },
    hesitation: { duration: 0.5,  cost: 0.04, cancelAt: 0.3, slowdown: 0.45, cooldown: 0.08 },
    inAndOut:   { duration: 0.38, cost: 0.07, cancelAt: 0.75, cooldown: 0.1 },
    behindBack: { duration: 0.42, cost: 0.10, cancelAt: 0.75, cooldown: 0.12 },
  },

  // Which action may interrupt which move once its cancel window opens.
  // 'shot' covers every Space action (jumper, side-step, floater, layup, dunk).
  // Anything not listed is ignored (and not queued).
  chain: {
    crossover:  ['shot', 'spin', 'stepBack', 'hesitation', 'inAndOut', 'behindBack', 'crossover'],
    hesitation: ['shot', 'crossover', 'spin', 'inAndOut', 'behindBack', 'stepBack'],
    inAndOut:   ['shot', 'crossover', 'spin', 'behindBack', 'stepBack', 'hesitation'],
    behindBack: ['shot', 'crossover', 'spin', 'stepBack', 'hesitation'],
    spin:       ['shot', 'crossover', 'hesitation'],
  },
  inputBuffer: 0.15,
  // Finishes: how long before the release a defender's hand can reach the ball
  // (the "release portion" of a layup, dunk or floater).
  finishReleaseWindow: 0.12,   // a move pressed just before its window opens still fires (seconds)

  // ---- light fatigue ------------------------------------------------------
  fatigue: {
    chainWindow: 0.9,      // moves closer together than this count as one chain
    chainGrowth: 0.35,     // each extra move in a chain costs 35% more
    effectFrom: 0.25,      // below this, fatigue has no effect at all
    recoverStill: 0.3,     // per second when standing / walking
    recoverMoving: 0.15,   // per second when running
    recoverSprint: 0.05,   // per second when sprinting
    recoverDelay: 0.35,    // no recovery right after a move
    slowMoves: 0.25,       // at full effect, moves take 25% longer
    burstLoss: 0.75,       // ...and the exit burst loses 75%
    balanceLoss: 0.3,      // ...and shot balance drops this much
  },

  // ---- momentum -----------------------------------------------------------
  momentum: {
    exitBurstTime: 0.35,   // sharper acceleration window after a clean move exit
    exitBurstAccel: 0.7,   // accelScale bonus at the start of that window
    plantFromSpeed: 3.0,   // reversing above this speed needs a plant...
    plantBrake: 0.62,      // ...braking at this fraction near sprint speed
    sprintTurnAccel: 0.8,  // sprinting: sideways acceleration is a bit softer
  },

  // ---- contextual Space (see Gather.determineScoringAction) ---------------
  finishing: {
    dunkMinDist: 0.9, dunkMaxDist: 2.7,
    dunkMinApproach: 5.6,      // approach speed toward the rim (needs a sprint; run speed is 5)
    dunkMaxAngle: 0.75,        // radians between travel and the rim direction (~43°)
    layupMaxDist: 3.4,
    layupMinApproach: 1.4,
    layupMaxAngle: 1.3,        // ~75°
    closeDist: 2.0,            // inside this, a slow player gets a protected layup
    floaterMinDist: 2.8, floaterMaxDist: 5.6,
    floaterMinApproach: 2.4,
    floaterMaxAngle: 1.05,     // ~60°
    sideStepMinDist: 3.6,
    sideStepMinLateral: 3.0,   // sideways speed (relative to the rim line)
    sideStepDominance: 1.4,    // ...and at least this much more than the approach speed
    behindBoardMargin: 0.15,   // behind the backboard plane...
    behindBoardHalfWidth: 1.4, // ...and within this far of the rim sideways: no finishes
    underRimStepOut: 1.25,     // layups started closer than this step out to here first
    maxTakeoffAngle: 1.2,      // takeoff spots stay within this angle (rad) of straight-on (in front of the board)
  },

  // Finish timelines (seconds from the press) and accuracy (aim spread, meters).
  layup: {
    gather: 0.16, takeoff: 0.42, air: 0.62, jump: 0.47, releaseAfterTakeoff: 0.27,
    takeoffDist: 1.5, protectedTakeoff: 0.26, protectedJump: 0.4,
    arcAbove: 0.32,
    spread: { base: 0.062, angle: 0.13, speed: 0.04, distance: 0.05, wrongHand: 0.05, fatigue: 0.1 },
  },
  dunk: {
    gather: 0.14, takeoff: 0.38, air: 0.88, jump: 0.95, releaseAfterTakeoff: 0.4,
    releaseDist: 0.45,         // body distance from the rim center at release (ball ~0.15 m from center)
    // angle: at the max dunk angle; takeoff: per meter outside the comfortable
    // 1.5-2.3 m press range (jumping from too close or too far)
    spread: { base: 0.02, angle: 0.09, speed: 0.04, takeoff: 0.26, fatigue: 0.12 },
  },
  floater: {
    gather: 0.12, takeoff: 0.24, air: 0.5, jump: 0.3, releaseAfterTakeoff: 0.18,
    idealDist: 3.8, arcAbove: 1.55,
    spread: { base: 0.058, distance: 0.03, angle: 0.06, speed: 0.025, fatigue: 0.1 },
  },
  // Jump shot flow (seconds from the press). The gather/jump/release timeline
  // (and so the meter and green window) lives in ShootingSystem settings and is
  // unchanged; these are the parts that decide how long control is taken away.
  jumpShot: {
    landRecover: 0.2,      // after landing, before you can move freely again
    // pump fake: a quick tap = ball up to the chin and back into the dribble
    fakeRise: 0.14,
    fakeHold: 0.05,
    fakeReturn: 0.17,
    fakeReleaseFeet: 0.45, // during the ball's return the feet are free again (pump fake -> drive)
  },
  finishRecover: { layup: 0.22, dunk: 0.24, floater: 0.18 },  // after landing a finish
  sideStep: {
    hopTime: 0.3, hopDist: 0.9, hopHeight: 0.12,
    balance: 0.15,             // balance cost of hopping into the shot
  },
};
