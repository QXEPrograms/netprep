// Teams and player identity.
//
//   PlayerEntity   who a player IS: playerId, teamId, controlSource, model.
//                  Never destroyed between possessions. It owns one controller
//                  per role and switches which one runs:
//                    offense  PlayerController (OffensiveLocomotion, dribble,
//                             moves, shots, finishes)
//                    defense  DefenderController (DefensiveLocomotion, facing
//                             assist, jump, hands/blocks, contest)
//                  Both drive the same model, so the player you see is the
//                  same body whichever role it plays.
//   Team           an id, a name and its players (1v1 now; 2v2/3v3 later).
//   Roster         every player and team, plus the current matchups.
//
// Team possession (which TEAM is on offense) lives in PossessionSystem.
// Ball ownership (which PLAYER holds it, or nobody) lives on the ball.
// They are different things: the shooting team still has possession while
// the ball is in the air with no owner.
(function () {
ISO.TEAM_A = 'A';
ISO.TEAM_B = 'B';

// Where a player's input comes from. Only 'local' and 'cpu' exist today;
// 'remote' is the slot a network client will fill.
ISO.CONTROL = { LOCAL: 'local', REMOTE: 'remote', CPU: 'cpu' };

ISO.Team = class {
  constructor(id, { name, color } = {}) {
    this.id = id;
    this.name = name || 'TEAM ' + id;
    this.color = color || '#ffffff';
    this.playerIds = [];
  }
};

// An input source that can be switched off (possession transitions) and
// re-pointed (a player's control source changes) without the controllers
// that read it noticing. Same interface as Input / VirtualInput.
ISO.GatedInput = class {
  constructor(source) {
    this.source = source;
    this.enabled = true;
    this._zero = { x: 0, y: 0 };
  }
  getMoveAxes() { return this.enabled ? this.source.getMoveAxes() : this._zero; }
  isSprinting() { return this.enabled && this.source.isSprinting(); }
  isDown(a) { return this.enabled && this.source.isDown(a); }
  // Presses made while disabled are swallowed, never stored for later.
  consumePress(a) { const p = this.source.consumePress(a); return this.enabled && p; }
  releaseAge(a, max) { return this.source.releaseAge ? this.source.releaseAge(a, max) : 0; }
  // Forget queued presses (e.g. keys hit while on defense must not fire a
  // crossover the moment you get the ball).
  flush() {
    const s = this.source;
    if (s.presses) s.presses.clear();
    if (s.pressed instanceof Set) s.pressed.clear();
    if (s.down instanceof Set) s.down.clear();
    if (s.axes) s.axes = { x: 0, y: 0 };
    if ('sprint' in s && typeof s.sprint === 'boolean') s.sprint = false;
  }
};

ISO.PlayerEntity = class {
  // opts: { id, teamId, name, controlSource, look (model colors), ball, camera, keyboard }
  constructor({ id, teamId, name, controlSource, look, ball, camera, keyboard }) {
    this.id = id;                       // playerId: 'P1', 'P2', ...
    this.playerId = id;
    this.teamId = teamId;
    this.name = name || id;
    this.keyboard = keyboard;
    this.virtual = new ISO.VirtualInput();   // what a CPU brain (or later a network client) writes
    this.input = new ISO.GatedInput(keyboard);
    this.controlSource = null;
    this.setControlSource(controlSource || ISO.CONTROL.CPU);

    this.model = new ISO.PlayerModel(Object.assign({ teamId, playerId: id }, look || {}));
    this.offense = new ISO.PlayerController({
      input: this.input, camera, ball, model: this.model, playerId: id,
      startPosition: new THREE.Vector3(0, 0, 9), startFacing: Math.PI,
    });
    this.offense.entity = this;
    this.defense = null;                // created by the roster once opponents exist
    this.role = null;                   // 'offense' | 'defense'
    this.assignmentId = null;           // defense: the playerId this player guards
    this.matchupId = null;              // offense: the playerId guarding this player
    this.bot = null;                    // CPU offense (dev test bot), when controlSource is cpu
    this.hasPossession = false;         // set by the possession system: this player's TEAM has the ball
    this.ball = ball;
  }

  // The controller running right now.
  get active() { return this.role === 'defense' ? this.defense : this.offense; }
  get position() { return this.active.position; }
  get object() { return this.model.root; }
  get isBallHandler() { return this.ball.ownerPlayerId === this.id; }

  setControlSource(src) {
    this.controlSource = src;
    this.input.source = src === ISO.CONTROL.LOCAL ? this.keyboard : this.virtual;
  }

  // Switch roles. The controller that stops running drops everything it was
  // doing (and the ball, if it had it); the possession reset then places the
  // body and gives the new role a clean start.
  setRole(role) {
    if (role === 'offense') { if (this.defense) this.defense.deactivate(); }
    else this.offense.deactivate();
    this.role = role;
  }
};

ISO.Roster = class {
  constructor() {
    this.teams = {};
    this.players = [];
    this.byId = {};
  }

  addTeam(team) { this.teams[team.id] = team; return team; }

  addPlayer(p) {
    this.players.push(p);
    this.byId[p.id] = p;
    this.teams[p.teamId].playerIds.push(p.id);
    return p;
  }

  get(id) { return id ? this.byId[id] || null : null; }
  playersOn(teamId) { return this.players.filter((p) => p.teamId === teamId); }
  otherTeam(teamId) { return Object.keys(this.teams).find((t) => t !== teamId) || null; }
  get local() { return this.players.find((p) => p.controlSource === ISO.CONTROL.LOCAL) || null; }

  // Defense controllers need their opponent at construction; build them once
  // every player exists (each starts guarding the first player of the other team).
  buildDefense({ ball, camera, events }) {
    if (!ISO.DEFENSE.enabled) return;
    for (const p of this.players) {
      const other = this.playersOn(this.otherTeam(p.teamId))[0];
      if (!other) continue;
      p.defense = new ISO.DefenderController({
        opponent: other.offense, ball, camera, model: p.model, playerId: p.id,
        startPosition: new THREE.Vector3(0, 0, 7.5), startFacing: 0,
      });
      p.defense.entity = p;
      p.defense.blocks.events = events;
      p.defense.deactivate();
    }
  }

  // Defender d guards ball handler/offensive player o: facing assist, CPU
  // reads, contact, contest and the offensive orientation all follow these ids.
  linkMatchup(o, d) {
    d.assignmentId = o.id;
    o.matchupId = d.id;
    d.defense.opponent = o.offense;
    o.offense.locomotion.matchup = d.defense;          // orientation / stance target
    const contest = (type) => d.defense.contest.atReleaseValue(type);
    o.offense.shooting.contestProvider = contest;
    o.offense.finishing.contestProvider = contest;
    if (o.bot) o.bot.defender = d.defense;
  }

  // Every defender guarding this offensive player (one in 1v1).
  defendersOf(o) { return this.players.filter((p) => p.role === 'defense' && p.assignmentId === o.id); }

  // Contact: the offensive player's body is resolved against each defender
  // guarding them, right after it moves.
  linkContact(o) {
    const defs = this.defendersOf(o);
    o.offense.afterMove = defs.length ? (dt) => { for (const d of defs) d.defense.resolveContact(dt); } : null;
  }
};
})();
