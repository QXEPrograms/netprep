// Reference scenarios (development): ?scenario=K sets up one repeatable 1v1
// situation at every possession start, so a mechanic can be tried over and
// over and compared against the reference behavior. Press Enter to restart it.
//
// A scenario only PLACES players (and picks who has the ball / what the CPU
// offense does); you play it. The automated measurements in the test harness
// use the same setups.
(function () {
const S = ISO.REFERENCE_SCENARIOS = {
  A: { name: 'Perimeter lateral movement', hint: 'Slide A / D along the arc. Squared to the basket, weight shifting.', handler: [0, 9.5], gap: 1.4 },
  B: { name: 'Left-right reversal', hint: 'Hold A, then D: lean, plant, transfer, push.', handler: [0, 9.5], gap: 1.4 },
  C: { name: 'Size-up -> drive', hint: 'Size up, then hold W (+Shift): hips open, longer strides, ball pushed out.', handler: [0, 9.5], gap: 1.4 },
  D: { name: 'Crossover -> drive', hint: 'Slide one way, E, attack the other way.', handler: [0, 9.5], gap: 1.4 },
  E: { name: 'Hesitation -> drive', hint: 'Walk at your man, C, then Shift + drive.', handler: [0, 9.5], gap: 1.6 },
  F: { name: 'In-and-out -> drive', hint: 'Slide, R, keep going the same way.', handler: [0, 9.5], gap: 1.4 },
  G: { name: 'Spin', hint: 'Drive into your man, Z / X at contact.', handler: [0, 9.0], gap: 1.1 },
  H: { name: 'Drive -> step-back', hint: 'Drive at the defender, Q.', handler: [-3.6, 8.2], gap: 1.4 },
  I: { name: 'Step-back -> shot', hint: 'Q, then hold Space on the landing.', handler: [0, 8.6], gap: 1.2 },
  J: { name: 'Pump fake -> drive', hint: 'Tap Space with your man close, then drive.', handler: [0, 8.6], gap: 1.05 },
  K: { name: 'Straight drive -> layup', hint: 'W (no sprint), Space inside ~2.5 m.', handler: [0.6, 8.6], defender: [5.5, 7.5] },
  L: { name: 'Straight drive -> dunk', hint: 'Shift + W, Space inside ~2.5 m.', handler: [0.3, 10.2], defender: [5.5, 7.5] },
  M: { name: 'Floater', hint: 'Drive, Space around the free-throw line.', handler: [0, 9.2], defender: [5.5, 7.5] },
  N: { name: 'Defender closeout', hint: 'Shoot right away: the defender starts far and closes out.', handler: [0, 8.6], defender: [3.4, 4.6] },
  O: { name: 'Defender gets beaten', hint: 'The defender starts out of position: attack the open side.', handler: [0, 9.3], defender: [1.3, 8.3] },
  P: { name: 'Contested jumper', hint: 'Hold Space: your man is right on you.', handler: [0, 8.6], gap: 0.95 },
  Q: { name: 'Physical block', hint: 'You defend: the CPU shoots a jumper. Space at its release to block.', team: 'B', bot: 1, handler: [0, 8.4], gap: 0.9 },
  R: { name: 'Make -> same team', hint: 'Score: the ball comes back to you (make-it-take-it).', handler: [0, 6.8], defender: [5.5, 7.5], free: true },
  S: { name: 'Miss -> other team', hint: 'Miss (let go of Space late): the other team gets it.', handler: [0, 6.8], defender: [5.5, 7.5], free: true },
};

ISO.ScenarioRunner = class {
  constructor(key) {
    this.key = key && S[key] ? key : null;
    this.def = this.key ? S[this.key] : null;
  }

  static fromUrl() {
    const m = /[?&]scenario=([A-Za-z])/.exec(window.location.search);
    return new ISO.ScenarioRunner(m ? m[1].toUpperCase() : null);
  }

  get active() { return !!this.def; }
  get label() { return this.def ? `SCENARIO ${this.key}: ${this.def.name} — ${this.def.hint}  (Enter: again)` : ''; }

  // Called right after every possession reset (screen black).
  apply(game) {
    const s = this.def, P = game.possession;
    if (!s) return false;
    const team = s.team || 'A';
    // Most scenarios replay with the same team; R and S show the real rule.
    if (!s.free && P.offenseTeamId !== team && game.roster.playersOn(team).length) { P.devReset(team); return true; }
    const h = game.roster.get(P.ballHandlerPlayerId), d = game.roster.defendersOf(h)[0];
    const H = ISO.CONFIG.hoop;
    const pos = new THREE.Vector3(s.handler[0], 0, s.handler[1]);
    h.offense.locomotion.resetMotion(pos, Math.atan2(-pos.x, H.centerZ - pos.z));
    h.offense._updateBallHandling(0);
    if (d) {
      let dp;
      if (s.defender) dp = new THREE.Vector3(s.defender[0], 0, s.defender[1]);
      else {
        const ux = -pos.x, uz = H.centerZ - pos.z, ul = Math.hypot(ux, uz);
        dp = new THREE.Vector3(pos.x + ux / ul * s.gap, 0, pos.z + uz / ul * s.gap);
      }
      d.defense.reset(dp);
      d.defense.frozen = true;
    }
    if (h.bot && s.bot !== undefined) { h.bot.pinned = s.bot; h.bot.startPossession(); }
    return false;
  }
};
})();
