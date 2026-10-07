// Tuning profiles (Step 17, development): ?tuning=16.5 plays the game with
// the Step 16.5 values for everything Step 17 changed, so the two can be
// compared by hand on the same build (STEP16_5_TUNING vs STEP17_TUNING).
// The default is STEP17 (the values in the config files). Visual-only Step
// 16.5 systems (smoothing, rig, camera springs) are the same in both.
(function () {
ISO.TUNING_PROFILES = {
  'STEP17': {},
  'STEP16_5': {
    jumpShot: { gatherTime: 0.16, takeoff: 0.3, raiseStart: 0.19, setReached: 0.43, autoRelease: 0.72, idealRelease: 0.498 },
    steal: { cleanExposure: 0.62 },
    gameflow: { makeResetDelay: 0.85, blockResetDelay: 0.8 },
    camera: { deadZone: 0 },
    shotClockEnabled: false,      // no shot clock in Step 16.5
    legacyFinishBlocks: true,     // finishes only blockable in their last 0.12 s, vertical contest arm
  },
};
const m = window.location.search.match(/[?&]tuning=([\w.]+)/);
const name = m ? (m[1] === '16.5' ? 'STEP16_5' : m[1] === '17' ? 'STEP17' : m[1].toUpperCase()) : 'STEP17';
const T = ISO.TUNING_PROFILES[name] || {};
ISO.TUNING = name in ISO.TUNING_PROFILES ? name : 'STEP17';
if (T.jumpShot) Object.assign(ISO.OFFENSE.jumpShot.timeline, T.jumpShot);
if (T.steal) Object.assign(ISO.DEFENSE.steal, T.steal);
if (T.gameflow) Object.assign(ISO.GAMEFLOW, T.gameflow);
if (T.camera) Object.assign(ISO.MOVEMENT.camera, T.camera);
if (T.shotClockEnabled === false) ISO.GAMEFLOW.shotClock.enabled = false;
if (T.legacyFinishBlocks) ISO.OFFENSE.finishBlockLegacy = true;
})();
