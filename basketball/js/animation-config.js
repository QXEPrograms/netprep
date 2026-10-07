// Animation / body-language tuning (Step 18). VISUAL ONLY: nothing here moves
// a gameplay root, a collision circle or a live defensive hand collider —
// those stay where gameplay puts them (see PlayerModel._exact). Angles in
// radians, lengths in meters, rates in 1/s.
ISO.ANIM = {
  // ---- offense: the athletic base (dribbling, slow) -----------------------------
  base: {
    flex: 0.12,            // extra knee/hip load at size-up speed (fades out with stride)
    width: 0.06,           // feet a little wider than hip width at rest (hip roll per leg)
    retreatFlex: 0.12,     // retreating: sit lower...
    retreatChest: 0.1,     // ...chest stays forward over the ball
    retreatStep: 0.35,     // ...and the backpedal steps are shorter (fraction removed)
    omega: 7,              // how gently the set base eases in/out (1/s)
  },
  // ---- alive while standing ---------------------------------------------------------
  idle: {
    breathe: 0.014,        // chest pitch amplitude
    breatheHz: 0.28,
    shift: 0.012,          // hip weight shift (m)
    shiftHz: 0.45,
    dribbleShoulder: 0.05, // dribble-side clavicle dips with the ball's push (eased)
  },
  // ---- the free (non-dribble) arm ---------------------------------------------------
  offArm: {
    guardPitch: -0.62, guardOut: 0.34, guardElbow: -1.22,    // relaxed guard in front (Step 17: -0.55 / 0.32 / -1.15)
    barPitch: -0.85, barOut: 0.5, barElbow: -1.5,            // arm bar when the defender is right there
  },
  // ---- braking / hard stop: the body catches the momentum ---------------------------
  brake: {
    decel: 16,             // m/s^2 of braking that reads as a full stop-plant
    flex: 0.14,            // knees load
    omega: 9,
  },
  // ---- drive load: the first push out of the stance --------------------------------
  driveLoad: {
    accel: 14,             // m/s^2 forward that reads as a full push
    flex: 0.06, shoulder: 0.07,
  },
  // ---- foot roll (stepper) ----------------------------------------------------------
  footRoll: {
    toeOff: 0.42,          // heel up as a foot leaves the floor
    heelStrike: 0.22,      // toes up as it lands (forward steps)
    peel: 0.3,             // a planted rear foot peels its heel before stepping
    toeLen: 0.2, toeDrop: 0.06,      // ankle -> toe (forward, down): the toe stays on the floor
    heelLen: 0.085, heelDrop: 0.0675, // ankle -> heel (back, down): the heel stays on the floor
  },
  // ---- contact: never lean through the matchup -------------------------------------
  contact: {
    near: 0.64, far: 0.98, // body-centre gap where the posture starts to give
    leanKeep: 0.35,        // fraction of the forward lean kept when chest to chest
    shoulder: 0.12,        // shoulders turn off the contact (chest yaw)
  },
  // ---- shots / finishes knocked away ------------------------------------------------
  blocked: {
    pull: 0.35,            // the hands come back toward the face
  },
};
