// Game flow: teams, possessions and the pace between them. Every number for
// what happens AFTER a shot resolves lives here (the shot itself is untouched).
// Times in seconds, positions in meters (court coordinates, see config.js).
//
// The rule (no rebounds, ever):
//   MAKE           shooting team keeps the ball (make-it-take-it)
//   MISS           the other team gets it
//   BLOCKED_MAKE   basket counts, shooting team keeps it
//   BLOCKED_MISS   the defending team gets it
ISO.GAMEFLOW = {
  // ---- teams -------------------------------------------------------------------
  teams: {
    A: { name: 'TEAM A', color: '#ff7a1a' },
    B: { name: 'TEAM B', color: '#2f6fe0' },
  },
  // Who has the ball first. ?defenseplayer starts you on defense (team B ball).
  firstPossession: 'A',

  // ---- pace after a shot -------------------------------------------------------
  // The physical result plays out for this long before the transition starts.
  makeResetDelay: 1.0,    // after the basket is detected (ball drops through the net)
  missResetDelay: 0.75,   // after the miss is confirmed (bounce / fall away)
  blockResetDelay: 1.0,   // after a blocked shot is confirmed a miss (see the deflection)
  // The transition itself: a quick fade hides the reset, then a short settle
  // with the ball already in the new ball handler's hands before input is live.
  useFade: true,
  fadeOut: 0.2,
  fadeIn: 0.25,
  startDelay: 0.4,        // POSSESSION_START: players set, ball live in the dribble, input off
  get transitionDuration() { return this.fadeOut + this.startDelay; },

  // ---- when is a miss a miss ------------------------------------------------------
  // A shot can only score by coming DOWN through the rim from above. Once the
  // ball is falling, this far below the rim and outside the hoop, nothing can
  // carry it back up and in: the miss is confirmed (no need to wait for the
  // floor). Floor contact and the timeout are the other ways a miss is called.
  missBelowRim: 0.45,     // m below the rim plane (ball center)
  missMinFlight: 0.1,     // s: never on the release frame itself
  shotTimeout: 6,         // s of flight before a stuck/odd shot is called a miss
  // Safety net only (nothing currently produces it): a free ball that isn't a
  // tracked shot or a pass for this long ends the possession, ball retained.
  deadBallTimeout: 2.5,

  // ---- reset / check-ball positions ---------------------------------------------------
  // Offense spots by slot (slot 0 = the ball handler, near the top of the arc).
  // Later 2v2/3v3 use the extra slots. Each defender starts between their
  // assignment and the rim, `defenseGap` in front of them.
  reset: {
    offense: [
      { x: 0, z: 9.5 },       // check ball: top of the arc
      { x: -4.6, z: 7.4 },    // (2v2/3v3: left wing)
      { x: 4.6, z: 7.4 },     // (3v3: right wing)
    ],
    defenseGap: 1.4,
  },

  // ---- rules (foundation only: nothing ends the game yet) ------------------------------
  // Points per make come from ISO.CONFIG.scoring (inside / outside the arc).
  // The intended game is first to 11 with 1s and 2s; set CONFIG.scoring to
  // { inside: 1, outside: 2 } to switch.
  rules: { targetScore: 11, makeItTakeIt: true },

  // ---- development ---------------------------------------------------------------------
  // ?controlball: your keyboard always drives whoever has the ball (the other
  // player is CPU defense). A testing aid for the possession loop: in the real
  // game your input belongs to YOUR player, offense or defense.
  devControlBallHandler: /[?&]controlball\b/.test(window.location.search),
};
